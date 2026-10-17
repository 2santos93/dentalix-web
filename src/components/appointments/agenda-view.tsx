'use client';
import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  canMoveAppointments,
  listAppointments,
  updateAppointment,
  type Appointment,
  type AppointmentStatus,
} from '@/lib/appointments/appointments-api';
import { getLocationSchedule, type BusinessHours } from '@/lib/locations/schedule-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import {
  blocksOwnAgendaOnly,
  canWriteScheduleBlocks,
  deleteScheduleBlock,
  listScheduleBlocks,
  type ScheduleBlock,
} from '@/lib/appointments/schedule-blocks-api';
import {
  blockLabel,
  blockShownInColumn,
  type ScheduleBlockLike,
} from '@/lib/appointments/schedule-blocks';
import type { MoveTarget } from '@/lib/appointments/day-grid';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { localDayRange, localWeekRange } from '@/lib/appointments/day-range';
import { monthGridRange, addMonths, monthLabel } from '@/lib/appointments/calendar-grid';
import { DayAgenda } from '@/components/appointments/day-agenda';
import { DayColumns } from '@/components/appointments/day-columns';
import { MoveAppointmentDialog } from '@/components/appointments/move-appointment-dialog';
import {
  MAX_PROVIDER_COLUMNS,
  ProviderColumnsPicker,
} from '@/components/appointments/provider-columns-picker';
import { WeekTimeGrid } from '@/components/appointments/week-time-grid';
import { MonthAgenda } from '@/components/appointments/month-agenda';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { ConfirmationLinkPanel } from '@/components/appointments/confirmation-link-panel';
import { AppointmentRemindersPanel } from '@/components/reminders/appointment-reminders-panel';
import { NewEvolutionModal } from '@/components/clinical-notes/new-evolution-modal';
import { canRegisterEvolution } from '@/lib/clinical-notes/evolution-access';
import { ScheduleBlockDialog } from '@/components/appointments/schedule-block-dialog';
import {
  WaitlistPanel,
  attendingStaff,
  waitlistCopy,
} from '@/components/appointments/waitlist-panel';
import { useWaitlist } from '@/components/appointments/use-waitlist';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  STATUS_LABELS,
  formatTimeRange,
  patientLabel,
} from '@/components/appointments/appointment-display';
import { Plus, ChevronLeft, ChevronRight, CalendarOff, ListTodo, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';
import { toast } from 'sonner';
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
import { formatDateLabel } from '@/lib/format/date';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  // DX-170: evolución ligada a la cita, desde su tarjeta.
  registerEvolution: 'Registrar evolución',
  evolutionSaved: (patient: string) => `Evolución registrada en la ficha de ${patient}.`,
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
  // Escalón 2 (control): sin `<label>` visible que le dé contexto (a
  // diferencia de `appointment-form`, donde el mismo fallo se apoya en el
  // `<label htmlFor="appointment-provider">` de fuera del ternario) — la
  // etiqueta tiene que bastarse sola.
  staffFieldError: 'No pudimos cargar profesionales',
  // Escalón 1 con reintento (Mes/Día/Semana, las tres vía `appointmentsReloadKey`):
  // sin "Intenta de nuevo." — `SectionError` trae su propio botón.
  genericAppointmentsError: 'No pudimos cargar la agenda.',
  // Escalón 3 (segundo plano): sin "Intenta de nuevo." — el toast trae acción.
  genericRefreshError: 'No pudimos actualizar la agenda.',
  genericStatusChangeError: 'No pudimos cambiar el estado de la cita.',
  /** Selected-day appointment count, shown above the day panel in the month view. */
  dayCount: (n: number) => (n === 0 ? 'Sin citas' : n === 1 ? '1 cita' : `${n} citas`),
  noProviders: 'No hay profesionales activos en esta clínica.',
  // DX-121: la vista Día en columnas por profesional, o en lista.
  dayLayoutLabel: 'Presentación del día',
  dayColumns: 'Columnas',
  dayList: 'Lista',
  genericMoveError: 'No pudimos mover la cita.',
  moved: 'Cita movida.',
  selectProviderPrompt: 'Selecciona un profesional para ver su agenda.',
  statusLabel: 'Estado',
  // DX-122: bloqueos de agenda y pendientes por agendar.
  blockSchedule: 'Bloquear horario',
  blockCreated: 'Horario bloqueado.',
  blocksError: 'No pudimos cargar los bloqueos de la agenda.',
  removeBlockTitle: 'Quitar el bloqueo',
  removeBlockDescription: (label: string) =>
    `«${label}» deja de bloquear la agenda. Las citas no cambian.`,
  removeBlockConfirm: 'Quitar bloqueo',
  removeBlockError: 'No pudimos quitar el bloqueo. Intenta de nuevo.',
  blockRemoved: 'Bloqueo quitado.',
  waitlistButton: 'Pendientes',
  waitlistButtonCount: (n: number) => `Pendientes por agendar: ${n}`,
  waitlistSheetDescription: 'Pacientes que cancelaron o no vinieron, para volver a darles cita.',
};

