'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ApiError } from '@/lib/api/client';
import { listAppointments, type Appointment } from '@/lib/appointments/appointments-api';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { listPatients } from '@/lib/patients/patients-api';
import { DayAgenda } from '@/components/appointments/day-agenda';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Agenda',
  checkingSession: 'Verificando sesión…',
  patientsLink: 'Pacientes',
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

function todayLocalDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Local-day boundaries (`from` inclusive, `to` inclusive-end-of-day) as UTC ISO instants for `GET /appointments?from&to`. */
function localDayRange(date: string): { from: string; to: string } {
  return {
    from: new Date(`${date}T00:00:00`).toISOString(),
    to: new Date(`${date}T23:59:59.999`).toISOString(),
  };
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
 */
export default function AgendaPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const tenant = typeof window !== 'undefined' ? parseTenantFromHost(window.location.host) : null;

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
    if (!hasHydrated || !accessToken) return;
    let cancelled = false;
    async function load() {
      setStaffLoading(true);
      try {
        const data = await listStaff(accessToken as string, tenant);
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
  }, [hasHydrated, accessToken, tenant, staffReloadKey]);

  // Patient names for `DayAgenda`'s `patientNames` map — fetched once
  // (bounded page, see `AppointmentForm`'s doc comment on the same
  // tradeoff). Best-effort: a failure here just leaves names falling back
  // to the raw `patientId` in `DayAgenda`, it's not worth its own error UI.
  useEffect(() => {
    if (!hasHydrated || !accessToken) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await listPatients(accessToken as string, { pageSize: 100 }, tenant);
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
  }, [hasHydrated, accessToken, tenant]);

  // Full (blocking) load whenever the provider or the selected day changes.
  useEffect(() => {
    if (!hasHydrated || !accessToken || !providerId) return;
    let cancelled = false;
    async function load() {
      setAppointmentsLoading(true);
      try {
        const { from, to } = localDayRange(selectedDate);
        const data = await listAppointments(accessToken as string, { from, to, providerId }, tenant);
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
  }, [hasHydrated, accessToken, providerId, selectedDate, tenant]);

  useEffect(() => {
    // Don't decide anything until the persisted store has rehydrated —
    // accessToken is null until then, and redirecting on that would bounce
    // an already-authenticated user.
    if (!hasHydrated) return;
    if (!accessToken) {
      router.replace('/login');
    }
  }, [accessToken, router, hasHydrated]);

  function refreshAppointmentsInPlace() {
    if (!accessToken || !providerId) return;
    setAppointmentsRefreshing(true);
    const { from, to } = localDayRange(selectedDate);
    listAppointments(accessToken, { from, to, providerId }, tenant)
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

  if (!hasHydrated) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-bg px-4 py-8">
        <p role="status" className="text-sm text-muted">
          {copy.checkingSession}
        </p>
      </div>
    );
  }

  if (!accessToken) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col gap-6 bg-bg px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-ink">{copy.title}</h1>
          <Link href="/patients" className="text-sm font-medium text-primary">
            {copy.patientsLink}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {showForm ? copy.cancel : copy.newAppointment}
          </button>
          <ThemeToggle />
        </div>
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
        <div className="w-full max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-sm">
          <AppointmentForm token={accessToken} tenant={tenant} onCreated={handleAppointmentCreated} />
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
