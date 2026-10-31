'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Lock, X } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
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
  implantSearchDetail,
  isPatientOptOut,
  staffLoginDetail,
  staffDetail,
  locationNameMap,
  type LocationNames,
  cashSessionDetail,
  sedationDetail,
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
import { auditTime, auditZoneHint, type AuditSedeTime, type AuditTime } from '@/lib/audit/audit-time';
import { listStaff, type StaffMember } from '@/lib/staff/staff-api';
import { screenLocation, sedeClockFor, type SedeClockError } from '@/lib/locations/sede-clock';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { isValidRange, MAX_RANGE_DAYS } from '@/lib/payments/cash-period';
import { isCivilDay } from '@/lib/time/civil-day';
import { wallInstant } from '@/lib/time/wall-clock';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { toolbarFieldClass } from '@/components/shared/list-toolbar';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

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
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  rangeHint: 'Sin fechas se ven los últimos 30 días.',
  invalidRangeOrder: 'La fecha final no puede ser anterior a la inicial.',
  invalidRangeLength: `El período no puede superar ${MAX_RANGE_DAYS} días. Acórtalo e intenta de nuevo.`,
  clearFilters: 'Limpiar filtros',
  patientChip: (name: string) => `Paciente: ${name}`,
  patientFallback: 'seleccionado',
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
  noIp: 'Sin IP',
  // Sin "Intenta de nuevo.": alimenta AsyncSection -> SectionError, que trae su botón.
  loadError: 'No pudimos cargar la auditoría.',
  badRequest: 'Los filtros no son válidos: revisa las fechas (como mucho 366 días).',
  forbiddenTitle: 'Solo la administración de la clínica puede ver la auditoría.',
  forbiddenHint: 'Pídele a quien administra la clínica que lo revise contigo.',
  empty: 'No hay eventos con estos filtros.',
  emptyHint: 'Prueba con otro período, usuario o acción.',
  patientEmpty: 'Nadie ha accedido a esta ficha en el período.',
  pagination: 'Paginación',
  prev: 'Anterior',
  next: 'Siguiente',
  page: (n: number) => `Página ${n}`,
};

const PAGE_SIZE = 50;

