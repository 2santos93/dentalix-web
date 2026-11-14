'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, Printer, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  cashSessionHref,
  cashSessionReportHref,
  getCurrentCashSession,
  listCashSessions,
  type CashSessionDetail,
  type CashSessionSummary,
  type CashSessionPage,
  type CashSessionStatus,
  type CurrentCashSession,
} from '@/lib/cash-sessions/cash-sessions-api';
import {
  AMOUNT_HIDDEN_TEXT,
  differenceText,
  hasVisibleDifference,
  moneyList,
  sessionStatusKey,
} from '@/lib/cash-sessions/presentation';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { invalidateLocations, loadLocations } from '@/lib/session/session-store';
import { onLocationChange } from '@/lib/locations/location-store';
import { locationCurrency, locationRegionalFormat } from '@/lib/locations/location-settings';
import { useSedeStamp, type SedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { getTokenRole } from '@/lib/auth/token-role';
import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { ResultCount } from '@/components/shared/list-toolbar';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { SectionHeader } from '@/components/ui/section-header';
import type { CashViewTabs } from '@/components/payments/cash-register-view';
import { OpenCashSessionModal } from './open-cash-session-modal';
import { CloseCashSessionModal } from './close-cash-session-modal';
import { CashOutflowModal } from './cash-outflow-modal';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Caja',
  description:
    'Tu turno de caja en la sede: ábrela con el fondo, cobra y ciérrala con el arqueo por moneda y método.',
  currentTitle: (sede: string) => `Mi caja en ${sede}`,
  noSession: 'No tienes la caja abierta en esta sede.',
  noSessionHint: 'Ábrela con el fondo con el que empiezas: los abonos que registres entran en ella.',
  requireOpen: 'Esta clínica exige caja abierta para cobrar en efectivo.',
  blindNote: 'Arqueo ciego: cuenta antes de ver lo esperado; lo verás cuando cierres la caja.',
  // SEC-043: cierre a ciegas que no cuadró y llegó sin motivo.
  unjustified: 'Sin justificar',
  openedAt: (when: string) => `Abierta el ${when}`,
  float: 'Fondo',
  expectedTitle: 'Esperado hasta ahora',
  open: 'Abrir caja',
  close: 'Cerrar caja',
  outflow: 'Salida de caja',
  outflowsCount: (n: number) => `Salidas del turno: ${n}`,
  viewShift: 'Ver turno',
  currentError: 'No pudimos cargar tu caja.',
  listTitle: 'Turnos',
  statusLabel: 'Estado',
  statusAll: 'Todos los estados',
  statusOpen: 'Abiertas',
  statusClosed: 'Cerradas',
  countNoun: 'turno',
  countNounPlural: 'turnos',
  tableLabel: 'Turnos de caja',
  colOpened: 'Apertura',
  colLocation: 'Sede',
  colOpenedBy: 'Abrió',
  colStatus: 'Estado',
  colFloat: 'Fondo',
  colDifference: 'Diferencia',
  rowLabel: (when: string) => `turno del ${when}`,
  rowLabelNoFormat: (sede: string) => `turno de ${sede}`,
  print: 'Informe de cierre',
  empty: 'Aún no hay turnos de caja.',
  emptyHint: 'Cuando alguien abra una caja aparecerá aquí, con su cierre.',
  listError: 'No pudimos cargar los turnos.',
  forbiddenTitle: 'Tu rol no tiene acceso a la caja.',
  forbiddenHint:
    'La caja es para administración y recepción. Pídele acceso a quien administra la clínica.',
  scopeAdmin: 'Ves los turnos de todo el personal.',
  scopeOwn: 'Ves tus turnos.',
  opened: 'Caja abierta.',
  closed: 'Caja cerrada: el arqueo quedó guardado.',
};

interface CashShiftsViewProps {
  token: string;
  tabs?: CashViewTabs;
}

/**
 * Pestaña «Turnos» de la Caja (DX-027): mi caja en la sede activa (abrir o
 * cerrar con arqueo) y la lista de turnos (ADMIN ve todos; RECEPTION, los
 * suyos: lo decide la API). Estados de carga, vacío y error de cada bloque
 * por separado: si la lista falla, la caja actual sigue a mano.
 */
