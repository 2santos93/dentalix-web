'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Lock, X } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import {
  listAuditEvents,
  type AuditAction,
  type AuditEvent,
  type AuditEventsPage,
  type AuditEventsQuery,
  type AuditResourceType,
} from '@/lib/audit/audit-api';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_OPTIONS,
  AUDIT_ACTION_VARIANT,
  AUDIT_RESOURCE_LABELS,
  AUDIT_RESOURCE_OPTIONS,
  actorRoleLabel,
  communicationDetail,
  confirmationLinkDetail,
  implantSearchDetail,
  isPatientOptOut,
  staffLoginDetail,
  staffDetail,
  locationNameMap,
  type LocationNames,
  cashSessionDetail,
  sedationDetail,
  chairDetail,
  scheduleChangeDetail,
  cancellationDetail,
  healthRegistrationDetail,
  clinicSettingsDetail,
  exchangeRateBackupDetail,
  locationCalendarDetail,
  patientFlowDetail,
  importBatchDetail,
  planItemAttributionDetail,
  anamnesisDetail,
  signatureRequestDetail,
} from '@/lib/audit/audit-labels';
import { configChangeItems, type ConfigChangeItem } from '@/lib/audit/config-change';
import { auditTime, auditZoneHint, type AuditSedeTime, type AuditTime } from '@/lib/audit/audit-time';
import { listStaff, type StaffMember } from '@/lib/staff/staff-api';
import { screenLocation, sedeClockFor, type SedeClockError } from '@/lib/locations/sede-clock';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { isValidRange, MAX_RANGE_DAYS } from '@/lib/payments/cash-period';
import { isCivilDay } from '@/lib/time/civil-day';
import { wallInstant } from '@/lib/time/wall-clock';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { CursorPagination } from './cursor-pagination';
import { OriginCell, originText } from './origin-cell';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  tableLabel: 'Registro de auditoría',
  patientTableLabel: 'Accesos a la ficha',
  filtersLabel: 'Filtros de la auditoría',
  actorLabel: 'Usuario',
  actorAll: 'Todos los usuarios',
  actorUnavailable: 'Usuarios no disponibles',
  actionLabel: 'Acción',
  actionAll: 'Todas las acciones',
  resourceLabel: 'Recurso',
  resourceAll: 'Todos los recursos',
  periodLabel: 'Período',
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  rangeHint: 'Sin fechas se ven los últimos 30 días.',
  invalidRangeOrder: 'La fecha final no puede ser anterior a la inicial.',
  invalidRangeLength: `El período no puede superar ${MAX_RANGE_DAYS} días. Acórtalo e intenta de nuevo.`,
  clearFilters: 'Limpiar filtros',
  patientChip: (name: string) => `Paciente: ${name}`,
  patientFallback: 'seleccionado',
  /** DX-360: un texto que la API no guarda (cuerpo, notas): solo que cambió. */
  configHidden: 'cambió',
  clearPatient: 'Quitar el filtro de paciente',
  colWhen: 'Fecha y hora',
  // DX-362: la hora en la sede del evento, cuando su reloj marca otra.
  sedeTime: ({ name, when, offset }: AuditSedeTime) => `En ${name}: ${when}${offset ? ` ${offset}` : ''}`,
  colActor: 'Usuario',
  colAction: 'Acción',
  colResource: 'Recurso',
  colPatient: 'Paciente',
  colOrigin: 'Origen',
  unknownActor: 'Usuario no identificado',
  // DX-128: la baja de recordatorios por enlace o mensaje la hace el paciente.
  patientActor: 'El propio paciente',
  formerMember: 'Usuario retirado',
  // Sin "Intenta de nuevo.": alimenta AsyncSection -> SectionError, que trae su botón.
  loadError: 'No pudimos cargar la auditoría.',
  badRequest: 'Los filtros no son válidos: revisa las fechas (como mucho 366 días).',
  forbiddenTitle: 'Solo la administración de la clínica puede ver la auditoría.',
  forbiddenHint: 'Pídele a quien administra la clínica que lo revise contigo.',
  empty: 'No hay eventos con estos filtros.',
  emptyHint: 'Prueba con otro período, usuario o acción.',
  patientEmpty: 'Nadie ha accedido a esta ficha en el período.',
};

