'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import { fetchClinicName } from '@/lib/clinic-branding';
import {
  downloadReceivablesCsv,
  getReceivablesAging,
  type ReceivablesAgingPage,
  type ReceivablesFilters,
} from '@/lib/receivables/receivables-api';
import { AGE_FILTERS, csvFileName } from '@/lib/receivables/presentation';
import { notifyError } from '@/components/errors/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { ResultCount, toolbarFieldClass } from '@/components/shared/list-toolbar';
import { AgingSummary } from './aging-summary';
import { DebtorCard } from './debtor-card';
import {
  AgeCell,
  BucketList,
  bucketLineCount,
  DebtCell,
  DebtorActions,
  LastPayment,
  NextInstallment,
  statementHref,
} from './debtor-parts';
import { cn } from '@/lib/utils';

export const receivablesCopy = {
  title: 'Cartera',
  description:
    'Lo que los pacientes deben, por antigüedad: a quién llamar primero. Cada saldo es el de su estado de cuenta, por moneda y sin convertir.',
  scopeAll: 'Toda la clínica',
  scopeLocation: (name: string) => `Deudas de ${name}`,
  ageLabel: 'Antigüedad',
  minBalanceLabel: 'Saldo mínimo',
  minBalancePlaceholder: 'Saldo mínimo',
  currencyLabel: 'Moneda',
  currencyAll: 'Todas las monedas',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exportError: 'No pudimos exportar la cartera.',
  exported: 'Cartera exportada.',
  countNoun: 'deudor',
  countNounPlural: 'deudores',
  tableLabel: 'Deudores de la sede, de la deuda más antigua a la más reciente',
  listLabel: 'Deudores',
  colPatient: 'Paciente',
  colAge: 'Antigüedad',
  colDebt: 'Por cobrar',
  colLastPayment: 'Último abono',
  colNext: 'Próxima cuota',
  colActions: 'Acciones',
  // Sin «Intenta de nuevo.»: AsyncSection → SectionError trae «Reintentar».
  loadError: 'No pudimos cargar la cartera.',
  badRequest: 'Algún filtro no es válido: revisa el saldo mínimo.',
  forbiddenTitle: 'Tu rol no tiene acceso a la cartera.',
  forbiddenHint:
    'La cartera es para administración y recepción. Pídele acceso a quien administra la clínica.',
  emptyLocation: 'No hay saldos vencidos en esta sede',
  emptyClinic: 'No hay saldos vencidos en la clínica',
  emptyHint: 'Cuando un paciente deba algo, aparecerá aquí con su antigüedad. Prueba también con otros filtros.',
  asOf: (day: string) => `Antigüedad contada al ${day}, en días del calendario de la sede.`,
};

const MIN_BALANCE_DEBOUNCE_MS = 400;

