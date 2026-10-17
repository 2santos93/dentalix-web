'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  cashSessionHref,
  cashSessionReportHref,
  getCurrentCashSession,
  listCashSessions,
  type CashSessionDetail,
  type CashSessionPage,
  type CashSessionStatus,
  type CurrentCashSession,
} from '@/lib/cash-sessions/cash-sessions-api';
import {
  differenceText,
  moneyList,
  sessionStatusLabel,
  sessionStatusVariant,
} from '@/lib/cash-sessions/presentation';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { onLocationChange } from '@/lib/locations/location-store';
import { COUNTRY_CURRENCY } from '@/lib/locations/clinic-currency';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { formatCurrency } from '@/lib/format/currency';
import { formatDateTimeInZone } from '@/lib/format/date';
import { getTokenRole } from '@/lib/auth/token-role';
import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { ResultCount, toolbarFieldClass } from '@/components/shared/list-toolbar';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CashViewTabs } from '@/components/payments/cash-register-view';
import { OpenCashSessionModal } from './open-cash-session-modal';
import { CloseCashSessionModal } from './close-cash-session-modal';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Caja',
  description:
    'Tu turno de caja en la sede: ábrela con el fondo, cobra y ciérrala con el arqueo por moneda y método.',
  currentTitle: (sede: string) => `Mi caja en ${sede}`,
  noSession: 'No tienes la caja abierta en esta sede.',
  noSessionHint: 'Ábrela con el fondo con el que empiezas: los abonos que registres entran en ella.',
  requireOpen: 'Esta clínica exige caja abierta para cobrar en efectivo.',
  blindNote: 'Arqueo ciego: verás lo esperado al cerrar.',
  openedAt: (when: string) => `Abierta el ${when}`,
  float: 'Fondo',
  expectedTitle: 'Esperado hasta ahora',
  open: 'Abrir caja',
  close: 'Cerrar caja',
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
  colActions: 'Acciones',
  view: 'Ver',
  viewLabel: (when: string) => `Ver el turno del ${when}`,
  print: 'Informe',
  printLabel: (when: string) => `Informe de cierre del turno del ${when}`,
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
  const [modalKey, setModalKey] = useState(0);
  const [notice, setNotice] = useState('');

  // La sede activa cambia la caja actual y la lista (la cabecera la pone apiFetch).
  useEffect(() => onLocationChange(() => setLocationKey((k) => k + 1)), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setCurrentLoading(true);
      try {
        const [cur, locs] = await Promise.all([
          getCurrentCashSession(token),
          listLocations(token).catch(() => [] as ClinicLocation[]),
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
  const defaultCurrency = sede ? COUNTRY_CURRENCY[sede.country] : 'COP';
  const session = current?.session ?? null;
  const zoneOf = (locationId: string) =>
    locations.find((l) => l.id === locationId)?.timeZone ?? 'America/Bogota';

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
        <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
          {notice}
        </p>

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
            timeZone={zoneOf(current.locationId)}
            onOpen={() => {
              setModalKey((k) => k + 1);
              setOpening(true);
            }}
            onClose={() => {
              setModalKey((k) => k + 1);
              setClosing(true);
            }}
          />
        ) : null}

        <section aria-labelledby="cash-shifts-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="cash-shifts-title" className="t-title text-ink">
                {copy.listTitle}
              </h2>
              <p className="text-sm text-muted">{isAdmin ? copy.scopeAdmin : copy.scopeOwn}</p>
            </div>
            <select
              aria-label={copy.statusLabel}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as CashSessionStatus | 'ALL');
                setPage(1);
              }}
              className={cn(toolbarFieldClass, 'sm:w-52')}
            >
              <option value="ALL">{copy.statusAll}</option>
              <option value="OPEN">{copy.statusOpen}</option>
              <option value="CLOSED">{copy.statusClosed}</option>
            </select>
          </div>

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
            <Card className="overflow-hidden p-0">
              <Table aria-label={copy.tableLabel}>
                <caption className="sr-only">{copy.tableLabel}</caption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">{copy.colOpened}</TableHead>
                    <TableHead scope="col">{copy.colLocation}</TableHead>
                    <TableHead scope="col">{copy.colOpenedBy}</TableHead>
                    <TableHead scope="col">{copy.colStatus}</TableHead>
                    <TableHead scope="col" className="text-right">
                      {copy.colFloat}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {copy.colDifference}
                    </TableHead>
                    <TableHead scope="col">
                      <span className="sr-only">{copy.colActions}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(list?.items ?? []).map((item) => {
                    const when = formatDateTimeInZone(item.openedAt, zoneOf(item.location.id));
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="tabular-nums" data-label={copy.colOpened}>
                          {when}
                        </TableCell>
                        <TableCell data-label={copy.colLocation}>{item.location.name}</TableCell>
                        <TableCell data-label={copy.colOpenedBy}>{item.openedBy.fullName ?? '—'}</TableCell>
                        <TableCell data-label={copy.colStatus}>
                          <Badge variant={sessionStatusVariant(item)}>{sessionStatusLabel(item)}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums" data-label={copy.colFloat}>
                          {moneyList(item.floats)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-medium tabular-nums',
                            item.differences.some((d) => d.amount !== 0) ? 'text-danger' : 'text-ink',
                          )}
                          data-label={copy.colDifference}
                        >
                          {item.status === 'CLOSED' ? differenceText(item.differences) : '—'}
                        </TableCell>
                        <TableCell className="text-right" data-label={copy.colActions}>
                          <span className="inline-flex flex-wrap items-center justify-end gap-3">
                            <Button asChild variant="outline" size="sm">
                              <Link href={cashSessionHref(item.id)} aria-label={copy.viewLabel(when)}>
                                {copy.view}
                              </Link>
                            </Button>
                            {item.status === 'CLOSED' ? (
                              <Button asChild variant="outline" size="sm">
                                <Link
                                  href={cashSessionReportHref(item.id)}
                                  target="_blank"
                                  aria-label={copy.printLabel(when)}
                                >
                                  {copy.print}
                                </Link>
                              </Button>
                            ) : null}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
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
    </>
  );
}