const PAGE_SIZE = 50;

interface Filters {
  actorUserId: string;
  action: AuditAction | '';
  resourceType: AuditResourceType | '';
  from: string;
  to: string;
}

const NO_FILTERS: Filters = {
  actorUserId: '',
  action: '',
  resourceType: '',
  from: '',
  to: '',
};

const MINUTES_PER_DAY = 24 * 60;

/** La lista de sedes no cargó: sin ella no hay reloj (la misma regla que `useSedeClock`). */
const LOCATIONS_ERROR: SedeClockError = {
  status: 'error',
  kind: 'locale',
  message: SEDE_LOCALE_ERROR,
  locationId: null,
};

/** El instante del minuto `minute` del día `day` en `timeZone`; `null` si el día no es válido. */
function dayInstant(day: string, minute: number, timeZone: string | null): string | null {
  if (!timeZone || !isCivilDay(day)) return null;
  return wallInstant(day, minute, timeZone).toISOString();
}

function rangeError({ from, to }: Filters): string | null {
  if (!from || !to || isValidRange({ from, to })) return null;
  return from > to ? copy.invalidRangeOrder : copy.invalidRangeLength;
}

interface AuditLogViewProps {
  token: string;
  /**
   * Paciente del filtro. Sin `onClearPatient` queda FIJO (la pestaña
   * «Accesos» de la ficha); con él, se pinta como un filtro que se puede
   * quitar (la pantalla de auditoría abierta con `?patientId=`).
   */
  patientId?: string;
  onClearPatient?: () => void;
}

/**
 * Registro de auditoría de la clínica (DX-009): quién vio o cambió qué dato
 * clínico o financiero y cuándo. Solo ADMIN (la API responde 403 a los demás).
 *
 * Patrón de lista de la app (`CashRegisterView`): estado local + `useEffect`
 * que recarga al cambiar filtros o página, `AsyncSection` para carga, error y
 * vacío. La API pagina por CURSOR, así que la navegación es Anterior/Siguiente
 * con una pila de cursores, sin total.
 *
 * DX-362: todas las horas y los días de los filtros van en la zona y con el
 * formato de la sede de la pantalla (la activa, o la principal en «Todas las
 * sedes»), dicha junto a los filtros, y cada hora lleva su desfase: la lista,
 * que la API ordena por instante, se lee cronológica. Un evento de una sede
 * cuyo reloj marca otra hora añade debajo la de su sede (la que vio la
 * clínica, DX-009/DX-314). Sin el reloj de la sede no se pinta ninguna hora:
 * «Falta un dato de la sede» con su reintento, nunca otra zona ni otro
 * formato (G1-B).
 */