function parseMinBalance(text: string): number | undefined {
  const value = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function saveCsv(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Cartera por antigüedad (DX-145): la lista de cobro de la sede activa. Mismo
 * patrón de lista que la caja y «Presupuestos por seguir»: filtros en la barra
 * con la acción primaria a la derecha («Exportar CSV», solo ADMIN), resumen por
 * tramo, conteo, lista y páginas. En escritorio es una tabla; bajo `sm` cada
 * deudor es una tarjeta con sus tramos y los botones a mano.
 */
export function ReceivablesView({ token }: { token: string }) {
  const isAdmin = getTokenRole(token) === 'ADMIN';
  const [ageFilter, setAgeFilter] = useState<string>('all');
  const [minBalanceText, setMinBalanceText] = useState('');
  const [minBalance, setMinBalance] = useState<number | undefined>(undefined);
  const [currency, setCurrency] = useState<string>('ALL');
  const [knownCurrencies, setKnownCurrencies] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReceivablesAgingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const age = AGE_FILTERS.find((f) => f.value === ageFilter);
  const minAgeDays = age?.minAgeDays;
  const filters: ReceivablesFilters = {
    ...(currency !== 'ALL' ? { currency } : {}),
    ...(minBalance !== undefined ? { minBalance } : {}),
    ...(minAgeDays !== undefined ? { minAgeDays } : {}),
  };
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    if (!token) return;
    const query: ReceivablesFilters = JSON.parse(filterKey);
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getReceivablesAging(token, { ...query, page });
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (res.items.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
        if (!query.currency) {
          setKnownCurrencies((prev) => [...new Set([...prev, ...res.totals.map((t) => t.currency)])].sort());
        }
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(
          apiErrorMessage(err, { fallback: receivablesCopy.loadError, byStatus: { 400: receivablesCopy.badRequest } }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, page, reloadKey]);

  // Nombre de la clínica para el mensaje de WhatsApp: si falla, «la clínica».
  useEffect(() => {
    let cancelled = false;
    fetchClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name);
      })
      .catch(() => {
        /* sin nombre, el mensaje dice «la clínica» */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // El saldo mínimo se aplica al dejar de teclear, no en cada tecla.
  useEffect(() => {
    const next = parseMinBalance(minBalanceText);
    if (next === minBalance) return;
    const timer = setTimeout(() => {
      setMinBalance(next);
      setPage(1);
    }, MIN_BALANCE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [minBalanceText, minBalance]);

  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    try {
      const text = await downloadReceivablesCsv(token, JSON.parse(filterKey) as ReceivablesFilters);
      saveCsv(text, csvFileName(data?.asOf ?? new Date().toISOString().slice(0, 10)));
      setNotice(receivablesCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: receivablesCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  const items = data?.items ?? [];
  const location = data?.scope.location ?? null;

  return (
    <>
      <PageHeader
        title={receivablesCopy.title}
        description={receivablesCopy.description}
        meta={
          data ? (
            <p className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-muted">
              <Building2 aria-hidden className="size-4 shrink-0 text-muted/80" />
              <span>{location ? receivablesCopy.scopeLocation(location.name) : receivablesCopy.scopeAll}</span>
            </p>
          ) : null
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <select
              aria-label={receivablesCopy.ageLabel}
              value={ageFilter}
              onChange={(e) => {
                setAgeFilter(e.target.value);
                setPage(1);
              }}
              className={cn(toolbarFieldClass, 'sm:w-52')}
            >
              {AGE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <Input
              type="text"
              inputMode="decimal"
              aria-label={receivablesCopy.minBalanceLabel}
              placeholder={receivablesCopy.minBalancePlaceholder}
              value={minBalanceText}
              onChange={(e) => setMinBalanceText(e.target.value)}
              className="tabular-nums sm:w-40"
            />
            <select
              aria-label={receivablesCopy.currencyLabel}
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setPage(1);
              }}
              className={cn(toolbarFieldClass, 'sm:w-48')}
            >
              <option value="ALL">{receivablesCopy.currencyAll}</option>
              {knownCurrencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && !forbidden ? (
            <Button type="button" onClick={() => void exportCsv()} disabled={exporting || loading} className="shrink-0">
              <Download aria-hidden />
              {exporting ? receivablesCopy.exporting : receivablesCopy.export}
            </Button>
          ) : null}
        </div>

        <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
          {notice}
        </p>

        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={receivablesCopy.forbiddenTitle}
            description={receivablesCopy.forbiddenHint}
          />
        ) : (
          <>
            {!loading && !loadError && data ? (
              <ResultCount
                total={data.total}
                noun={receivablesCopy.countNoun}
                nounPlural={receivablesCopy.countNounPlural}
              />
            ) : null}

            <AsyncSection
              loading={loading}
              error={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={items.length === 0}
              emptyTitle={location || !data ? receivablesCopy.emptyLocation : receivablesCopy.emptyClinic}
              emptyDescription={receivablesCopy.emptyHint}
              skeleton={<TableSkeleton rows={5} />}
            >
              {data ? (
                <>
                  <AgingSummary totals={data.totals} />
                  <p className="text-xs text-muted tabular-nums">
                    {receivablesCopy.asOf(data.asOf.split('-').reverse().join('/'))}
                  </p>
                </>
              ) : null}

              {/* Escritorio: una tabla. */}
              <Card className="overflow-hidden p-0 max-sm:hidden">
                <Table aria-label={receivablesCopy.tableLabel}>
                  <caption className="sr-only">{receivablesCopy.tableLabel}</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col">{receivablesCopy.colPatient}</TableHead>
                      <TableHead scope="col">{receivablesCopy.colAge}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {receivablesCopy.colDebt}
                      </TableHead>
                      <TableHead scope="col">{receivablesCopy.colLastPayment}</TableHead>
                      <TableHead scope="col">{receivablesCopy.colNext}</TableHead>
                      <TableHead scope="col">
                        <span className="sr-only">{receivablesCopy.colActions}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((row) => (
                      <TableRow key={row.patient.id} data-testid="debtor-row">
                        <TableCell data-label={receivablesCopy.colPatient}>
                          <Link
                            href={statementHref(row.patient.id)}
                            className="font-medium text-ink underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {row.patient.fullName}
                          </Link>
                          {row.patient.phone ? (
                            <span className="block text-xs text-muted tabular-nums">{row.patient.phone}</span>
                          ) : null}
                        </TableCell>
                        <TableCell data-label={receivablesCopy.colAge}>
                          <AgeCell row={row} />
                        </TableCell>
                        <TableCell className="text-right" data-label={receivablesCopy.colDebt}>
                          <DebtCell currencies={row.currencies} />
                          {/* Con un solo tramo ya lo dice la antigüedad; con
                              varios, el desglose bajo el total. */}
                          {bucketLineCount(row) > 1 ? (
                            <BucketList currencies={row.currencies} className="mt-1 text-xs" />
                          ) : null}
                        </TableCell>
                        <TableCell data-label={receivablesCopy.colLastPayment}>
                          <LastPayment row={row} />
                        </TableCell>
                        <TableCell data-label={receivablesCopy.colNext}>
                          <NextInstallment row={row} />
                        </TableCell>
                        <TableCell data-label={receivablesCopy.colActions}>
                          <DebtorActions row={row} clinicName={clinicName} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Móvil: una tarjeta por deudor, sin scroll lateral. */}
              <ul aria-label={receivablesCopy.listLabel} className="flex flex-col gap-3 sm:hidden">
                {items.map((row) => (
                  <li key={row.patient.id}>
                    <DebtorCard row={row} clinicName={clinicName} />
                  </li>
                ))}
              </ul>
            </AsyncSection>

            {!loadError ? (
              <Pagination
                page={page}
                pageSize={data?.pageSize ?? 0}
                total={data?.total ?? 0}
                onPageChange={setPage}
                disabled={loading}
              />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
