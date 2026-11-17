'use client';
import * as React from 'react';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import { percentText, type CommissionLine, type CommissionTotal } from '@/lib/commissions/commissions-api';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SectionHeader } from '@/components/ui/section-header';
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
};

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

function lineColumns(stamp: SedeStamp): DataListColumn<CommissionLine>[] {
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
      cell: (l) => stamp.money(l.base, l.currency, l.locationId),
    },
    {
      id: 'percent',
      header: copy.colPercent,
      numeric: true,
      align: 'end',
      cell: (l) => percentText(l.percent),
    },
    {
      id: 'amount',
      header: copy.colAmount,
      numeric: true,
      align: 'end',
      mobile: 'trailing',
      cell: (l) => (
        <span className={cn('font-medium tabular-nums', l.amount < 0 && 'text-danger-text')}>
          {stamp.money(l.amount, l.currency, l.locationId)}
        </span>
      ),
    },
  ];
}

/** El detalle (vista previa o congelado): devengos y, aparte, los ajustes. */
export function CommissionLines({ lines, stamp }: { lines: readonly CommissionLine[]; stamp: SedeStamp }) {
  const accruals = lines.filter((l) => l.kind === 'ACCRUAL');
  const adjustments = lines.filter((l) => l.kind === 'ADJUSTMENT');
  const columns = lineColumns(stamp);
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
