'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileX, Lock, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { getPlanQuote, type PlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { PlanQuoteDocument, type QuoteSecondCurrency } from './plan-quote-document';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FieldError } from '@/components/errors/field-error';
import { useExchangeRates, type ExchangeRatesState } from '@/components/payments/use-exchange-rates';
import { ratePreviewCopy } from '@/components/payments/payment-rate-preview';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { quoteFromRates, ratePerBase } from '@/lib/payments/payment-rate';

const copy = {
  toolbar: 'Acciones del presupuesto',
  print: 'Imprimir o guardar como PDF',
  back: 'Volver a la ficha',
  loading: 'Preparando el presupuesto…',
  loadError: 'No pudimos cargar el presupuesto.',
  notFoundTitle: 'No encontramos este presupuesto.',
  notFoundHint: 'Puede que el enlace no sea de esta clínica o de este paciente.',
  forbiddenTitle: 'Tu rol no tiene acceso a este presupuesto.',
  forbiddenHint: 'Pide a la administración de la clínica que revise tu rol.',
  documentTitle: (name: string) => `Presupuesto · ${name}`,
  // DX-376: 2.ª moneda opcional, con la tasa de hoy de la clínica.
  secondCurrency: 'Segunda moneda (opcional)',
  secondNone: 'Sin segunda moneda',
  secondLoading: 'Consultando la tasa de hoy…',
  secondMissing: (currency: string) =>
    `No hay tasa de ${currency} para hoy: el presupuesto se imprime sin la segunda moneda.`,
};

/** La 2.ª moneda lista para el documento, o el motivo de que no la haya. */
function secondCurrencyOf(
  state: ExchangeRatesState,
  planCurrency: string,
  second: string,
  date: string,
): { value: QuoteSecondCurrency } | { missing: string } | null {
  if (state.status !== 'ready') return null;
  // La misma tasa que congelaría un abono de hoy (8 decimales, DX-375).
  const quote = quoteFromRates(state.rates, planCurrency, second);
  if (quote === null) {
    return { missing: ratePerBase(state.rates, planCurrency) === null ? planCurrency : second };
  }
  const { fromPerBase, toPerBase } = quote;
  const { source } = state.rates;
  return { value: { currency: second, fromPerBase, toPerBase, source, date } };
}

interface PlanQuotePrintViewProps {
  token: string;
  patientId: string;
  planId: string;
  /** A dónde vuelve «Volver a la ficha» (la pestaña depende del rol). */
  backHref: string;
  /** En `false` no se pide nada y se muestra el aviso de acceso (la API daría 403). */
  allowed?: boolean;
}

/**
 * Vista imprimible del presupuesto (DX-012), fuera del shell, mismo patrón que
 * la del consentimiento y la receta: abre el diálogo de impresión UNA vez
 * cuando el presupuesto está en pantalla; la barra lleva `print:hidden`.
 */
export function PlanQuotePrintView({
  token,
  patientId,
  planId,
  backHref,
  allowed = true,
}: PlanQuotePrintViewProps) {
  const [data, setData] = useState<PlanQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const printed = useRef(false);
  const forbidden = !allowed || deniedByApi;
  // DX-376: la tasa es la de hoy en la sede; sin zona no se pide ninguna.
  const [second, setSecond] = useState('');
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : '';
  const rates = useExchangeRates(token, today, second !== '' && data !== null);
  const secondResult = data && second ? secondCurrencyOf(rates, data.currency, second, today) : null;

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await getPlanQuote(token, patientId, planId);
        if (cancelled) return;
        // La URL nombra al paciente: si el plan es de otro, no se imprime bajo
        // su ficha (el «Volver» llevaría a quien no es).
        if (res.patientId !== patientId) {
          setNotFound(true);
          setError(copy.loadError);
          return;
        }
        setData(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        // 404: reintentar no lo arregla → aviso, no error con reintento.
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(copy.loadError);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, planId, reloadKey, allowed]);

  useEffect(() => {
    if (data && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [data]);

  return (
    <div className="quote-print-page flex min-h-full flex-1 flex-col bg-surface-sunken print:min-h-0 print:bg-white">
      {data ? <title>{copy.documentTitle(data.patient.name)}</title> : null}
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <Button asChild variant="ghost" className="justify-start">
          <Link href={backHref}>
            <ChevronLeft aria-hidden />
            {copy.back}
          </Link>
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {data ? (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <label htmlFor="quote-second-currency" className="text-sm text-ink">
                {copy.secondCurrency}
              </label>
              <CurrencySelect
                id="quote-second-currency"
                token={token}
                value={second}
                onChange={setSecond}
                exclude={[data.currency]}
                noneLabel={copy.secondNone}
                className="sm:w-56"
              />
            </div>
          ) : null}
          <Button type="button" onClick={() => window.print()} disabled={!data}>
            <Printer aria-hidden />
            {copy.print}
          </Button>
        </div>
      </div>
      {data && second ? (
        <div role="status" aria-live="polite" className="px-4 pt-3 text-sm text-ink print:hidden">
          {zone.status === 'error' ? (
            <SedeConfigError kind="timeZone" variant="note" onRetry={zone.retry} />
          ) : rates.status === 'loading' || (rates.status === 'idle' && !today) ? (
            <p className="text-muted">{copy.secondLoading}</p>
          ) : rates.status === 'error' ? (
            <FieldError
              label={ratePreviewCopy.error}
              onRetry={rates.retry}
              retryLabel={ratePreviewCopy.retry}
              className="w-full sm:w-auto"
            />
          ) : secondResult && 'missing' in secondResult ? (
            <p>{copy.secondMissing(secondResult.missing)}</p>
          ) : null}
        </div>
      ) : null}

      <main className="flex-1 px-0 py-0 sm:px-4 sm:py-8 print:p-0">
        {data ? (
          <div className="mx-auto max-w-[210mm] shadow-sm print:shadow-none">
            <PlanQuoteDocument
              quote={data}
              secondCurrency={secondResult && 'value' in secondResult ? secondResult.value : null}
            />
          </div>
        ) : forbidden ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState
              role="status"
              icon={<Lock aria-hidden />}
              title={copy.forbiddenTitle}
              description={copy.forbiddenHint}
            />
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <EmptyState
              role="status"
              icon={<FileX aria-hidden />}
              title={copy.notFoundTitle}
              description={copy.notFoundHint}
            />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl px-4 py-8">
            <SectionError
              description={error}
              onRetry={() => {
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            />
          </div>
        ) : (
          <p role="status" className="px-4 py-8 text-center text-sm text-muted">
            {copy.loading}
          </p>
        )}
      </main>
    </div>
  );
}
