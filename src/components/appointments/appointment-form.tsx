'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { PatientMedicalAlertsNotice } from '@/components/clinical/appointment-medical-alerts';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createAppointment,
  type Appointment,
  type CreateAppointmentInput,
} from '@/lib/appointments/appointments-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { canChangeWantsEarlier } from '@/lib/appointments/wants-earlier';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import {
  listAppointmentTypes,
  type AppointmentType,
} from '@/lib/appointments/appointment-types-api';
import { listPatients, type Patient } from '@/lib/patients/patients-api';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  getLocationSchedule,
  fitsBusinessHoursLocal,
  describeDay,
  timeToMinutes,
  type BusinessHours,
} from '@/lib/locations/schedule-api';
import { sedeMinuteRanges, useSedeClock } from '@/lib/locations/sede-clock';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { civilWeekday } from '@/lib/time/civil-day';
import { wallInstant } from '@/lib/time/wall-clock';
import { UserPlus, Loader2, Search, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PatientForm } from '@/components/patients/patient-form';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { ApiError } from '@/lib/api/api-error';
import { useProviderDay } from '@/components/appointments/use-provider-day';
import { fitsRanges } from '@/lib/locations/provider-schedule';
import { documentText, dtoDocTypeName } from '@/lib/patients/doc-type';
import { endSentence } from '@/lib/format/text';

// Copy as constants (i18n-ready, es-first) — matches patient-form.tsx /
// tooth-record-panel.tsx convention until next-intl wiring lands.
const copy = {
  // DX-446: hueco reservado (409 RESERVED_SLOT) y «Agendar igualmente».
  overrideReasonLabel: 'Motivo para agendar igualmente',
  overrideReasonHint: 'Queda registrado con tu nombre. No escribas datos clínicos.',
  overrideSubmit: 'Agendar igualmente',
  overrideReasonLength: 'Escribe un motivo de entre 5 y 300 caracteres.',
  wantsEarlierLabel: 'Adelantar si hay hueco',
  wantsEarlierHint:
    'El paciente quiere venir antes: saldrá como candidato cuando se libere un hueco en un día anterior.',
  patientLabel: 'Paciente',
  patientSearchPlaceholder: 'Buscar por documento o nombre…',
  patientSearchHint: 'Escribe el documento o el nombre del paciente.',
  patientSearching: 'Buscando…',
  patientNoMatchTitle: 'No encontramos a nadie',
  patientNoMatch: 'Ningún paciente coincide con lo que escribiste.',
  patientNoDoc: 'Sin documento',
  changePatient: 'Cambiar',
  createPatientCta: 'Crear paciente',
  createPatientTitle: 'Nuevo paciente',
  createPatientDesc: 'Se agrega y queda seleccionado en la cita, sin salir de la agenda.',
  providerLabel: 'Profesional',
  providerPlaceholder: 'Selecciona un profesional',
  providerLoading: 'Cargando profesionales…',
  dateLabel: 'Fecha',
  startTimeLabel: 'Hora de inicio',
  endTimeLabel: 'Hora de fin',
  reasonLabel: 'Motivo (opcional)',
  typeLabel: 'Tipo de cita (opcional)',
  typeNone: 'Sin tipo',
  typeOption: (name: string, minutes: number) => `${name} · ${minutes} min`,
  typeHint: 'El tipo fija la duración: la hora de fin se calcula sola.',
  typesFieldError: 'No se pudieron cargar',
  submit: 'Agendar cita',
  submitting: 'Guardando…',
  patientsFieldError: 'No se pudieron cargar',
  staffFieldError: 'No se pudieron cargar',
  genericSaveError: 'No pudimos crear la cita. Intenta de nuevo.',
  validationMissingFields: 'Completa paciente, profesional, fecha y horas.',
  sedeLoading: 'Cargando el horario de la sede. Vuelve a intentarlo en un momento.',
  validationEndAfterStart: 'La hora de fin debe ser posterior a la hora de inicio.',
  validationPastStart: 'No se puede agendar en el pasado. Elige una fecha y hora futuras.',
  validationOutsideHours: (ranges: string) =>
    ranges === ''
      ? 'La sede no atiende ese día.'
      : endSentence(`Fuera del horario de atención. Ese día se atiende: ${ranges}`),
  hoursHint: (ranges: string) => `Horario de ese día: ${ranges}`,
  hoursHintClosed: 'La sede no atiende ese día.',
  // DX-233: aviso no bloqueante (la API decide: aviso o 409 en modo estricto).
  providerOffSchedule: (name: string, ranges: string) =>
    ranges === ''
      ? `${name} no atiende en esta sede ese día.`
      : `Fuera del horario de ${name} en esta sede (ese día: ${ranges}).`,
  providerOffScheduleAllowed: 'Se puede agendar igual; quedará el aviso.',
  providerOffScheduleStrict: 'La clínica no permite citar fuera del horario del profesional.',
};

