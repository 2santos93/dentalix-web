'use client';
import { Loader2, TriangleAlert } from 'lucide-react';
import { FieldError } from '@/components/errors/field-error';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import { convertWithRate, paymentRateCopy, ratePairLabel } from '@/lib/payments/payment-rate';
import type { ExchangeRatesState } from './use-exchange-rates';

// Copy como constantes (i18n-ready). Ningún texto nombra un país ni un banco.
export const ratePreviewCopy = {
  title: (currency: string) => `En la moneda del plan (${currency})`,
  loading: 'Consultando la tasa de cambio…',
  error: 'No se pudo consultar la tasa',
  retry: 'Reintentar la consulta de la tasa',
  errorHint: 'Puedes registrar el abono igual: se convierte con la tasa de su día.',
  rate: (pair: string, source: string, date: string) => `Tasa: ${pair} · ${source} · ${date}`,
  typeAmount: 'Escribe el importe para ver cuánto cubre del plan.',
  equivalent: (currency: string) => `Equivalente en ${currency}`,
  pendingAfter: 'Pendiente tras el abono',
  inFavorAfter: 'A favor tras el abono',
  missing: (currency: string, date: string) =>
    `No hay tasa de ${currency} para el ${date}: el abono se guarda igual y queda «sin tasa» hasta que se registre la tasa de ese día.`,
};
const copy = ratePreviewCopy;

interface PaymentRatePreviewProps {
  state: ExchangeRatesState;
  /** Importe del abono ya leído; `null` si aún no hay uno válido. */
  amount: number | null;
  paymentCurrency: string;
  planCurrency: string;
  /** Saldo del plan antes del abono, en su moneda. */
  planBalance: number;
  /** Día del abono (AAAA-MM-DD): el de la tasa que congelará (DX-375). */
  date: string;
}

/**
 * DX-376: al cobrar en otra moneda que la del plan, cuánto cubre el abono en
 * la moneda del plan, con qué tasa (su fuente y su día) y lo que queda
 * pendiente, ANTES de guardar. Es la misma tasa del día que la API congelará
 * al registrar el abono (DX-375), con la misma cuenta. Sin tasa, lo dice y
 * no bloquea: el abono se guarda «sin tasa». Un fallo de la consulta tampoco
 * bloquea el cobro.
 */
export function PaymentRatePreview({
  state,
  amount,
  paymentCurrency,
  planCurrency,
  planBalance,
  date,
}: PaymentRatePreviewProps) {
  return (
    <section
      data-testid="rp-rate-preview"
      aria-label={copy.title(planCurrency)}
      aria-live="polite"
      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink"
    >
      <p className="t-label text-muted">{copy.title(planCurrency)}</p>
      <PreviewBody
        state={state}
        amount={amount}
        paymentCurrency={paymentCurrency}
        planCurrency={planCurrency}
        planBalance={planBalance}
        date={date}
      />
    </section>
  );
}

function PreviewBody({ state, amount, paymentCurrency, planCurrency, planBalance, date }: PaymentRatePreviewProps) {
  if (state.status === 'idle') return null;
  if (state.status === 'loading') {
    return (
      <p className="mt-1 flex items-center gap-2 text-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {copy.loading}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="mt-1 space-y-1">
        <FieldError label={copy.error} onRetry={state.retry} retryLabel={copy.retry} className="w-full" />
        <p className="text-muted">{copy.errorHint}</p>
      </div>
    );
  }
  const { base, source, rates } = state.rates;
  const perBase = (currency: string): number | undefined => (currency === base ? 1 : rates[currency]);
  const fromPerBase = perBase(paymentCurrency);
  const toPerBase = perBase(planCurrency);
  if (fromPerBase === undefined || toPerBase === undefined) {
    const missing = fromPerBase === undefined ? paymentCurrency : planCurrency;
    return (
      <p className="mt-1 flex items-start gap-2">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>{copy.missing(missing, formatCivilDate(date))}</span>
      </p>
    );
  }
  const rate = { currency: planCurrency, fromPerBase, toPerBase };
  const rateLine = copy.rate(
    ratePairLabel(paymentCurrency, rate, (value, currency) => formatCurrency(value, currency)),
    paymentRateCopy.source[source],
    formatCivilDate(date),
  );
  if (amount === null) {
    return (
      <>
        <p className="mt-1 tabular-nums">{rateLine}</p>
        <p className="text-muted">{copy.typeAmount}</p>
      </>
    );
  }
  const equivalent = convertWithRate(amount, rate);
  const after = Math.round((planBalance - equivalent) * 100) / 100;
  return (
    <>
      <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted">{copy.equivalent(planCurrency)}</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(equivalent, planCurrency)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">{after < 0 ? copy.inFavorAfter : copy.pendingAfter}</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(Math.abs(after), planCurrency)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-muted tabular-nums">{rateLine}</p>
    </>
  );
}