/** Valor de una celda con varias líneas: en móvil, a la derecha de su etiqueta y en bloque. */
const cellValueClass = 'min-w-0 max-sm:text-right';

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

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={copy.filtersLabel}
        className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <ActorFilter
          token={token}
          value={filters.actorUserId}
          onChange={(actorUserId) => changeFilters({ actorUserId })}
        />
        <select
          aria-label={copy.actionLabel}
          value={filters.action}
          onChange={(e) => changeFilters({ action: e.target.value as Filters['action'] })}
          className={cn(toolbarFieldClass, 'sm:w-44')}
        >
          <option value="">{copy.actionAll}</option>
          {AUDIT_ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {AUDIT_ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        <select
          aria-label={copy.resourceLabel}
          value={filters.resourceType}
          onChange={(e) =>
            changeFilters({
              resourceType: e.target.value as Filters['resourceType'],
            })
          }
          className={cn(toolbarFieldClass, 'sm:w-44')}
        >
          <option value="">{copy.resourceAll}</option>
          {AUDIT_RESOURCE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {AUDIT_RESOURCE_LABELS[r]}
            </option>
          ))}
        </select>
        {/* En móvil, dos columnas con la etiqueta encima: «Desde» y «Hasta» en
            línea no caben en 390px junto a dos campos de fecha. */}
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex">
          <label className="flex min-w-0 flex-col gap-1 text-sm text-muted sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0">{copy.fromLabel}</span>
            <Input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => changeFilters({ from: e.target.value })}
              aria-invalid={invalidRange !== null}
              aria-describedby={dateDescribedBy}
              className="min-w-0 tabular-nums sm:w-36"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-muted sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0">{copy.toLabel}</span>
            <Input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => changeFilters({ to: e.target.value })}
              aria-invalid={invalidRange !== null}
              aria-describedby={dateDescribedBy}
              className="min-w-0 tabular-nums sm:w-36"
            />
          </label>
        </div>
        {hasFilters ? (
          <Button type="button" variant="ghost" onClick={() => changeFilters(NO_FILTERS)}>
            {copy.clearFilters}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 empty:hidden">
        {zoneHint ? (
          <p id={zoneHintId} className="text-xs text-muted">
            {zoneHint}
          </p>
        ) : null}
        {invalidRange ? (
          <InlineError id={rangeErrorId}>{invalidRange}</InlineError>
        ) : !filters.from && !filters.to ? (
          <p id={hintId} className="text-xs text-muted">
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
              className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
          <Card className="overflow-hidden p-0">
            <Table aria-label={locked ? copy.patientTableLabel : copy.tableLabel}>
              <caption className="sr-only">
                {locked ? copy.patientTableLabel : copy.tableLabel}
              </caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">{copy.colWhen}</TableHead>
                  <TableHead scope="col">{copy.colActor}</TableHead>
                  <TableHead scope="col">{copy.colAction}</TableHead>
                  <TableHead scope="col">{copy.colResource}</TableHead>
                  {patientId ? null : <TableHead scope="col">{copy.colPatient}</TableHead>}
                  <TableHead scope="col">{copy.colOrigin}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Sin reloj, AsyncSection pinta el esqueleto: ninguna fila se formatea. */}
                {clock
                  ? items.map((event) => (
                      <AuditRow
                        key={event.id}
                        event={event}
                        time={auditTime(event, clock, locationNames)}
                        showPatient={!patientId}
                        locationNames={locationNames}
                      />
                    ))
                  : null}
              </TableBody>
            </Table>
          </Card>
        </AsyncSection>
      ) : null}

      {clock && !forbidden && !invalidRange && !loadError && (cursors.length > 1 || data?.nextCursor) ? (
        <nav
          aria-label={copy.pagination}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
        >
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {copy.page(cursors.length)}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || cursors.length <= 1}
              onClick={() => setCursors((stack) => stack.slice(0, -1))}
            >
              <ChevronLeft /> {copy.prev}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || !data?.nextCursor}
              onClick={() => {
                const next = data?.nextCursor;
                if (next) setCursors((stack) => [...stack, next]);
              }}
            >
              {copy.next} <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function AuditRow({
  event,
  time,
  showPatient,
  locationNames,
}: {
  event: AuditEvent;
  time: AuditTime;
  showPatient: boolean;
  locationNames: LocationNames | null;
}) {
  const detail =
    communicationDetail(event.metadata) ??
    implantSearchDetail(event.metadata) ??
    staffLoginDetail(event.metadata) ??
    staffDetail(event.metadata, locationNames) ??
    cashSessionDetail(event.metadata) ??
    sedationDetail(event.metadata) ??
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
    signatureRequestDetail(event.metadata);
  return (
    <TableRow>
      <TableCell className="tabular-nums" data-label={copy.colWhen}>
        {/* Un solo bloque: en móvil la celda es flex (etiqueta | valor). */}
        <div className={cellValueClass}>
          <time dateTime={time.iso} className="whitespace-nowrap text-ink">
            {time.reference.when}
          </time>{' '}
          <span className="whitespace-nowrap text-xs text-muted">{time.reference.offset}</span>
          {time.sede ? <span className="block text-xs text-muted">{copy.sedeTime(time.sede)}</span> : null}
        </div>
      </TableCell>
      <TableCell data-label={copy.colActor}>
        <div className={cellValueClass}>
          <span className="block font-medium text-ink">
            {event.actor
              ? (event.actor.fullName ?? copy.formerMember)
              : isPatientOptOut(event.metadata)
                ? copy.patientActor
                : copy.unknownActor}
          </span>
          <span className="block text-xs text-muted">
            {actorRoleLabel(event.actor?.role ?? null)}
          </span>
        </div>
      </TableCell>
      <TableCell data-label={copy.colAction}>
        <Badge variant={AUDIT_ACTION_VARIANT[event.action]}>
          {AUDIT_ACTION_LABELS[event.action]}
        </Badge>
      </TableCell>
      <TableCell data-label={copy.colResource}>
        <div className={cellValueClass}>
          {AUDIT_RESOURCE_LABELS[event.resourceType]}
          {detail ? <span className="block text-xs text-muted">{detail}</span> : null}
        </div>
      </TableCell>
      {showPatient ? (
        <TableCell data-label={copy.colPatient}>
          {event.patient ? (
            <Link
              href={`/patients/${event.patient.id}`}
              className="font-medium text-ink underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {event.patient.fullName}
            </Link>
          ) : (
            <span className="text-muted">—</span>
          )}
        </TableCell>
      ) : null}
      <TableCell data-label={copy.colOrigin}>
        <div className={cellValueClass}>
          <span className="block tabular-nums text-ink">{event.ip ?? copy.noIp}</span>
          {event.userAgent ? (
            <span className="block max-w-56 truncate text-xs text-muted max-sm:ml-auto" title={event.userAgent}>
              {event.userAgent}
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Filtro de usuario con el personal de la clínica (`GET /staff`). Si no carga,
 * escalón 2 de la escalera de errores: el control se sustituye en su sitio por
 * un `FieldError` con reintento; el resto de la pantalla sigue funcionando.
 */
function ActorFilter({
  token,
  value,
  onChange,
}: {
  token: string;
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

  if (failed) {
    return (
      <FieldError
        label={copy.actorUnavailable}
        onRetry={() => setAttempt((n) => n + 1)}
        className="sm:w-48"
      />
    );
  }
  return (
    <select
      aria-label={copy.actorLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={staff === null}
      className={cn(toolbarFieldClass, 'sm:w-48')}
    >
      <option value="">{copy.actorAll}</option>
      {(staff ?? []).map((member) => (
        <option key={member.userId} value={member.userId}>
          {member.fullName}
        </option>
      ))}
    </select>
  );
}
