'use client';
import { Checkbox } from '@/components/ui/checkbox';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  canMoveAppointments,
  listAppointments,
  updateAppointment,
  type Appointment,
  type AppointmentStatus,
  type AppointmentWriteDetail,
} from '@/lib/appointments/appointments-api';
import { getLocationSchedule, type BusinessHours } from '@/lib/locations/schedule-api';
import { getRoster, type MinuteRangeDto, type Roster } from '@/lib/locations/provider-schedule-api';
import { hiddenProviderIds, rosterDayOf } from '@/lib/locations/provider-schedule';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { NEW_APPOINTMENT_EVENT, NEW_APPOINTMENT_PARAM } from '@/lib/ui/new-appointment';
import type { ClinicLocation } from '@/lib/locations/locations-api';
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
import { monthGridRange, addMonths, monthLabel } from '@/lib/appointments/calendar-grid';
import { DayAgenda } from '@/components/appointments/day-agenda';
import { CoverageDetailLine } from '@/components/appointments/coverage-detail-line';
import { DayColumns } from '@/components/appointments/day-columns';
import { listChairs, type Chair } from '@/lib/chairs/chairs-api';
import {
  NO_CHAIR_COLUMN,
  chairColumnOf,
  chairColumns as buildChairColumns,
  chairDisplayName,
  readColumnsBy,
  writeColumnsBy,
  type ColumnsBy,
} from '@/lib/chairs/chair-columns';
import { announceAppointmentWarnings } from '@/components/appointments/appointment-warnings';
import { MoveAppointmentDialog } from '@/components/appointments/move-appointment-dialog';
import { CompletedExitModal } from '@/components/appointments/completed-exit-modal';
import { AppointmentStatusSelect } from '@/components/appointments/appointment-status-select';
import { CancelAppointmentDialog } from '@/components/appointments/cancel-appointment-dialog';
import { AttendanceBadge } from '@/components/appointments/attendance-badge';
import { cancellationSummary } from '@/lib/cancellations/cancellation';
import { completedExitSummary } from '@/lib/appointments/plan-item-reservations';
import {
  MAX_PROVIDER_COLUMNS,
  ProviderColumnsPicker,
} from '@/components/appointments/provider-columns-picker';
import { WeekTimeGrid } from '@/components/appointments/week-time-grid';
import { AgendaStatusLegend, MonthAgenda } from '@/components/appointments/month-agenda';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { AppointmentMedicalAlerts } from '@/components/clinical/appointment-medical-alerts';
import { ConfirmationLinkPanel } from '@/components/appointments/confirmation-link-panel';
import { CancellationFeePanel } from '@/components/appointments/cancellation-fee-panel';
import { AppointmentRemindersPanel } from '@/components/reminders/appointment-reminders-panel';
import { AppointmentPostOpPanel } from '@/components/postop/appointment-postop-panel';
import { AnamnesisLinkPanel } from '@/components/anamnesis/anamnesis-link-panel';
import { canDeliverPostOp } from '@/lib/postop/postop-api';
import { NewEvolutionModal } from '@/components/clinical-notes/new-evolution-modal';
import { canRegisterEvolution } from '@/lib/clinical-notes/evolution-access';
import { ScheduleBlockDialog } from '@/components/appointments/schedule-block-dialog';
import {
  WaitlistPanel,
  attendingStaff,
  waitlistCopy,
} from '@/components/appointments/waitlist-panel';
import { useWaitlist } from '@/components/appointments/use-waitlist';
import { FillOpeningPanel } from '@/components/appointments/fill-opening-panel';
import { WANTS_EARLIER_LABEL } from '@/components/appointments/wants-earlier-chip';
import { canChangeWantsEarlier } from '@/lib/appointments/wants-earlier';
import {
  canOfferOpenings,
  canSeeOpeningCandidates,
  type OpeningSlot,
} from '@/lib/appointments/opening-candidates';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  STATUS_LABELS,
  patientLabel,
} from '@/components/appointments/appointment-display';
import { Plus, ChevronLeft, ChevronRight, CalendarOff, ListTodo, NotebookPen, Armchair, FileDown, Siren } from 'lucide-react';
import { ContingencyAgendaDialog, contingencyCopy } from '@/components/appointments/contingency-agenda-dialog';
import { WalkInDialog, walkInCopy } from '@/components/appointments/walk-in-dialog';
import { canWalkIn, type WalkInResult } from '@/lib/appointments/walk-in';
import { canDownloadContingencyAgenda } from '@/lib/appointments/contingency-agenda-api';
import { InClinicPanel, inClinicCopy } from '@/components/appointments/in-clinic-panel';
import { focusLocationSwitcher } from '@/components/locations/location-switcher';
import {
  dismissReservedToasts,
  PatientFlowActions,
  usePatientFlow,
} from '@/components/appointments/patient-flow-actions';
import { useInClinic } from '@/components/appointments/use-in-clinic';
import {
  inClinicCount,
  notifyInClinicChanged,
  statusOptionsFor,
} from '@/lib/appointments/patient-flow';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
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
import { civilDateLabel } from '@/lib/format/date';
import { sedeTimeRange, useSedeClock, type AgendaClock } from '@/lib/locations/sede-clock';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { Skeleton } from '@/components/ui/skeleton';
import { isCivilDay } from '@/lib/time/civil-day';
import { addCivilDays, civilWeekStart, wallDay, wallDayRange, wallWeekRange } from '@/lib/time/wall-clock';

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
  // DX-211: columnas por profesional o por sillón (solo si la sede tiene sillones).
  columnsByLabel: 'Columnas',
  columnsByProviders: 'Profesionales',
  columnsByChairs: 'Sillones',
  chairsError: 'No pudimos cargar los sillones de la sede: la agenda se ve por profesional.',
  genericMoveError: 'No pudimos mover la cita.',
  moved: 'Cita movida.',
  // DX-210: «Ocupar este hueco» tras cancelar.
  cancelled: 'Cita cancelada.',
  cancelledBy: 'Canceló:',
  completedExitDone: (status: string) => `La cita pasó a «${status}».`,
  fillOpening: 'Ocupar este hueco',
  filled: 'La agenda ya muestra al paciente en el hueco.',
  wantsEarlierHint: 'Saldrá como candidato cuando se libere un hueco en un día anterior.',
  wantsEarlierError: 'No pudimos cambiar «Adelantar si hay hueco».',
  selectProviderPrompt: 'Selecciona un profesional para ver su agenda.',
  statusLabel: 'Estado',
  detailChair: 'Sillón',
  detailProvider: 'Profesional',
  detailType: 'Tipo',
  detailReason: 'Motivo',
  // DX-122: bloqueos de agenda y pendientes por agendar.
  blockSchedule: 'Bloquear horario',
  blockCreated: 'Horario bloqueado.',
  walkInCreated: (patient: string) => `${patient || 'El paciente'} ya está en «En clínica».`,
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
  // DX-200: panel «En clínica».
  inClinicButton: 'En clínica',
  inClinicButtonCount: (n: number) => `En clínica: ${n}`,
  inClinicSheetDescription: 'Quién espera, quién está en el sillón y quién está listo para cobrar en la sede.',
  // DX-233: horario de cada profesional en la sede activa.
  showAllProviders: 'Mostrar todos',
  hiddenProviders: (n: number) =>
    n === 1
      ? '1 profesional no atiende este día en esta sede.'
      : `${n} profesionales no atienden este día en esta sede.`,
  nobodyWorks: 'Ningún profesional de las columnas atiende este día en esta sede.',
};


