'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { listAppointments, type Appointment } from '@/lib/appointments/appointments-api';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { listPatients } from '@/lib/patients/patients-api';
import { localDayRange } from '@/lib/appointments/day-range';
import { DayAgenda } from '@/components/appointments/day-agenda';
import { AppointmentForm } from '@/components/appointments/appointment-form';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  newAppointment: 'Nueva cita',
  cancel: 'Cancelar',
  providerLabel: 'Profesional',
  providerLoading: 'Cargando…',
  dateLabel: 'Fecha',
  refreshing: 'Actualizando…',
  retry: 'Reintentar',
  genericStaffError: 'No pudimos cargar los profesionales. Intenta de nuevo.',
  genericAppointmentsError: 'No pudimos cargar la agenda. Intenta de nuevo.',
  genericRefreshError: 'No pudimos actualizar la agenda. Intenta de nuevo.',
  noProviders: 'No hay profesionales activos en esta clínica.',
  selectProviderPrompt: 'Selecciona un profesional para ver su agenda.',
};

const NEW_APPOINTMENT_FORM_ID = 'agenda-new-appointment-form';

function todayLocalDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface AgendaViewProps {
  token: string;
  tenant: string | null;
}

/**
 * Composes the day/provider selectors + `AppointmentForm` (revealed inline —
 * this app has no modal/dialog primitive yet, see `tooth-record-panel.tsx` /
 * `clinical-entries-list.tsx` for the same inline-section convention) +
 * `DayAgenda`. Mirrors `OdontogramTab`'s refresh-without-unmount pattern:
 * after `AppointmentForm` creates a cita, `handleAppointmentCreated` re-fetches
 * the day's appointments via `refreshing` (a small non-blocking "Actualizando…"
 * indicator) instead of `loading` (the full-page state), so `DayAgenda` and
 * the form stay mounted — no remount, no lost scroll/focus.
 *
 * Extracted out of `agenda/page.tsx` (review fix) — same boundary as
 * `patients/[id]/page.tsx` delegating to `OdontogramTab`: the page stays a
 * thin hydration-gate shell, and this component (client-only, no `page.tsx`
 * wrapper) carries all the stateful orchestration so it's unit-testable —
 * see `agenda-view.test.tsx`.
 */
export function AgendaView({ token, tenant }: AgendaViewProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffReloadKey, setStaffReloadKey] = useState(0);
  const [providerId, setProviderId] = useState('');

  const [selectedDate, setSelectedDate] = useState(todayLocalDateString);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsLoadError, setAppointmentsLoadError] = useState<string | null>(null);
  const [appointmentsRefreshing, setAppointmentsRefreshing] = useState(false);
  const [appointmentsRefreshError, setAppointmentsRefreshError] = useState<string | null>(null);

  const [patientNames, setPatientNames] = useState<Record<string, string>>({});

  const [showForm, setShowForm] = useState(false);

  // Default the provider selector to the first active staff member once
  // loaded, so the agenda shows something without an extra click. Adjusts
  // state DURING render (the React-recommended pattern — see
  // `ToothRecordPanel`'s `prevToothNumber` comment) rather than in a
  // `useEffect`, since it's a pure derivation from `staff` becoming
  // non-empty, not a synchronization with an external system.
  const [prevStaffLen, setPrevStaffLen] = useState(0);
  if (staff.length !== prevStaffLen) {
    setPrevStaffLen(staff.length);
    if (!providerId && staff.length > 0) setProviderId(staff[0].userId);
  }

  // Fetch active staff once (retriable) — feeds the provider selector.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setStaffLoading(true);
      try {
        const data = await listStaff(token, tenant);
        if (cancelled) return;
        setStaff(data);
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
  }, [token, tenant, staffReloadKey]);

  // Patient names for `DayAgenda`'s `patientNames` map — fetched once
  // (bounded page, see `AppointmentForm`'s doc comment on the same
  // tradeoff). Best-effort: a failure here just leaves names falling back
  // to the raw `patientId` in `DayAgenda`, it's not worth its own error UI.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await listPatients(token, { pageSize: 100 }, tenant);
        if (cancelled) return;
        setPatientNames(
          Object.fromEntries(res.items.map((p) => [p.id, `${p.firstName} ${p.lastName}`])),
        );
      } catch {
        /* best-effort, see comment above */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, tenant]);

  // Full (blocking) load whenever the provider or the selected day changes.
  useEffect(() => {
    if (!token || !providerId) return;
    let cancelled = false;
    async function load() {
      setAppointmentsLoading(true);
      try {
        const { from, to } = localDayRange(selectedDate);
        const data = await listAppointments(token, { from, to, providerId }, tenant);
        if (cancelled) return;
        setAppointments(data);
        setAppointmentsLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setAppointmentsLoadError(err instanceof ApiError ? err.message : copy.genericAppointmentsError);
      } finally {
        if (!cancelled) setAppointmentsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, providerId, selectedDate, tenant]);

  function refreshAppointmentsInPlace() {
    if (!token || !providerId) return;
    setAppointmentsRefreshing(true);
    const { from, to } = localDayRange(selectedDate);
    listAppointments(token, { from, to, providerId }, tenant)
      .then((data) => {
        setAppointments(data);
        setAppointmentsRefreshError(null);
      })
      .catch((err) => {
        setAppointmentsRefreshError(
          err instanceof ApiError ? err.message : copy.genericRefreshError,
        );
      })
      .finally(() => setAppointmentsRefreshing(false));
  }

  function handleAppointmentCreated() {
    setShowForm(false);
    refreshAppointmentsInPlace();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
          aria-controls={NEW_APPOINTMENT_FORM_ID}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {showForm ? copy.cancel : copy.newAppointment}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="agenda-provider" className="text-sm font-medium text-ink">
            {copy.providerLabel}
          </label>
          <select
            id="agenda-provider"
            disabled={staffLoading || staff.length === 0}
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          >
            {staffLoading && <option value="">{copy.providerLoading}</option>}
            {!staffLoading && staff.length === 0 && <option value="">{copy.noProviders}</option>}
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="agenda-date" className="text-sm font-medium text-ink">
            {copy.dateLabel}
          </label>
          <input
            id="agenda-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          />
        </div>
      </div>

      {staffError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-danger">
            {staffError}
          </p>
          <button
            type="button"
            onClick={() => setStaffReloadKey((k) => k + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink"
          >
            {copy.retry}
          </button>
        </div>
      )}

      {showForm && (
        <div
          id={NEW_APPOINTMENT_FORM_ID}
          className="w-full max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-sm"
        >
          <AppointmentForm
            token={token}
            tenant={tenant}
            onCreated={handleAppointmentCreated}
            defaultDate={selectedDate}
          />
        </div>
      )}

      {appointmentsRefreshing && (
        <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
          {copy.refreshing}
        </p>
      )}

      {appointmentsRefreshError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-xs text-danger">
            {appointmentsRefreshError}
          </p>
          <button
            type="button"
            onClick={refreshAppointmentsInPlace}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-ink"
          >
            {copy.retry}
          </button>
        </div>
      )}

      {!staffLoading && staff.length > 0 && !providerId ? (
        <p role="status" className="text-sm text-muted">
          {copy.selectProviderPrompt}
        </p>
      ) : (
        <DayAgenda
          appointments={appointments}
          loading={appointmentsLoading}
          error={appointmentsLoadError}
          patientNames={patientNames}
        />
      )}
    </div>
  );
}