function fullPatientName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

/** Human label for a patient's document, «{nombre visible} {número}» — or a "no document" note when the patient has none. */
function patientDocLabel(patient: Patient): string {
  return documentText(dtoDocTypeName(patient), patient.docNumber) ?? copy.patientNoDoc;
}

/** A query is treated as a document number (to pre-fill the create-patient form) when it's all digits. */
function looksLikeDocNumber(query: string): boolean {
  return /^\d+$/.test(query);
}

/** How long the patient search box waits after the last keystroke before querying the server (ms). */
const PATIENT_SEARCH_DEBOUNCE_MS = 300;
/** Bounded page size for the patient search — matches the "typeahead" nature of the search box (not a full roster listing). */
const PATIENT_SEARCH_PAGE_SIZE = 20;

/**
 * DX-378: the ISO instant of a `YYYY-MM-DD` date + `HH:mm` time on the sede
 * clock (`timeZone`), never the browser's; `null` for a malformed time.
 */
function toIsoInstant(date: string, time: string, timeZone: string): string | null {
  const minute = timeToMinutes(time);
  return minute === null ? null : wallInstant(date, minute, timeZone).toISOString();
}

interface AppointmentFormProps {
  defaultPatient?: Patient;
  defaultReason?: string;
  planItemIds?: string[];
  minimumDate?: string;
  locationId?: string;
  token: string;
  /** Called with the created appointment once `createAppointment` succeeds — the caller (`AgendaView`) refreshes the day list in place, it does not remount this form. */
  onCreated: (appointment: Appointment) => void;
  /**
   * Pre-fills the date field to the day currently being viewed (e.g.
   * `AgendaView`'s `selectedDate`), so a cita created from an already-picked
   * day doesn't default back to blank. Optional and backward-compatible —
   * omitting it keeps the previous empty-by-default behavior.
   */
  defaultDate?: string;
  /** Pre-rellena la hora de inicio ("HH:mm"), p. ej. al crear desde un hueco del calendario. Opcional/backward-compatible. */
  defaultStartTime?: string;
  /** Pre-rellena la hora de fin ("HH:mm"). Opcional/backward-compatible. */
  defaultEndTime?: string;
  /** DX-121: pre-selecciona el profesional (p. ej. «Nueva cita» de su columna). */
  defaultProviderId?: string;
}

/**
 * New-appointment form: picks a patient (searched/selected from `GET
 * /patients`), a provider (selected from `GET /staff`), a date + start/end
 * time, and an optional reason, then `createAppointment`s.
 *
 * The patient search box queries the server (`listPatients(token, { query,
 * pageSize })`), debounced ~300ms after the last keystroke via
 * `useDebouncedValue` — so clinics with rosters bigger than one page can
 * still find any patient, not just whichever page loaded first. Typing a
 * document that exactly matches a single patient auto-selects them (see the
 * exact-match branch in the search effect); otherwise matches are shown as a
 * clickable list. Once a patient is chosen the search collapses to a chip
 * with a "Cambiar" button, and a "Crear paciente" dialog covers the
 * not-yet-registered case.
 */
