'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  listAppointments,
  updateAppointment,
  type Appointment,
  type AppointmentStatus,
} from '@/lib/appointments/appointments-api';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { listPatients } from '@/lib/patients/patients-api';
import { localDayRange, localWeekRange } from '@/lib/appointments/day-range';
import { DayAgenda } from '@/components/appointments/day-agenda';
import { WeekAgenda } from '@/components/appointments/week-agenda';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/molecules/form-field';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  newAppointment: 'Nueva cita',
  cancel: 'Cancelar',
  providerLabel: 'Profesional',
  providerLoading: 'Cargando…',
  dateLabel: 'Fecha',
  viewLabel: 'Vista',
  dayView: 'Día',
  weekView: 'Semana',
  refreshing: 'Actualizando…',
  retry: 'Reintentar',
  genericStaffError: 'No pudimos cargar los profesionales. Intenta de nuevo.',
  genericAppointmentsError: 'No pudimos cargar la agenda. Intenta de nuevo.',
  genericRefreshError: 'No pudimos actualizar la agenda. Intenta de nuevo.',
  genericStatusChangeError: 'No pudimos actualizar el estado de la cita. Intenta de nuevo.',
  noProviders: 'No hay profesionales activos en esta clínica.',
  selectProviderPrompt: 'Selecciona un profesional para ver su agenda.',
};

const NEW_APPOINTMENT_FORM_ID = 'agenda-new-appointment-form';

// Native <select> styled to match the Input atom (kept native for a11y/tests).
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

function dateToLocalDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayLocalDateString(): string {
  return dateToLocalDateString(new Date());
}

/** `WeekAgenda`'s `weekStart` (the Monday of `date`'s week, as a local `YYYY-MM-DD`) — derived from `localWeekRange`'s `from` boundary so the two never drift apart. */
function weekStartOf(date: string): string {
  return dateToLocalDateString(new Date(localWeekRange(date).from));
}

interface AgendaViewProps {
  token: string;
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
export function AgendaView({ token }: AgendaViewProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffReloadKey, setStaffReloadKey] = useState(0);
  const [providerId, setProviderId] = useState('');