type ViewMode = 'month' | 'day' | 'week';
/** DX-121: la vista Día se ve en columnas por profesional (por defecto) o en lista. */
type DayLayout = 'columns' | 'list';

/**
 * Columnas por defecto: quienes atienden pacientes (odontólogos y
 * administración, que en la clínica suele ser el titular), hasta 12. Si no hay
 * ninguno, el personal entero. Recepción y asistentes se añaden con el selector.
 *
 * DX-089: con una sede activa, solo los clínicos que trabajan en ella
 * (`locationIds` nulo = todas las sedes). Si ninguno, se cae a la regla de
 * siempre para no dejar la vista vacía.
 */
function defaultColumnIds(staff: StaffMember[], activeLocationId: string | null): string[] {
  const clinicians = staff.filter((s) => s.role === 'DENTIST' || s.role === 'ADMIN');
  const inLocation =
    activeLocationId === null
      ? []
      : clinicians.filter((s) => !s.locationIds || s.locationIds.includes(activeLocationId));
  const pool = inLocation.length > 0 ? inLocation : clinicians.length > 0 ? clinicians : staff;
  return pool.slice(0, MAX_PROVIDER_COLUMNS).map((s) => s.userId);
}

// Orden de granularidad, del panorama al detalle.
const VIEW_MODES: ViewMode[] = ['month', 'week', 'day'];

/** Teléfono: Día en lista por defecto y Mes como calendario de puntos (critique-ops §1, research §1.4). */
const PHONE_QUERY = '(max-width: 767px)';
/** Desde aquí «En clínica» y «Pendientes» van en una columna fija junto a la agenda. */
const SIDE_PANEL_QUERY = '(min-width: 1280px)';
const VIEW_LABEL: Record<ViewMode, string> = {
  month: copy.monthView,
  day: copy.dayView,
  week: copy.weekView,
};

/**
 * The `{ from, to }` fetch range for the active view + selected date, in the
 * sede zone (DX-378): the agenda's days are the sede's days, in any browser.
 */
function rangeFor(mode: ViewMode, date: string, timeZone: string): { from: string; to: string } {
  if (mode === 'month') return monthGridRange(date, timeZone);
  if (mode === 'week') return wallWeekRange(date, timeZone);
  return wallDayRange(date, timeZone);
}

/** Weekday + day + month label for the day-panel header, e.g. "lunes, 15 de marzo". */
function longDayLabel(date: string): string {
  return civilDateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** The week's range label for the Semana nav, e.g. "9 – 15 de marzo" (or
 * spanning months, "30 mar – 5 abr"). Civil days: no zone involved. */
function weekRangeLabel(date: string): string {
  const start = civilWeekStart(date);
  const end = addCivilDays(start, 6);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const startStr = civilDateLabel(start, {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' }),
  });
  const endStr = civilDateLabel(end, { day: 'numeric', month: 'long' });
  return `${startStr} – ${endStr}`;
}

/** Suma `mins` a una hora "HH:mm" y devuelve "HH:mm" (acota a 23:59). */
function addMinutesToTime(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + mins, 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Salto a una fecha (DatePicker de la sede: dd/mm/aaaa, nunca el formato del
 * navegador). Lo que se escribe a medias no mueve la agenda: solo un día
 * completo; al cambiar el día desde fuera (‹ ›, Hoy), el campo se alinea.
 */
function AgendaDateField({ date, onDateChange }: { date: string; onDateChange: (date: string) => void }) {
  const [draft, setDraft] = useState<string | null>(date);
  const [shown, setShown] = useState(date);
  if (date !== shown) {
    setShown(date);
    setDraft(date);
  }
  return (
    <DatePicker
      aria-label={copy.dateLabel}
      value={draft}
      onChange={(next) => {
        setDraft(next);
        if (next && isCivilDay(next)) onDateChange(next);
      }}
      className="w-[10.5rem] shrink-0"
    />
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
  // DX-378: la agenda va en la zona y el reloj de la sede, nunca en los del
  // navegador. Sin ellos no hay días que contar: el error de la sede con su
  // Reintentar en lugar de la agenda.
  const sede = useSedeClock(token);
  if (sede.status === 'loading') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">{copy.loading}</span>
        <Skeleton aria-hidden className="h-9 w-64" />
        <Skeleton aria-hidden className="h-96 w-full" />
      </div>
    );
  }
  if (sede.status === 'error') {
    return (
      <SedeConfigError
        kind={sede.kind}
        description={sede.message}
        onRetry={sede.retry}
        locationId={sede.locationId}
      />
    );
  }
  return <AgendaScreen token={token} clock={sede.clock} />;
}

