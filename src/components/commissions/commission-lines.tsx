'use client';
import * as React from 'react';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import {
  lineHasDeductions,
  percentText,
  type CommissionLine,
  type CommissionTotal,
} from '@/lib/commissions/commissions-api';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

export const commissionLinesCopy = {
  accruals: 'Devengado en el período',
  accrualsHint: 'Cada procedimiento realizado o cada abono imputado a él, con el porcentaje que le toca.',
  adjustments: 'Ajustes de liquidaciones anteriores',
  adjustmentsHint:
    'Lo que cambió después de cerrar una liquidación (un abono anulado, un descuento): se corrige aquí, nunca en la cerrada.',
  colPatient: 'Paciente',
  colItem: 'Procedimiento',
  colPayment: 'Abono',
  colBase: 'Base',
  colPercent: '%',
  colAmount: 'Honorario',
  produced: 'Realizado',
  baseAt: (base: string, percent: string) => `Base ${base} al ${percent}`,
  tooth: (t: string) => `Diente ${t}`,
  paid: (date: string, amount: string) => `${date} · ${amount}`,
  patientUnknown: 'Paciente sin nombre',
  accrualsLabel: 'Detalle devengado por paciente, procedimiento y abono',
  adjustmentsLabel: 'Ajustes de liquidaciones anteriores',
  totals: 'Totales por moneda',
  totalAccrued: 'Devengado',
  totalAdjustments: 'Ajustes',
  totalToPay: (currency: string) => `A pagar en ${currency}`,
  noLines: 'Nada que liquidar en este período.',
  // DX-018-bis: lo que la base descontó (base = antes de descuentos − laboratorio − pasarela).
  gross: (amount: string) => `Antes de descuentos ${amount}`,
  labCost: (amount: string) => `Laboratorio ${amount}`,
  cardFee: (percent: string, amount: string) => `Pasarela ${percent}: ${amount}`,
  labSkipped: (currencies: string) => `Laboratorio en ${currencies} sin descontar: no se convierte a la moneda del plan.`,
};

/**
 * DX-018-bis: el desglose de la base de una línea («Antes de descuentos USD
 * 300,00 · Laboratorio −USD 120,00 · Pasarela 3,5 %: −USD 10,50») y, si un
 * costo de laboratorio está en otra moneda, el aviso de que no se descontó.
 */
export function lineDeductionTexts(
  l: CommissionLine,
  money: (amount: number) => string,
): { detail: string | null; skipped: string | null } {
  if (!lineHasDeductions(l)) return { detail: null, skipped: null };
  const d = l.deductions;
  const parts = [
    d.labCost !== 0 ? commissionLinesCopy.labCost(money(-d.labCost)) : null,
    d.cardFee !== 0 && d.cardFeePercent !== null
      ? commissionLinesCopy.cardFee(percentText(d.cardFeePercent), money(-d.cardFee))
      : null,
  ].filter((p): p is string => p !== null);
  return {
    detail: parts.length > 0 ? [commissionLinesCopy.gross(money(d.grossBase)), ...parts].join(' · ') : null,
    skipped:
      d.labCostSkippedCurrencies.length > 0 ? commissionLinesCopy.labSkipped(d.labCostSkippedCurrencies.join(', ')) : null,
  };
}

const copy = commissionLinesCopy;

/** Totales por moneda (nunca sumados entre monedas). */
export function CommissionTotals({ totals, stamp }: { totals: readonly CommissionTotal[]; stamp: SedeStamp }) {
  if (totals.length === 0) return <p className="text-sm text-muted">{copy.noLines}</p>;
  return (
    <section aria-label={copy.totals} className="flex flex-col gap-3">
      {totals.map((t) => (
        <div key={t.currency} className="rounded-lg border border-border bg-surface p-4 sm:p-6">
          <DescriptionList columns={3}>
            <DescriptionItem label={copy.totalAccrued} numeric>
              {stamp.money(t.accrued, t.currency)}
            </DescriptionItem>
            <DescriptionItem label={copy.totalAdjustments} numeric>
              {stamp.money(t.adjustments, t.currency)}
            </DescriptionItem>
            <DescriptionItem label={copy.totalToPay(t.currency)} numeric>
              <span className="font-semibold">{stamp.money(t.total, t.currency)}</span>
            </DescriptionItem>
          </DescriptionList>
        </div>
      ))}
    </section>
  );
}

