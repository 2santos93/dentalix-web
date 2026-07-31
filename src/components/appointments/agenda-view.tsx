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
import { monthGridRange, addMonths, monthLabel } from '@/lib/appointments/calendar-grid';
import { DayAgenda } from '@/components/appointments/day-agenda';
import { WeekAgenda } from '@/components/appointments/week-agenda';
import { MonthAgenda } from '@/components/appointments/month-agenda';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FormField } from '@/components/molecules/form-field';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  newAppointment: 'Nueva cita',
  newAppointmentDesc: 'Agenda una cita para un paciente con su profesional, fecha y horario.',
  cancel: 'Cancelar',
  providerLabel: 'Profesional',
  allProviders: 'Todos los profesionales',
  dateLabel: 'Fecha',
  viewLabel: 'Vista',
  monthView: 'Mes',
  dayView: 'Día',
  weekView: 'Semana',
  prevMonth: 'Mes anterior',
  nextMonth: 'Mes siguiente',
  todayBtn: 'Hoy',
  dayDetail: 'Detalle del día',
  refreshing: 'Actualizando…',
  retry: 'Reintentar',
  genericStaffError: 'No pudimos cargar los profesionales. Intenta de nuevo.',
  genericAppointmentsError: 'No pudimos cargar la agenda. Intenta de nuevo.',
  genericRefreshError: 'No pudimos actualizar la agenda. Intenta de nuevo.',
  genericStatusChangeError: 'No pudimos actualizar el estado de la cita. Intenta de nuevo.',
  /** Selected-day appointment count, shown above the day panel in the month view. */
  dayCount: (n: number) => (n === 0 ? 'Sin citas' : n === 1 ? '1 cita' : `${n} citas`),
};

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

type ViewMode = 'month' | 'day' | 'week';

/** The `{ from, to }` fetch range for the active view + selected date. */
function rangeFor(mode: ViewMode, date: string): { from: string; to: string } {
  if (mode === 'month') return monthGridRange(date);
  if (mode === 'week') return localWeekRange(date);
  return localDayRange(date);
}

/** Local `YYYY-MM-DD` of an appointment's start (for filtering to the selected day in the month panel). */
function localDayKeyOf(iso: string): string {
  return dateToLocalDateString(new Date(iso));
}

/** Weekday + day + month label for the day-panel header, e.g. "lunes, 15 de marzo". */
function longDayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
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
  // Today's local date — stable across renders (set once) so the calendar's
  // "today" highlight and the "Hoy" button never drift mid-session.
  const [today] = useState(todayLocalDateString);
  // Mes (calendar) | Día | Semana. 'month' is the default landing view: a
  // month grid of all providers' appointments; picking a day reveals its full
  // list + the new-appointment flow below (see the `viewMode === 'month'`
  // branch). 'day'/'week' keep the original single-provider agenda.
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsLoadError, setAppointmentsLoadError] = useState<string | null>(null);
  const [appointmentsRefreshing, setAppointmentsRefreshing] = useState(false);
  const [appointmentsRefreshError, setAppointmentsRefreshError] = useState<string | null>(null);

  const [patientNames, setPatientNames] = useState<Record<string, string>>({});

  const [showForm, setShowForm] = useState(false);

  // Provider filter defaults to '' = "Todos los profesionales" (the month
  // calendar shows the whole clinic; `listAppointments` omits `providerId`
  // when it's empty). A specific provider narrows every view.

  // Status-change control (`DayAgenda`'s `onStatusChange`/`updatingId` props):
  // `updatingId` tracks which row's PATCH is in flight so `DayAgenda` can
  // disable just that row's select; `statusChangeError` surfaces a failed
  // PATCH the same way `appointmentsRefreshError` does.
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);

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

  // Full (blocking) load whenever the provider, the selected day, or the view
  // changes. No `providerId` guard: '' means "all providers" — a valid fetch
  // (`listAppointments` just omits the param), which is the month view's default.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setAppointmentsLoading(true);
      try {
        const { from, to } = rangeFor(viewMode, selectedDate);
        const data = await listAppointments(token, { from, to, providerId: providerId || undefined });
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
    if (!token) return Promise.resolve();
    setAppointmentsRefreshing(true);
    const { from, to } = rangeFor(viewMode, selectedDate);
    return listAppointments(token, { from, to, providerId: providerId || undefined })
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

  /** `MonthAgenda`'s `onSelectDay` — selects the day WITHOUT leaving the month view; the day's full list + "Nueva cita" render in the panel below the calendar. */
  function handleSelectMonthDay(date: string) {
    setSelectedDate(date);
  }

  // The selected day's appointments, derived from the month's fetched set —
  // no extra request; the panel and the calendar share one source of truth.
  const selectedDayAppointments = appointments.filter(
    (a) => localDayKeyOf(a.start) === selectedDate,
  );

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
                disabled={staffLoading}
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className={fieldClass}
              >
                <option value="">{copy.allProviders}</option>
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
            <FormField htmlFor="agenda-view-mode" label={copy.viewLabel}>
              <div id="agenda-view-mode" role="group" className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'month' ? 'default' : 'outline'}
                  aria-pressed={viewMode === 'month'}
                  onClick={() => setViewMode('month')}
                >
                  {copy.monthView}
                </Button>
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
          {/* In the month view the primary "Nueva cita" lives in the day panel
              (contextual to the selected day); here it covers Día/Semana. */}
          {viewMode !== 'month' && (
            <Button type="button" onClick={() => setShowForm(true)}>
              <Plus /> {copy.newAppointment}
            </Button>
          )}
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

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.newAppointment}</DialogTitle>
            <DialogDescription>{copy.newAppointmentDesc}</DialogDescription>
          </DialogHeader>
          <AppointmentForm
            token={token}
            onCreated={handleAppointmentCreated}
            defaultDate={selectedDate}
          />
        </DialogContent>
      </Dialog>

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

      {viewMode === 'month' ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={copy.prevMonth}
                  onClick={() => setSelectedDate(addMonths(selectedDate, -1))}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={copy.nextMonth}
                  onClick={() => setSelectedDate(addMonths(selectedDate, 1))}
                >
                  <ChevronRight />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDate(today)}
                >
                  {copy.todayBtn}
                </Button>
              </div>
              <p className="text-sm font-semibold text-ink first-letter:uppercase">
                {monthLabel(selectedDate)}
              </p>
            </div>
            <MonthAgenda
              appointments={appointments}
              monthDate={selectedDate}
              selectedDate={selectedDate}
              today={today}
              onSelectDay={handleSelectMonthDay}
              patientNames={patientNames}
              loading={appointmentsLoading}
              error={appointmentsLoadError}
            />
          </div>

          <section
            aria-label={copy.dayDetail}
            className="flex flex-col gap-3 border-t border-border pt-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-ink first-letter:uppercase">
                  {longDayLabel(selectedDate)}
                </h2>
                <p className="text-xs text-muted">
                  {copy.dayCount(selectedDayAppointments.length)}
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => setShowForm(true)}>
                <Plus /> {copy.newAppointment}
              </Button>
            </div>
            <DayAgenda
              appointments={selectedDayAppointments}
              loading={appointmentsLoading}
              error={appointmentsLoadError}
              patientNames={patientNames}
              onStatusChange={handleStatusChange}
              updatingId={updatingId}
            />
          </section>
        </div>
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