export function CashShiftsView({ token, tabs }: CashShiftsViewProps) {
  const isAdmin = getTokenRole(token) === 'ADMIN';
  const [locationKey, setLocationKey] = useState(0);
  const [current, setCurrent] = useState<CurrentCashSession | null>(null);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [currentLoading, setCurrentLoading] = useState(true);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [currentKey, setCurrentKey] = useState(0);
  const [status, setStatus] = useState<CashSessionStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<CashSessionPage | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listKey, setListKey] = useState(0);
  const [forbidden, setForbidden] = useState(false);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [outflowing, setOutflowing] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [notice, setNotice] = useState('');
  // Cada turno (y la caja actual) con el reloj, el formato y la moneda de SU sede (DX-354b, E1):
  // también con «Todas las sedes», donde la lista mezcla sedes.
  const stamp = useSedeStamp(token, [current?.locationId, ...(list?.items ?? []).map((item) => item.location.id)]);

  // La sede activa cambia la caja actual y la lista (la cabecera la pone apiFetch).
  useEffect(() => onLocationChange(() => setLocationKey((k) => k + 1)), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setCurrentLoading(true);
      try {
        const [cur, locs] = await Promise.all([
          getCurrentCashSession(token),
          loadLocations(token).catch(() => [] as ClinicLocation[]),
        ]);
        if (cancelled) return;
        setCurrent(cur);
        setLocations(locs);
        setCurrentError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setCurrentError(apiErrorMessage(err, copy.currentError));
      }
      if (!cancelled) setCurrentLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, locationKey, currentKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setListLoading(true);
      try {
        const res = await listCashSessions(token, {
          status: status === 'ALL' ? undefined : status,
          page,
        });
        if (cancelled) return;
        setList(res);
        setListError(null);
      } catch (err) {
        if (cancelled) return;
        setListError(apiErrorMessage(err, copy.listError));
      }
      if (!cancelled) setListLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, status, page, locationKey, listKey]);

  const sede = locations.find((l) => l.id === current?.locationId);
  const sedeName = sede?.name ?? '';
  // La moneda de la sede de la caja (GLOBAL-G1), o `null` si no se sabe (sede
  // sin configurar o sedes sin cargar): entonces no se abre caja ni se registra
  // una salida (empezarían en una moneda supuesta) y se muestra `SedeConfigError`.
  const defaultCurrency = locationCurrency(sede);
  const currencyMissing = current !== null && defaultCurrency === null;
  const session = current?.session ?? null;

  function afterChange(message: string) {
    setNotice(message);
    setCurrentKey((k) => k + 1);
    setListKey((k) => k + 1);
  }

  if (forbidden) {
    return (
      <>
        <PageHeader title={copy.title} description={copy.description} />
        {tabs?.nav}
        <div {...(tabs ? { role: 'tabpanel', id: tabs.panelId, 'aria-labelledby': tabs.tabId } : {})}>
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={copy.forbiddenTitle}
            description={copy.forbiddenHint}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      {tabs?.nav}
      <div
        className="flex flex-col gap-8"
        {...(tabs ? { role: 'tabpanel', id: tabs.panelId, 'aria-labelledby': tabs.tabId } : {})}
      >
        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>
        <SedeStampNote stamp={stamp} />

        {currentLoading && !current ? (
          <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-6">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-3 h-3 w-72" />
          </div>
        ) : currentError ? (
          <SectionError description={currentError} onRetry={() => setCurrentKey((k) => k + 1)} />
        ) : current ? (
          <CurrentSessionCard
            current={current}
            sedeName={sedeName}
            stamp={stamp}
            currencyMissing={currencyMissing}
            onRetryLocations={() => {
              // La sede no traía moneda: la lista cacheada de la sesión no sirve.
              invalidateLocations();
              setCurrentKey((k) => k + 1);
            }}
            onOpen={() => {
              setModalKey((k) => k + 1);
              setOpening(true);
            }}
            onClose={() => {
              setModalKey((k) => k + 1);
              setClosing(true);
            }}
            onOutflow={() => {
              setModalKey((k) => k + 1);
              setOutflowing(true);
            }}
          />
        ) : null}

        <section aria-labelledby="cash-shifts-title" className="flex flex-col gap-3">
          <SectionHeader
            titleId="cash-shifts-title"
            title={copy.listTitle}
            description={isAdmin ? copy.scopeAdmin : copy.scopeOwn}
            actions={
              <NativeSelect
                aria-label={copy.statusLabel}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as CashSessionStatus | 'ALL');
                  setPage(1);
                }}
                className="w-full sm:w-52"
              >
                <option value="ALL">{copy.statusAll}</option>
                <option value="OPEN">{copy.statusOpen}</option>
                <option value="CLOSED">{copy.statusClosed}</option>
              </NativeSelect>
            }
            className="[&>div:last-child]:max-sm:w-full"
          />

          {!listLoading && !listError && list ? (
            <ResultCount total={list.total} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
          ) : null}

          <AsyncSection
            loading={listLoading}
            error={listError}
            onRetry={() => setListKey((k) => k + 1)}
            isEmpty={(list?.items.length ?? 0) === 0}
            emptyTitle={copy.empty}
            emptyDescription={copy.emptyHint}
            emptyIcon={<Wallet aria-hidden />}
            skeleton={<TableSkeleton rows={3} />}
          >
            <DataList
              label={copy.tableLabel}
              rows={list?.items ?? []}
              columns={shiftColumns(stamp)}
              getRowKey={(item) => item.id}
              getRowHref={(item) => cashSessionHref(item.id)}
              getRowLabel={(item) => {
                const when = stamp.maybe.dateTime(item.openedAt, item.location.id);
                return when ? copy.rowLabel(when) : copy.rowLabelNoFormat(item.location.name);
              }}
              rowActions={(item) =>
                item.status === 'CLOSED'
                  ? [
                      {
                        label: copy.print,
                        icon: <Printer aria-hidden />,
                        onSelect: () => window.open(cashSessionReportHref(item.id), '_blank', 'noopener'),
                      },
                    ]
                  : []
              }
            />
          </AsyncSection>

          {!listError && list ? (
            <Pagination
              page={page}
              pageSize={list.pageSize}
              total={list.total}
              onPageChange={setPage}
              disabled={listLoading}
            />
          ) : null}
        </section>
      </div>

      {defaultCurrency ? (
        <OpenCashSessionModal
          key={`open-${modalKey}`}
          open={opening}
          onOpenChange={setOpening}
          token={token}
          sedeName={sedeName}
          defaultCurrency={defaultCurrency}
          onOpened={() => {
            setOpening(false);
            afterChange(copy.opened);
          }}
        />
      ) : null}
      {session ? (
        <CloseCashSessionModal
          key={`close-${modalKey}`}
          open={closing}
          onOpenChange={setClosing}
          token={token}
          session={session}
          defaultCurrency={defaultCurrency}
          onClosed={() => {
            setClosing(false);
            afterChange(copy.closed);
          }}
        />
      ) : null}
      {session && current && defaultCurrency ? (
        <CashOutflowModal
          key={`outflow-${modalKey}`}
          open={outflowing}
          onOpenChange={setOutflowing}
          token={token}
          locationId={current.locationId}
          sedeName={sedeName}
          defaultCurrency={defaultCurrency}
          fmt={locationRegionalFormat(sede)}
          onRetryFormat={() => setCurrentKey((k) => k + 1)}
          onCreated={(_expense, notice) => afterChange(notice)}
        />
      ) : null}
    </>
  );
}