export function AppointmentForm({
  token,
  onCreated,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  defaultProviderId,
  defaultPatient,
  defaultReason,
  planItemIds,
  minimumDate,
  locationId,
}: AppointmentFormProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  // Truthy is all that's needed — the rendered `FieldError` shows a fixed
  // short label (`copy.patientsFieldError`), never the server's message.
  const [patientsError, setPatientsError] = useState(false);
  const [patientsReloadKey, setPatientsReloadKey] = useState(0);
  const [patientQuery, setPatientQuery] = useState('');
  const debouncedPatientQuery = useDebouncedValue(patientQuery, PATIENT_SEARCH_DEBOUNCE_MS);
  const [patientId, setPatientId] = useState(defaultPatient?.id ?? '');
  // The full chosen `Patient` — drives the "chosen-patient chip" that replaces
  // the search box once someone is picked (manually, by exact-document
  // auto-select, or via inline-create).
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(defaultPatient ?? null);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  // Truthy is all that's needed — the rendered `FieldError` shows a fixed
  // short label (`copy.staffFieldError`), never the server's message.
  const [staffError, setStaffError] = useState(false);
  const [staffReloadKey, setStaffReloadKey] = useState(0);
  const [providerId, setProviderId] = useState(defaultProviderId ?? '');

  // DX-121: tipos de cita ACTIVOS (la API no devuelve los desactivados). Es
  // opcional: si no cargan, se agenda igual sin tipo.
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [typesError, setTypesError] = useState(false);
  const [typesReloadKey, setTypesReloadKey] = useState(0);
  const [appointmentTypeId, setAppointmentTypeId] = useState('');

  const [date, setDate] = useState(defaultDate ?? '');
  const [startTime, setStartTime] = useState(defaultStartTime ?? '');
  const [endTime, setEndTime] = useState(defaultEndTime ?? '');
  const [reason, setReason] = useState(defaultReason ?? '');
  // DX-210: «Adelantar si hay hueco» (recepción, odontología y ADMIN).
  const [wantsEarlier, setWantsEarlier] = useState(false);
  const canMarkWantsEarlier = canChangeWantsEarlier(getTokenRole(token));

  // Horario de atención de la sede activa: `null` = sin configurar => sin
  // restricción (misma semántica que el backend).
  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const providerDay = useProviderDay(token, providerId, date, locationId);
  const [saveError, setSaveError] = useState<string | null>(null);
  // DX-446: la cita que chocó con un hueco reservado, si quien agenda puede
  // saltárselo con motivo.
  const [overridable, setOverridable] = useState<CreateAppointmentInput | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const overrideInputRef = useRef<HTMLInputElement>(null);
  // Si cambia la cita (paciente, profesional, tipo, día u horas), «Agendar
  // igualmente» ya no vale: reintentaría la cita ANTERIOR. El panel solo se
  // ofrece para la cita que chocó; si no, hay que volver a enviar.
  const slotKey = [patientId, providerId, appointmentTypeId, date, startTime, endTime, locationId ?? ''].join('|');
  const [overridableKey, setOverridableKey] = useState<string | null>(null);
  const overrideFor = overridable !== null && overridableKey === slotKey ? overridable : null;
  // Al aparecer el motivo, el foco va a él (teclado y lector de pantalla).
  const showOverride = overrideFor !== null;
  useEffect(() => {
    if (showOverride) overrideInputRef.current?.focus();
  }, [showOverride]);
  const [submitting, setSubmitting] = useState(false);
  const [showPatientDialog, setShowPatientDialog] = useState(false);
  // DX-378: la fecha y las horas son las del reloj de la sede de la cita (la
  // indicada o la de la pantalla), nunca las del navegador.
  const sede = useSedeClock(token, locationId);
  const clock = sede.status === 'ready' ? sede.clock : null;
  const today = clock ? sedeToday(clock.timeZone) : undefined;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPatientsLoading(true);
      try {
        const query = debouncedPatientQuery.trim();
        const res = await listPatients(token, {
          ...(query ? { query } : {}),
          pageSize: PATIENT_SEARCH_PAGE_SIZE,
        });
        if (cancelled) return;
        setPatients(res.items);
        setPatientsError(false);
        // Auto-select on an exact document match: when the typed query equals
        // a single patient's docNumber, pick that patient without making the
        // user choose from a list — documents are unique, so one exact match
        // is unambiguous. Done here (not in a separate effect) so it fires
        // exactly once per search result. It's keyed off the debounced query,
        // so clearing a pick via "Cambiar" (which leaves the debounced query
        // untouched for a beat) doesn't re-run this and can't undo the change.
        if (query) {
          const exactMatches = res.items.filter((p) => p.docNumber === query);
          if (exactMatches.length === 1) {
            setPatientId(exactMatches[0].id);
            setSelectedPatient(exactMatches[0]);
          }
        }
      } catch {
        if (cancelled) return;
        setPatientsError(true);
      } finally {
        if (!cancelled) setPatientsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, debouncedPatientQuery, patientsReloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStaffLoading(true);
      try {
        const res = await listStaff(token);
        // Best-effort: si el horario no se puede leer, no se bloquea el
        // formulario — el backend sigue validando y es la autoridad.
        void (locationId ? getLocationSchedule(token,locationId) : getLocationSchedule(token))
          .then((h) => {
            if (!cancelled) setHours(h);
          })
          .catch(() => {});
        if (cancelled) return;
        setStaff(res);
        setStaffError(false);
      } catch {
        if (cancelled) return;
        setStaffError(true);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, staffReloadKey, locationId]);

  useEffect(() => {
    let cancelled = false;
    listAppointmentTypes(token)
      .then((res) => {
        if (cancelled) return;
        setTypes(res);
        setTypesError(false);
      })
      .catch(() => {
        if (!cancelled) setTypesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, typesReloadKey]);

  const selectedType = types.find((t) => t.id === appointmentTypeId) ?? null;

  /** Con tipo elegido, la hora de fin es inicio + su duración. */
  function endFor(start: string, type: AppointmentType | null): string | null {
    if (!type || !start) return null;
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + type.durationMinutes;
    if (total >= 24 * 60) return null;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function handleTypeChange(id: string) {
    setAppointmentTypeId(id);
    const end = endFor(startTime, types.find((t) => t.id === id) ?? null);
    if (end) setEndTime(end);
  }

  function handleStartTimeChange(value: string) {
    setStartTime(value);
    const end = endFor(value, selectedType);
    if (end) setEndTime(end);
  }

  function resetForm() {
    setPatientId('');
    setPatientQuery('');
    setSelectedPatient(null);
    setProviderId('');
    setDate('');
    setStartTime('');
    setEndTime('');
    setReason('');
    setWantsEarlier(false);
    setAppointmentTypeId('');
  }

  function handlePatientSelect(patient: Patient) {
    setPatientId(patient.id);
    setSelectedPatient(patient);
  }

  // "Cambiar": drop the current pick and clear the query so the search starts
  // fresh — clearing the query also stops the exact-match auto-select from
  // immediately re-selecting the same patient.
  function handleClearPatient() {
    setPatientId('');
    setSelectedPatient(null);
    setPatientQuery('');
  }

  // Reused PatientForm (in a dialog) calls this on success: select the new
  // patient and close — so you never leave the agenda.
  function handlePatientCreated(patient: Patient) {
    setPatientQuery('');
    setPatientId(patient.id);
    setSelectedPatient(patient);
    setShowPatientDialog(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError(null);
    setSaveError(null);
    setOverridable(null);
    setOverrideError(null);

    if (!patientId || !providerId || !date || !startTime || !endTime) {
      setValidationError(copy.validationMissingFields);
      return;
    }

    if (!clock) {
      setValidationError(sede.status === 'error' ? sede.message : copy.sedeLoading);
      return;
    }
    const start = toIsoInstant(date, startTime, clock.timeZone);
    const end = toIsoInstant(date, endTime, clock.timeZone);
    if (!start || !end) {
      setValidationError(copy.validationMissingFields);
      return;
    }
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      setValidationError(copy.validationEndAfterStart);
      return;
    }

    // No agendar en el pasado. El `min` del input de fecha ya evita elegir un
    // día anterior, pero no cubre "hoy a una hora que ya pasó" (el input de hora
    // no tiene un `min` dependiente del día elegido), así que se valida el
    // INSTANTE acá. Mismo criterio que el backend, que lo rechaza con 400.
    if (new Date(start).getTime() < Date.now()) {
      setValidationError(copy.validationPastStart);
      return;
    }

    // Horario de atención. El backend lo rechaza igual con 400; esto lo avisa
    // antes de enviar y con el horario real del día en el mensaje.
    if (!fitsBusinessHoursLocal(date, startTime, endTime, hours)) {
      setValidationError(copy.validationOutsideHours(describeDay(civilWeekday(date), hours, clock.fmt)));
      return;
    }

    setSubmitting(true);
    try {
      const input: CreateAppointmentInput = {
        patientId,
        ...(planItemIds ? {planItemIds} : {}),
        providerId,
        start,
        end,
        ...(appointmentTypeId ? { appointmentTypeId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(wantsEarlier ? { wantsEarlier: true } : {}),
      };
      await save(input);
    } finally {
      setSubmitting(false);
    }
  }

  async function save(input: CreateAppointmentInput) {
    try {
      const created = await (locationId ? createAppointment(token,input,locationId) : createAppointment(token,input));
      resetForm();
      setOverridable(null);
      setOverrideReason('');
      onCreated(created);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.genericSaveError));
      const canRetry = err instanceof ApiError && err.code === 'RESERVED_SLOT' && err.canOverride === true;
      setOverridable(canRetry ? { ...input, overrideReason: undefined } : null);
      setOverridableKey(canRetry ? slotKey : null);
    }
  }

  /** DX-446: reintenta la misma cita con el motivo (5–300 caracteres). */
  async function handleOverride() {
    if (!overrideFor) return;
    const reasonText = overrideReason.trim();
    if (reasonText.length < 5 || reasonText.length > 300) {
      setOverrideError(copy.overrideReasonLength);
      return;
    }
    setOverrideError(null);
    setSubmitting(true);
    try {
      await save({ ...overrideFor, overrideReason: reasonText });
    } finally {
      setSubmitting(false);
    }
  }

  const trimmedPatientQuery = patientQuery.trim();
  // The "no match" empty state owns the create CTA, so we hide the header's
  // duplicate "Crear paciente" button while it's showing — one clear action.
  const showNoPatientMatch =
    !selectedPatient &&
    !patientsError &&
    trimmedPatientQuery !== '' &&
    !patientsLoading &&
    patients.length === 0;

  return (
    <form onSubmit={handleSubmit} aria-label={copy.submit} className="flex flex-col gap-4">
      <Dialog open={showPatientDialog} onOpenChange={setShowPatientDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.createPatientTitle}</DialogTitle>
            <DialogDescription>{copy.createPatientDesc}</DialogDescription>
          </DialogHeader>
          <PatientForm
            token={token}
            initialDocNumber={
              looksLikeDocNumber(patientQuery.trim()) ? patientQuery.trim() : undefined
            }
            onCreated={handlePatientCreated}
          />
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="appointment-patient-search" className="text-sm font-medium text-ink">
            {copy.patientLabel}
          </label>
          {!defaultPatient && !showNoPatientMatch && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setShowPatientDialog(true)}
            >
              <UserPlus className="size-3.5" /> {copy.createPatientCta}
            </Button>
          )}
        </div>

        {selectedPatient ? (
          <>
            {/* Chosen-patient chip: a document match (or a manual pick) resolves
                to a single patient, so we show who's booked instead of a list. */}
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Check className="size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {fullPatientName(selectedPatient)}
                  </p>
                  <p className="truncate text-xs text-muted">{patientDocLabel(selectedPatient)}</p>
                </div>
              </div>
              {!defaultPatient ? <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                onClick={handleClearPatient}
              >
                <X className="size-3.5" /> {copy.changePatient}
              </Button> : null}
            </div>
            {/* DX-247: «Requiere premedicación» al agendar, antes de guardar. */}
            <PatientMedicalAlertsNotice key={selectedPatient.id} token={token} patientId={selectedPatient.id} />
          </>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                id="appointment-patient-search"
                type="text"
                placeholder={copy.patientSearchPlaceholder}
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-9 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
              />
              {patientsLoading && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
              )}
            </div>

            {patientsError ? (
              <FieldError
                label={copy.patientsFieldError}
                onRetry={() => setPatientsReloadKey((k) => k + 1)}
                className="w-full"
              />
            ) : patientQuery.trim() === '' ? (
              <p className="text-xs text-muted">{copy.patientSearchHint}</p>
            ) : patientsLoading ? (
              <p className="text-xs text-muted">{copy.patientSearching}</p>
            ) : patients.length === 0 ? (
              <div
                role="status"
                className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center"
              >
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-full bg-bg text-muted"
                >
                  <Search className="size-4" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium text-ink">{copy.patientNoMatchTitle}</p>
                  <p className="text-xs text-muted">{copy.patientNoMatch}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowPatientDialog(true)}
                >
                  <UserPlus className="size-3.5" /> {copy.createPatientCta}
                </Button>
              </div>
            ) : (
              <ul
                role="listbox"
                aria-label={copy.patientLabel}
                className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border bg-surface p-1"
              >
                {patients.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => handlePatientSelect(p)}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="truncate text-sm text-ink">{fullPatientName(p)}</span>
                      <span className="shrink-0 text-xs text-muted">{patientDocLabel(p)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="appointment-provider" className="text-sm font-medium text-ink">
          {copy.providerLabel}
        </label>
        {staffError ? (
          <FieldError
            label={copy.staffFieldError}
            onRetry={() => setStaffReloadKey((k) => k + 1)}
            className="h-10 w-full"
          />
        ) : (
          <select
            id="appointment-provider"
            required
            disabled={staffLoading}
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              {staffLoading ? copy.providerLoading : copy.providerPlaceholder}
            </option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.fullName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="appointment-type" className="text-sm font-medium text-ink">
          {copy.typeLabel}
        </label>
        {typesError ? (
          <FieldError
            label={copy.typesFieldError}
            onRetry={() => setTypesReloadKey((k) => k + 1)}
            className="h-10 w-full"
          />
        ) : (
          <select
            id="appointment-type"
            value={appointmentTypeId}
            onChange={(e) => handleTypeChange(e.target.value)}
            aria-describedby="appointment-type-hint"
            className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <option value="">{copy.typeNone}</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {copy.typeOption(t.name, t.durationMinutes)}
              </option>
            ))}
          </select>
        )}
        <p id="appointment-type-hint" className="text-xs text-muted">
          {copy.typeHint}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="appointment-date" className="text-sm font-medium text-ink">
            {copy.dateLabel}
          </label>
          {sede.status === 'error' ? (
            // Sin el reloj de la sede no hay «hoy» ni hora que valga: el campo
            // se sustituye por su error con Reintentar (escalón 2).
            <SedeConfigError
              kind={sede.kind}
              variant="field"
              retryId="appointment-date"
              onRetry={sede.retry}
            />
          ) : (
            <input
              id="appointment-date"
              type="date"
              required
              disabled={!clock}
              // No se puede agendar en el pasado: el date picker no ofrece días
              // anteriores a hoy en la sede. "Hoy a una hora ya pasada" lo cubre
              // la validación del instante en handleSubmit (y el backend con un 400).
              min={today && minimumDate && minimumDate > today ? minimumDate : today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
            />
          )}
          {/* Pista del horario del día elegido: que se VEA por qué una hora no
              entra, en vez de descubrirlo al enviar. Solo cuando la sede tiene
              horario configurado. */}
          {hours && clock && date !== '' && (
            <p className="text-xs text-muted">
              {describeDay(civilWeekday(date), hours, clock.fmt) === ''
                ? copy.hoursHintClosed
                : copy.hoursHint(describeDay(civilWeekday(date), hours, clock.fmt))}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="appointment-start-time" className="text-sm font-medium text-ink">
            {copy.startTimeLabel}
          </label>
          <input
            id="appointment-start-time"
            type="time"
            required
            value={startTime}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="appointment-end-time" className="text-sm font-medium text-ink">
            {copy.endTimeLabel}
          </label>
          <input
            id="appointment-end-time"
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="appointment-reason" className="text-sm font-medium text-ink">
          {copy.reasonLabel}
        </label>
        <input
          id="appointment-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {canMarkWantsEarlier ? (
        <div className="flex items-start gap-3">
          <input
            id="appointment-wants-earlier"
            type="checkbox"
            checked={wantsEarlier}
            onChange={(e) => setWantsEarlier(e.target.checked)}
            aria-describedby="appointment-wants-earlier-hint"
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
          />
          <div className="flex flex-col gap-0.5">
            <label htmlFor="appointment-wants-earlier" className="text-sm font-medium text-ink">
              {copy.wantsEarlierLabel}
            </label>
            <p id="appointment-wants-earlier-hint" className="text-xs text-muted">
              {copy.wantsEarlierHint}
            </p>
          </div>
        </div>
      ) : null}

      {(() => {
        // DX-233: aviso no bloqueante con el horario del profesional ese día.
        const start = startTime ? Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)) : NaN;
        const end = endTime ? Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5)) : NaN;
        if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
        if (fitsRanges(providerDay.ranges, start, end) || !clock) return null;
        const name = staff.find((s) => s.userId === providerId)?.fullName ?? '';
        const ranges = sedeMinuteRanges(providerDay.ranges ?? [], clock.fmt);
        return (
          <p
            role="status"
            data-testid="provider-off-schedule"
            className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink"
          >
            {copy.providerOffSchedule(name, ranges)}{' '}
            {providerDay.strict ? copy.providerOffScheduleStrict : copy.providerOffScheduleAllowed}
          </p>
        );
      })()}
      {validationError && <InlineError>{validationError}</InlineError>}
      {saveError && <InlineError>{saveError}</InlineError>}
      {overrideFor && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-3">
          <label htmlFor="appointment-override-reason" className="text-sm font-medium text-ink">
            {copy.overrideReasonLabel}
          </label>
          <input
            ref={overrideInputRef}
            id="appointment-override-reason"
            type="text"
            maxLength={300}
            value={overrideReason}
            aria-invalid={overrideError ? true : undefined}
            aria-describedby={overrideError ? 'appointment-override-error' : 'appointment-override-hint'}
            onChange={(e) => setOverrideReason(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          />
          <p id="appointment-override-hint" className="text-xs text-muted">
            {copy.overrideReasonHint}
          </p>
          {overrideError && <InlineError id="appointment-override-error">{overrideError}</InlineError>}
          <Button type="button" variant="secondary" className="self-start" loading={submitting} onClick={() => void handleOverride()}>
            {copy.overrideSubmit}
          </Button>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="submit" loading={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </div>
    </form>
  );
}
