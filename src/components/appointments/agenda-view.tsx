'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  listAppointments,
  updateAppointment,
  type Appointment,
  type AppointmentStatus,
} from '@/lib/appointments/appointments-api';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { localDayRange, localWeekRange } from '@/lib/appointments/day-range';
import { monthGridRange, addMonths, monthLabel } from '@/lib/appointments/calendar-grid';
import { DayAgenda } from '@/components/appointments/day-agenda';
import { WeekTimeGrid } from '@/components/appointments/week-time-grid';
import { MonthAgenda } from '@/components/appointments/month-agenda';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import {
  STATUS_LABELS,
  formatTimeRange,
  patientLabel,
} from '@/components/appointments/appointment-display';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FormField } from '@/components/molecules/form-field';
import { FieldError } from '@/components/errors/field-error';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  newAppointment: 'Nueva cita',
  newAppointmentForDay: 'Nueva cita este día',
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
  prevDay: 'Día anterior',
  nextDay: 'Día siguiente',
  prevWeek: 'Semana anterior',
  nextWeek: 'Semana siguiente',
  todayBtn: 'Hoy',
  dayDetail: 'Detalle del día',
  refreshing: 'Actualizando…',
  retry: 'Reintentar',
  loading: 'Cargando agenda…',
  // Escalón 2 (control): etiqueta corta, el contexto lo da el propio filtro.
  staffFieldError: 'No se pudieron cargar',
  // Escalón 1 con reintento (Mes/Día/Semana, las tres vía `appointmentsReloadKey`):
  // sin "Intenta de nuevo." — `SectionError` trae su propio botón.
  genericAppointmentsError: 'No pudimos cargar la agenda.',
  // Escalón 3 (segundo plano): sin "Intenta de nuevo." — el toast trae acción.
  genericRefreshError: 'No pudimos actualizar la agenda.',
  genericStatusChangeError: 'No pudimos cambiar el estado de la cita.',
  /** Selected-day appointment count, shown above the day panel in the month view. */
  dayCount: (n: number) => (n === 0 ? 'Sin citas' : n === 1 ? '1 cita' : `${n} citas`),
  noProviders: 'No hay profesionales activos en esta clínica.',
  selectProviderPrompt: 'Selecciona un profesional para ver su agenda.',
  statusLabel: 'Estado',
};

const STATUS_OPTIONS: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

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

/** `WeekTimeGrid`'s `weekStart` (the Monday of `date`'s week, as a local `YYYY-MM-DD`) — derived from `localWeekRange`'s `from` boundary so the two never drift apart. */
function weekStartOf(date: string): string {
  return dateToLocalDateString(new Date(localWeekRange(date).from));
}

type ViewMode = 'month' | 'day' | 'week';

const VIEW_MODES: ViewMode[] = ['month', 'day', 'week'];
const VIEW_LABEL: Record<ViewMode, string> = {
  month: copy.monthView,
  day: copy.dayView,
  week: copy.weekView,
};

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

/** `date` shifted by `n` local days, as `YYYY-MM-DD` — the ‹ › step for the
 * Día view (n = ±1) and the Semana view (n = ±7). */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dateToLocalDateString(d);
}

/** The week's range label for the Semana nav, e.g. "9 – 15 de marzo" (or
 * spanning months, "30 mar – 5 abr"), derived from `localWeekRange`. */
function weekRangeLabel(date: string): string {
  const { from, to } = localWeekRange(date);
  const start = new Date(from);
  // `to` is the exclusive end (next Monday 00:00) — step back a day for the
  // inclusive Sunday shown to the user.
  const end = new Date(new Date(to).getTime() - 24 * 60 * 60 * 1000);
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString('es', {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' }),
  });
  const endStr = end.toLocaleDateString('es', { day: 'numeric', month: 'long' });
  return `${startStr} – ${endStr}`;
}

