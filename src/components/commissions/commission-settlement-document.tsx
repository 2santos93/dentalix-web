'use client';
import * as React from 'react';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { lineDeductionTexts } from './commission-lines';
import {
  COMMISSION_BASIS_LABELS,
  COMMISSION_RELEASE_LABELS,
  deductionsSummary,
  percentText,
  type CommissionLine,
  type CommissionSettlement,
} from '@/lib/commissions/commissions-api';

export const commissionDocumentCopy = {
  title: 'Liquidación de honorarios',
  professional: 'Profesional',
  period: 'Período',
  rule: 'Regla',
  closedAt: 'Cerrada',
  closedBy: 'Cerró',
  lock: 'Cierre contable',
  lockValue: (day: string) => `Cerrado hasta el ${day}`,
  categories: 'Porcentaje por categoría',
  accruals: 'Devengado en el período',
  adjustments: 'Ajustes de liquidaciones anteriores',
  colPatient: 'Paciente',
  colItem: 'Procedimiento',
  colPayment: 'Abono',
  colBase: 'Base',
  colPercent: '%',
  colAmount: 'Honorario',
  produced: 'Realizado',
  totals: 'Totales por moneda',
  totalAccrued: 'Devengado',
  totalAdjustments: 'Ajustes',
  totalToPay: 'A pagar',
  nothing: 'Sin movimientos en este período.',
  frozen: 'Documento congelado: lo que cambie después se corrige como ajuste en la siguiente liquidación.',
  periodValue: (from: string, to: string) => `${from} – ${to}`,
  ruleValue: (percent: string, basis: string, release: string) => `${percent} de ${basis}, ${release}`,
  // DX-018-bis: los descuentos de la regla al cerrar.
  deductions: 'Descuentos de la base',
  deductionsValue: (summary: string | null) =>
    summary ? `${summary[0].toUpperCase()}${summary.slice(1)} antes del porcentaje` : 'Ninguno',
};

const copy = commissionDocumentCopy;