  const [selectedDate, setSelectedDate] = useState(todayLocalDateString);
  // Día | Semana toggle — 'day' keeps the existing single-day fetch/render;
  // 'week' swaps the range to `localWeekRange(selectedDate)` and renders
  // `WeekAgenda` instead of `DayAgenda` (see the `viewMode === 'week'` branch
  // below). Kept additive/minimal per the task brief.
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsLoadError, setAppointmentsLoadError] = useState<string | null>(null);
  const [appointmentsRefreshing, setAppointmentsRefreshing] = useState(false);
  const [appointmentsRefreshError, setAppointmentsRefreshError] = useState<string | null>(null);

  const [patientNames, setPatientNames] = useState<Record<string, string>>({});

  const [showForm, setShowForm] = useState(false);

  // Status-change control (`DayAgenda`'s `onStatusChange`/`updatingId` props):
  // `updatingId` tracks which row's PATCH is in flight so `DayAgenda` can
  // disable just that row's select; `statusChangeError` surfaces a failed
  // PATCH the same way `appointmentsRefreshError` does.
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);

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
        const data = await listStaff(token);
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
  }, [token, staffReloadKey]);

  // Patient names for `DayAgenda`'s `patientNames` map — fetched once
  // (bounded page, see `AppointmentForm`'s doc comment on the same
  // tradeoff). Best-effort: a failure here just leaves names falling back
  // to the raw `patientId` in `DayAgenda`, it's not worth its own error UI.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await listPatients(token, { pageSize: 100 });
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
  }, [token]);

  // Full (blocking) load whenever the provider or the selected day changes.
  useEffect(() => {
    if (!token || !providerId) return;
    let cancelled = false;
    async function load() {
      setAppointmentsLoading(true);
      try {
        const { from, to } =
          viewMode === 'week' ? localWeekRange(selectedDate) : localDayRange(selectedDate);
        const data = await listAppointments(token, { from, to, providerId });
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
  }, [token, providerId, selectedDate, viewMode]);

  function refreshAppointmentsInPlace(): Promise<void> {
    if (!token || !providerId) return Promise.resolve();
    setAppointmentsRefreshing(true);
    const { from, to } =
      viewMode === 'week' ? localWeekRange(selectedDate) : localDayRange(selectedDate);
    return listAppointments(token, { from, to, providerId })
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

  /** `WeekAgenda`'s `onSelectDay` — jumps the day selector to the clicked column and switches back to Día view, mirroring a calendar "drill in" interaction. */
  function handleSelectDay(date: string) {
    setSelectedDate(date);
    setViewMode('day');
  }

  /**
   * `DayAgenda`'s `onStatusChange` — `PATCH`es the appointment's status, then
   * refreshes the day list in place (same no-remount pattern as
   * `handleAppointmentCreated`) so the badge reflects the new status without
   * losing scroll/focus. `refreshAppointmentsInPlace()` is `await`ed (not
   * fire-and-forget) so `updatingId` — and therefore the row's disabled
   * `<select>` — stays set for the *whole* window until the refetched
   * `appointments` state actually lands, not just until the PATCH settles;
   * otherwise the select would briefly re-enable showing the stale
   * pre-change status (review fix).
   */
  async function handleStatusChange(id: string, status: AppointmentStatus) {
    if (!token) return;
    setUpdatingId(id);
    setStatusChangeError(null);
    try {
      await updateAppointment(token, id, { status });
      await refreshAppointmentsInPlace();
    } catch (err) {
      setStatusChangeError(err instanceof ApiError ? err.message : copy.genericStatusChangeError);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <FormField
              htmlFor="agenda-provider"
              label={copy.providerLabel}
              className="min-w-[13rem]"
            >
              <select
                id="agenda-provider"
                disabled={staffLoading || staff.length === 0}
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className={fieldClass}
              >
                {staffLoading && <option value="">{copy.providerLoading}</option>}
                {!staffLoading && staff.length === 0 && (
                  <option value="">{copy.noProviders}</option>
                )}
                {staff.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField htmlFor="agenda-date" label={copy.dateLabel}>
              <Input
                id="agenda-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto"
              />
            </FormField>
            <FormField htmlFor="agenda-view-mode-day" label={copy.viewLabel}>
              <div id="agenda-view-mode-day" role="group" className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'day' ? 'default' : 'outline'}
                  aria-pressed={viewMode === 'day'}
                  onClick={() => setViewMode('day')}
                >
                  {copy.dayView}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'week' ? 'default' : 'outline'}
                  aria-pressed={viewMode === 'week'}
                  onClick={() => setViewMode('week')}
                >
                  {copy.weekView}
                </Button>
              </div>
            </FormField>
          </div>
          <Button
            type="button"
            variant={showForm ? 'outline' : 'default'}
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
            aria-controls={NEW_APPOINTMENT_FORM_ID}
          >
            {showForm ? (
              <>
                <X /> {copy.cancel}
              </>
            ) : (
              <>
                <Plus /> {copy.newAppointment}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {staffError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-danger">
            {staffError}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStaffReloadKey((k) => k + 1)}
          >
            {copy.retry}
          </Button>
        </div>
      )}

      {showForm && (
        <Card id={NEW_APPOINTMENT_FORM_ID} className="max-w-2xl">
          <CardContent className="p-6">
            <AppointmentForm
              token={token}
              onCreated={handleAppointmentCreated}
              defaultDate={selectedDate}
            />
          </CardContent>
        </Card>
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
          <Button variant="outline" size="sm" onClick={refreshAppointmentsInPlace}>
            {copy.retry}
          </Button>
        </div>
      )}

      {statusChangeError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-xs text-danger">
            {statusChangeError}
          </p>
        </div>
      )}

      {!staffLoading && staff.length > 0 && !providerId ? (
        <p role="status" className="text-sm text-muted">
          {copy.selectProviderPrompt}
        </p>
      ) : viewMode === 'week' ? (
        <WeekAgenda
          appointments={appointments}
          weekStart={weekStartOf(selectedDate)}
          loading={appointmentsLoading}
          error={appointmentsLoadError}
          patientNames={patientNames}
          onSelectDay={handleSelectDay}
        />
      ) : (
        <DayAgenda
          appointments={appointments}
          loading={appointmentsLoading}
          error={appointmentsLoadError}
          patientNames={patientNames}
          onStatusChange={handleStatusChange}
          updatingId={updatingId}
        />
      )}
    </div>
  );
}