/**
 * Columnas de la lista de turnos. En el teléfono: apertura y diferencia en la
 * línea 1; sede, quien abrió, estado y fondo en la 2. Toda la fila abre el
 * turno; el informe de un cierre va en «⋯».
 */
function shiftColumns(stamp: SedeStamp): DataListColumn<CashSessionSummary>[] {
  const moneyIn = (locationId: string) => (amount: number, currency: string) => stamp.money(amount, currency, locationId);
  return [
    {
      id: 'opened',
      header: copy.colOpened,
      mobile: 'primary',
      cell: (item) => stamp.dateTime(item.openedAt, item.location.id),
      cellClassName: 'tabular-nums',
      mobileCell: (item) => stamp.maybe.dateTime(item.openedAt, item.location.id),
    },
    { id: 'location', header: copy.colLocation, cell: (item) => item.location.name },
    { id: 'openedBy', header: copy.colOpenedBy, cell: (item) => item.openedBy.fullName ?? '—', mobileCell: (item) => item.openedBy.fullName },
    {
      id: 'status',
      header: copy.colStatus,
      cell: (item) => <StatusBadge kind="cashSession" status={sessionStatusKey(item)} />,
    },
    { id: 'float', header: copy.colFloat, numeric: true, cell: (item) => moneyList(item.floats, undefined, moneyIn(item.location.id)) },
    {
      id: 'difference',
      header: copy.colDifference,
      numeric: true,
      mobile: 'trailing',
      cell: (item) =>
        item.status === 'CLOSED' ? (
          <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            <span
              className={cn(
                'font-medium',
                hasVisibleDifference(item.differences)
                  ? 'text-danger-text'
                  : item.differences.some((d) => d.amount === null)
                    ? 'text-muted'
                    : 'text-ink',
              )}
            >
              {differenceText(item.differences, moneyIn(item.location.id))}
            </span>
            {item.unjustifiedDifference ? (
              <Badge variant="warning" dot>
                {copy.unjustified}
              </Badge>
            ) : null}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
      mobileCell: (item) =>
        item.status === 'CLOSED' ? (
          <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            <span
              className={cn(
                hasVisibleDifference(item.differences)
                  ? 'text-danger-text'
                  : item.differences.some((d) => d.amount === null) && 'text-muted',
              )}
            >
              {differenceText(item.differences, moneyIn(item.location.id))}
            </span>
            {item.unjustifiedDifference ? (
              <Badge variant="warning" dot>
                {copy.unjustified}
              </Badge>
            ) : null}
          </span>
        ) : null,
    },
  ];
}

function CurrentSessionCard({
  current,
  sedeName,
  stamp,
  currencyMissing,
  onRetryLocations,
  onOpen,
  onClose,
  onOutflow,
}: {
  current: CurrentCashSession;
  sedeName: string;
  /** El pintor de la pantalla: hora e importes de la caja con el formato de SU sede (sin él, «—»). */
  stamp: SedeStamp;
  /** La sede de la caja no tiene moneda (o las sedes no cargaron). */
  currencyMissing: boolean;
  onRetryLocations: () => void;
  onOpen: () => void;
  onClose: () => void;
  onOutflow: () => void;
}) {
  const session: CashSessionDetail | null = current.session;
  const openedAt = session ? stamp.dateTime(session.openedAt, current.locationId) : '';
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2 id={headingId} className="t-title text-ink">
            {copy.currentTitle(sedeName || '…')}
          </h2>
          {session ? (
            <p className="text-sm text-muted tabular-nums">
              {copy.openedAt(openedAt)} · {copy.float}{' '}
              {moneyList(session.floats, undefined, (amount, currency) => stamp.money(amount, currency, current.locationId))}
            </p>
          ) : (
            <p className="text-sm text-muted">{copy.noSession}</p>
          )}
          {session ? (
            <p className="text-sm text-muted tabular-nums">{copy.outflowsCount(session.outflows.length + (session.creditRefunds?.length ?? 0))}</p>
          ) : null}
          {current.settings.requireOpenSession && session ? (
            <p className="text-sm text-muted">{copy.requireOpen}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
          {session ? (
            <>
              <Button asChild variant="ghost">
                <Link href={cashSessionHref(session.id)}>{copy.viewShift}</Link>
              </Button>
              {currencyMissing ? null : (
                <Button type="button" variant="secondary" onClick={onOutflow}>
                  {copy.outflow}
                </Button>
              )}
              <Button type="button" onClick={onClose}>
                {copy.close}
              </Button>
            </>
          ) : currencyMissing ? null : (
            <Button type="button" onClick={onOpen}>
              {copy.open}
            </Button>
          )}
        </div>
      </div>
      {current.settings.requireOpenSession && !session ? (
        <div className="px-4 pt-3 sm:px-6">
          <Callout tone="warning">{copy.requireOpen}</Callout>
        </div>
      ) : null}
      {currencyMissing ? (
        <div className="px-4 pt-3 sm:px-6">
          <SedeConfigError kind="currency" onRetry={onRetryLocations} locationId={current.locationId} />
        </div>
      ) : null}
      <div className="px-4 py-3 sm:px-6">
        {!session ? (
          <p className="text-sm text-muted">{copy.noSessionHint}</p>
        ) : session.blindHidden || !session.expected ? (
          <p className="text-sm text-muted">{copy.blindNote}</p>
        ) : (
          <>
            <p className="t-label text-muted">{copy.expectedTitle}</p>
            <ul className="mt-1 divide-y divide-border-subtle">
              {session.expected.map((line) => (
                <li
                  key={`${line.currency}-${line.method}`}
                  className="flex items-baseline justify-between gap-4 py-2"
                >
                  <span className="font-medium text-ink">
                    {PAYMENT_METHOD_LABELS[line.method]}{' '}
                    <span className="text-xs text-muted">{line.currency}</span>
                  </span>
                  {line.expected === null ? (
                    <span className="text-sm text-muted">{AMOUNT_HIDDEN_TEXT}</span>
                  ) : (
                    <span className={cn('font-medium tabular-nums', line.expected < 0 ? 'text-danger-text' : 'text-ink')}>
                      {stamp.money(line.expected, line.currency, current.locationId)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