function LinesTable({ title, lines, stamp }: { title: string; lines: readonly CommissionLine[]; stamp: SedePainters }) {
  if (lines.length === 0) return null;
  return (
    <section className="commission-lines mt-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      <table className="mt-2 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#d1d5db] text-left text-[#4b5563]">
            <th className="py-1.5 pr-2 font-medium">{copy.colPatient}</th>
            <th className="py-1.5 pr-2 font-medium">{copy.colItem}</th>
            <th className="py-1.5 pr-2 font-medium">{copy.colPayment}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{copy.colBase}</th>
            <th className="py-1.5 pr-2 text-right font-medium">{copy.colPercent}</th>
            <th className="py-1.5 text-right font-medium">{copy.colAmount}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id ?? i} className="border-b border-[#e5e7eb] align-top">
              <td className="py-1.5 pr-2 [overflow-wrap:anywhere]">{l.patient.name ?? '—'}</td>
              <td className="py-1.5 pr-2 [overflow-wrap:anywhere]">
                {l.catalogLabel} · {l.toothNumber}
                {l.completedAt ? <span className="block text-[#4b5563]">{stamp.date(l.completedAt, l.locationId)}</span> : null}
              </td>
              <td className="py-1.5 pr-2 tabular-nums">
                {l.payment
                  ? `${stamp.date(l.payment.paidAt, l.locationId)} · ${stamp.money(l.payment.amount, l.payment.currency, l.locationId)}`
                  : copy.produced}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {stamp.money(l.base, l.currency, l.locationId)}
                {(() => {
                  const { detail, skipped } = lineDeductionTexts(l, (n) => stamp.money(n, l.currency, l.locationId));
                  return (
                    <>
                      {detail ? <span className="block text-[#4b5563]">{detail}</span> : null}
                      {skipped ? <span className="block text-[#834B14]">{skipped}</span> : null}
                    </>
                  );
                })()}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{percentText(l.percent)}</td>
              <td className="py-1.5 text-right font-medium tabular-nums">{stamp.money(l.amount, l.currency, l.locationId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * La liquidación cerrada como DOCUMENTO (DX-018): cabecera con la clínica,
 * profesional, período y regla congelada; detalle de devengos y ajustes; y
 * totales por moneda (nunca sumados entre monedas). Papel blanco y tinta
 * oscura explícitos, también con el tema oscuro.
 */
export function CommissionSettlementDocument({
  data,
  stamp,
  clinic,
}: {
  data: CommissionSettlement;
  stamp: SedePainters;
  clinic: { name: string | null; logoUrl: string | null };
}) {
  const accruals = data.lines.filter((l) => l.kind === 'ACCRUAL');
  const adjustments = data.lines.filter((l) => l.kind === 'ADJUSTMENT');
  return (
    <article className="commission-print-root relative mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <header className="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between print:flex-row">
        <div className="flex min-w-0 items-center gap-3">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo del tenant con host arbitrario, para imprimir; next/image no aporta nada aquí
            <img src={clinic.logoUrl} alt={clinic.name ?? ''} referrerPolicy="no-referrer" className="h-12 w-auto max-w-[160px] object-contain" />
          ) : null}
          {clinic.name ? <p className="text-base font-semibold [overflow-wrap:anywhere]">{clinic.name}</p> : null}
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-right print:text-right">{copy.title}</h1>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
        <div>
          <dt className="text-xs text-[#4b5563]">{copy.professional}</dt>
          <dd className="font-medium">{data.professional.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#4b5563]">{copy.period}</dt>
          <dd className="tabular-nums">{copy.periodValue(stamp.civilDate(data.period.from), stamp.civilDate(data.period.to))}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#4b5563]">{copy.rule}</dt>
          <dd>
            {copy.ruleValue(
              percentText(data.percent),
              COMMISSION_BASIS_LABELS[data.basis].toLowerCase(),
              COMMISSION_RELEASE_LABELS[data.releaseMode].toLowerCase(),
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#4b5563]">{copy.deductions}</dt>
          <dd>{copy.deductionsValue(deductionsSummary(data))}</dd>
        </div>
        {data.categoryPercents.length > 0 ? (
          <div className="col-span-2 sm:col-span-3 print:col-span-3">
            <dt className="text-xs text-[#4b5563]">{copy.categories}</dt>
            <dd>{data.categoryPercents.map((c) => `${c.category}: ${percentText(c.percent)}`).join(' · ')}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-[#4b5563]">{copy.closedAt}</dt>
          <dd className="tabular-nums">{stamp.dateTime(data.closedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#4b5563]">{copy.closedBy}</dt>
          <dd>{data.closedBy.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#4b5563]">{copy.lock}</dt>
          <dd className="tabular-nums">{copy.lockValue(stamp.civilDate(data.lockDateAfter))}</dd>
        </div>
      </dl>

      <LinesTable title={copy.accruals} lines={accruals} stamp={stamp} />
      <LinesTable title={copy.adjustments} lines={adjustments} stamp={stamp} />

      <section className="commission-totals mt-6">
        <h2 className="text-sm font-semibold">{copy.totals}</h2>
        {data.totals.length === 0 ? (
          <p className="mt-2 text-sm">{copy.nothing}</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#d1d5db] text-left text-xs text-[#4b5563]">
                <th className="py-1.5 pr-2 font-medium" />
                <th className="py-1.5 pr-2 text-right font-medium">{copy.totalAccrued}</th>
                <th className="py-1.5 pr-2 text-right font-medium">{copy.totalAdjustments}</th>
                <th className="py-1.5 text-right font-medium">{copy.totalToPay}</th>
              </tr>
            </thead>
            <tbody>
              {data.totals.map((t) => (
                <tr key={t.currency} className="border-b border-[#e5e7eb]">
                  <th scope="row" className="py-1.5 pr-2 text-left font-medium">{t.currency}</th>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{stamp.money(t.accrued, t.currency)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{stamp.money(t.adjustments, t.currency)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{stamp.money(t.total, t.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="mt-6 text-xs text-[#4b5563]">{copy.frozen}</p>
    </article>
  );
}