function CurrentSessionCard({
  current,
  sedeName,
  timeZone,
  onOpen,
  onClose,
}: {
  current: CurrentCashSession;
  sedeName: string;
  timeZone: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  const session: CashSessionDetail | null = current.session;
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-hairline px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2 id={headingId} className="t-title text-ink">
            {copy.currentTitle(sedeName || '…')}
          </h2>
          {session ? (
            <p className="text-sm text-muted tabular-nums">
              {copy.openedAt(formatDateTimeInZone(session.openedAt, timeZone))} · {copy.float}{' '}
              {moneyList(session.floats)}
            </p>
          ) : (
            <p className="text-sm text-muted">{copy.noSession}</p>
          )}
          {current.settings.requireOpenSession ? (
            <p className="mt-1 text-sm text-warning">{copy.requireOpen}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {session ? (
            <>
              <Button asChild variant="outline">
                <Link href={cashSessionHref(session.id)}>{copy.viewShift}</Link>
              </Button>
              <Button type="button" onClick={onClose}>
                {copy.close}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={onOpen}>
              {copy.open}
            </Button>
          )}
        </div>
      </div>
      <div className="px-4 py-3 sm:px-6">
        {!session ? (
          <p className="text-sm text-muted">{copy.noSessionHint}</p>
        ) : session.blindHidden || !session.expected ? (
          <p className="text-sm text-muted">{copy.blindNote}</p>
        ) : (
          <>
            <p className="t-label text-muted">{copy.expectedTitle}</p>
            <ul className="mt-1 divide-y divide-hairline">
              {session.expected.map((line) => (
                <li
                  key={`${line.currency}-${line.method}`}
                  className="flex items-baseline justify-between gap-4 py-2"
                >
                  <span className="font-medium text-ink">
                    {PAYMENT_METHOD_LABELS[line.method]}{' '}
                    <span className="text-xs text-muted">{line.currency}</span>
                  </span>
                  <span className="font-medium tabular-nums text-ink">
                    {formatCurrency(line.expected, line.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