export function AuditLogView({ token, patientId, onClearPatient }: AuditLogViewProps) {
  const locked = Boolean(patientId) && !onClearPatient;
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // Pila de cursores: el último es la página que se ve; `null` = la primera.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  // El reloj de la pantalla. Hasta tenerlo no se pide nada: sin él no hay
  // con qué contar los días ni con qué pintar las horas.
  const locationsState = useLocationsState(token);
  const locations = locationsState.status === 'ready' ? locationsState.locations : null;
  const activeLocationId = locationsState.status === 'ready' ? locationsState.activeLocationId : null;
  const locationsFailed = locationsState.status === 'error';
  const sede = useMemo(
    () =>
      locationsFailed ? LOCATIONS_ERROR : locations ? sedeClockFor(locations, activeLocationId) : null,
    [locationsFailed, locations, activeLocationId],
  );
  const clock = sede?.status === 'ready' ? sede.clock : null;
  const timeZone = clock?.timeZone ?? null;
  const reference = useMemo(
    () => (locations ? screenLocation(locations, activeLocationId) : undefined),
    [locations, activeLocationId],
  );
  // DX-359: nombres de las sedes para los accesos del personal (`staffAccess`
  // solo trae ids) y para la hora de la sede de cada evento.
  const locationNames = useMemo(() => (locations ? locationNameMap(locations) : null), [locations]);
  // El desfase de hoy en el aviso de la zona; cada fila dice el suyo.
  const [now] = useState(() => new Date());
  const [data, setData] = useState<AuditEventsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const rangeErrorId = React.useId();
  const hintId = React.useId();
  const zoneHintId = React.useId();
  const actorId = React.useId();
  const actionId = React.useId();
  const resourceId = React.useId();
  const periodId = React.useId();

  // Otra sede activa, otra zona: los días cuentan otro rango, así que la
  // paginación vuelve a la primera página (ajuste en el render, sin efecto).
  const [cursorsZone, setCursorsZone] = useState(timeZone);
  if (cursorsZone !== timeZone) {
    setCursorsZone(timeZone);
    setCursors([null]);
  }

  const invalidRange = rangeError(filters);
  const cursor = cursors[cursors.length - 1];

  // La query que sale hacia la API. Sin el reloj de la sede o con el rango
  // inválido no hay query: no se pide nada que no se pueda pintar o que se
  // sabe que daría 400. Los días se cuentan en la zona de la pantalla, cada
  // uno con su desfase (el `to` de la API es excluido: el fin del día).
  const fromInstant = dayInstant(filters.from, 0, timeZone);
  const toInstant = dayInstant(filters.to, MINUTES_PER_DAY, timeZone);
  const query = useMemo<AuditEventsQuery | null>(() => {
    if (invalidRange || !timeZone) return null;
    const q: AuditEventsQuery = { limit: PAGE_SIZE };
    if (patientId) q.patientId = patientId;
    if (filters.actorUserId) q.actorUserId = filters.actorUserId;
    if (filters.action) q.action = filters.action;
    if (filters.resourceType) q.resourceType = filters.resourceType;
    if (fromInstant) q.from = fromInstant;
    if (toInstant) q.to = toInstant;
    if (cursor) q.cursor = cursor;
    return q;
  }, [invalidRange, timeZone, patientId, filters, fromInstant, toInstant, cursor]);

  useEffect(() => {
    if (!token || !query) return;
    let cancelled = false;
    async function load(q: AuditEventsQuery) {
      setLoading(true);
      try {
        const res = await listAuditEvents(token, q);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        const status = err instanceof ApiError ? err.status : null;
        setForbidden(status === 403);
        setLoadError(status === 400 ? copy.badRequest : copy.loadError);
      }
      if (!cancelled) setLoading(false);
    }
    void load(query);
    return () => {
      cancelled = true;
    };
  }, [token, query, reloadKey]);

  // Cada cambio de filtro vuelve a la primera página en el MISMO render.
  function changeFilters(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setCursors([null]);
  }

  const items = data?.items ?? [];
  const hasFilters =
    filters.actorUserId !== '' ||
    filters.action !== '' ||
    filters.resourceType !== '' ||
    filters.from !== '' ||
    filters.to !== '';
  const patientName = items.find((e) => e.patient)?.patient?.fullName ?? copy.patientFallback;
  const zoneHint = clock && reference ? auditZoneHint(reference, clock, now) : null;
  // La zona describe las fechas siempre, también junto al error del rango: el
  // día que se corrige se sigue contando en esa zona.
  const dateDescribedBy =
    [
      invalidRange ? rangeErrorId : null,
      zoneHint ? zoneHintId : null,
      !invalidRange && !filters.from && !filters.to ? hintId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  const rows: AuditRowData[] = clock
    ? items.map((event) => ({
        event,
        time: auditTime(event, clock, locationNames),
        detail: eventDetail(event, locationNames),
        change: configChangeItems(event.metadata, clock.fmt),
      }))
    : [];
  const columns = auditColumns(!patientId);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={copy.filtersLabel}
        className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end"
      >
        <ActorFilter
          token={token}
          id={actorId}
          value={filters.actorUserId}
          onChange={(actorUserId) => changeFilters({ actorUserId })}
        />
        <FormField htmlFor={actionId} label={copy.actionLabel} className="min-w-0 sm:w-44">
          <NativeSelect
            id={actionId}
            value={filters.action}
            onChange={(e) => changeFilters({ action: e.target.value as Filters['action'] })}
          >
            <option value="">{copy.actionAll}</option>
            {AUDIT_ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor={resourceId} label={copy.resourceLabel} className="min-w-0 sm:w-44">
          <NativeSelect
            id={resourceId}
            value={filters.resourceType}
            onChange={(e) => changeFilters({ resourceType: e.target.value as Filters['resourceType'] })}
          >
            <option value="">{copy.resourceAll}</option>
            {AUDIT_RESOURCE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {AUDIT_RESOURCE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {/* «Desde – Hasta» en un solo campo, en el locale de la sede (dd/mm/aaaa
            donde toca), con atajos. Sin periodo, la API da los últimos 30 días. */}
        <FormField htmlFor={periodId} label={copy.periodLabel} className="col-span-2 min-w-0 sm:w-72">
          <DateRangePicker
            id={periodId}
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) => changeFilters({ from: range?.from ?? '', to: range?.to ?? '' })}
            presets
            startLabel={copy.fromLabel}
            endLabel={copy.toLabel}
            isInvalid={invalidRange !== null}
            aria-describedby={dateDescribedBy}
          />
        </FormField>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            className="col-span-2 sm:col-auto"
            onClick={() => changeFilters(NO_FILTERS)}
          >
            {copy.clearFilters}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 empty:hidden">
        {zoneHint ? (
          <p id={zoneHintId} className="t-caption">
            {zoneHint}
          </p>
        ) : null}
        {invalidRange ? (
          <InlineError id={rangeErrorId}>{invalidRange}</InlineError>
        ) : !filters.from && !filters.to ? (
          <p id={hintId} className="t-caption">
            {copy.rangeHint}
          </p>
        ) : null}
      </div>

      {patientId && onClearPatient ? (
        <div>
          <span className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface pl-3 pr-1 text-sm text-ink">
            {copy.patientChip(patientName)}
            <button
              type="button"
              onClick={onClearPatient}
              aria-label={copy.clearPatient}
              title={copy.clearPatient}
              className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary pointer-coarse:size-10"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        </div>
      ) : null}

      {forbidden && !invalidRange ? (
        <EmptyState
          role="status"
          icon={<Lock aria-hidden />}
          title={copy.forbiddenTitle}
          description={copy.forbiddenHint}
        />
      ) : null}

      {sede?.status === 'error' && !forbidden && !invalidRange ? (
        <SedeConfigError
          kind={sede.kind}
          description={sede.message}
          onRetry={locationsState.retry}
          locationId={sede.locationId}
        />
      ) : null}

      {sede?.status !== 'error' && !forbidden && !invalidRange ? (
        <AsyncSection
          loading={loading || !clock}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={items.length === 0}
          emptyTitle={locked ? copy.patientEmpty : copy.empty}
          emptyDescription={copy.emptyHint}
          skeleton={<TableSkeleton rows={5} />}
        >
          {/* Sin reloj, AsyncSection pinta el esqueleto: ninguna fila se formatea. */}
          <DataList
            label={locked ? copy.patientTableLabel : copy.tableLabel}
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.event.id}
          />
        </AsyncSection>
      ) : null}

      {clock && !forbidden && !invalidRange && !loadError && (cursors.length > 1 || data?.nextCursor) ? (
        <CursorPagination
          page={cursors.length}
          hasNext={Boolean(data?.nextCursor)}
          disabled={loading}
          onPrev={() => setCursors((stack) => stack.slice(0, -1))}
          onNext={() => {
            const next = data?.nextCursor;
            if (next) setCursors((stack) => [...stack, next]);
          }}
        />
      ) : null}
    </div>
  );
}