/** La agenda con el reloj de la sede ya resuelto. */
function AgendaScreen({ token, clock }: AgendaViewProps & { clock: AgendaClock }) {
  const timeZone = clock.timeZone;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  // Truthy is all that's needed — the rendered `FieldError` shows a fixed
  // short label (`copy.staffFieldError`), never the server's message.
  const [staffError, setStaffError] = useState(false);
  const [staffReloadKey, setStaffReloadKey] = useState(0);
  const [providerId, setProviderId] = useState('');

  const [selectedDate, setSelectedDate] = useState(() => sedeToday(timeZone));
  // Today in the sede — stable across renders so the calendar's "today"
  // highlight and the "Hoy" button never drift mid-session; recomputed only
  // when the sede of the screen changes to one in another zone (DX-378).
  const [todayIn, setTodayIn] = useState(() => ({ timeZone, day: sedeToday(timeZone) }));
  let today = todayIn.day;
  if (todayIn.timeZone !== timeZone) {
    today = sedeToday(timeZone);
    setTodayIn({ timeZone, day: today });
  }
  // Mes (calendar) | Semana | Día. Sin una elección explícita, la vista de
  // partida depende del ancho: en escritorio y tablet, el Mes (todas las
  // citas de la clínica; elegir un día abre su lista en un panel); en el
  // teléfono, el Día en lista (hora · paciente · profesional · estado), que es
  // lo que se lee con el pulgar (research §1.4). Elegir una vista o una
  // presentación la fija para el resto de la sesión de la pantalla.
  const phone = useMediaQuery(PHONE_QUERY);
  const [pickedView, setPickedView] = useState<ViewMode | null>(null);
  const [pickedDayLayout, setPickedDayLayout] = useState<DayLayout | null>(null);
  const viewMode: ViewMode = pickedView ?? (phone ? 'day' : 'month');
  const dayLayout: DayLayout = pickedDayLayout ?? (phone ? 'list' : 'columns');
  // `null` = todavía la selección por defecto (se deriva del personal).
  const [pickedColumnIds, setPickedColumnIds] = useState<string[] | null>(null);
  // DX-211: «Columnas: Profesionales | Sillones», recordado por usuario.
  const [columnsBy, setColumnsBy] = useState<ColumnsBy>(() => readColumnsBy(getTokenUserId(token)));
  // Sillones de la sede activa (también los inactivos: sus citas los nombran).
  // Best-effort: sin ellos la agenda sigue por profesional.
  const [chairs, setChairs] = useState<Chair[]>([]);
  const [chairsReloadKey, setChairsReloadKey] = useState(0);
  // Horario de la sede activa (sombreado de la vista en columnas). Best-effort:
  // si no se puede leer no se sombrea nada; el servidor sigue validando (422).
  const [hours, setHours] = useState<BusinessHours | null>(null);
  // DX-233: cuadrante del día en la sede activa (horario de cada profesional).
  // Best-effort, como el horario de la sede: sin él no se sombrea ni se oculta.
  const [roster, setRoster] = useState<Roster | null>(null);
  const [showAllProviders, setShowAllProviders] = useState(false);
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
  // DX-470: «Atender sin cita».
  const [showWalkIn, setShowWalkIn] = useState(false);
  // DX-339: agenda de contingencia en PDF (ADMIN y RECEPTION).
  const [showContingency, setShowContingency] = useState(false);
  const [removingBlock, setRemovingBlock] = useState<ScheduleBlockLike | null>(null);
  const [removeBlockError, setRemoveBlockError] = useState<string | null>(null);
  const [removingBlockPending, setRemovingBlockPending] = useState(false);
  const [waitlistReloadKey, setWaitlistReloadKey] = useState(0);
  const waitlist = useWaitlist(token, waitlistReloadKey);
  // Desde 1280 px la lista va en un panel lateral fijo; por debajo, en un
  // cajón. Se monta UNA sola de las dos (revisión H4).
  const wide = useMediaQuery(SIDE_PANEL_QUERY);
  const waitlistCount = waitlist.loading || waitlist.error ? null : waitlist.total;
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  // DX-200: panel «En clínica» (lateral desde 1280 px; si no, en un cajón).
  // Se relee al cambiar un estado en la agenda, además de su sondeo.
  const [inClinicReloadKey, setInClinicReloadKey] = useState(0);
  const requestLocations = useSessionLocations(token);
  const inClinic = useInClinic(token, { reloadKey: inClinicReloadKey });
  const [inClinicOpen, setInClinicOpen] = useState(false);
  const chooseLocationOnClose = useRef(false);
  const inClinicTotal = inClinic.view ? inClinicCount(inClinic.view) : null;
  // DX-210: el hueco libre (o la cita recién cancelada) a ocupar.
  const [fillSlot, setFillSlot] = useState<OpeningSlot | null>(null);
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
    { date: string; startTime?: string; endTime?: string; providerId?: string; chairId?: string } | null
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
  // DX-273: salir de «Completada» pide un motivo (modal).
  const [completedExit, setCompletedExit] = useState<{
    id: string;
    to: AppointmentStatus;
  } | null>(null);
  // DX-279: cancelar pide quién cancela y el motivo (modal), y avisa si es tardía.
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  // El selector de estado desde el que se abrió: al cerrar el diálogo el foco
  // vuelve ahí (Radix lo devolvería a la opción de la lista, que ya no existe).
  const cancelReturnFocus = useRef<HTMLElement | null>(null);

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
        const locations = await requestLocations();
        if (locations.length !== 1) return;
      }
      const h = await getLocationSchedule(token);
      if (!cancelled) setHours(h);
    }
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations]);

  // DX-233: en Día (columnas) con una sede activa, el cuadrante de ese día.
  // En «Todas las sedes» no hay una sede con la que comparar: nada.
  const rosterWanted = viewMode === 'day' && dayLayout === 'columns' && activeLocationId !== null;
  useEffect(() => {
    if (!token || !rosterWanted || activeLocationId === null) return;
    let cancelled = false;
    getRoster(token, { weekStart: selectedDate, days: 1, locationId: activeLocationId })
      .then((r) => {
        if (!cancelled) setRoster(r);
      })
      .catch(() => {
        if (!cancelled) setRoster(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, rosterWanted, activeLocationId, selectedDate, appointmentsReloadKey]);

  // DX-211: sillones de la sede activa (en «Todas las sedes» no hay columnas por sillón).
  useEffect(() => {
    if (!token || activeLocationId === null) return;
    let cancelled = false;
    listChairs(token, activeLocationId, { includeInactive: true })
      .then((data) => {
        if (!cancelled) setChairs(data);
      })
      .catch(() => {
        if (cancelled) return;
        setChairs([]);
        // Quien trabaja por sillón se entera (escalón 3, con Reintentar); a
        // quien no, no le cambia nada.
        if (readColumnsBy(getTokenUserId(token)) === 'chairs') {
          notifyError(copy.chairsError, { onRetry: () => setChairsReloadKey((k) => k + 1) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, activeLocationId, chairsReloadKey]);

  // Sedes (para «Bloquear horario»). Best-effort: sin ellas se puede bloquear
  // a un profesional en todas las sedes.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    requestLocations()
      .then((data) => {
        if (!cancelled) setLocations(data.filter((l) => l.isActive));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations]);

  // Columnas visibles: la selección del usuario (solo ids que siguen en el
  // personal) o la de por defecto.
  const columnIds = (pickedColumnIds ?? defaultColumnIds(staff, activeLocationId)).filter((id) =>
    staff.some((s) => s.userId === id),
  );
  const columnProviders = columnIds
    .map((id) => staff.find((s) => s.userId === id))
    .filter((s): s is StaffMember => s !== undefined);
  const columnsMode = viewMode === 'day' && dayLayout === 'columns';
  // DX-211: la vista por sillón solo existe si la sede tiene alguno activo.
  const hasChairs = chairs.some((c) => c.active);
  const chairMode = columnsMode && hasChairs && columnsBy === 'chairs';
  // DX-233: el cuadrante solo vale para el día que se mira (uno viejo, de otro
  // día, no oculta ni sombrea nada). Quien tiene citas activas ese día se ve
  // siempre: ocultarlo escondería citas reales agendadas fuera de horario.
  const dayRoster = rosterWanted && roster?.from === selectedDate ? roster : null;
  const busyIds = new Set(
    appointments.filter((a) => a.status !== 'CANCELLED').map((a) => a.providerId),
  );
  const offToday = [...hiddenProviderIds(dayRoster, selectedDate)].filter(
    (id) => columnIds.includes(id) && !busyIds.has(id),
  );
  const visibleColumnProviders = showAllProviders
    ? columnProviders
    : columnProviders.filter((p) => !offToday.includes(p.userId));
  const providerRanges: Record<string, MinuteRangeDto[] | null> = Object.fromEntries(
    columnProviders.map((p) => [p.userId, rosterDayOf(dayRoster, p.userId, selectedDate)?.locationRanges ?? null]),
  );
  // Por sillón se pide toda la sede (incluidas las citas sin sillón).
  const columnsKey = columnsMode && !chairMode ? columnIds.join(',') : '';
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
    if (waitingForStaff || (columnsMode && !chairMode && columnsKey === '')) return;
    let cancelled = false;
    async function load() {
      setAppointmentsLoading(true);
      try {
        const { from, to } = rangeFor(viewMode, selectedDate, timeZone);
        const data = await listAppointments(token, {
          from,
          to,
          ...(chairMode
            ? {}
            : columnsMode
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
  }, [token, providerId, selectedDate, viewMode, appointmentsReloadKey, columnsMode, chairMode, columnsKey, waitingForStaff, timeZone]);

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
        const { from, to } = rangeFor(viewMode, selectedDate, timeZone);
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
  }, [token, viewMode, selectedDate, blocksReloadKey, timeZone]);

  /** Bloqueos que se pintan en la Semana: los del profesional elegido (o todos) y de la sede activa. */
  const weekBlocks = blocks.filter((b) =>
    providerId
      ? blockShownInColumn(b, providerId, activeLocationId)
      : activeLocationId === null || b.locationId === null || b.locationId === activeLocationId,
  );
  const staffName = (id: string) => staff.find((s) => s.userId === id)?.fullName;

  function handleWalkInCreated(result: WalkInResult) {
    const name = [result.patientFirstName, result.patientLastName].filter(Boolean).join(' ');
    toast.success(copy.walkInCreated(name));
    void refreshAppointmentsInPlace();
  }

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

  /**
   * DX-210: abre «Ocupar este hueco». La sede es la de la cita cancelada o,
   * para un hueco libre, la sede activa. En «Todas las sedes» solo hay huecos
   * libres si la clínica tiene UNA sede (sin ella no hay horario con el que
   * calcularlos): esa. Nunca una sede cualquiera de la lista; sin sede cierta
   * no se abre (hay que elegir la sede arriba).
   */
  function openFillOpening(
    slotProviderId: string,
    slot: { start: string; end: string },
    locationId?: string,
  ) {
    const location =
      locationId ?? activeLocationId ?? (locations.length === 1 ? locations[0].id : null);
    if (!location) return;
    if (!clock.of(location)) {
      notifyError(SEDE_LOCALE_ERROR);
      return;
    }
    setDetailAppointment(null);
    setFillSlot({ locationId: location, providerId: slotProviderId, ...slot });
  }

  function handleOpeningFilled() {
    setFillSlot(null);
    toast.success(copy.filled);
    setWaitlistReloadKey((k) => k + 1);
    void refreshAppointmentsInPlace();
  }

  function refreshAppointmentsInPlace(): Promise<void> {
    if (!token) return Promise.resolve();
    setAppointmentsRefreshing(true);
    const { from, to } = rangeFor(viewMode, selectedDate, timeZone);
    return listAppointments(token, {
      from,
      to,
      ...(chairMode
        ? {}
        : columnsMode && columnsKey !== ''
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

  // DX-200: un paso del flujo (desde la tarjeta, el detalle o el panel)
  // refresca la agenda y el panel; por la ref, con los filtros vigentes.
  const flow = usePatientFlow(token, () => {
    setInClinicReloadKey((k) => k + 1);
    void refreshAppointmentsInPlaceRef.current();
  });

  /** Botones rápidos del flujo de una cita de la agenda (DX-200). */
  function renderFlowActions(appointment: Appointment, className = 'mt-2') {
    return (
      <PatientFlowActions
        appointmentId={appointment.id}
        status={appointment.status}
        role={role}
        isToday={wallDay(appointment.start, timeZone) === today}
        patientName={patientLabel(appointment)}
        runner={flow}
        className={className}
      />
    );
  }

  function handleAppointmentCreated(created?: Appointment) {
    setShowForm(false);
    setSlotPrefill(null);
    announceAppointmentWarnings(created);
    refreshAppointmentsInPlace();
  }

  /** `WeekTimeGrid`'s `onSelectDay` — jumps the day selector to the clicked column and switches back to Día view, mirroring a calendar "drill in" interaction. */
  function handleSelectDay(date: string) {
    setSelectedDate(date);
    setPickedView('day');
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

  /** DX-211: «Nueva cita» de la columna de un sillón (sin profesional: lo propone el sillón). */
  function handleNewFromChair(columnId: string, startTime?: string) {
    setSlotPrefill({
      date: selectedDate,
      // Solo un sillón activo se puede elegir (los inactivos salen como
      // columna por sus citas, pero no admiten citas nuevas).
      ...(columnId !== NO_CHAIR_COLUMN && chairs.some((c) => c.id === columnId && c.active)
        ? { chairId: columnId }
        : {}),
      ...(startTime ? { startTime, endTime: addMinutesToTime(startTime, 30) } : {}),
    });
    setDetailAppointment(null);
    setShowForm(true);
  }

  function selectColumnsBy(value: ColumnsBy) {
    setColumnsBy(value);
    writeColumnsBy(getTokenUserId(token), value);
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
      announceAppointmentWarnings(updated);
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

  /** «Mover a…»: sin el reloj de la sede de la cita no se puede elegir su hora. */
  function requestMove(appointment: Appointment) {
    if (!clock.of(appointment.locationId)) {
      notifyError(SEDE_LOCALE_ERROR);
      return;
    }
    setMovingAppointment(appointment);
  }

  /** «Mover a…» confirmado por el servidor: cierra el modal, lo anuncia y refresca. */
  function handleMoved(updated: Appointment) {
    setMovingAppointment(null);
    toast.success(copy.moved);
    announceAppointmentWarnings(updated);
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
    // En el teléfono la lista del día va debajo del calendario (sin hoja).
    if (!phone) setDayPanelOpen(true);
  }

  /** Segmented "Vista" control — switches view and clears any open detail;
   * leaving Mes also closes the day panel. */
  function selectView(mode: ViewMode) {
    setPickedView(mode);
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

  // A4: la paleta de comandos abre «Nueva cita» — con `?nueva=cita` si viene
  // de otra pantalla, o con un evento si ya está en la Agenda. El parámetro se
  // retira de la URL para que recargar no vuelva a abrir el formulario.
  const openNewAppointmentRef = useRef(openNewAppointment);
  useEffect(() => {
    openNewAppointmentRef.current = openNewAppointment;
  });
  useEffect(() => {
    const open = () => openNewAppointmentRef.current();
    const params = new URLSearchParams(window.location.search);
    if (params.get(NEW_APPOINTMENT_PARAM) === 'cita') {
      params.delete(NEW_APPOINTMENT_PARAM);
      const rest = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
      open();
    }
    window.addEventListener(NEW_APPOINTMENT_EVENT, open);
    return () => window.removeEventListener(NEW_APPOINTMENT_EVENT, open);
  }, []);

  // The selected day's appointments, derived from the month's fetched set —
  // no extra request; the panel and the calendar share one source of truth.
  const selectedDayAppointments = appointments.filter(
    (a) => wallDay(a.start, timeZone) === selectedDate,
  );

  /**
   * `DayAgenda`'s `onStatusChange` — `PATCH`es the appointment's status, then
   * refreshes the day list in place (same no-remount pattern as
   * `handleAppointmentCreated`) so the badge reflects the new status without
   * losing scroll/focus. `refreshAppointmentsInPlace()` is `await`ed (not
   * fire-and-forget) so `updatingId` — and therefore the row's disabled
   * status selector — stays set for the *whole* window until the refetched
   * `appointments` state actually lands, not just until the PATCH settles;
   * otherwise the select would briefly re-enable showing the stale
   * pre-change status (review fix).
   */
  async function handleStatusChange(
    id: string,
    status: AppointmentStatus,
    trigger?: HTMLElement | null,
  ) {
    if (!token) return;
    const before = appointments.find((a) => a.id === id);
    // DX-279: cancelar va por el modal de origen y motivo (también desde
    // «Completada», que pide además el motivo de esa salida).
    if (status === 'CANCELLED' && before && before.status !== 'CANCELLED') {
      cancelReturnFocus.current = trigger ?? null;
      setCancelling(before);
      return;
    }
    // DX-273: la salida de «Completada» va por el modal del motivo.
    if (before?.status === 'COMPLETED' && status !== 'COMPLETED') {
      setCompletedExit({ id, to: status });
      return;
    }
    setUpdatingId(id);
    try {
      await updateAppointment(token, id, { status });
      await afterStatusChange();
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.genericStatusChangeError), {
        onRetry: () => handleStatusChange(id, status),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  /**
   * Tras cambiar el estado: DX-122 cancelar o no-show deja al paciente en
   * «Pendientes por agendar» y reactivar lo saca (revisión H1); DX-200
   * completar o cancelar a alguien en la clínica lo saca del panel.
   */
  async function afterStatusChange() {
    setWaitlistReloadKey((k) => k + 1);
    setInClinicReloadKey((k) => k + 1);
    notifyInClinicChanged();
    await refreshAppointmentsInPlace();
  }

  /** DX-279: la cita quedó cancelada con su origen y motivo. */
  async function handleCancelled(before: Appointment) {
    setCancelling(null);
    // DX-210: la cita recién cancelada deja un hueco: se ofrece ocuparlo.
    const offersOpening =
      new Date(before.end).getTime() > Date.now() &&
      canSeeOpeningCandidates(role, getTokenUserId(token), before.providerId);
    toast.success(
      copy.cancelled,
      offersOpening
        ? {
            action: {
              label: copy.fillOpening,
              onClick: () =>
                openFillOpening(
                  before.providerId,
                  { start: before.start, end: before.end },
                  before.locationId,
                ),
            },
          }
        : undefined,
    );
    await afterStatusChange();
  }

  /** DX-273: la cita salió de «Completada»: aviso con el mínimo recalculado. */
  async function handleCompletedExitDone(result: AppointmentWriteDetail) {
    setCompletedExit(null);
    const summary = result.completedExit ? completedExitSummary(result.completedExit) : [];
    toast.success(copy.completedExitDone(STATUS_LABELS[result.status]), {
      description: summary.length ? summary.join(' ') : undefined,
    });
    setWaitlistReloadKey((k) => k + 1);
    setInClinicReloadKey((k) => k + 1);
    notifyInClinicChanged();
    await refreshAppointmentsInPlace();
  }

  /** DX-210: marcar o desmarcar «Adelantar si hay hueco» desde el detalle. */
  async function handleWantsEarlierChange(id: string, wantsEarlier: boolean) {
    if (!token) return;
    setUpdatingId(id);
    try {
      await updateAppointment(token, id, { wantsEarlier });
      await refreshAppointmentsInPlace();
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.wantsEarlierError), {
        onRetry: () => handleWantsEarlierChange(id, wantsEarlier),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  // The detail panel's displayed appointment, kept in sync with the
  // server-confirmed `appointments` array (same pattern as `DayAgenda`'s row
  // status selector, whose `value` is also read off `appointments`, not local
  // state) — so a failed status PATCH leaves the real, unchanged status
  // showing instead of the optimistic one (review fix). Falls back to
  // `detailAppointment` itself if it's since dropped out of `appointments`
  // (e.g. a day/week range change while the panel is open).
  const liveDetailAppointment = detailAppointment
    ? appointments.find((a) => a.id === detailAppointment.id) ?? detailAppointment
    : null;

  const userId = getTokenUserId(token);
  // DX-378: «Ocupar este hueco» habla con el reloj de la sede del hueco.
  const fillClock = fillSlot ? clock.of(fillSlot.locationId) : null;
  // «Mover a…» elige la fecha y la hora en el reloj de la sede de la cita.
  const movingClock = movingAppointment ? clock.of(movingAppointment.locationId) : null;

  // La navegación del periodo, según la vista: ‹ › avanzan su unidad.
  const nav =
    viewMode === 'month'
      ? {
          label: monthLabel(selectedDate),
          prevLabel: copy.prevMonth,
          nextLabel: copy.nextMonth,
          step: (d: number) => addMonths(selectedDate, d),
        }
      : viewMode === 'week'
        ? {
            label: weekRangeLabel(selectedDate),
            prevLabel: copy.prevWeek,
            nextLabel: copy.nextWeek,
            step: (d: number) => addCivilDays(selectedDate, 7 * d),
          }
        : {
            label: longDayLabel(selectedDate),
            prevLabel: copy.prevDay,
            nextLabel: copy.nextDay,
            step: (d: number) => addCivilDays(selectedDate, d),
          };

  const counterClass = 'rounded-full bg-surface-active px-1.5 text-xs font-semibold tabular-nums text-ink';

  return (
    <div className="flex flex-col gap-5">
      {/* Barra de la agenda. Fila 1: vista · ‹ › Hoy · fecha · periodo, y a la
          derecha las dos acciones. Fila 2: el filtro de profesional (con su
          etiqueta visible), la presentación del Día y, sin panel lateral,
          «En clínica» y «Pendientes». Se parte en filas limpias a 900 y 390. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <SegmentedControl
            semantics="toggle"
            fullWidthOnMobile
            aria-label={copy.viewLabel}
            value={viewMode}
            onValueChange={selectView}
            options={VIEW_MODES.map((m) => ({ value: m, label: VIEW_LABEL[m] }))}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={nav.prevLabel}
                onClick={() => setSelectedDate(nav.step(-1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={nav.nextLabel}
                onClick={() => setSelectedDate(nav.step(1))}
              >
                <ChevronRight />
              </Button>
              <Button type="button" variant="outline" onClick={() => setSelectedDate(today)}>
                {copy.todayBtn}
              </Button>
            </div>
            <AgendaDateField date={selectedDate} onDateChange={setSelectedDate} />
          </div>
          <h2 className="t-title min-w-0 text-ink first-letter:uppercase" data-testid="agenda-period">
            {nav.label}
          </h2>
          <div className="ml-auto flex shrink-0 gap-2">
            {/* En el teléfono «Bloquear horario» baja, como icono con su
                nombre, a la fila de «En clínica» y «Pendientes»: así «Nueva
                cita» cabe junto al periodo. */}
            {canDownloadContingencyAgenda(role) && !phone ? (
              <Button type="button" variant="secondary" onClick={() => setShowContingency(true)}>
                <FileDown aria-hidden /> {contingencyCopy.button}
              </Button>
            ) : null}
            {canWriteBlocks && !phone ? (
              <Button type="button" variant="secondary" onClick={() => setShowBlockDialog(true)}>
                <CalendarOff aria-hidden /> {copy.blockSchedule}
              </Button>
            ) : null}
            {canWalkIn(role) && !phone ? (
              <Button type="button" variant="secondary" onClick={() => setShowWalkIn(true)}>
                <Siren aria-hidden /> {walkInCopy.button}
              </Button>
            ) : null}
            <Button type="button" onClick={openNewAppointment}>
              <Plus /> {copy.newAppointment}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {staffError ? (
            <FieldError
              label={copy.staffFieldError}
              onRetry={() => setStaffReloadKey((k) => k + 1)}
              className="h-10"
            />
          ) : chairMode ? null : columnsMode ? (
            <ProviderColumnsPicker
              staff={staff}
              selected={columnIds}
              onChange={setPickedColumnIds}
              disabled={staffLoading || staff.length === 0}
            />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <label htmlFor="agenda-provider" className="t-label shrink-0 text-muted">
                {copy.providerLabel}
              </label>
              <NativeSelect
                id="agenda-provider"
                disabled={staffLoading}
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="min-w-0 sm:w-56"
              >
                <option value="">{copy.allProviders}</option>
                {staff.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.fullName}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {viewMode === 'day' ? (
            <SegmentedControl
              semantics="toggle"
              size="sm"
              aria-label={copy.dayLayoutLabel}
              value={dayLayout}
              onValueChange={setPickedDayLayout}
              options={[
                { value: 'columns' as const, label: copy.dayColumns },
                { value: 'list' as const, label: copy.dayList },
              ]}
            />
          ) : null}
          {columnsMode && hasChairs ? (
            <div className="flex items-center gap-2">
              <span id="agenda-columns-by" className="t-label shrink-0 text-muted">
                {copy.columnsByLabel}
              </span>
              <SegmentedControl
                semantics="toggle"
                size="sm"
                aria-labelledby="agenda-columns-by"
                value={columnsBy}
                onValueChange={selectColumnsBy}
                options={[
                  { value: 'providers' as const, label: copy.columnsByProviders },
                  { value: 'chairs' as const, label: copy.columnsByChairs },
                ]}
              />
            </div>
          ) : null}
          {!wide ? (
            <div className="flex w-full gap-2 sm:ml-auto sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
              {/* DX-200: «En clínica», en un cajón sin panel lateral. */}
              <Button
                type="button"
                variant="secondary"
                aria-label={
                  inClinicTotal === null ? copy.inClinicButton : copy.inClinicButtonCount(inClinicTotal)
                }
                onClick={() => {
                  // QA DX-273 (D1): la hoja ya ofrece «Traer a esta cita»;
                  // el toast quedaría encima sin recibir toques.
                  dismissReservedToasts();
                  setInClinicOpen(true);
                }}
              >
                <Armchair aria-hidden /> {copy.inClinicButton}
                {inClinicTotal ? <span className={counterClass}>{inClinicTotal}</span> : null}
              </Button>
              {/* DX-122: en pantallas sin panel lateral, los pendientes van en un cajón. */}
              <Button
                type="button"
                variant="secondary"
                aria-label={waitlistCount === null ? copy.waitlistButton : copy.waitlistButtonCount(waitlistCount)}
                onClick={() => setWaitlistOpen(true)}
              >
                <ListTodo aria-hidden /> {copy.waitlistButton}
                {waitlistCount ? <span className={counterClass}>{waitlistCount}</span> : null}
              </Button>
              {canWalkIn(role) && phone ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="flex-none!"
                  title={walkInCopy.button}
                  onClick={() => setShowWalkIn(true)}
                >
                  <Siren aria-hidden />
                  <span className="sr-only">{walkInCopy.button}</span>
                </Button>
              ) : null}
              {canWriteBlocks && phone ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="flex-none!"
                  title={copy.blockSchedule}
                  onClick={() => setShowBlockDialog(true)}
                >
                  <CalendarOff aria-hidden />
                  <span className="sr-only">{copy.blockSchedule}</span>
                </Button>
              ) : null}
              {canDownloadContingencyAgenda(role) && phone ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="flex-none!"
                  title={contingencyCopy.button}
                  onClick={() => setShowContingency(true)}
                >
                  <FileDown aria-hidden />
                  <span className="sr-only">{contingencyCopy.button}</span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'flex flex-col gap-5',
          wide && 'grid grid-cols-[minmax(0,1fr)_18rem] items-start gap-6',
        )}
      >
      <div className="flex min-w-0 flex-col gap-4">
        {appointmentsRefreshing && (
          <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
            {copy.refreshing}
          </p>
        )}

        {/* The active view, full width. The day detail lives in a sheet (on
            the phone, the month's selected day is listed under the calendar). */}
        {viewMode === 'month' ? (
          <div className="flex flex-col gap-3">
            <MonthAgenda
              appointments={appointments}
              clock={clock}
              monthDate={selectedDate}
              selectedDate={selectedDate}
              today={today}
              onSelectDay={handleSelectMonthDay}
              loading={appointmentsLoading}
              error={appointmentsLoadError}
              onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
              compact={phone}
            />
            <AgendaStatusLegend showAlert={!phone} />
            {phone ? (
              <section aria-labelledby="agenda-selected-day" className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 id="agenda-selected-day" className="t-title text-ink first-letter:uppercase">
                    {longDayLabel(selectedDate)}
                  </h3>
                  <span className="t-caption tabular-nums text-muted">
                    {copy.dayCount(selectedDayAppointments.length)}
                  </span>
                </div>
                <DayAgenda
                  appointments={selectedDayAppointments}
                  clock={clock}
                  loading={appointmentsLoading}
                  error={appointmentsLoadError}
                  onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
                  onStatusChange={handleStatusChange}
                  role={role}
                  updatingId={updatingId}
                  onSelectAppointment={openAppointmentDetail}
                  renderActions={renderFlowActions}
                  providerName={staffName}
                />
              </section>
            ) : null}
          </div>
        ) : viewMode === 'week' ? (
          <div className="flex flex-col gap-3">
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
                clock={clock}
                weekStart={civilWeekStart(selectedDate)}
                onSelectDay={handleSelectDay}
                onSelectSlot={handleSelectSlot}
                onSelectAppointment={(a) => setDetailAppointment(a)}
                blocks={weekBlocks}
                providerName={staffName}
                selectedProviderId={providerId || null}
              />
            )}
            <AgendaStatusLegend />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {columnsMode && offToday.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-muted">{copy.hiddenProviders(offToday.length)}</span>
                <Checkbox
                  checked={showAllProviders}
                  onChange={(e) => setShowAllProviders(e.target.checked)}
                  label={copy.showAllProviders}
                />
              </div>
            ) : null}
            {dayLayout === 'list' ? (
              <DayAgenda
                appointments={appointments}
                clock={clock}
                loading={appointmentsLoading}
                error={appointmentsLoadError}
                onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
                onStatusChange={handleStatusChange}
                role={role}
                updatingId={updatingId}
                onSelectAppointment={openAppointmentDetail}
                renderActions={renderFlowActions}
                providerName={staffName}
              />
            ) : chairMode ? (
              <DayColumns
                date={selectedDate}
                clock={clock}
                providers={staff}
                chairColumns={{
                  columns: buildChairColumns(chairs, appointments),
                  columnOf: chairColumnOf,
                }}
                appointments={appointments}
                hours={hours}
                loading={appointmentsLoading}
                error={appointmentsLoadError}
                onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
                canMove={canMove}
                onSelectAppointment={openAppointmentDetail}
                onMoveRequest={requestMove}
                onDrop={(a, target) => void handleDrop(a, target)}
                onNewAppointment={handleNewFromChair}
                pendingId={movePendingId}
                blocks={blocks}
                activeLocationId={activeLocationId}
              />
            ) : !staffLoading && !staffError && columnProviders.length === 0 ? (
              <p role="status" className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
                {copy.noProviders}
              </p>
            ) : !showAllProviders && visibleColumnProviders.length === 0 && !appointmentsLoading ? (
              <p role="status" className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
                {copy.nobodyWorks}
              </p>
            ) : (
              <DayColumns
                date={selectedDate}
                clock={clock}
                providers={visibleColumnProviders}
                providerRanges={providerRanges}
                appointments={appointments}
                hours={hours}
                loading={appointmentsLoading || staffLoading}
                error={appointmentsLoadError}
                onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
                canMove={canMove}
                onSelectAppointment={openAppointmentDetail}
                onMoveRequest={requestMove}
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
                // DX-210: «Ocupar este hueco» (el odontólogo, solo su columna).
                onFillOpening={openFillOpening}
                canFillOpening={(pid) => canSeeOpeningCandidates(role, userId, pid)}
              />
            )}
          </div>
        )}

        {completedExit && token ? (
          <CompletedExitModal
            open
            onOpenChange={(open) => {
              if (!open) setCompletedExit(null);
            }}
            token={token}
            appointmentId={completedExit.id}
            to={completedExit.to}
            onDone={(result) => void handleCompletedExitDone(result)}
          />
        ) : null}

        {cancelling && token ? (
          <CancelAppointmentDialog
            open
            onOpenChange={(open) => {
              if (!open) setCancelling(null);
            }}
            token={token}
            appointmentId={cancelling.id}
            patientName={patientLabel(cancelling)}
            fromStatus={cancelling.status}
            onCloseAutoFocus={(event) => {
              const trigger = cancelReturnFocus.current;
              cancelReturnFocus.current = null;
              if (!trigger?.isConnected) return;
              event.preventDefault();
              trigger.focus();
            }}
            onDone={() => void handleCancelled(cancelling)}
          />
        ) : null}

        {movingAppointment && movingClock && (
          <MoveAppointmentDialog
            key={movingAppointment.id}
            open
            onOpenChange={(open) => {
              if (!open) setMovingAppointment(null);
            }}
            token={token}
            appointment={movingAppointment}
            clock={movingClock}
            providers={staff}
            hours={hours}
            onMoved={handleMoved}
            chairs={chairs.filter((c) => c.locationId === movingAppointment.locationId)}
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
              defaultChairId={slotPrefill?.chairId}
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
                clock={clock}
                loading={appointmentsLoading}
                error={appointmentsLoadError}
                onRetry={() => setAppointmentsReloadKey((k) => k + 1)}
                onStatusChange={handleStatusChange}
                role={role}
                updatingId={updatingId}
                onSelectAppointment={openAppointmentDetail}
                renderActions={renderFlowActions}
                providerName={staffName}
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
                  {sedeTimeRange(liveDetailAppointment.start, liveDetailAppointment.end, clock.of(liveDetailAppointment.locationId))}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="flex flex-col gap-4 [&>*]:shrink-0">
                {/* DX-247: «Requiere premedicación» y las alertas, primero. */}
                <AppointmentMedicalAlerts flags={liveDetailAppointment.medicalAlerts} />
                {/* DX-279: inasistencias y cancelaciones tardías del paciente (12 meses). */}
                <AttendanceBadge counts={liveDetailAppointment.attendance} className="self-start" />
                {liveDetailAppointment.status === 'CANCELLED' &&
                cancellationSummary(liveDetailAppointment) ? (
                  <p className="text-sm text-muted" data-testid="cancellation-summary">
                    {copy.cancelledBy} {cancellationSummary(liveDetailAppointment)}
                  </p>
                ) : null}
                {/* Quién atiende, qué tipo y para qué: lo que recepción confirma por teléfono. */}
                <DescriptionList columns={1} layout="inline">
                  {staffName(liveDetailAppointment.providerId) ? (
                    <DescriptionItem label={copy.detailProvider}>
                      {staffName(liveDetailAppointment.providerId)}
                    </DescriptionItem>
                  ) : null}
                  {/* DX-211: el sillón de la cita, con «(inactivo)» si se desactivó. */}
                  {liveDetailAppointment.chair ? (
                    <DescriptionItem label={copy.detailChair}>
                      <span data-testid="appointment-chair">{chairDisplayName(liveDetailAppointment.chair)}</span>
                    </DescriptionItem>
                  ) : null}
                  {liveDetailAppointment.appointmentType ? (
                    <DescriptionItem label={copy.detailType}>{liveDetailAppointment.appointmentType.name}</DescriptionItem>
                  ) : null}
                  {liveDetailAppointment.reason ? (
                    <DescriptionItem label={copy.detailReason}>{liveDetailAppointment.reason}</DescriptionItem>
                  ) : null}
                </DescriptionList>
                <CoverageDetailLine coverage={liveDetailAppointment.coverage} />
                <FormField htmlFor="detail-status" label={copy.statusLabel}>
                  {/* DX-295: las flechas no cambian la cita; solo Enter o un clic. */}
                  <AppointmentStatusSelect
                    id="detail-status"
                    label={copy.statusLabel}
                    value={liveDetailAppointment.status}
                    options={statusOptionsFor(liveDetailAppointment.status, role)}
                    disabled={updatingId === liveDetailAppointment.id}
                    onChange={(status, trigger) => {
                      void handleStatusChange(liveDetailAppointment.id, status, trigger);
                    }}
                  />
                </FormField>
                {renderFlowActions(liveDetailAppointment, '')}
                {canChangeWantsEarlier(role) &&
                (liveDetailAppointment.status === 'SCHEDULED' ||
                  liveDetailAppointment.status === 'CONFIRMED') ? (
                  <Checkbox
                    id="detail-wants-earlier"
                    checked={liveDetailAppointment.wantsEarlier}
                    disabled={updatingId === liveDetailAppointment.id}
                    onChange={(e) =>
                      void handleWantsEarlierChange(liveDetailAppointment.id, e.target.checked)
                    }
                    label={WANTS_EARLIER_LABEL}
                    description={copy.wantsEarlierHint}
                  />
                ) : null}
                {liveDetailAppointment.status === 'CANCELLED' &&
                new Date(liveDetailAppointment.end).getTime() > Date.now() &&
                canSeeOpeningCandidates(role, userId, liveDetailAppointment.providerId) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto sm:self-start"
                    onClick={() =>
                      openFillOpening(
                        liveDetailAppointment.providerId,
                        { start: liveDetailAppointment.start, end: liveDetailAppointment.end },
                        liveDetailAppointment.locationId,
                      )
                    }
                  >
                    {copy.fillOpening}
                  </Button>
                ) : null}
                {/* DX-170: la evolución queda ligada a esta cita. Se cierra el
                    panel antes de abrir el modal: dos capas modales a la vez
                    se pelean el foco. Recepción no lo ve (la API da 403). */}
                {canRegisterEvolution(role, liveDetailAppointment, today, timeZone) ? (
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
                {/* DX-291: «Generar cargo» y «Condonar» en una inasistencia o
                    una cancelación tardía (ADMIN y RECEPTION; el servidor
                    dice si este usuario puede decidir). */}
                {(role === 'ADMIN' || role === 'RECEPTION') &&
                (liveDetailAppointment.status === 'NO_SHOW' ||
                  (liveDetailAppointment.status === 'CANCELLED' &&
                    liveDetailAppointment.lateCancellation === true)) ? (
                  <CancellationFeePanel
                    key={`fee-${liveDetailAppointment.id}-${liveDetailAppointment.status}`}
                    token={token}
                    appointmentId={liveDetailAppointment.id}
                  />
                ) : null}
                {/* `key`: el enlace generado vive solo en este panel (el backend
                    guarda únicamente su hash); al cambiar de cita se descarta. */}
                <ConfirmationLinkPanel
                  key={liveDetailAppointment.id}
                  token={token}
                  appointment={liveDetailAppointment}
                  clock={clock.of(liveDetailAppointment.locationId)}
                  onLinkCreated={() => void refreshAppointmentsInPlace()}
                />
                {/* DX-099: «Enviar anamnesis» antes de la cita (caduca a su
                    inicio). Solo citas aún por atender. */}
                {liveDetailAppointment.status === 'SCHEDULED' ||
                liveDetailAppointment.status === 'CONFIRMED' ? (
                  <div className="border-t border-border-subtle pt-4">
                    <AnamnesisLinkPanel
                      key={`anamnesis-${liveDetailAppointment.id}`}
                      token={token}
                      patientId={liveDetailAppointment.patientId}
                      appointmentId={liveDetailAppointment.id}
                    />
                  </div>
                ) : null}
                {/* DX-222: indicaciones postoperatorias de la cita (propuesta y entrega).
                    La `key` lleva prefijo: es hermano del panel de confirmación,
                    que ya usa el id de la cita, y dos hermanos con la misma key
                    se duplican al re-renderizar. */}
                {canDeliverPostOp(role) ? (
                  <AppointmentPostOpPanel
                    key={`postop-${liveDetailAppointment.id}`}
                    token={token}
                    appointmentId={liveDetailAppointment.id}
                    clock={clock.of(liveDetailAppointment.locationId)}
                  />
                ) : null}
                {/* DX-026: se relee al reprogramar o cambiar el estado (la API
                    recalcula los pendientes con la hora y el estado vigentes). */}
                <AppointmentRemindersPanel
                  key={`${liveDetailAppointment.id}-${liveDetailAppointment.start}-${liveDetailAppointment.status}`}
                  token={token}
                  appointmentId={liveDetailAppointment.id}
                  clock={clock.of(liveDetailAppointment.locationId)}
                />
              </SheetBody>
            </SheetContent>
          )}
        </Sheet>
      </div>

      {/* DX-122: panel lateral fijo junto a la agenda (≥ 1280 px). */}
      {wide ? (
        <aside
          aria-label={`${inClinicCopy.title} · ${waitlistCopy.title}`}
          className="sticky top-4 flex max-h-[calc(100dvh-6rem)] flex-col gap-6 divide-y divide-border-subtle overflow-y-auto overscroll-contain [&>*+*]:pt-6"
        >
          <InClinicPanel state={inClinic} role={role} runner={flow} />
          <WaitlistPanel
            token={token}
            staff={staff}
            clock={clock}
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
                clock={clock}
                waitlist={waitlist}
                onScheduled={handleWaitlistScheduled}
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}
      </div>
      {!wide ? (
        <Sheet open={inClinicOpen} onOpenChange={setInClinicOpen}>
          <SheetContent
            className="top-0 h-dvh max-h-none rounded-none border-t-0 sm:w-[26rem]"
            onCloseAutoFocus={(event) => {
              // «Elegir sede»: al cerrar la hoja, el foco va al selector de sede
              // visible (en el teléfono, el de la barra superior). Si no hay
              // ninguno a la vista, vuelve al botón que abrió la hoja.
              if (!chooseLocationOnClose.current) return;
              chooseLocationOnClose.current = false;
              if (focusLocationSwitcher()) event.preventDefault();
            }}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{inClinicCopy.title}</SheetTitle>
              <SheetDescription>{copy.inClinicSheetDescription}</SheetDescription>
            </SheetHeader>
            <SheetBody className="pt-14">
              <InClinicPanel
                state={inClinic}
                role={role}
                runner={flow}
                onChooseLocation={() => {
                  chooseLocationOnClose.current = true;
                  setInClinicOpen(false);
                }}
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
      ) : null}

      {fillSlot && fillClock ? (
        <FillOpeningPanel
          open
          onOpenChange={(open) => {
            if (!open) setFillSlot(null);
          }}
          token={token}
          slot={fillSlot}
          clock={fillClock}
          providerName={staffName(fillSlot.providerId) ?? ''}
          locationName={locations.find((l) => l.id === fillSlot.locationId)?.name ?? ''}
          canAct={canOfferOpenings(role)}
          onAssigned={handleOpeningFilled}
          onAgendaStale={() => void refreshAppointmentsInPlace()}
          onShowWaitlist={() => {
            setFillSlot(null);
            if (!wide) setWaitlistOpen(true);
          }}
        />
      ) : null}

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

      {showContingency ? (
        <ContingencyAgendaDialog
          open
          onOpenChange={setShowContingency}
          token={token}
          defaultLocationId={activeLocationId}
        />
      ) : null}

      {showWalkIn ? (
        <WalkInDialog
          open
          onOpenChange={setShowWalkIn}
          token={token}
          locationId={activeLocationId}
          defaultProviderId={providerId || null}
          onCreated={handleWalkInCreated}
        />
      ) : null}

      {showBlockDialog ? (
        <ScheduleBlockDialog
          open
          onOpenChange={setShowBlockDialog}
          token={token}
          staff={attendingStaff(staff)}
          locations={locations}
          clock={clock}
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
