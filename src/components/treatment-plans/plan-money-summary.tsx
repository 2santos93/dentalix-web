'use client';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeMoney } from '@/lib/format/sede-number';
import { allocationCopy } from '@/lib/payments/allocation-copy';
import type { PlanBalance } from '@/lib/payments/payments-api';
import { WithoutRateNotice } from '@/components/payments/without-rate-notice';
import { cn } from '@/lib/utils';
import { copy } from './treatment-plans-tab-copy';

/**
 * Las cuatro cifras del plan en UNA fila etiquetada, no en tarjetas.
 *
 * Antes esta pantalla mostraba «Total» en su propia franja y luego tres
 * tarjetas con borde (A pagar / Pagado / Saldo) — la plantilla de
 * métrica-héroe que DESIGN.md prohíbe como estructura, y seis cifras con
 * alcances distintos compitiendo por la misma atención junto a las tres del
 * plan de pagos. Aquí las cuatro que describen ESTE plan van juntas y con el
 * mismo peso; las del financiamiento se quedan bajo «Plan de pagos», que es lo
 * que las distingue.
 *
 * `Saldo` es la única que se destaca (`text-ink` sobre el resto en `text-muted`
 * es lo que hace jerarquía sin volver a inventar una tarjeta): es la cifra que
 * el paciente pregunta en voz alta.
 */
export function PlanMoneySummary({
  token,
  total,
  currency,
  balance,
  fmt,
}: {
  token: string;
  total: number;
  currency: string;
  balance: PlanBalance | null;
  /** DX-489: el formato de la sede, el mismo de la lista de abonos (DX-386); sin él, «—». */
  fmt: RegionalFormat | null;
}) {
  const money = (amount: number, code: string) => sedeMoney(amount, code, fmt);
  const figures: { key: string; label: string; value: string; strong?: boolean; help?: string }[] = [
    { key: 'total', label: copy.totalLabel, value: money(total, currency) },
  ];
  if (balance) {
    figures.push(
      {
        key: 'billable',
        label: copy.billableLabel,
        value: money(balance.billable, balance.planCurrency),
      },
      {
        key: 'paid',
        label: copy.paidLabel,
        value: money(balance.paid, balance.planCurrency),
      },
      {
        key: 'balance',
        label: copy.balanceLabel,
        value: money(balance.balance, balance.planCurrency),
        strong: true,
      },
    );
    // DX-051: solo cuando hay algo por imputar; un cero aquí sería ruido.
    if (balance.unallocated > 0) {
      figures.push({
        key: 'unallocated',
        label: allocationCopy.unallocated,
        value: money(balance.unallocated, balance.planCurrency),
        help: allocationCopy.unallocatedHelp,
      });
    }
  }

  return (
    <>
      {/* `<dl>` y no divs: son pares etiqueta/valor, y así un lector de
          pantalla los anuncia emparejados en vez de como ocho textos sueltos. */}
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {figures.map((figure) => (
          <div key={figure.key} className="min-w-0">
            <dt className="t-label text-muted">{figure.label}</dt>
            <dd
              className={cn(
                't-data mt-0.5',
                figure.strong ? 'text-lg font-semibold text-ink' : 'text-base text-muted',
              )}
            >
              {figure.value}
            </dd>
            {figure.help ? <dd className="t-caption mt-0.5 max-w-[28ch] text-muted">{figure.help}</dd> : null}
          </div>
        ))}
      </dl>
      {/* DX-375: los abonos «sin tasa» no cuentan en Pagado ni en Saldo; el
          aviso lo dice junto a las cifras (y cómo resolverlo) en vez de la
          nota de «sin convertir», que habla de los mismos abonos. */}
      {balance && balance.paymentsWithoutRate.length > 0 ? (
        <WithoutRateNotice token={token} payments={balance.paymentsWithoutRate} />
      ) : balance && balance.unconvertedPaymentsCount > 0 ? (
        <p className="text-sm text-muted">{allocationCopy.unconvertedNotice(balance.unconvertedPaymentsCount)}</p>
      ) : null}
    </>
  );
}