interface AuditRowData {
  event: AuditEvent;
  time: AuditTime;
  detail: string | null;
  /** DX-360: el antes y el después de un cambio de configuración. */
  change: ConfigChangeItem[] | null;
}

/**
 * DX-360: qué cambió, campo a campo, en una lista de definición: el término es
 * el campo y la definición su valor («60 → 75 min»). La flecha es visual; el
 * lector oye «60 a 75 min». Sin color: el sentido lo dan el texto y la acción.
 * `inline` para la línea 2 de la tarjeta del teléfono: los pares siguen el
 * texto y se separan con « · »; un valor largo se parte (390 px sin scroll).
 */
function ConfigChangeList({ items, inline = false }: { items: ConfigChangeItem[]; inline?: boolean }) {
  return (
    <dl
      className={cn(
        'min-w-0 [overflow-wrap:anywhere]',
        inline ? 'inline' : 't-caption mt-0.5 flex flex-col gap-0.5',
      )}
    >
      {items.map((item, i) => (
        <div key={item.field} className={inline ? 'inline' : 'min-w-0'}>
          {inline && i > 0 ? <span aria-hidden> · </span> : null}
          <dt className="inline font-medium text-ink">{item.label}:</dt>{' '}
          <dd className="t-data inline">
            <ConfigChangeValue item={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ConfigChangeValue({ item }: { item: ConfigChangeItem }) {
  if (item.kind === 'hidden') return <>{copy.configHidden}</>;
  if (item.kind !== 'changed') return <>{item.value}</>;
  return (
    <>
      {item.before} <span aria-hidden>→</span>
      <span className="sr-only"> a </span> {item.after}
    </>
  );
}

function eventDetail(event: AuditEvent, locationNames: LocationNames | null): string | null {
  return (
    communicationDetail(event.metadata) ??
    confirmationLinkDetail(event.metadata) ??
    implantSearchDetail(event.metadata) ??
    staffLoginDetail(event.metadata) ??
    staffDetail(event.metadata, locationNames) ??
    cashSessionDetail(event.metadata) ??
    sedationDetail(event.metadata) ??
    chairDetail(event.metadata) ??
    scheduleChangeDetail(event.metadata) ??
    cancellationDetail(event.metadata) ??
    patientFlowDetail(event.metadata) ??
    planItemAttributionDetail(event.metadata) ??
    importBatchDetail(event.metadata) ??
    healthRegistrationDetail(event.metadata) ??
    clinicSettingsDetail(event.metadata) ??
    locationCalendarDetail(event.metadata) ??
    exchangeRateBackupDetail(event.metadata) ??
    anamnesisDetail(event.metadata) ??
    signatureRequestDetail(event.metadata)
  );
}

function actorName(event: AuditEvent): string {
  if (event.actor) return event.actor.fullName ?? copy.formerMember;
  return isPatientOptOut(event.metadata) ? copy.patientActor : copy.unknownActor;
}

/** El tono de la acción: neutro para leer, semántico para lo que cambia o alerta. */
function actionTone(action: AuditAction): NonNullable<BadgeProps['variant']> {
  return AUDIT_ACTION_VARIANT[action];
}

function PatientLink({ event }: { event: AuditEvent }) {
  if (!event.patient) return null;
  return (
    <Link
      href={`/patients/${event.patient.id}`}
      className="font-medium text-ink underline-offset-4 hover:text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {event.patient.fullName}
    </Link>
  );
}

/**
 * Las columnas: tabla de seis columnas desde `sm`; en el teléfono, tarjeta de
 * dos líneas: «Usuario · Acción» con la hora a la derecha, y debajo el rol (y
 * la hora de la sede del evento, si su reloj marca otra), el recurso, el
 * paciente y el origen.
 */
function auditColumns(showPatient: boolean): DataListColumn<AuditRowData>[] {
  const columns: (DataListColumn<AuditRowData> | null)[] = [
    {
      id: 'when',
      header: copy.colWhen,
      mobile: 'trailing',
      cell: ({ time }) => (
        <div className="t-data min-w-0">
          <time dateTime={time.iso} className="whitespace-nowrap text-ink">
            {time.reference.when}
          </time>{' '}
          <span className="t-caption whitespace-nowrap">{time.reference.offset}</span>
          {time.sede ? <span className="t-caption block">{copy.sedeTime(time.sede)}</span> : null}
        </div>
      ),
      mobileCell: ({ time }) => (
        <span className="flex flex-col items-end">
          <time dateTime={time.iso} className="whitespace-nowrap">
            {time.reference.when}
          </time>
          <span className="t-caption whitespace-nowrap">{time.reference.offset}</span>
        </span>
      ),
    },
    {
      id: 'actor',
      header: copy.colActor,
      mobile: 'primary',
      cell: ({ event }) => (
        <span className="flex min-w-0 flex-col">
          <span className="block">{actorName(event)}</span>
          <span className="t-caption block">{actorRoleLabel(event.actor?.role ?? null)}</span>
        </span>
      ),
      mobileCell: ({ event }) => `${actorName(event)} · ${AUDIT_ACTION_LABELS[event.action]}`,
    },
    {
      id: 'action',
      header: copy.colAction,
      cell: ({ event }) => <Badge variant={actionTone(event.action)}>{AUDIT_ACTION_LABELS[event.action]}</Badge>,
      // En el teléfono la acción ya va en la línea 1; esta posición de la
      // línea 2 lleva el rol y, si su reloj marca otra, la hora de la sede.
      mobileCell: ({ event, time }) => (
        <>
          <span>{actorRoleLabel(event.actor?.role ?? null)}</span>
          {time.sede ? (
            <>
              <span aria-hidden> · </span>
              <span>{copy.sedeTime(time.sede)}</span>
            </>
          ) : null}
        </>
      ),
    },
    {
      id: 'resource',
      header: copy.colResource,
      cell: ({ event, detail, change }) => (
        <div className="min-w-0">
          {AUDIT_RESOURCE_LABELS[event.resourceType]}
          {detail ? <span className="t-caption block">{detail}</span> : null}
          {change ? <ConfigChangeList items={change} /> : null}
        </div>
      ),
      mobileCell: ({ event, detail, change }) => (
        <>
          <span>{AUDIT_RESOURCE_LABELS[event.resourceType]}</span>
          {detail ? (
            <>
              <span aria-hidden> · </span>
              <span>{detail}</span>
            </>
          ) : null}
          {change ? (
            <>
              <span aria-hidden> · </span>
              <ConfigChangeList items={change} inline />
            </>
          ) : null}
        </>
      ),
    },
    showPatient
      ? {
          id: 'patient',
          header: copy.colPatient,
          cell: ({ event }) => (event.patient ? <PatientLink event={event} /> : <span className="text-muted">—</span>),
          mobileCell: ({ event }) => (event.patient ? <PatientLink event={event} /> : null),
        }
      : null,
    {
      id: 'origin',
      header: copy.colOrigin,
      cell: ({ event }) => <OriginCell ip={event.ip} userAgent={event.userAgent} />,
      mobileCell: ({ event }) => originText(event.ip, event.userAgent),
    },
  ];
  return columns.filter((c): c is DataListColumn<AuditRowData> => c !== null);
}

/**
 * Filtro de usuario con el personal de la clínica (`GET /staff`). Si no carga,
 * escalón 2 de la escalera de errores: el control se sustituye en su sitio por
 * un `FieldError` con reintento; el resto de la pantalla sigue funcionando.
 */
function ActorFilter({
  token,
  id,
  value,
  onChange,
}: {
  token: string;
  id: string;
  value: string;
  onChange: (actorUserId: string) => void;
}) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listStaff(token)
      .then((members) => {
        if (cancelled) return;
        setStaff([...members].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')));
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  return (
    <FormField htmlFor={id} label={copy.actorLabel} className="col-span-2 min-w-0 sm:w-52">
      {failed ? (
        <FieldError label={copy.actorUnavailable} retryId={id} onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={staff === null}>
          <option value="">{copy.actorAll}</option>
          {(staff ?? []).map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.fullName}
            </option>
          ))}
        </NativeSelect>
      )}
    </FormField>
  );
}
