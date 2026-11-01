'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ApiError, NetworkError, type ExistingPatientRef } from '@/lib/api/api-error';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { getPatient, listPatients, type Patient, type DocType } from '@/lib/patients/patients-api';
import { DOC_TYPES, docTypeOptionLabel } from '@/lib/patients/doc-type';
import { useDocumentTypeNames } from '@/lib/patients/use-document-type-names';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useSessionLocations } from '@/lib/locations/session-locations';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { getTokenAllowedLocationIds } from '@/lib/auth/token-role';
import {
  NO_RESERVED_SLOT,
  OVERBOOK_REASON_MAX,
  PATIENT_DUPLICATE,
  PHONE_MIN_DIGITS,
  TRIAGE_FLAGS,
  TRIAGE_LABELS,
  TRIAGE_NOTE_MAX,
  createWalkIn,
  validOverbookReason,
  type CreateWalkInInput,
  type TriageFlag,
  type WalkInResult,
} from '@/lib/appointments/walk-in';
import { notifyInClinicChanged } from '@/lib/appointments/patient-flow';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export const walkInCopy = {
  button: 'Atender sin cita',
  title: 'Atender sin cita',
  description:
    'Urgencia en un paso: queda en «En clínica» con una cita de urgencia desde ahora, en el primer hueco reservado libre del profesional.',
  patientMode: 'Paciente',
  existing: 'Ya es paciente',
  newPatient: 'Paciente nuevo',
  search: 'Buscar paciente',
  searchPlaceholder: 'Nombre o documento…',
  searchHint: 'Escribe al menos 2 letras del nombre o el documento.',
  searching: 'Buscando…',
  noMatch: 'Nadie coincide. Puedes darlo de alta como paciente nuevo.',
  searchError: 'No pudimos buscar pacientes.',
  // DX-486: la sede de la urgencia, a la vista (y obligatoria con «Todas las sedes»).
  location: 'Sede',
  locationPlaceholder: 'Elige dónde se atiende',
  locationHint: 'Estás viendo todas las sedes: la urgencia queda en la que elijas.',
  locationsLoading: 'Cargando sedes…',
  locationsError: 'No pudimos cargar las sedes.',
  atLocation: (name: string) => `Se atiende en ${name}.`,
  missingLocation: 'Elige la sede.',
  change: 'Cambiar',
  noDoc: 'Sin documento',
  firstName: 'Nombre',
  lastName: 'Apellido',
  phone: 'Teléfono',
  phoneHint: 'Para avisarle. Mejor con el prefijo del país (+…).',
  phoneTooShort: `El teléfono debe tener al menos ${PHONE_MIN_DIGITS} dígitos.`,
  docType: 'Tipo de documento (opcional)',
  docNumber: 'Documento (opcional)',
  docNone: 'Sin documento',
  docHint: 'Si ya existe un paciente con ese documento, te lo proponemos.',
  provider: 'Profesional',
  providerPlaceholder: 'Elige quién lo atiende',
  providersLoading: 'Cargando profesionales…',
  providersError: 'No pudimos cargar los profesionales.',
  providerNeedsLocation: 'Elige primero la sede',
  noProviders: 'Nadie atiende en esta sede.',
  triage: 'Señales de triaje',
  triageHint: 'Marca lo que refiere el paciente.',
  note: 'Nota de triaje (opcional)',
  noteCount: (n: number) => `${n}/${TRIAGE_NOTE_MAX}`,
  noteTooLong: `La nota admite como mucho ${TRIAGE_NOTE_MAX} caracteres.`,
  overbookTitle: 'No queda hueco reservado libre hoy',
  overbookReason: 'Motivo del sobrecupo',
  overbookHint: 'Queda anotado con tu nombre. No escribas datos clínicos.',
  overbookInvalid: 'Escribe un motivo de entre 5 y 300 caracteres, en una línea.',
  duplicateTitle: 'Ya existe un paciente con ese documento',
  useExisting: 'Usar ese paciente',
  duplicateWho: (name: string) => `Es ${name}.`,
  duplicateLoadError: 'No pudimos cargar ese paciente. Búscalo en «Ya es paciente».',
  submit: 'Atender',
  submitOverbook: 'Atender en sobrecupo',
  missingPatient: 'Busca y elige al paciente, o pasa a «Paciente nuevo».',
  missingFirstName: 'Escribe el nombre.',
  missingLastName: 'Escribe el apellido.',
  missingPhone: 'Escribe el teléfono para poder avisarle.',
  missingProvider: 'Elige el profesional.',
  error: 'No pudimos registrar la urgencia. Intenta de nuevo.',
  retry: 'Reintentar',
};