/** Avisos de la API al crear o mover (p. ej. un bloqueo de almuerzo que deja agendar). */
function announceWarnings(appointment: Appointment | null | undefined) {
  for (const warning of appointment?.warnings ?? []) toast.warning(warning);
}

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
/** DX-121: la vista Día se ve en columnas por profesional (por defecto) o en lista. */
type DayLayout = 'columns' | 'list';

/**
 * Columnas por defecto: quienes atienden pacientes (odontólogos y
 * administración, que en la clínica suele ser el titular), hasta 12. Si no hay
 * ninguno, el personal entero. Recepción y asistentes se añaden con el selector.
 */
function defaultColumnIds(staff: StaffMember[]): string[] {
  const clinicians = staff.filter((s) => s.role === 'DENTIST' || s.role === 'ADMIN');
  return (clinicians.length > 0 ? clinicians : staff)
    .slice(0, MAX_PROVIDER_COLUMNS)
    .map((s) => s.userId);
}

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
  return formatDateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });
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
  const startStr = formatDateLabel(start, {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' }),
  });
  const endStr = formatDateLabel(end, { day: 'numeric', month: 'long' });
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
  const [dayLayout, setDayLayout] = useState<DayLayout>('columns');
  // `null` = todavía la selección por defecto (se deriva del personal).
  const [pickedColumnIds, setPickedColumnIds] = useState<string[] | null>(null);
  // Horario de la sede activa (sombreado de la vista en columnas). Best-effort:
  // si no se puede leer no se sombrea nada; el servidor sigue validando (422).
  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [movingAppointment, setMovingAppointment] = useState<Appointment | null>(null);
  const [movePendingId, setMovePendingId] = useState<string | null>(null);
  const role = getTokenRole(token);
  const canMove = canMoveAppointments(role);
  // DX-122: bloqueos de agenda (Día y Semana) y «Pendientes por agendar».
  const canWriteBlocks = canWriteScheduleBlocks(role);
  const ownBlocksOnly = blocksOwnAgendaOnly(role);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [blocksReloadKey, setBlocksReloadKey] = useState(0);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [activeLocationId] = useState(getActiveLocationId);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [removingBlock, setRemovingBlock] = useState<ScheduleBlockLike | null>(null);
  const [removeBlockError, setRemoveBlockError] = useState<string | null>(null);
  const [removingBlockPending, setRemovingBlockPending] = useState(false);
  const [waitlistReloadKey, setWaitlistReloadKey] = useState(0);
  const waitlist = useWaitlist(token, waitlistReloadKey);
  // Desde 1400 px la lista va en un panel lateral fijo; por debajo, en un
  // cajón. Se monta UNA sola de las dos (revisión H4).
  const wide = useMediaQuery('(min-width: 1400px)');
  const waitlistCount = waitlist.loading || waitlist.error ? null : waitlist.total;
  const [waitlistOpen, setWaitlistOpen] = useState(false);
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
    { date: string; startTime?: string; endTime?: string; providerId?: string } | null
  >(null);
  // The appointment whose detail sheet (status change + confirmación por
  // enlace) is open — set by `WeekTimeGrid`'s `onSelectAppointment` and by the
  // "Detalle" button of `DayAgenda` rows (Día view and the month's day panel).
  const [detailAppointment, setDetailAppointment] = useState<Appointment | null>(null);
  // DX-170: la cita cuya evolución se está registrando (modal abierto).
  const [evolutionFor, setEvolutionFor] = useState<Appointment | null>(null);

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

  // Con una sede activa, su horario. En «Todas las sedes» se mezclan citas de
  // sedes con horarios distintos: solo se sombrea si la clínica tiene UNA sede
  // (si no, el sombreado de una sede mentiría sobre las demás).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      if (getActiveLocationId() === null) {
        const locations = await listLocations(token);
        if (locations.length !== 1) return;
      }
      const h = await getLocationSchedule(token);
      if (!cancelled) setHours(h);
    }
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Sedes (para «Bloquear horario»). Best-effort: sin ellas se puede bloquear
  // a un profesional en todas las sedes.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listLocations(token)
      .then((data) => {
        if (!cancelled) setLocations(data.filter((l) => l.isActive));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Columnas visibles: la selección del usuario (solo ids que siguen en el
  // personal) o la de por defecto.
  const columnIds = (pickedColumnIds ?? defaultColumnIds(staff)).filter((id) =>
    staff.some((s) => s.userId === id),
  );
  const columnProviders = columnIds
    .map((id) => staff.find((s) => s.userId === id))
    .filter((s): s is StaffMember => s !== undefined);
  const columnsMode = viewMode === 'day' && dayLayout === 'columns';
  const columnsKey = columnsMode ? columnIds.join(',') : '';
  // Solo en columnas importa esperar al personal (en las demás vistas no se
  // vuelve a pedir la agenda cuando termina de cargar).
  const waitingForStaff = columnsMode && staffLoading;

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
    // En columnas hace falta saber qué profesionales pedir: se espera al
    // personal; sin ninguno no hay nada que cargar (se avisa en la vista).
    if (waitingForStaff || (columnsMode && columnsKey === '')) return;
    let cancelled = false;
    async function load() {
      setAppointmentsLoading(true);
      try {
        const { from, to } = rangeFor(viewMode, selectedDate);
        const data = await listAppointments(token, {
          from,
          to,
          ...(columnsMode
            ? { providerIds: columnsKey.split(',') }
            : { providerId: providerId || undefined }),
        });
        if (cancelled) return;
        setAppointments(data);
        setAppointmentsLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setAppointmentsLoadError(apiErrorMessage(err, copy.genericAppointmentsError));
      } finally {
        if (!cancelled) setAppointmentsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, providerId, selectedDate, viewMode, appointmentsReloadKey, columnsMode, columnsKey, waitingForStaff]);

  // DX-122: bloqueos del rango visible (Día y Semana; el Mes no los pinta).
  // Si fallan, la agenda sigue siendo correcta: aviso con Reintentar (escalón 3).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      if (viewMode === 'month' || !selectedDate) {
        setBlocks([]);
        return;
      }
      try {
        const { from, to } = rangeFor(viewMode, selectedDate);
        const data = await listScheduleBlocks(token, { from, to });
        if (!cancelled) setBlocks(data);
      } catch (err) {
        if (cancelled) return;
        notifyError(apiErrorMessage(err, copy.blocksError), {
          onRetry: () => setBlocksReloadKey((k) => k + 1),
        });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, viewMode, selectedDate, blocksReloadKey]);

  /** Bloqueos que se pintan en la Semana: los del profesional elegido (o todos) y de la sede activa. */
  const weekBlocks = blocks.filter((b) =>
    providerId
      ? blockShownInColumn(b, providerId, activeLocationId)
      : activeLocationId === null || b.locationId === null || b.locationId === activeLocationId,
  );
  const staffName = (id: string) => staff.find((s) => s.userId === id)?.fullName;

  function handleBlockCreated() {
    setShowBlockDialog(false);
    toast.success(copy.blockCreated);
    setBlocksReloadKey((k) => k + 1);
  }

  async function confirmRemoveBlock() {
    if (!removingBlock) return;
    setRemovingBlockPending(true);
    setRemoveBlockError(null);
    try {
      await deleteScheduleBlock(token, removingBlock.id);
      setRemovingBlock(null);
      toast.success(copy.blockRemoved);
      setBlocksReloadKey((k) => k + 1);
    } catch (err) {
      setRemoveBlockError(apiErrorMessage(err, copy.removeBlockError));
    } finally {
      setRemovingBlockPending(false);
    }
  }

  /** Se agendó desde «Pendientes»: la agenda se refresca sin desmontar. */
  function handleWaitlistScheduled() {
    setWaitlistOpen(false);
    void refreshAppointmentsInPlace();
  }

  function refreshAppointmentsInPlace(): Promise<void> {
    if (!token) return Promise.resolve();
    setAppointmentsRefreshing(true);
    const { from, to } = rangeFor(viewMode, selectedDate);
    return listAppointments(token, {
      from,
      to,
      ...(columnsMode && columnsKey !== ''
        ? { providerIds: columnsKey.split(',') }
        : { providerId: providerId || undefined }),
    })
      .then((data) => {
        setAppointments(data);
      })
      .catch((err) => {
        notifyError(apiErrorMessage(err, copy.genericRefreshError), {
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
  useEffect(() => {
    refreshAppointmentsInPlaceRef.current = refreshAppointmentsInPlace;
  });

  function handleAppointmentCreated(created?: Appointment) {
    setShowForm(false);
    setSlotPrefill(null);
    announceWarnings(created);
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

  /** «Nueva cita» de una columna (o clic en un hueco libre): prefija el
   * profesional y, si viene, la hora (fin = +30 min, o la duración del tipo). */
  function handleNewFromColumn(columnProviderId: string, startTime?: string) {
    setSlotPrefill({
      date: selectedDate,
      providerId: columnProviderId,
      ...(startTime ? { startTime, endTime: addMinutesToTime(startTime, 30) } : {}),
    });
    setDetailAppointment(null);
    setShowForm(true);
  }

  /**
   * Arrastre soltado (DX-121): la tarjeta pasa YA a su destino (vista previa
   * confirmada) y se hace UN PATCH. Si el servidor lo rechaza (409 solape, 422
   * fuera de horario...), la cita vuelve a su sitio y el mensaje sale en un
   * aviso con Reintentar: nunca queda a medias.
   */
  async function handleDrop(appointment: Appointment, target: MoveTarget) {
    if (!token) return;
    setAppointments((prev) =>
      prev.map((a) => (a.id === appointment.id ? { ...a, ...target } : a)),
    );
    setMovePendingId(appointment.id);
    try {
      const updated = await updateAppointment(token, appointment.id, target);
      toast.success(copy.moved);
      announceWarnings(updated);
      await refreshAppointmentsInPlace();
    } catch (err) {
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointment.id ? appointment : a)),
      );
      notifyError(apiErrorMessage(err, copy.genericMoveError), {
        onRetry: () => handleDrop(appointment, target),
      });
    } finally {
      setMovePendingId(null);
    }
  }

  /** «Mover a…» confirmado por el servidor: cierra el modal, lo anuncia y refresca. */
  function handleMoved(updated: Appointment) {
    setMovingAppointment(null);
    toast.success(copy.moved);
    announceWarnings(updated);
    void refreshAppointmentsInPlace();
  }

  /** Abre el detalle de una cita desde Día o desde el panel del día del Mes.
   * Cierra el panel del día para no apilar dos hojas. */
  function openAppointmentDetail(appointment: Appointment) {
    setDayPanelOpen(false);
    setDetailAppointment(appointment);
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
      // DX-122: cancelar o no-show deja al paciente en «Pendientes por
      // agendar», y reactivar la cita lo saca (revisión H1): se recarga siempre.
      setWaitlistReloadKey((k) => k + 1);
      await refreshAppointmentsInPlace();
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.genericStatusChangeError), {
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

  const userId = getTokenUserId(token);

  return (
    <div
      className={cn(
        'flex flex-col gap-5',
        wide && 'grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-6',
      )}
    >
      <div className="flex min-w-0 flex-col gap-5">
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
            ) : columnsMode ? (
              <ProviderColumnsPicker
                staff={staff}
                selected={columnIds}
                onChange={setPickedColumnIds}
                disabled={staffLoading || staff.length === 0}
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
          <div className="flex flex-wrap items-center gap-2">
            {/* DX-122: en pantallas sin panel lateral, los pendientes van en un cajón. */}
            {!wide ? (
            <Button
              type="button"
              variant="secondary"
              aria-label={waitlistCount === null ? copy.waitlistButton : copy.waitlistButtonCount(waitlistCount)}
              onClick={() => setWaitlistOpen(true)}
            >
              <ListTodo aria-hidden /> {copy.waitlistButton}
              {waitlistCount ? (
                <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">
                  {waitlistCount}
                </span>
              ) : null}
            </Button>
            ) : null}
            {canWriteBlocks ? (
              <Button type="button" variant="secondary" onClick={() => setShowBlockDialog(true)}>
                <CalendarOff aria-hidden /> {copy.blockSchedule}
              </Button>
            ) : null}
            <Button type="button" onClick={openNewAppointment}>
              <Plus /> {copy.newAppointment}
            </Button>
          </div>
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
                blocks={weekBlocks}
                providerName={staffName}
                selectedProviderId={providerId || null}
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
            <div
              role="group"
              aria-label={copy.dayLayoutLabel}
              className="inline-flex self-start rounded-lg border border-border bg-surface-2 p-0.5"
            >
              {(['columns', 'list'] as DayLayout[]).map((layout) => (
                <button
                  key={layout}
                  type="button"
                  aria-pressed={dayLayout === layout}
                  onClick={() => setDayLayout(layout)}
                  className={cn(
                    'h-7 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    dayLayout === layout ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                  )}
                >
                  {layout === 'columns' ? copy.dayColumns : copy.dayList}
                </button>
              ))}
            </div>
            {dayLayout === 'list' ? (
              <DayAgenda
                appointments={appointments}
                loading={appointmentsLoading}
                error={appointmentsLoadError}
                onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
                onStatusChange={handleStatusChange}
                updatingId={updatingId}
                onSelectAppointment={openAppointmentDetail}
              />
            ) : !staffLoading && !staffError && columnProviders.length === 0 ? (
              <p role="status" className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
                {copy.noProviders}
              </p>
            ) : (
              <DayColumns
                date={selectedDate}
                providers={columnProviders}
                appointments={appointments}
                hours={hours}
                loading={appointmentsLoading || staffLoading}
                error={appointmentsLoadError}
                onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
                canMove={canMove}
                onSelectAppointment={openAppointmentDetail}
                onMoveRequest={setMovingAppointment}
                onDrop={(a, target) => void handleDrop(a, target)}
                onNewAppointment={handleNewFromColumn}
                pendingId={movePendingId}
                blocks={blocks}
                activeLocationId={activeLocationId}
                onSelectBlock={
                  canWriteBlocks
                    ? (block) => {
                        setRemoveBlockError(null);
                        setRemovingBlock(block);
                      }
                    : undefined
                }
                // El odontólogo solo quita los suyos (la API daría 403).
                canSelectBlock={(block) => !ownBlocksOnly || block.providerId === userId}
              />
            )}
          </div>
        )}

        {movingAppointment && (
          <MoveAppointmentDialog
            key={movingAppointment.id}
            open
            onOpenChange={(open) => {
              if (!open) setMovingAppointment(null);
            }}
            token={token}
            appointment={movingAppointment}
            providers={staff}
            hours={hours}
            onMoved={handleMoved}
          />
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
              defaultProviderId={slotPrefill?.providerId}
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
                onSelectAppointment={openAppointmentDetail}
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
                {/* DX-170: la evolución queda ligada a esta cita. Se cierra el
                    panel antes de abrir el modal: dos capas modales a la vez
                    se pelean el foco. Recepción no lo ve (la API da 403). */}
                {canRegisterEvolution(role, liveDetailAppointment, today) ? (
                  <Button
                    type="button"
                    className="w-full sm:w-auto sm:self-start"
                    onClick={() => {
                      setEvolutionFor(liveDetailAppointment);
                      setDetailAppointment(null);
                    }}
                  >
                    <NotebookPen aria-hidden />
                    {copy.registerEvolution}
                  </Button>
                ) : null}
                {/* `key`: el enlace generado vive solo en este panel (el backend
                    guarda únicamente su hash); al cambiar de cita se descarta. */}
                <ConfirmationLinkPanel
                  key={liveDetailAppointment.id}
                  token={token}
                  appointment={liveDetailAppointment}
                  onLinkCreated={() => void refreshAppointmentsInPlace()}
                />
                {/* DX-026: se relee al reprogramar o cambiar el estado (la API
                    recalcula los pendientes con la hora y el estado vigentes). */}
                <AppointmentRemindersPanel
                  key={`${liveDetailAppointment.id}-${liveDetailAppointment.start}-${liveDetailAppointment.status}`}
                  token={token}
                  appointmentId={liveDetailAppointment.id}
                />
              </SheetBody>
            </SheetContent>
          )}
        </Sheet>
      </div>

      {/* DX-122: panel lateral fijo junto a la agenda (≥ 1400 px: a 1440 deja sitio a la tabla del día). */}
      {wide ? (
        <aside
          aria-label={waitlistCopy.title}
          className="sticky top-0 max-h-[calc(100dvh-4rem)] overflow-y-auto"
        >
          <WaitlistPanel
            token={token}
            staff={staff}
            waitlist={waitlist}
            onScheduled={handleWaitlistScheduled}
          />
        </aside>
      ) : (
        /* Cajón: a pantalla completa en móvil, lateral en tablet. */
        <Sheet open={waitlistOpen} onOpenChange={setWaitlistOpen}>
          <SheetContent className="top-0 h-dvh max-h-none rounded-none border-t-0 sm:w-[26rem]">
            <SheetHeader className="sr-only">
              <SheetTitle>{waitlistCopy.title}</SheetTitle>
              <SheetDescription>{copy.waitlistSheetDescription}</SheetDescription>
            </SheetHeader>
            {/* pt-14: la X de cerrar va arriba a la derecha, sobre el título. */}
            <SheetBody className="pt-14">
              <WaitlistPanel
                token={token}
                staff={staff}
                waitlist={waitlist}
                onScheduled={handleWaitlistScheduled}
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}

      {evolutionFor ? (
        <NewEvolutionModal
          key={evolutionFor.id}
          open
          onOpenChange={(open) => {
            if (!open) setEvolutionFor(null);
          }}
          token={token}
          patientId={evolutionFor.patientId}
          appointment={{
            id: evolutionFor.id,
            start: evolutionFor.start,
            providerName: staffName(evolutionFor.providerId),
          }}
          onCreated={() => toast.success(copy.evolutionSaved(patientLabel(evolutionFor)))}
        />
      ) : null}

      {showBlockDialog ? (
        <ScheduleBlockDialog
          open
          onOpenChange={setShowBlockDialog}
          token={token}
          staff={attendingStaff(staff)}
          locations={locations}
          activeLocationId={activeLocationId}
          defaultDate={selectedDate}
          defaultProviderId={providerId || columnIds[0]}
          ownProviderId={ownBlocksOnly ? userId : null}
          onCreated={handleBlockCreated}
        />
      ) : null}

      <ConfirmDialog
        open={removingBlock !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingBlock(null);
        }}
        title={copy.removeBlockTitle}
        description={
          removingBlock
            ? copy.removeBlockDescription(
                blockLabel(
                  removingBlock,
                  removingBlock.providerId ? staffName(removingBlock.providerId) : undefined,
                ),
              )
            : undefined
        }
        confirmLabel={copy.removeBlockConfirm}
        onConfirm={() => void confirmRemoveBlock()}
        confirming={removingBlockPending}
        error={removeBlockError}
      />
    </div>
  );
}