function lineColumns(stamp: SedeStamp, showPayment: boolean): DataListColumn<CommissionLine>[] {
  return [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (l) => l.patient.name ?? copy.patientUnknown,
    },
    {
      id: 'item',
      header: copy.colItem,
      cell: (l) => (
        <span className="flex min-w-0 flex-col">
          <span className="[overflow-wrap:anywhere]">{l.catalogLabel}</span>
          <span className="t-caption text-muted tabular-nums">
            {[l.category, copy.tooth(l.toothNumber), l.completedAt ? stamp.date(l.completedAt, l.locationId) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ),
      mobileCell: (l) => `${l.catalogLabel} · ${copy.tooth(l.toothNumber)}`,
    },
    {
      id: 'payment',
      header: copy.colPayment,
      cell: (l) =>
        l.payment ? (
          <span className="tabular-nums">
            {copy.paid(stamp.date(l.payment.paidAt, l.locationId), stamp.money(l.payment.amount, l.payment.currency, l.locationId))}
          </span>
        ) : (
          <span className="text-muted">{copy.produced}</span>
        ),
      mobileCell: (l) => {
        if (!l.payment) return copy.produced;
        const day = stamp.maybe.date(l.payment.paidAt, l.locationId);
        return day ? copy.paid(day, stamp.money(l.payment.amount, l.payment.currency, l.locationId)) : null;
      },
    },
    {
      id: 'base',
      header: copy.colBase,
      numeric: true,
      align: 'end',
      cell: (l) => {
        const base = stamp.money(l.base, l.currency, l.locationId);
        const { detail, skipped } = lineDeductionTexts(l, (n) => stamp.money(n, l.currency, l.locationId));
        if (!detail && !skipped) return base;
        return (
          <span className="flex flex-col items-end gap-0.5">
            <span>{base}</span>
            {detail ? <span className="t-caption max-w-[18rem] text-right text-muted">{detail}</span> : null}
            {skipped ? <span className="t-caption max-w-[18rem] text-right text-warning-text">{skipped}</span> : null}
          </span>
        );
      },
      // En la tarjeta, base y % juntos: «Base USD 200,00 al 35 %», y el desglose debajo.
      mobileCell: (l) => {
        const baseAt = copy.baseAt(stamp.money(l.base, l.currency, l.locationId), percentText(l.percent));
        const { detail, skipped } = lineDeductionTexts(l, (n) => stamp.money(n, l.currency, l.locationId));
        if (!detail && !skipped) return baseAt;
        return (
          <span className="flex flex-col gap-0.5">
            <span>{baseAt}</span>
            {detail ? <span className="t-caption text-muted">{detail}</span> : null}
            {skipped ? <span className="t-caption text-warning-text">{skipped}</span> : null}
          </span>
        );
      },
    },
    {
      id: 'percent',
      header: copy.colPercent,
      numeric: true,
      align: 'end',
      mobile: 'hidden',
      cell: (l) => <span className="whitespace-nowrap">{percentText(l.percent)}</span>,
    },
    {
      id: 'amount',
      header: copy.colAmount,
      numeric: true,
      align: 'end',
      mobile: 'trailing',
      cell: (l) => (
        <span className="flex flex-col items-end gap-1">
          <span className={cn('font-medium tabular-nums', l.amount < 0 && 'text-danger-text')}>
            {stamp.money(l.amount, l.currency, l.locationId)}
          </span>
          {/* DX-464: la línea que cubre un pago vivo. */}
          {showPayment && l.paidInPaymentId ? <StatusBadge kind="commissionPayment" status="PAID" /> : null}
        </span>
      ),
    },
  ];
}

/** El detalle (vista previa o congelado): devengos y, aparte, los ajustes. */
export function CommissionLines({
  lines,
  stamp,
  showPayment = false,
}: {
  lines: readonly CommissionLine[];
  stamp: SedeStamp;
  /** DX-464: en la liquidación cerrada, marca las líneas ya pagadas. */
  showPayment?: boolean;
}) {
  const accruals = lines.filter((l) => l.kind === 'ACCRUAL');
  const adjustments = lines.filter((l) => l.kind === 'ADJUSTMENT');
  const columns = lineColumns(stamp, showPayment);
  const key = (l: CommissionLine, i: number) =>
    l.id ?? `${l.kind}-${l.treatmentPlanItemId}-${l.payment?.id ?? 'p'}-${l.adjustsLineId ?? i}`;
  return (
    <div className="flex flex-col gap-8">
      {accruals.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title={copy.accruals} description={copy.accrualsHint} />
          <DataList
            label={copy.accrualsLabel}
            rows={accruals}
            columns={columns}
            getRowKey={(l) => key(l, accruals.indexOf(l))}
          />
        </section>
      ) : null}
      {adjustments.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title={copy.adjustments} description={copy.adjustmentsHint} />
          <DataList
            label={copy.adjustmentsLabel}
            rows={adjustments}
            columns={columns}
            getRowKey={(l) => key(l, adjustments.indexOf(l))}
          />
        </section>
      ) : null}
    </div>
  );
}
