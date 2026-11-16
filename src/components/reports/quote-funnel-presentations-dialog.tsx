'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { treatmentPlanHref } from '@/lib/patients/patient-tab-access';
import { REJECTION_REASON_LABELS } from '@/lib/treatment-plans/plan-options';
import {
  getQuoteFunnelPresentations,
  presentationAmount,
  QUOTE_FUNNEL_OUTCOME_LABELS,
  type QuoteFunnelDetailStep,
  type QuoteFunnelFilters,
  type QuoteFunnelPresentations,
  type QuoteFunnelRejectionReasonKey,
} from '@/lib/reports/quote-funnel-api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollFrame } from '@/components/ui/scroll-frame';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Pagination } from '@/components/shared/pagination';

/** La cifra abierta: qué paso o desenlace, con qué motivo y de quién (fila por profesional). */
export interface OpenQuoteFunnelFigure {
  step: QuoteFunnelDetailStep;
  reason?: QuoteFunnelRejectionReasonKey;
  /** Fila por profesional: solo lo que elaboró esa persona. */
  providerId?: string;
  /** «Aceptados», «Rechazados · Precio», «Cobrados · Dra. Pérez». */
  title: string;
  /** Las presentaciones que cuenta la cifra (la descripción antes de cargar). */
  count: number;
}

export const quoteFunnelDialogCopy = {
  description: (count: number) =>
    `${count} ${count === 1 ? 'presentación' : 'presentaciones'}, de la más reciente a la más antigua. Cada una abre el plan en la ficha del paciente.`,
  tableLabel: 'Presentaciones de la cifra',
  date: 'Presentado',
  patient: 'Paciente',
  location: 'Sede',
  professional: 'Lo elaboró',
  options: 'Opciones',
  amount: (step: QuoteFunnelDetailStep) =>
    step === 'ACCEPTED'
      ? 'Aceptado'
      : step === 'SCHEDULED'
        ? 'Agendado'
        : step === 'DONE'
          ? 'Realizado'
          : step === 'COLLECTED'
            ? 'Cobrado'
            : 'Presentado',
  outcome: 'Desenlace',
  noLocation: 'Sin sede',
  unattributed: 'Sin atribuir',
  deletedPatient: 'Paciente eliminado',
  noValue: '—',
  loadError: 'No pudimos cargar las presentaciones de esta cifra.',
  empty: 'No hay presentaciones en esta cifra',
};

const PAGE_SIZE = 25;

/**
 * Detalle de una cifra del «Embudo de presupuestos» (DX-558): las
 * presentaciones que la forman, con los MISMOS filtros que el informe, de 25
 * en 25. Lleva el nombre del paciente (la API lo audita) y enlaza a su ficha
 * en «Plan de tratamiento» con el plan de la primera opción elegido. A 390 px
 * ocupa la pantalla y la tabla se desplaza dentro de su marco.
 */
export function QuoteFunnelPresentationsDialog({
  token,
  filters,
  opened,
  fmt,
  onClose,
}: {
  token: string;
  filters: QuoteFunnelFilters;
  opened: OpenQuoteFunnelFigure | null;
  fmt: RegionalFormat;
  onClose: () => void;
}) {
  const c = quoteFunnelDialogCopy;
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QuoteFunnelPresentations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const query = opened
    ? JSON.stringify({
        filters: { ...filters, ...(opened.providerId ? { providerId: opened.providerId } : {}) },
        step: opened.step,
        reason: opened.reason ?? null,
        page,
      })
    : null;

  useEffect(() => {
    if (!query) return;
    const q = JSON.parse(query) as {
      filters: QuoteFunnelFilters;
      step: QuoteFunnelDetailStep;
      reason: QuoteFunnelRejectionReasonKey | null;
      page: number;
    };
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getQuoteFunnelPresentations(token, q.filters, q.step, q.reason, q.page, PAGE_SIZE);
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

  const money = (amount: number | null) =>
    amount === null || !data?.currency ? c.noValue : moneyWithCode(amount, data.currency, fmt);

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
      <DialogContent className="max-w-4xl" fullScreenOnMobile>
        {opened ? (
          <>
            <DialogHeader>
              <DialogTitle>{opened.title}</DialogTitle>
              <DialogDescription>{c.description(data?.total ?? opened.count)}</DialogDescription>
            </DialogHeader>
            <AsyncSection
              loading={loading}
              error={error}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={data?.items.length === 0}
              emptyTitle={c.empty}
              skeleton={<TableSkeleton />}
            >
              {data ? (
                <div className="flex min-w-0 flex-col gap-3">
                  <ScrollFrame label={c.tableLabel} className="rounded-lg border border-border">
                    <table className="w-full min-w-[46rem] text-sm">
                      <caption className="sr-only">{c.tableLabel}</caption>
                      <thead className="bg-surface-sunken">
                        <tr>
                          {[c.date, c.patient, c.location, c.professional].map((h) => (
                            <th key={h} scope="col" className="t-label px-3 py-2 text-left text-ink">
                              {h}
                            </th>
                          ))}
                          <th scope="col" className="t-label px-3 py-2 text-right text-ink">
                            {c.options}
                          </th>
                          <th scope="col" className="t-label px-3 py-2 text-right text-ink">
                            {c.amount(opened.step)}
                          </th>
                          <th scope="col" className="t-label px-3 py-2 text-left text-ink">
                            {c.outcome}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {data.items.map((item) => (
                          <tr key={item.groupId} data-testid="quote-funnel-presentation" className="h-11">
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink">
                              {fmt.date(new Date(item.presentedAt), item.timeZone)}
                            </td>
                            <td className="px-3 py-2">
                              {item.patientId && item.patientName ? (
                                <Link
                                  href={treatmentPlanHref(item.patientId, item.firstPlanId)}
                                  className="inline-flex min-h-8 items-center font-medium text-primary-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary-text"
                                >
                                  {item.patientName}
                                </Link>
                              ) : (
                                <span className="text-muted">{c.deletedPatient}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-ink">{item.locationName ?? c.noLocation}</td>
                            <td className="px-3 py-2 text-ink">{item.professionalName ?? c.unattributed}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink">{fmt.number(item.optionCount)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink">
                              {money(presentationAmount(item, opened.step))}
                            </td>
                            <td className="px-3 py-2 text-ink">
                              {QUOTE_FUNNEL_OUTCOME_LABELS[item.outcome]}
                              {item.rejectionReason ? (
                                <span className="text-muted"> · {REJECTION_REASON_LABELS[item.rejectionReason]}</span>
                              ) : null}
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
