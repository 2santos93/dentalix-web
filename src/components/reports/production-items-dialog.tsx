'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import {
  getProductionItems,
  type ProcedureRow,
  type ProductionFilters,
  type ProductionItems,
} from '@/lib/reports/reports-api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollFrame } from '@/components/ui/scroll-frame';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Pagination } from '@/components/shared/pagination';

export const productionItemsCopy = {
  title: (code: string, label: string) => `${code} · ${label}`,
  description: (count: number, currency: string) =>
    `${count} ${count === 1 ? 'procedimiento realizado' : 'procedimientos realizados'} en ${currency}, del más reciente al más antiguo.`,
  tableLabel: 'Procedimientos realizados de la fila',
  date: 'Fecha',
  patient: 'Paciente',
  professional: 'Profesional',
  location: 'Sede',
  tooth: 'Diente',
  net: 'Neto',
  noProfessional: '—',
  deletedPatient: 'Paciente eliminado',
  loadError: 'No pudimos cargar los procedimientos de la fila.',
  empty: 'No hay procedimientos en esta fila',
};

const PAGE_SIZE = 25;

/**
 * Detalle de una fila de «Producción por procedimiento» (DX-423): cada ítem
 * realizado con su paciente, fecha, profesional y sede. Es lo único del
 * reporte que lleva nombres de paciente: la API solo lo sirve a quien ve
 * pacientes (ADMIN y DENTIST, este solo los suyos) y deja la consulta en la
 * auditoría.
 */
export function ProductionItemsDialog({
  token,
  filters,
  row,
  fmt,
  onClose,
}: {
  token: string;
  filters: ProductionFilters;
  row: ProcedureRow | null;
  fmt: RegionalFormat;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProductionItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const query = row
    ? JSON.stringify({
        ...filters,
        catalogItemId: row.catalogItemId,
        currency: row.currency,
        page,
      })
    : null;

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getProductionItems(token, {
          ...JSON.parse(query as string),
          pageSize: PAGE_SIZE,
        });
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, { fallback: productionItemsCopy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, query, reloadKey]);

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) {
          setPage(1);
          setData(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        {row ? (
          <>
            <DialogHeader>
              <DialogTitle>{productionItemsCopy.title(row.code, row.label)}</DialogTitle>
              <DialogDescription>{productionItemsCopy.description(row.count, row.currency)}</DialogDescription>
            </DialogHeader>
            <AsyncSection
              loading={loading}
              error={error}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={data?.items.length === 0}
              emptyTitle={productionItemsCopy.empty}
              skeleton={<TableSkeleton />}
            >
              {data ? (
                <div className="flex min-w-0 flex-col gap-3">
                  <ScrollFrame label={productionItemsCopy.tableLabel} className="rounded-lg border border-border">
                    <table className="w-full min-w-[40rem] text-sm">
                      <caption className="sr-only">{productionItemsCopy.tableLabel}</caption>
                      <thead className="bg-surface-2">
                        <tr>
                          {[
                            productionItemsCopy.date,
                            productionItemsCopy.patient,
                            productionItemsCopy.professional,
                            productionItemsCopy.location,
                            productionItemsCopy.tooth,
                          ].map((h) => (
                            <th key={h} scope="col" className="t-label px-3 py-2 text-left text-ink">
                              {h}
                            </th>
                          ))}
                          <th scope="col" className="t-label px-3 py-2 text-right text-ink">
                            {productionItemsCopy.net}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {data.items.map((item) => (
                          <tr key={item.id} data-testid="production-item" className="h-11">
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink">
                              {fmt.date(new Date(item.completedAt), item.timeZone)}
                            </td>
                            <td className="px-3 py-2">
                              {item.patientId && item.patientName ? (
                                <Link
                                  href={`/patients/${item.patientId}`}
                                  className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                                >
                                  {item.patientName}
                                </Link>
                              ) : (
                                <span className="text-muted">{productionItemsCopy.deletedPatient}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-ink">
                              {item.professionalName ?? productionItemsCopy.noProfessional}
                            </td>
                            <td className="px-3 py-2 text-ink">{item.locationName}</td>
                            <td className="px-3 py-2 tabular-nums text-ink">{item.toothNumber}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink">
                              {moneyWithCode(item.net, item.currency, fmt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollFrame>
                  <Pagination
                    page={data.page}
                    pageSize={data.pageSize}
                    total={data.total}
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
