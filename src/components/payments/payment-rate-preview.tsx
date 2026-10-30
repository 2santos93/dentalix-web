'use client';
import { Loader2, TriangleAlert } from 'lucide-react';
import { FieldError } from '@/components/errors/field-error';
import { Button } from '@/components/ui/button';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import { convertWithRate, paymentRateCopy, quoteFromRates, ratePairLabel, ratePerBase } from '@/lib/payments/payment-rate';
import type { ExchangeRatesState } from './use-exchange-rates';

// Copy como constantes (i18n-ready). Ningún texto nombra un país ni un banco.
export const ratePreviewCopy = {
  title: (currency: string) => `En la moneda del plan (${currency})`,
  loading: 'Consultando la tasa de cambio…',
  error: 'No se pudo consultar la tasa',
  retry: 'Reintentar la consulta de la tasa',
  errorHint: 'Puedes registrar el abono igual: se convierte con la tasa de su día.',
  // DX-386: fuente automática sin la tasa del día todavía (el proveedor no la dio).
  unavailable: (date: string) =>
    `La tasa del proveedor para el ${date} aún no está disponible; reintentamos solos. El abono se guarda igual y queda «sin tasa» hasta que llegue.`,
  rate: (pair: string, source: string, date: string) => `Tasa: ${pair} · ${source} · ${date}`,
  typeAmount: 'Escribe el importe para ver cuánto cubre del plan.',
  equivalent: (currency: string) => `Equivalente en ${currency}`,
  pendingAfter: 'Pendiente tras el abono',
  inFavorAfter: 'A favor tras el abono',
  pendingLoading: 'Leyendo el saldo del plan…',
  pendingUnavailable: 'No se pudo leer el saldo del plan: lo pendiente se verá al guardar.',
  pendingWithoutRate: (n: number) =>
    n === 1
      ? 'No cuenta 1 abono anterior «sin tasa»: lo pendiente real será menor cuando se registre su tasa.'
      : `No cuenta ${n} abonos anteriores «sin tasa»: lo pendiente real será menor cuando se registre su tasa.`,
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
  /**
   * Saldo del plan antes del abono, en su moneda y con los abonos en otra
   * moneda ya convertidos (`GET /treatment-plans/:id/balance`), y cuántos
   * abonos «sin tasa» aún no cuenta. `'loading'` mientras se lee; `'error'`
   * si no se pudo: el equivalente y la tasa se enseñan igual.
   */
  planBalance: PreviewPlanBalance;
  /** Día del abono (AAAA-MM-DD): el de la tasa que congelará (DX-375). */
  date: string;
  /** Formato de la sede (DX-378/DX-386); `null` mientras carga: importes y días «—». */
  fmt: RegionalFormat | null;
}

export type PreviewPlanBalance = { balance: number; paymentsWithoutRate: number } | 'loading' | 'error';

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
  fmt,
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
        fmt={fmt}
      />
    </section>
  );
}

function PreviewBody({ state, amount, paymentCurrency, planCurrency, planBalance, date, fmt }: PaymentRatePreviewProps) {
  const money = (value: number, currency: string) => sedeMoney(value, currency, fmt);
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
  if (state.status === 'unavailable') {
    return (
      <div className="mt-1 space-y-1">
        <p className="flex items-start gap-2">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>{copy.unavailable(sedeCivilDate(date, fmt))}</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={state.retry}>
          {copy.retry}
        </Button>
      </div>
    );
  }
  const { source } = state.rates;
  // La misma tasa que congela la API (8 decimales; una que redondea a 0 es «sin tasa»).
  const rate = quoteFromRates(state.rates, paymentCurrency, planCurrency);
  if (rate === null) {
    const missing = ratePerBase(state.rates, paymentCurrency) === null ? paymentCurrency : planCurrency;
    return (
      <p className="mt-1 flex items-start gap-2">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>{copy.missing(missing, sedeCivilDate(date, fmt))}</span>
      </p>
    );
  }
  const rateLine = copy.rate(
    ratePairLabel(paymentCurrency, rate, money),
    paymentRateCopy.source[source],
    sedeCivilDate(date, fmt),
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
  const after =
    typeof planBalance === 'object' ? Math.round((planBalance.balance - equivalent) * 100) / 100 : null;
  return (
    <>
      <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted">{copy.equivalent(planCurrency)}</dt>
          <dd className="font-semibold tabular-nums">{money(equivalent, planCurrency)}</dd>
        </div>
        {after !== null ? (
          <div className="min-w-0">
            <dt className="text-muted">{after < 0 ? copy.inFavorAfter : copy.pendingAfter}</dt>
            <dd className="font-semibold tabular-nums">{money(Math.abs(after), planCurrency)}</dd>
          </div>
        ) : planBalance === 'loading' ? (
          <div className="min-w-0 flex items-center">
            <Loader2 aria-hidden className="size-4 animate-spin text-muted" />
            <span className="sr-only">{copy.pendingLoading}</span>
          </div>
        ) : null}
      </dl>
      {planBalance === 'error' ? <p className="text-muted">{copy.pendingUnavailable}</p> : null}
      {typeof planBalance === 'object' && planBalance.paymentsWithoutRate > 0 ? (
        <p className="mt-1 flex items-start gap-2">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>{copy.pendingWithoutRate(planBalance.paymentsWithoutRate)}</span>
        </p>
      ) : null}
      <p className="mt-1 text-muted tabular-nums">{rateLine}</p>
    </>
  );
}
