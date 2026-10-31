'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getExchangeRates, type ExchangeRates } from '@/lib/exchange/exchange-api';
import type { ExchangeRateSource } from '@/lib/exchange/exchange-settings-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { listLocations } from '@/lib/locations/locations-api';
import { locationCurrency } from '@/lib/locations/location-settings';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';

export const todayRatesCopy = {
  heading: 'Tasa de hoy',
  automatic: (day: string) => `La del proveedor de tasas para hoy, ${day}. Con ella se convierten los abonos de hoy.`,
  manual: (day: string) => `La que registró la clínica para hoy, ${day}. Con ella se convierten los abonos de hoy.`,
  per: (currency: string, base: string) => `${currency} por 1 ${base}`,
  missing: 'Sin tasa hoy',
  missingManual:
    'Falta la tasa de hoy de alguna moneda: los abonos de hoy en esa moneda quedan sin tasa hasta que la registres.',
  noCurrencies: (base: string) => `Todas las sedes cobran en ${base}: hoy no hay nada que convertir.`,
  unavailableTitle: 'Todavía no hay tasa de hoy.',
  unavailable: 'El proveedor aún no la ha dado. Vuelve a mirar en un rato: los abonos de hoy la toman en cuanto llegue.',
  retry: 'Volver a mirar',
  loadError: 'No pudimos cargar la tasa de hoy.',
  loading: 'Cargando la tasa de hoy',
  noFormat: '—',
};

const copy = todayRatesCopy;

type TodayState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** El proveedor no la dio (503) o la clínica agotó su cupo de consultas (429). */
  | { status: 'unavailable'; detail: string }
  | { status: 'ready'; rates: ExchangeRates; currencies: string[] };

interface TodayRatesProps {
  token: string;
  /** Moneda de referencia de las tasas (la da la API). */
  baseCurrency: string;
  source: ExchangeRateSource;
  /** Hoy en la zona de la sede; `null` mientras no se sabe. */
  today: string | null;
  fmt: RegionalFormat | null;
  /** Cambia cuando cambia algo que mueve la tasa de hoy (fuente, una tasa manual). */
  version: number;
}

/** Monedas de las sedes distintas de la de referencia, ordenadas. */
function sedeCurrencies(currencies: (string | null)[], base: string): string[] {
  return [...new Set(currencies.filter((c): c is string => c !== null && c !== base))].sort();
}

/**
 * La tasa con la que se convierten HOY los abonos de la clínica (critique-settings,
 * tasa de cambio P1): el número al que se viene a esta pantalla. Sale de
 * `GET /exchange/rates` con el día de hoy en la sede, que ya responde según la
 * fuente (proveedor o tasas manuales), y se enseña para las monedas en las que
 * cobran las sedes. Si el proveedor aún no dio la del día, se dice tal cual.
 */
export function TodayRates({ token, baseCurrency, source, today, fmt, version }: TodayRatesProps) {
  const [state, setState] = useState<{ key: string; value: TodayState } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const key = `${today}|${source}|${version}|${reloadKey}`;
  const headingId = React.useId();

  useEffect(() => {
    if (!today) return;
    let cancelled = false;
    const requestKey = `${today}|${source}|${version}|${reloadKey}`;
    Promise.all([getExchangeRates(token, today), listLocations(token)])
      .then(([rates, locations]) => {
        if (cancelled) return;
        let currencies = sedeCurrencies(
          locations.filter((l) => l.isActive).map((l) => locationCurrency(l)),
          baseCurrency,
        );
        // Sin sedes en otra moneda, las que tengan tasa manual hoy (si las hay).
        if (currencies.length === 0 && rates.source === 'MANUAL') {
          currencies = sedeCurrencies(Object.keys(rates.rates), baseCurrency);
        }
        setState({ key: requestKey, value: { status: 'ready', rates, currencies } });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // No es que la pantalla falle: la tasa de hoy aún no se puede saber.
        // Se dice con un aviso, no con el bloque de error de sección.
        const unavailable =
          err instanceof ApiError &&
          (err.code === 'EXCHANGE_RATE_UNAVAILABLE' || err.status === 503 || err.status === 429);
        setState({
          key: requestKey,
          value: unavailable
            ? {
                status: 'unavailable',
                detail: err.status === 429 ? apiErrorMessage(err, copy.unavailable) : copy.unavailable,
              }
            : { status: 'error', message: apiErrorMessage(err, copy.loadError) },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token, today, source, version, reloadKey, baseCurrency]);

  const current: TodayState = state?.key === key ? state.value : { status: 'loading' };
  const day = today && fmt ? fmt.civilDate(today) : copy.noFormat;
  const retry = () => setReloadKey((k) => k + 1);

  let body: React.ReactNode;
  if (current.status === 'loading') {
    body = (
      <div role="status" aria-label={copy.loading} className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-40" />
      </div>
    );
  } else if (current.status === 'error') {
    body = <SectionError description={current.message} onRetry={retry} />;
  } else if (current.status === 'unavailable') {
    body = (
      <Callout
        tone="warning"
        title={copy.unavailableTitle}
        action={
          <Button type="button" variant="secondary" size="sm" onClick={retry}>
            <RefreshCw aria-hidden />
            {copy.retry}
          </Button>
        }
      >
        <p>{current.detail}</p>
      </Callout>
    );
  } else if (current.currencies.length === 0) {
    body = <p className="t-body text-muted">{copy.noCurrencies(baseCurrency)}</p>;
  } else {
    const { rates, currencies } = current;
    const missing = currencies.filter((c) => rates.rates[c] === undefined);
    body = (
      <div className="flex flex-col gap-4">
        <DescriptionList columns={currencies.length > 2 ? 3 : 2} data-testid="exchange-rate-today">
          {currencies.map((c) => {
            const rate = rates.rates[c];
            return (
              <DescriptionItem
                key={c}
                label={copy.per(c, baseCurrency)}
                numeric
                valueClassName={rate === undefined ? 'text-warning-text' : 't-display'}
              >
                {rate === undefined ? copy.missing : fmt ? fmt.number(rate, { min: 0, max: 8 }) : copy.noFormat}
              </DescriptionItem>
            );
          })}
        </DescriptionList>
        {missing.length > 0 && rates.source === 'MANUAL' ? (
          <Callout tone="warning">
            <p>{copy.missingManual}</p>
          </Callout>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader
        titleId={headingId}
        title={copy.heading}
        description={source === 'MANUAL' ? copy.manual(day) : copy.automatic(day)}
      />
      {body}
    </section>
  );
}
