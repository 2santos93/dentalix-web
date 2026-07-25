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
import { UserPlus, Loader2 } from 'lucide-react';
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
  patientSearchLabel: 'Buscar paciente',
  patientSearchPlaceholder: 'Nombre o documento…',
  patientLabel: 'Paciente',
  patientPlaceholder: 'Selecciona un paciente',
  createPatientCta: 'Crear paciente',
  createPatientTitle: 'Nuevo paciente',
  createPatientDesc: 'Se agrega y queda seleccionado en la cita, sin salir de la agenda.',
  patientLoading: 'Cargando pacientes…',
  patientEmpty: 'No hay pacientes que coincidan con la búsqueda.',
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
};

function fullPatientName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

/** Builds a local-time ISO instant from a `YYYY-MM-DD` date + `HH:mm` time — the browser's timezone converts it to UTC on the wire (see `Appointment.start`/`end` docs). */
function toIsoInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
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
}

/**
 * New-appointment form: picks a patient (searched/selected from `GET
 * /patients`), a provider (selected from `GET /staff`), a date + start/end
 * time, and an optional reason, then `createAppointment`s.
 *
 * The patient list is fetched once (a bounded page — see `patients-api.ts`'s
 * `MAX_PAGE_SIZE`) and filtered client-side by the search box, mirroring how
 * simple the rest of this app's lists are (no debounce/typeahead machinery
 * exists elsewhere in the codebase yet) — good enough for a single-clinic
 * v1; a live server-side search is a natural follow-up once patient rosters
 * grow past one page.
 */
export function AppointmentForm({ token, onCreated, defaultDate }: AppointmentFormProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patientsReloadKey, setPatientsReloadKey] = useState(0);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientId, setPatientId] = useState('');

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffReloadKey, setStaffReloadKey] = useState(0);
  const [providerId, setProviderId] = useState('');

  const [date, setDate] = useState(defaultDate ?? '');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
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
        const res = await listPatients(token, { pageSize: 100 });
        if (cancelled) return;
        setPatients(res.items);
        setPatientsError(null);
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
  }, [token, patientsReloadKey]);

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

  const filteredPatients = patientQuery.trim()
    ? patients.filter((p) => {
        const q = patientQuery.trim().toLowerCase();
        return (
          fullPatientName(p).toLowerCase().includes(q) ||
          (p.docNumber ?? '').toLowerCase().includes(q)
        );
      })
    : patients;

  function resetForm() {
    setPatientId('');
    setPatientQuery('');
    setProviderId('');
    setDate('');
    setStartTime('');
    setEndTime('');
    setReason('');
  }

  // Reused PatientForm (in a dialog) calls this on success: add the new patient
  // to the list, select it, and close — so you never leave the agenda.
  function handlePatientCreated(patient: Patient) {
    setPatients((prev) => [patient, ...prev.filter((p) => p.id !== patient.id)]);
    setPatientQuery('');
    setPatientId(patient.id);
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

  return (
    <form onSubmit={handleSubmit} aria-label={copy.submit} className="flex flex-col gap-4">
      <Dialog open={showPatientDialog} onOpenChange={setShowPatientDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.createPatientTitle}</DialogTitle>
            <DialogDescription>{copy.createPatientDesc}</DialogDescription>
          </DialogHeader>
          <PatientForm token={token} onCreated={handlePatientCreated} />
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-1">
        <label htmlFor="appointment-patient-search" className="text-sm font-medium text-ink">
          {copy.patientSearchLabel}
        </label>
        <input
          id="appointment-patient-search"
          type="text"
          placeholder={copy.patientSearchPlaceholder}
          value={patientQuery}
          onChange={(e) => setPatientQuery(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="appointment-patient" className="text-sm font-medium text-ink">
            {copy.patientLabel}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setShowPatientDialog(true)}
          >
            <UserPlus className="size-3.5" /> {copy.createPatientCta}
          </Button>
        </div>
        <select
          id="appointment-patient"
          required
          disabled={patientsLoading}
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled>
            {patientsLoading ? copy.patientLoading : copy.patientPlaceholder}
          </option>
          {filteredPatients.map((p) => (
            <option key={p.id} value={p.id}>
              {fullPatientName(p)}
            </option>
          ))}
        </select>
        {patientsError && (
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
        )}
        {!patientsLoading && !patientsError && filteredPatients.length === 0 && (
          <div role="status" className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">{copy.patientEmpty}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setShowPatientDialog(true)}
            >
              <UserPlus className="size-3.5" /> {copy.createPatientCta}
            </Button>
          </div>
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

      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? (
          <>
            <Loader2 className="animate-spin" /> {copy.submitting}
          </>
        ) : (
          copy.submit
        )}
      </Button>
    </form>
  );
}
