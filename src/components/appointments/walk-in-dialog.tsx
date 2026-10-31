'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Search } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ApiError } from '@/lib/api/api-error';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { listPatients, type Patient, type DocType } from '@/lib/patients/patients-api';
import { DOC_TYPES, docTypeOptionLabel } from '@/lib/patients/doc-type';
import { useDocumentTypeNames } from '@/lib/patients/use-document-type-names';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  NO_RESERVED_SLOT,
  OVERBOOK_REASON_MAX,
  PATIENT_DUPLICATE,
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
  change: 'Cambiar',
  noDoc: 'Sin documento',
  firstName: 'Nombre',
  lastName: 'Apellido',
  phone: 'Teléfono',
  phoneHint: 'Para avisarle. Mejor con el prefijo del país (+…).',
  docType: 'Tipo de documento (opcional)',
  docNumber: 'Documento (opcional)',
  docNone: 'Sin documento',
  docHint: 'Si ya existe un paciente con ese documento, te lo proponemos.',
  provider: 'Profesional',
  providerPlaceholder: 'Elige quién lo atiende',
  providersLoading: 'Cargando profesionales…',
  providersError: 'No pudimos cargar los profesionales.',
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
  submit: 'Atender',
  submitOverbook: 'Atender en sobrecupo',
  missingPatient: 'Elige un paciente o escribe nombre, apellido y teléfono.',
  missingProvider: 'Elige el profesional.',
  error: 'No pudimos registrar la urgencia. Intenta de nuevo.',
  retry: 'Reintentar',
};

type Mode = 'existing' | 'new';

interface WalkInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sede de la urgencia (la del panel o la activa); la API la valida. */
  locationId: string | null;
  /** El profesional que propone (el de la columna o el filtro). */
  defaultProviderId?: string | null;
  onCreated?: (result: WalkInResult) => void;
}

function patientLabel(p: Pick<Patient, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** Quien atiende en la sede: odontólogos y administración (como la agenda). */
function providersAt(staff: StaffMember[], locationId: string | null): StaffMember[] {
  return staff.filter(
    (s) =>
      (s.role === 'DENTIST' || s.role === 'ADMIN') &&
      (s.locationIds === null || locationId === null || s.locationIds.includes(locationId)),
  );
}

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
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searchError, setSearchError] = useState(false);
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
  const [providerId, setProviderId] = useState(defaultProviderId ?? '');
  const [flags, setFlags] = useState<TriageFlag[]>([]);
  const [note, setNote] = useState('');
  const [overbook, setOverbook] = useState(false);
  const [overbookMessage, setOverbookMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [duplicate, setDuplicate] = useState<{ id: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (!open || mode !== 'existing' || patient || debounced.length < 2) return;
    let cancelled = false;
    listPatients(token, { query: debounced, pageSize: 8 })
      .then((res) => {
        if (cancelled) return;
        setResults(res.items);
        setSearchError(false);
      })
      .catch(() => {
        if (!cancelled) setSearchError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, patient, debounced, token, searchKey]);

  const providers = staff ? providersAt(staff, locationId) : [];
  const searchShown = debounced.length >= 2;

  function toggleFlag(flag: TriageFlag, checked: boolean) {
    setFlags((current) => (checked ? [...current, flag] : current.filter((f) => f !== flag)));
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (mode === 'existing' && !patient) errors.patient = walkInCopy.missingPatient;
    if (mode === 'new') {
      if (!firstName.trim()) errors.firstName = walkInCopy.missingPatient;
      if (!lastName.trim()) errors.lastName = walkInCopy.missingPatient;
      if (phone.trim().length < 5) errors.phone = walkInCopy.missingPatient;
    }
    if (!providerId) errors.provider = walkInCopy.missingProvider;
    if (note.trim().length > TRIAGE_NOTE_MAX) errors.note = walkInCopy.noteTooLong;
    if (overbook && !validOverbookReason(reason)) errors.reason = walkInCopy.overbookInvalid;
    return errors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;
    const input: CreateWalkInInput = {
      providerId,
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
      const result = await createWalkIn(token, input, locationId);
      notifyInClinicChanged();
      onCreated?.(result);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === NO_RESERVED_SLOT) {
        setOverbook(true);
        setOverbookMessage(apiErrorMessage(err, walkInCopy.overbookTitle));
      } else if (err instanceof ApiError && err.code === PATIENT_DUPLICATE && err.existingPatientId) {
        setDuplicate({ id: err.existingPatientId, message: apiErrorMessage(err, walkInCopy.duplicateTitle) });
      } else {
        setError(apiErrorMessage(err, walkInCopy.error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function useDuplicate() {
    if (!duplicate) return;
    setPatient({ id: duplicate.id, firstName, lastName, docNumber: docNumber.trim() || null });
    setMode('existing');
    setDuplicate(null);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={walkInCopy.title}
      description={walkInCopy.description}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={overbook ? walkInCopy.submitOverbook : walkInCopy.submit}
      submitting={submitting}
      error={error}
      touchTargets
    >
      <div className="flex min-w-0 flex-col gap-4" data-testid="walk-in-dialog">
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
              ) : searchError ? (
                <FieldError label={walkInCopy.searchError} onRetry={() => setSearchKey((k) => k + 1)} retryLabel={walkInCopy.retry} />
              ) : results === null ? (
                <p role="status" className="text-xs text-muted">{walkInCopy.searching}</p>
              ) : results.length === 0 ? (
                <p role="status" className="text-sm text-muted">{walkInCopy.noMatch}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border" aria-label={walkInCopy.search}>
                  {results.map((p) => (
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
                  <Button type="button" variant="secondary" size="sm" onClick={useDuplicate}>
                    {walkInCopy.useExisting}
                  </Button>
                }
              >
                {duplicate.message}
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
          ) : providers.length === 0 ? (
            <p role="status" className="text-sm text-muted">{walkInCopy.noProviders}</p>
          ) : (
            <NativeSelect
              id={id('provider')}
              value={providerId}
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