/** Suma `mins` a una hora "HH:mm" y devuelve "HH:mm" (acota a 23:59). */
function addMinutesToTime(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + mins, 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Contextual date navigation shown above each view (Mes/Día/Semana): a
 * ‹ › stepper (whose stride is the view's own unit), a "Hoy" reset, and the
 * current period's label. Replaces the old raw date input that used to sit in
 * the toolbar — navigation now belongs with the view it drives.
 */
function DateNav({
  label,
  prevLabel,
  nextLabel,
  date,
  onPrev,
  onNext,
  onToday,
  onDateChange,
}: {
  label: string;
  prevLabel: string;
  nextLabel: string;
  date: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateChange: (date: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" aria-label={prevLabel} onClick={onPrev}>
          <ChevronLeft />
        </Button>
        <Button type="button" variant="outline" size="sm" aria-label={nextLabel} onClick={onNext}>
          <ChevronRight />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onToday}>
          Hoy
        </Button>
        {/* Compact jump-to-date, contextual to the view (moved out of the old
            fat toolbar) — for reaching a far date without stepping. */}
        <input
          type="date"
          aria-label={copy.dateLabel}
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className={cn(fieldClass, 'ml-1 h-8 w-auto px-2.5 py-1 text-sm')}
        />
      </div>
      <p className="text-sm font-semibold text-ink first-letter:uppercase">{label}</p>
    </div>
  );
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
  // Truthy is all that's needed — the rendered `FieldError` shows a fixed
  // short label (`copy.staffFieldError`), never the server's message.
  const [staffError, setStaffError] = useState(false);
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
  // Whether the day panel (right drawer / bottom sheet) is open — opened by
  // clicking a day in the month calendar; shows that day's appointments
  // without pushing the calendar or scrolling the page.
  const [dayPanelOpen, setDayPanelOpen] = useState(false);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsLoadError, setAppointmentsLoadError] = useState<string | null>(null);
  const [appointmentsRefreshing, setAppointmentsRefreshing] = useState(false);
  // Bumped by the retry button on any of the three views' `SectionError` —
  // Mes/Día pass it straight through as `MonthAgenda`/`DayAgenda`'s `onRetry`
  // prop; Semana's error is hand-rolled here instead (no `WeekTimeGrid` error
  // prop exists), so it wires the same key directly. Either way this is the
  // one thing that forces the load effect below to refire.
  const [appointmentsReloadKey, setAppointmentsReloadKey] = useState(0);


  const [showForm, setShowForm] = useState(false);
  // Prefill for `AppointmentForm` when opened from an empty slot in
  // `WeekTimeGrid` (`handleSelectSlot`) — falls back to `selectedDate` alone
  // (no start/end) when the form is opened via the "Nueva cita" toggle
  // instead.
  const [slotPrefill, setSlotPrefill] = useState<
    { date: string; startTime: string; endTime: string } | null
  >(null);
  // The appointment whose inline detail panel (status change) is open — set
  // by `WeekTimeGrid`'s `onSelectAppointment`.
  const [detailAppointment, setDetailAppointment] = useState<Appointment | null>(null);

  // Provider filter defaults to '' = "Todos los profesionales" (the month
  // calendar shows the whole clinic; `listAppointments` omits `providerId`
  // when it's empty). A specific provider narrows every view.

  // Status-change control (`DayAgenda`'s `onStatusChange`/`updatingId` props):
  // `updatingId` tracks which row's PATCH is in flight so `DayAgenda` can
  // disable just that row's select; a failed PATCH surfaces via
  // `notifyError` (background, rung 3) instead of blocking state.
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
  }, [token, staffReloadKey]);

  // Patient names come joined on each appointment (`patientFirstName` /
  // `patientLastName`, see `patientLabel`). This used to fetch a
  // `patientId -> name` map via `GET /patients?pageSize=100`, which the API
  // caps at 100 — so in a clinic with more patients than that, every
  // appointment for patient #101+ rendered as a raw UUID. Nothing to fetch
  // here anymore.

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
  }, [token, providerId, selectedDate, viewMode, appointmentsReloadKey]);

  function refreshAppointmentsInPlace(): Promise<void> {
    if (!token) return Promise.resolve();
    setAppointmentsRefreshing(true);
    const { from, to } = rangeFor(viewMode, selectedDate);
    return listAppointments(token, { from, to, providerId: providerId || undefined })
      .then((data) => {
        setAppointments(data);
      })
      .catch((err) => {
        notifyError(err instanceof ApiError ? err.message : copy.genericRefreshError, {
          onRetry: () => refreshAppointmentsInPlaceRef.current(),
        });
      })
      .finally(() => setAppointmentsRefreshing(false));
  }

  // `refreshAppointmentsInPlace` closes over `providerId`/`selectedDate`/
  // `viewMode` from the render it was created in. The old inline retry
  // button got the current filters for free (a fresh `onClick` every
  // render); the toast's `onRetry` is built once inside the `catch` and can
  // sit on screen across renders, so it must call through a ref kept in
  // sync every render instead of closing over the function directly —
  // otherwise switching provider/date/view while the toast is still up and
  // then hitting "Reintentar" replays the *stale* filters and can overwrite
  // fresh data with the old provider's appointments.
  const refreshAppointmentsInPlaceRef = useRef(refreshAppointmentsInPlace);
  refreshAppointmentsInPlaceRef.current = refreshAppointmentsInPlace;

  function handleAppointmentCreated() {
    setShowForm(false);
    setSlotPrefill(null);
    refreshAppointmentsInPlace();
  }

  /** `WeekTimeGrid`'s `onSelectDay` — jumps the day selector to the clicked column and switches back to Día view, mirroring a calendar "drill in" interaction. */
  function handleSelectDay(date: string) {
    setSelectedDate(date);
    setViewMode('day');
    setDetailAppointment(null);
  }

  /** `WeekTimeGrid`'s `onSelectSlot` — opens the create form pre-filled with the clicked slot's date/start time (end defaults to +30min). */
  function handleSelectSlot(date: string, startTime: string) {
    setSlotPrefill({ date, startTime, endTime: addMinutesToTime(startTime, 30) });
    setDetailAppointment(null);
    setShowForm(true);
  }

  /** `MonthAgenda`'s `onSelectDay` — selects the day and opens the day panel
   * (right drawer / bottom sheet) with that day's appointments; the calendar
   * stays put, nothing pushes the page. */
  function handleSelectMonthDay(date: string) {
    setSelectedDate(date);
    setDayPanelOpen(true);
  }

  /** Segmented "Vista" control — switches view and clears any open detail;
   * leaving Mes also closes the day panel. */
  function selectView(mode: ViewMode) {
    setViewMode(mode);
    setDetailAppointment(null);
    if (mode !== 'month') setDayPanelOpen(false);
  }

  /** Toolbar "Nueva cita" — opens the create form for the selected date (no
   * slot prefill); also closes the day panel so the two overlays don't stack. */
  function openNewAppointment() {
    setSlotPrefill(null);
    setDayPanelOpen(false);
    setShowForm(true);
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
    try {
      await updateAppointment(token, id, { status });
      await refreshAppointmentsInPlace();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : copy.genericStatusChangeError, {
        onRetry: () => handleStatusChange(id, status),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  // The detail panel's displayed appointment, kept in sync with the
  // server-confirmed `appointments` array (same pattern as `DayAgenda`'s row
  // `<select>`, whose `value` is also read off `appointments`, not local
  // state) — so a failed status PATCH leaves the real, unchanged status
  // showing instead of the optimistic one (review fix). Falls back to
  // `detailAppointment` itself if it's since dropped out of `appointments`
  // (e.g. a day/week range change while the panel is open).
  const liveDetailAppointment = detailAppointment
    ? appointments.find((a) => a.id === detailAppointment.id) ?? detailAppointment
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Lean control row: view segmented control + compact provider filter on
          the left, the single primary action on the right. Date navigation is
          contextual (below, with the calendar) — no fat toolbar card, no date
          input that duplicates the "Nueva cita" form. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label={copy.viewLabel}
            className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
          >
            {VIEW_MODES.map((m) => {
              const active = viewMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectView(m)}
                  className={cn(
                    'h-8 rounded-md px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2',
                    active
                      ? 'bg-surface text-ink shadow-sm'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {VIEW_LABEL[m]}
                </button>
              );
            })}
          </div>
          {staffError ? (
            <FieldError
              label={copy.staffFieldError}
              onRetry={() => setStaffReloadKey((k) => k + 1)}
              className="h-9"
            />
          ) : (
            <select
              aria-label={copy.providerLabel}
              disabled={staffLoading}
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className={cn(fieldClass, 'h-9 w-auto min-w-[11rem] text-sm')}
            >
              <option value="">{copy.allProviders}</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.fullName}
                </option>
              ))}
            </select>
          )}
        </div>
        <Button type="button" onClick={openNewAppointment}>
          <Plus /> {copy.newAppointment}
        </Button>
      </div>

      {appointmentsRefreshing && (
        <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
          {copy.refreshing}
        </p>
      )}

      {/* The active view, full width — nothing renders below it, so the page
          never grows a second scroll region. The day detail lives in a sheet. */}
      {viewMode === 'month' ? (
        <div className="flex flex-col gap-3">
          <DateNav
            label={monthLabel(selectedDate)}
            prevLabel={copy.prevMonth}
            nextLabel={copy.nextMonth}
            date={selectedDate}
            onDateChange={setSelectedDate}
            onPrev={() => setSelectedDate(addMonths(selectedDate, -1))}
            onNext={() => setSelectedDate(addMonths(selectedDate, 1))}
            onToday={() => setSelectedDate(today)}
          />
          <MonthAgenda
            appointments={appointments}
            monthDate={selectedDate}
            selectedDate={selectedDate}
            today={today}
            onSelectDay={handleSelectMonthDay}
            loading={appointmentsLoading}
            error={appointmentsLoadError}
            onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
          />
        </div>
      ) : viewMode === 'week' ? (
        <div className="flex flex-col gap-3">
          <DateNav
            label={weekRangeLabel(selectedDate)}
            prevLabel={copy.prevWeek}
            nextLabel={copy.nextWeek}
            date={selectedDate}
            onDateChange={setSelectedDate}
            onPrev={() => setSelectedDate(addDays(selectedDate, -7))}
            onNext={() => setSelectedDate(addDays(selectedDate, 7))}
            onToday={() => setSelectedDate(today)}
          />
          {/* `WeekTimeGrid` is purely presentational (no loading/error props,
              unlike `DayAgenda`) — mirror `DayAgenda`'s own loading/error
              branches here so Semana still surfaces the feedback the grid
              itself doesn't render. */}
          {appointmentsLoading ? (
            <p role="status" className="text-sm text-muted">
              {copy.loading}
            </p>
          ) : appointmentsLoadError ? (
            <SectionError
              description={appointmentsLoadError}
              onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
              retryLabel={copy.retry}
            />
          ) : (
            <WeekTimeGrid
              appointments={appointments}
              weekStart={weekStartOf(selectedDate)}
                onSelectDay={handleSelectDay}
              onSelectSlot={handleSelectSlot}
              onSelectAppointment={(a) => setDetailAppointment(a)}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <DateNav
            label={longDayLabel(selectedDate)}
            prevLabel={copy.prevDay}
            nextLabel={copy.nextDay}
            date={selectedDate}
            onDateChange={setSelectedDate}
            onPrev={() => setSelectedDate(addDays(selectedDate, -1))}
            onNext={() => setSelectedDate(addDays(selectedDate, 1))}
            onToday={() => setSelectedDate(today)}
          />
          <DayAgenda
            appointments={appointments}
            loading={appointmentsLoading}
            error={appointmentsLoadError}
            onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
            onStatusChange={handleStatusChange}
            updatingId={updatingId}
          />
        </div>
      )}

      {/* Create-appointment form (centered dialog — protected focus for a
          multi-field task). */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setSlotPrefill(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.newAppointment}</DialogTitle>
            <DialogDescription>{copy.newAppointmentDesc}</DialogDescription>
          </DialogHeader>
          <AppointmentForm
            token={token}
            onCreated={handleAppointmentCreated}
            defaultDate={slotPrefill?.date ?? selectedDate}
            defaultStartTime={slotPrefill?.startTime}
            defaultEndTime={slotPrefill?.endTime}
          />
        </DialogContent>
      </Dialog>

      {/* Day panel — right drawer (sm+) / bottom sheet (mobile). Opens on a
          day click in the month view; shows that day's appointments without
          pushing the calendar or scrolling the page. */}
      <Sheet open={dayPanelOpen} onOpenChange={setDayPanelOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{longDayLabel(selectedDate)}</SheetTitle>
            <SheetDescription>
              {copy.dayCount(selectedDayAppointments.length)}
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-3">
            <DayAgenda
              appointments={selectedDayAppointments}
              loading={appointmentsLoading}
              error={appointmentsLoadError}
              onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
              onStatusChange={handleStatusChange}
              updatingId={updatingId}
            />
          </SheetBody>
          <SheetFooter>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                setDayPanelOpen(false);
                setSlotPrefill(null);
                setShowForm(true);
              }}
            >
              <Plus /> {copy.newAppointmentForDay}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Appointment detail (from the week grid) — same sheet, so status
          changes never render a card that grows the page. */}
      <Sheet
        open={liveDetailAppointment != null}
        onOpenChange={(open) => {
          if (!open) setDetailAppointment(null);
        }}
      >
        {liveDetailAppointment && (
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                {patientLabel(liveDetailAppointment)}
              </SheetTitle>
              <SheetDescription>
                {formatTimeRange(liveDetailAppointment.start, liveDetailAppointment.end)}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-4">
              {liveDetailAppointment.reason && (
                <p className="text-sm text-ink">{liveDetailAppointment.reason}</p>
              )}
              <FormField htmlFor="detail-status" label={copy.statusLabel}>
                <select
                  id="detail-status"
                  className={fieldClass}
                  value={liveDetailAppointment.status}
                  disabled={updatingId === liveDetailAppointment.id}
                  onChange={(e) => {
                    void handleStatusChange(
                      liveDetailAppointment.id,
                      e.target.value as AppointmentStatus,
                    );
                  }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </FormField>
            </SheetBody>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
