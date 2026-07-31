'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  createAppointment,
  type Appointment,
  type CreateAppointmentInput,
} from '@/lib/appointments/appointments-api';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { listPatients, type Patient } from '@/lib/patients/patients-api';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
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

// Copy as constants (i18n-ready, es-first) — matches patient-form.tsx /
// tooth-record-panel.tsx convention until next-intl wiring lands.
const copy = {
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
  submit: 'Agendar cita',
  submitting: 'Guardando…',
  retry: 'Reintentar',
  genericPatientsError: 'No pudimos cargar los pacientes. Intenta de nuevo.',
  genericStaffError: 'No pudimos cargar los profesionales. Intenta de nuevo.',
  genericSaveError: 'No pudimos crear la cita. Intenta de nuevo.',
  validationMissingFields: 'Completa paciente, profesional, fecha y horas.',
  validationEndAfterStart: 'La hora de fin debe ser posterior a la hora de inicio.',
  validationPastStart: 'No se puede agendar en el pasado. Elige una fecha y hora futuras.',
};

function fullPatientName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

/** Human label for a patient's document, e.g. "CC 123456" — or a "no document" note when the patient has none. */
function patientDocLabel(patient: Patient): string {
  return patient.docNumber ? `${patient.docType} ${patient.docNumber}` : copy.patientNoDoc;
}

/** A query is treated as a document number (to pre-fill the create-patient form) when it's all digits. */
function looksLikeDocNumber(query: string): boolean {
  return /^\d+$/.test(query);
}

/** How long the patient search box waits after the last keystroke before querying the server (ms). */
const PATIENT_SEARCH_DEBOUNCE_MS = 300;
/** Bounded page size for the patient search — matches the "typeahead" nature of the search box (not a full roster listing). */
const PATIENT_SEARCH_PAGE_SIZE = 20;

/** Builds a local-time ISO instant from a `YYYY-MM-DD` date + `HH:mm` time — the browser's timezone converts it to UTC on the wire (see `Appointment.start`/`end` docs). */
function toIsoInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

/**
 * Today as a local `YYYY-MM-DD`, for the date field's `min` — you can't book in
 * the past. Local (not `toISOString()`) so the boundary is the user's own day,
 * not UTC's. Same shape as `agenda-view.tsx`/`dashboard-view.tsx`'s helper of
 * the same name (that duplication is the existing house convention here).
 */
function todayLocalDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface AppointmentFormProps {
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
}: AppointmentFormProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patientsReloadKey, setPatientsReloadKey] = useState(0);
  const [patientQuery, setPatientQuery] = useState('');
  const debouncedPatientQuery = useDebouncedValue(patientQuery, PATIENT_SEARCH_DEBOUNCE_MS);
  const [patientId, setPatientId] = useState('');
  // The full chosen `Patient` — drives the "chosen-patient chip" that replaces
  // the search box once someone is picked (manually, by exact-document
  // auto-select, or via inline-create).
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffReloadKey, setStaffReloadKey] = useState(0);
  const [providerId, setProviderId] = useState('');

  const [date, setDate] = useState(defaultDate ?? '');
  const [startTime, setStartTime] = useState(defaultStartTime ?? '');
  const [endTime, setEndTime] = useState(defaultEndTime ?? '');
  const [reason, setReason] = useState('');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPatientDialog, setShowPatientDialog] = useState(false);

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
        setPatientsError(null);
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
      } catch (err) {
        if (cancelled) return;
        setPatientsError(err instanceof ApiError ? err.message : copy.genericPatientsError);
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
        if (cancelled) return;
        setStaff(res);
        setStaffError(null);
      } catch (err) {
        if (cancelled) return;
        setStaffError(err instanceof ApiError ? err.message : copy.genericStaffError);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, staffReloadKey]);

  function resetForm() {
    setPatientId('');
    setPatientQuery('');
    setSelectedPatient(null);
    setProviderId('');
    setDate('');
    setStartTime('');
    setEndTime('');
    setReason('');
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

    if (!patientId || !providerId || !date || !startTime || !endTime) {
      setValidationError(copy.validationMissingFields);
      return;
    }

    const start = toIsoInstant(date, startTime);
    const end = toIsoInstant(date, endTime);
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

    setSubmitting(true);
    try {
      const input: CreateAppointmentInput = {
        patientId,
        providerId,
        start,
        end,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      };
      const created = await createAppointment(token, input);
      resetForm();
      onCreated(created);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : copy.genericSaveError);
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
          {!showNoPatientMatch && (
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
          // Chosen-patient chip: a document match (or a manual pick) resolves
          // to a single patient, so we show who's booked instead of a list.
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              onClick={handleClearPatient}
            >
              <X className="size-3.5" /> {copy.changePatient}
            </Button>
          </div>
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
              <div className="flex items-center gap-3">
                <p role="alert" className="text-xs text-danger">
                  {patientsError}
                </p>
                <button
                  type="button"
                  onClick={() => setPatientsReloadKey((k) => k + 1)}
                  className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium text-ink transition-colors hover:bg-bg"
                >
                  {copy.retry}
                </button>
              </div>
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
        {staffError && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-xs text-danger">
              {staffError}
            </p>
            <button
              type="button"
              onClick={() => setStaffReloadKey((k) => k + 1)}
              className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium text-ink transition-colors hover:bg-bg"
            >
              {copy.retry}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="appointment-date" className="text-sm font-medium text-ink">
            {copy.dateLabel}
          </label>
          <input
            id="appointment-date"
            type="date"
            required
            // No se puede agendar en el pasado: el date picker no ofrece días
            // anteriores a hoy. "Hoy a una hora ya pasada" lo cubre la validación
            // del instante en handleSubmit (y el backend con un 400).
            min={todayLocalDateString()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          />
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
            onChange={(e) => setStartTime(e.target.value)}
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

      {validationError && (
        <p role="alert" className="text-sm text-danger">
          {validationError}
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-danger">
          {saveError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="submit" loading={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </div>
    </form>
  );
}
