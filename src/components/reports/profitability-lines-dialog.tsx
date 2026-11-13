'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import {
  getProfitabilityLines,
  type ProfitabilityFigure,
  type ProfitabilityFilters,
  type ProfitabilityLine,
  type ProfitabilityLines,
} from '@/lib/reports/profitability-api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollFrame } from '@/components/ui/scroll-frame';
import { StatusBadge } from '@/components/ui/status-badge';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Pagination } from '@/components/shared/pagination';

/** La cifra abierta y el título del diálogo («Cobrado · Sede Chacao · USD»). */
export interface OpenFigure {
  figure: ProfitabilityFigure;
  title: string;
}

export const profitabilityLinesCopy = {
  description: (count: number, total: string) =>
    `${count} ${count === 1 ? 'movimiento' : 'movimientos'} que suman ${total}, del más reciente al más antiguo.`,
  tableLabel: 'Movimientos de la cifra',
  date: 'Fecha',
  location: 'Sede',
  concept: {
    INCOME_CASH: 'Recibo',
    INCOME_ACCRUAL: 'Procedimiento',
    EXPENSE: 'Proveedor o descripción',
  },
  category: 'Categoría',
  method: 'Medio',
  status: 'Pago',
  amount: 'Importe',
  noValue: '—',
  loading: 'Cargando los movimientos…',
  loadError: 'No pudimos cargar los movimientos de esta cifra.',
  empty: 'No hay movimientos en esta cifra',
};

const PAGE_SIZE = 25;

/** El estado de pago del gasto en el vocabulario de Gastos (DX-274): «Pendiente» si no tiene pagos. */
const EXPENSE_STATUS = { PAID: 'PAID', PARTIAL: 'PARTIAL', UNPAID: 'PENDING' } as const;

interface Column {
  header: string;
  numeric?: boolean;
  cell: (line: ProfitabilityLine) => React.ReactNode;
}

/**
 * Detalle de una cifra de «Rentabilidad por sede» (DX-410): los abonos,
 * procedimientos realizados, pagos de gastos o gastos que la forman, con los
 * MISMOS filtros que el informe (su suma es la cifra). Sin datos de
 * pacientes: recibo, procedimiento o proveedor.
 */
export function ProfitabilityLinesDialog({
  token,
  filters,
  opened,
  fmt,
  onClose,
}: {
  token: string;
  filters: ProfitabilityFilters;
  opened: OpenFigure | null;
  fmt: RegionalFormat;
  onClose: () => void;
}) {
  const c = profitabilityLinesCopy;
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProfitabilityLines | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const query = opened ? JSON.stringify({ filters, figure: opened.figure, page }) : null;

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    async function load() {
      const q = JSON.parse(query as string) as { filters: ProfitabilityFilters; figure: ProfitabilityFigure; page: number };
      setLoading(true);
      try {
        const res = await getProfitabilityLines(token, q.filters, q.figure, q.page, PAGE_SIZE);
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, { fallback: c.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, query, reloadKey, c.loadError]);

  const figure = opened?.figure;
  const income = figure?.side === 'INCOME';
  const cash = filters.basis === 'CASH';
  const currency = figure?.currency ?? '';
  const columns: Column[] = figure
    ? [
        { header: c.date, cell: (l) => <span className="whitespace-nowrap tabular-nums">{fmt.civilDate(l.date)}</span> },
        ...(figure.locationId ? [] : [{ header: c.location, cell: (l: ProfitabilityLine) => l.locationName }]),
        {
          header: income ? (cash ? c.concept.INCOME_CASH : c.concept.INCOME_ACCRUAL) : c.concept.EXPENSE,
          cell: (l) => l.concept ?? <span className="text-muted">{c.noValue}</span>,
        },
        ...(!income && figure.category === undefined
          ? [{ header: c.category, cell: (l: ProfitabilityLine) => l.category ?? c.noValue }]
          : []),
        ...(cash ? [{ header: c.method, cell: (l: ProfitabilityLine) => l.method ?? c.noValue }] : []),
        ...(!income && !cash
          ? [
              {
                header: c.status,
                cell: (l: ProfitabilityLine) =>
                  l.paymentStatus ? <StatusBadge kind="expense" status={EXPENSE_STATUS[l.paymentStatus]} /> : c.noValue,
              },
            ]
          : []),
        {
          header: c.amount,
          numeric: true,
          cell: (l) => <span className="whitespace-nowrap tabular-nums">{moneyWithCode(l.amount, currency, fmt)}</span>,
        },
      ]
    : [];

  return (
    <Dialog
      open={opened !== null}
      onOpenChange={(open) => {
        if (!open) {
          setPage(1);
          setData(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        {opened ? (
          <>
            <DialogHeader>
              <DialogTitle>{opened.title}</DialogTitle>
              <DialogDescription>
                {data ? c.description(data.count, moneyWithCode(data.total, currency, fmt)) : c.loading}
              </DialogDescription>
            </DialogHeader>
            <AsyncSection
              loading={loading}
              error={error}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={data?.lines.length === 0}
              emptyTitle={c.empty}
              skeleton={<TableSkeleton />}
            >
              {data ? (
                <div className="flex min-w-0 flex-col gap-3">
                  <ScrollFrame label={c.tableLabel} className="rounded-lg border border-border">
                    <table className="w-full min-w-[34rem] text-sm">
                      <caption className="sr-only">{c.tableLabel}</caption>
                      <thead className="bg-surface-sunken">
                        <tr>
                          {columns.map((col) => (
                            <th
                              key={col.header}
                              scope="col"
                              className={`t-label px-3 py-2 text-ink ${col.numeric ? 'text-right' : 'text-left'}`}
                            >
                              {col.header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {data.lines.map((line) => (
                          <tr key={line.id} data-testid="profitability-line" className="h-11">
                            {columns.map((col) => (
                              <td
                                key={col.header}
                                className={`px-3 py-2 text-ink ${col.numeric ? 'text-right' : 'text-left'}`}
                              >
                                {col.cell(line)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollFrame>
                  <Pagination
                    page={data.page}
                    pageSize={data.pageSize}
                    total={data.count}
                    onPageChange={setPage}
                    disabled={loading}
                  />
                </div>
              ) : null}
            </AsyncSection>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