type Mode = 'existing' | 'new';

interface WalkInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /**
   * Sede de la urgencia (la del panel o la activa); la API la valida. `null`
   * («Todas las sedes» o «Mis sedes»): el diálogo la pide entre las de la sesión.
   */
  locationId: string | null;
  /** El profesional que propone (el de la columna o el filtro). */
  defaultProviderId?: string | null;
  onCreated?: (result: WalkInResult) => void;
}

function patientLabel(p: Pick<Patient, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

function phoneDigits(value: string): number {
  return value.replace(/\D/g, '').length;
}

/** Quien atiende en la sede: odontólogos y administración (como la agenda). */
function providersAt(staff: StaffMember[], locationId: string): StaffMember[] {
  return staff.filter(
    (s) => (s.role === 'DENTIST' || s.role === 'ADMIN') && (s.locationIds === null || s.locationIds.includes(locationId)),
  );
}

/**
 * Orden de los campos en pantalla: tras validar, el foco va al primero con
 * error (clave de `validate()` → id del control).
 */
const FIELD_ORDER: [string, string][] = [
  ['location', 'location'],
  ['patient', 'search'],
  ['firstName', 'first'],
  ['lastName', 'last'],
  ['phone', 'phone'],
  ['provider', 'provider'],
  ['note', 'note'],
  ['reason', 'reason'],
];

/**
 * DX-470 «Atender sin cita» (formulario en modal): paciente existente o alta
 * mínima (nombre, apellido y teléfono), profesional, las 6 señales de
 * triaje y una nota corta. Sin hueco reservado libre (409
 * `NO_RESERVED_SLOT`) pide el motivo del sobrecupo; con un documento que ya
 * es de otro paciente (409 `PATIENT_DUPLICATE`), ofrece usarlo.
 */
export function WalkInDialog({ open, onOpenChange, token, locationId, defaultProviderId, onCreated }: WalkInDialogProps) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const [mode, setMode] = useState<Mode>('existing');
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 300);
  // La respuesta lleva la consulta a la que contesta: con otra consulta en el
  // campo no se enseña (ni se puede elegir) nada de la anterior.
  const [search, setSearch] = useState<{ query: string; items: Patient[] | null; error: boolean } | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const [patient, setPatient] = useState<Pick<Patient, 'id' | 'firstName' | 'lastName' | 'docNumber'> | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [docType, setDocType] = useState<DocType | ''>('');
  const [docNumber, setDocNumber] = useState('');
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [staffError, setStaffError] = useState(false);
  const [staffKey, setStaffKey] = useState(0);
  const requestLocations = useSessionLocations(token);
  const [locations, setLocations] = useState<ClinicLocation[] | null>(null);
  const [locationsError, setLocationsError] = useState(false);
  const [locationsKey, setLocationsKey] = useState(0);
  const [pickedLocationId, setPickedLocationId] = useState('');
  const [providerId, setProviderId] = useState(defaultProviderId ?? '');
  const [flags, setFlags] = useState<TriageFlag[]>([]);
  const [note, setNote] = useState('');
  const [overbook, setOverbook] = useState(false);
  const [overbookMessage, setOverbookMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [duplicate, setDuplicate] = useState<{
    id: string;
    message: string;
    patient: ExistingPatientRef | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sin red o servidor caído: el banner ofrece reenviar lo ya escrito.
  const [retryable, setRetryable] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Tras validar con errores: llevar el foco al primero cuando ya se pintó.
  const focusFirstError = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  // DX-327: el nombre local de cada tipo de documento de la clínica.
  const docTypeNames = useDocumentTypeNames(token);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listStaff(token)
      .then((data) => {
        if (cancelled) return;
        setStaff(data);
        setStaffError(false);
      })
      .catch(() => {
        if (!cancelled) setStaffError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, staffKey]);

  // Las sedes de la sesión: para nombrar la activa o, sin ella, elegir una.
  // Como el selector de sede: solo activas y, con sedes acotadas, las suyas.
  const allowedKey = getTokenAllowedLocationIds(token)?.join(',') ?? null;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    requestLocations()
      .then((data) => {
        if (cancelled) return;
        const allowed = allowedKey === null ? null : allowedKey.split(',');
        setLocations(data.filter((l) => l.isActive && (allowed === null || allowed.includes(l.id))));
        setLocationsError(false);
      })
      .catch(() => {
        if (!cancelled) setLocationsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, requestLocations, allowedKey, locationsKey]);

  useEffect(() => {
    if (!open || mode !== 'existing' || patient || debounced.length < 2) return;
    let cancelled = false;
    listPatients(token, { query: debounced, pageSize: 8 })
      .then((res) => {
        if (!cancelled) setSearch({ query: debounced, items: res.items, error: false });
      })
      .catch(() => {
        if (!cancelled) setSearch({ query: debounced, items: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, patient, debounced, token, searchKey]);

  // Sede fija: la activa o, si la sesión solo tiene una, esa. Si no, la elegida.
  const fixedLocationId = locationId ?? (locations?.length === 1 ? locations[0].id : null);
  const effectiveLocationId = fixedLocationId ?? (pickedLocationId || null);
  const fixedLocationName = fixedLocationId ? locations?.find((l) => l.id === fixedLocationId)?.name ?? null : null;
  const providers = staff && effectiveLocationId ? providersAt(staff, effectiveLocationId) : [];
  // Un profesional que no atiende en la sede (el de la columna, o tras
  // cambiar de sede) no cuenta como elegido.
  const selectedProviderId = providers.some((p) => p.userId === providerId) ? providerId : '';
  const typedQuery = query.trim();
  const searchShown = typedQuery.length >= 2;
  const searchAnswer = search?.query === typedQuery ? search : null;

  const focusFirstInvalid = useCallback(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    const first = FIELD_ORDER.find(([key]) => fieldErrors[key]);
    if (first) document.getElementById(`${ids}-${first[1]}`)?.focus();
  }, [fieldErrors, ids]);
  useEffect(focusFirstInvalid, [focusFirstInvalid]);

  function toggleFlag(flag: TriageFlag, checked: boolean) {
    setFlags((current) => (checked ? [...current, flag] : current.filter((f) => f !== flag)));
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!effectiveLocationId) errors.location = walkInCopy.missingLocation;
    if (mode === 'existing' && !patient) errors.patient = walkInCopy.missingPatient;
    if (mode === 'new') {
      if (!firstName.trim()) errors.firstName = walkInCopy.missingFirstName;
      if (!lastName.trim()) errors.lastName = walkInCopy.missingLastName;
      // Más estricto que la API (5 caracteres): con 5 dígitos siempre pasa.
      if (!phone.trim()) errors.phone = walkInCopy.missingPhone;
      else if (phoneDigits(phone) < PHONE_MIN_DIGITS) errors.phone = walkInCopy.phoneTooShort;
    }
    if (!selectedProviderId) errors.provider = walkInCopy.missingProvider;
    if (note.trim().length > TRIAGE_NOTE_MAX) errors.note = walkInCopy.noteTooLong;
    if (overbook && !validOverbookReason(reason)) errors.reason = walkInCopy.overbookInvalid;
    return errors;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  /** Valida y envía lo que hay en el formulario (también desde «Reintentar»). */
  async function submit() {
    const errors = validate();
    setFieldErrors(errors);
    setError(null);
    setRetryable(false);
    if (Object.keys(errors).length > 0) {
      focusFirstError.current = true;
      return;
    }
    const input: CreateWalkInInput = {
      providerId: selectedProviderId,
      triageFlags: TRIAGE_FLAGS.filter((f) => flags.includes(f)),
      ...(note.trim() ? { triageNote: note.trim() } : {}),
      ...(overbook ? { overbookReason: reason.trim() } : {}),
      ...(mode === 'existing' && patient
        ? { patientId: patient.id }
        : {
            newPatient: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: phone.trim(),
              ...(docNumber.trim()
                ? { docNumber: docNumber.trim(), ...(docType ? { docType } : {}) }
                : {}),
            },
          }),
    };
    setSubmitting(true);
    try {
      const result = await createWalkIn(token, input, effectiveLocationId);
      notifyInClinicChanged();
      onCreated?.(result);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === NO_RESERVED_SLOT) {
        setOverbook(true);
        setOverbookMessage(apiErrorMessage(err, walkInCopy.overbookTitle));
      } else if (err instanceof ApiError && err.code === PATIENT_DUPLICATE && err.existingPatientId) {
        setDuplicate({
          id: err.existingPatientId,
          message: apiErrorMessage(err, walkInCopy.duplicateTitle),
          patient: err.existingPatient,
        });
      } else {
        setError(apiErrorMessage(err, walkInCopy.error));
        setRetryable(err instanceof NetworkError || (err instanceof ApiError && err.status >= 500));
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** El paciente que YA tiene ese documento, con su nombre (no el tecleado). */
  async function adoptDuplicate() {
    if (!duplicate) return;
    let existing: Pick<Patient, 'id' | 'firstName' | 'lastName' | 'docNumber'>;
    if (duplicate.patient) {
      existing = { ...duplicate.patient, docNumber: docNumber.trim() || null };
    } else {
      // Un 409 sin nombre (p. ej. una API anterior): se lee por su id.
      try {
        const p = await getPatient(token, duplicate.id);
        existing = { id: p.id, firstName: p.firstName, lastName: p.lastName, docNumber: p.docNumber };
      } catch (err) {
        setError(apiErrorMessage(err, walkInCopy.duplicateLoadError));
        return;
      }
    }
    setPatient(existing);
    setMode('existing');
    setDuplicate(null);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={walkInCopy.title}
      description={walkInCopy.description}
      onSubmit={handleSubmit}
      submitLabel={overbook ? walkInCopy.submitOverbook : walkInCopy.submit}
      submitting={submitting}
      error={error}
      errorRetry={retryable ? { label: walkInCopy.retry, onRetry: () => void submit() } : null}
      touchTargets
    >
      <div className="flex min-w-0 flex-col gap-4" data-testid="walk-in-dialog">
        {fixedLocationId ? (
          fixedLocationName ? (
            <p className="flex min-w-0 items-center gap-2 text-sm text-ink" data-testid="walk-in-location">
              <MapPin aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 break-words">{walkInCopy.atLocation(fixedLocationName)}</span>
            </p>
          ) : null
        ) : (
          <FormField
            htmlFor={id('location')}
            label={walkInCopy.location}
            hint={walkInCopy.locationHint}
            hintId={id('location-hint')}
            error={fieldErrors.location}
          >
            {locationsError ? (
              <FieldError label={walkInCopy.locationsError} onRetry={() => setLocationsKey((k) => k + 1)} retryLabel={walkInCopy.retry} />
            ) : locations === null ? (
              <NativeSelect id={id('location')} disabled value="">
                <option value="">{walkInCopy.locationsLoading}</option>
              </NativeSelect>
            ) : (
              <NativeSelect
                id={id('location')}
                value={pickedLocationId}
                aria-required
                onChange={(e) => {
                  setPickedLocationId(e.target.value);
                  setFieldErrors((errs) => ({ ...errs, location: '' }));
                }}
                aria-invalid={fieldErrors.location ? true : undefined}
                aria-describedby={fieldErrors.location ? fieldErrorId(id('location')) : id('location-hint')}
              >
                <option value="">{walkInCopy.locationPlaceholder}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        )}

        <SegmentedControl
          aria-label={walkInCopy.patientMode}
          value={mode}
          onValueChange={(value) => {
            setMode(value);
            setDuplicate(null);
          }}
          options={[
            { value: 'existing', label: walkInCopy.existing },
            { value: 'new', label: walkInCopy.newPatient },
          ]}
          fullWidthOnMobile
        />

        {mode === 'existing' ? (
          patient ? (
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink" data-testid="walk-in-patient">{patientLabel(patient)}</p>
                <p className="truncate text-xs text-muted">{patient.docNumber ?? walkInCopy.noDoc}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPatient(null)}>
                {walkInCopy.change}
              </Button>
            </div>
          ) : (
            <FormField htmlFor={id('search')} label={walkInCopy.search} error={fieldErrors.patient}>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  id={id('search')}
                  type="search"
                  autoComplete="off"
                  className="pl-9"
                  placeholder={walkInCopy.searchPlaceholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-invalid={fieldErrors.patient ? true : undefined}
                  aria-describedby={fieldErrors.patient ? fieldErrorId(id('search')) : undefined}
                />
              </div>
              {!searchShown ? (
                <p className="text-xs text-muted">{walkInCopy.searchHint}</p>
              ) : searchAnswer?.error ? (
                <FieldError
                  label={walkInCopy.searchError}
                  onRetry={() => {
                    setSearch(null);
                    setSearchKey((k) => k + 1);
                  }}
                  retryLabel={walkInCopy.retry}
                />
              ) : !searchAnswer?.items ? (
                <p role="status" className="text-xs text-muted">{walkInCopy.searching}</p>
              ) : searchAnswer.items.length === 0 ? (
                <p role="status" className="text-sm text-muted">{walkInCopy.noMatch}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border" aria-label={walkInCopy.search}>
                  {searchAnswer.items.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full min-w-0 flex-col items-start px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text max-sm:min-h-11"
                        onClick={() => {
                          setPatient(p);
                          setFieldErrors((e) => ({ ...e, patient: '' }));
                        }}
                      >
                        <span className="w-full truncate font-medium text-ink">{patientLabel(p)}</span>
                        <span className="w-full truncate text-xs text-muted">{p.docNumber ?? walkInCopy.noDoc}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </FormField>
          )
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <FormField htmlFor={id('first')} label={walkInCopy.firstName} error={fieldErrors.firstName}>
              <Input id={id('first')} autoComplete="off" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={100} aria-invalid={fieldErrors.firstName ? true : undefined} aria-describedby={fieldErrors.firstName ? fieldErrorId(id('first')) : undefined} />
            </FormField>
            <FormField htmlFor={id('last')} label={walkInCopy.lastName} error={fieldErrors.lastName}>
              <Input id={id('last')} autoComplete="off" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={100} aria-invalid={fieldErrors.lastName ? true : undefined} aria-describedby={fieldErrors.lastName ? fieldErrorId(id('last')) : undefined} />
            </FormField>
            <FormField htmlFor={id('phone')} label={walkInCopy.phone} hint={walkInCopy.phoneHint} hintId={id('phone-hint')} error={fieldErrors.phone} className="sm:col-span-2">
              <Input id={id('phone')} type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} aria-describedby={fieldErrors.phone ? `${id('phone-hint')} ${fieldErrorId(id('phone'))}` : id('phone-hint')} aria-invalid={fieldErrors.phone ? true : undefined} />
            </FormField>
            <FormField htmlFor={id('doc-type')} label={walkInCopy.docType}>
              <NativeSelect id={id('doc-type')} value={docType} onChange={(e) => setDocType(e.target.value as DocType | '')}>
                <option value="">{walkInCopy.docNone}</option>
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{docTypeOptionLabel(t, docTypeNames)}</option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField htmlFor={id('doc')} label={walkInCopy.docNumber} hint={walkInCopy.docHint} hintId={id('doc-hint')}>
              <Input id={id('doc')} autoComplete="off" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} maxLength={40} aria-describedby={id('doc-hint')} />
            </FormField>
            {duplicate ? (
              <Callout
                tone="warning"
                title={walkInCopy.duplicateTitle}
                className="sm:col-span-2"
                action={
                  <Button type="button" variant="secondary" size="sm" onClick={() => void adoptDuplicate()}>
                    {walkInCopy.useExisting}
                  </Button>
                }
              >
                {duplicate.message}
                {duplicate.patient ? (
                  <span className="mt-1 block font-medium text-ink">
                    {walkInCopy.duplicateWho(patientLabel(duplicate.patient))}
                  </span>
                ) : null}
              </Callout>
            ) : null}
          </div>
        )}

        <FormField htmlFor={id('provider')} label={walkInCopy.provider} error={fieldErrors.provider}>
          {staffError ? (
            <FieldError label={walkInCopy.providersError} onRetry={() => setStaffKey((k) => k + 1)} retryLabel={walkInCopy.retry} />
          ) : staff === null ? (
            <NativeSelect id={id('provider')} disabled value="">
              <option value="">{walkInCopy.providersLoading}</option>
            </NativeSelect>
          ) : !effectiveLocationId ? (
            <NativeSelect id={id('provider')} disabled value="">
              <option value="">{walkInCopy.providerNeedsLocation}</option>
            </NativeSelect>
          ) : providers.length === 0 ? (
            <p role="status" className="text-sm text-muted">{walkInCopy.noProviders}</p>
          ) : (
            <NativeSelect
              id={id('provider')}
              value={selectedProviderId}
              onChange={(e) => setProviderId(e.target.value)}
              aria-invalid={fieldErrors.provider ? true : undefined}
              aria-describedby={fieldErrors.provider ? fieldErrorId(id('provider')) : undefined}
            >
              <option value="">{walkInCopy.providerPlaceholder}</option>
              {providers.map((p) => (
                <option key={p.userId} value={p.userId}>{p.fullName}</option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-sm font-medium text-ink">{walkInCopy.triage}</legend>
          <p className="text-xs text-muted">{walkInCopy.triageHint}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {TRIAGE_FLAGS.map((flag) => (
              <Checkbox
                key={flag}
                label={TRIAGE_LABELS[flag]}
                checked={flags.includes(flag)}
                onChange={(e) => toggleFlag(flag, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>

        <FormField htmlFor={id('note')} label={walkInCopy.note} hint={walkInCopy.noteCount(note.trim().length)} hintId={id('note-count')} error={fieldErrors.note}>
          <Textarea
            id={id('note')}
            autoGrow
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-describedby={fieldErrors.note ? fieldErrorId(id('note')) : id('note-count')}
            aria-invalid={fieldErrors.note ? true : undefined}
          />
        </FormField>

        {overbook ? (
          <div className="flex min-w-0 flex-col gap-3" data-testid="walk-in-overbook">
            <Callout tone="warning" title={walkInCopy.overbookTitle}>
              {overbookMessage}
            </Callout>
            <FormField htmlFor={id('reason')} label={walkInCopy.overbookReason} hint={walkInCopy.overbookHint} hintId={id('reason-hint')} error={fieldErrors.reason}>
              <Input
                id={id('reason')}
                autoFocus
                autoComplete="off"
                value={reason}
                maxLength={OVERBOOK_REASON_MAX}
                onChange={(e) => setReason(e.target.value)}
                aria-describedby={fieldErrors.reason ? fieldErrorId(id('reason')) : id('reason-hint')}
                aria-invalid={fieldErrors.reason ? true : undefined}
              />
            </FormField>
          </div>
        ) : null}
      </div>
    </FormModal>
  );
}
