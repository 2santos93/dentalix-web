'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, TriangleAlert } from 'lucide-react';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageExchangeRates, type ExchangeRateSource } from '@/lib/exchange/exchange-settings-api';
import type { ExchangeHeader, ExchangeHeaderRate } from '@/lib/exchange/exchange-header-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useExchangeHeader } from './exchange-header-context';

export const rateIndicatorCopy = {
  heading: 'Tasa de hoy',
  missing: 'Sin tasa hoy',
  /** «1 USD = 918,77 Bs.» */
  pair: (currency: string, value: string, reference: string) => `1 ${currency} = ${value} ${reference}`,
  /** Nombre accesible: empieza por el texto visible (WCAG 2.5.3). */
  name: (visible: string, source: string, more: number) =>
    `Tasa de hoy: ${visible}, fuente ${source}${more > 0 ? `, y ${more} ${more === 1 ? 'moneda' : 'monedas'} más` : ''}`,
  missingName: (visible: string, currency: string, reference: string, more: number) =>
    `${visible}: falta la de 1 ${currency} en ${reference}${more > 0 ? `, y ${more} ${more === 1 ? 'moneda' : 'monedas'} más` : ''}`,
  source: { AUTOMATIC: 'automática', MANUAL: 'manual', BCV: 'BCV' } satisfies Record<ExchangeRateSource, string>,
  sourceLabel: { AUTOMATIC: 'Automática', MANUAL: 'Manual', BCV: 'BCV' } satisfies Record<ExchangeRateSource, string>,
  /** DX-585: en el nombre accesible, «BCV, fecha valor 20/11/2026». */
  bcvSource: (valueDate: string) => `BCV, fecha valor ${valueDate}`,
  /** «Automática · del 21/11/2026» */
  meta: (source: string, day: string) => `${source} · del ${day}`,
  /** DX-585: «BCV · fecha valor 20/11/2026» (la del BCV que rige hoy; un fin de semana, la del último día hábil). */
  bcvMeta: (valueDate: string) => `BCV · fecha valor ${valueDate}`,
  missingMeta: 'Aún no hay tasa de hoy: los abonos en esta moneda la toman en cuanto llegue.',
  settings: 'Ajustes de la tasa',
  noFormat: '—',
};

const copy = rateIndicatorCopy;
export const RATE_SETTINGS_HREF = '/settings/tasa-de-cambio';

/**
 * La tasa con su escala: ≥ 1 con 2 decimales («918,77»); por debajo, hasta 6
 * («0,00109»), para que una moneda fuerte frente a la de referencia no salga «0,00».
 */
export function formatRate(value: number, fmt: RegionalFormat | null): string {
  if (!fmt) return copy.noFormat;
  return value >= 1 ? fmt.number(value, { min: 2, max: 2 }) : fmt.number(value, { min: 2, max: 6 });
}

interface RateLine {
  visible: string;
  name: string;
  missing: boolean;
}

function describeRate(
  header: ExchangeHeader,
  rate: ExchangeHeaderRate,
  fmt: RegionalFormat | null,
  more: number,
): RateLine {
  const currency = rate.label ?? rate.currency;
  const reference = header.referenceLabel ?? header.reference ?? '';
  if (rate.perReference === null) {
    return {
      visible: copy.missing,
      name: copy.missingName(copy.missing, currency, reference, more),
      missing: true,
    };
  }
  const visible = copy.pair(currency, formatRate(rate.perReference, fmt), reference);
  const source = rowSource(rate);
  const name = copy.name(
    visible,
    source === 'BCV' && rate.valueDate ? copy.bcvSource(day(rate.valueDate, fmt)) : copy.source[source],
    more,
  );
  return { visible, name, missing: false };
}

function day(date: string, fmt: RegionalFormat | null): string {
  return fmt ? fmt.civilDate(date) : copy.noFormat;
}

/**
 * DX-585: de dónde sale la cifra de la fila. Con la fuente BCV, la API da
 * `valueDate` solo en las filas que usan VES o EUR (las que salen del BCV);
 * el resto sale del proveedor y se rotula «automática», para no dar a
 * entender que el BCV publica esa moneda.
 */
function rowSource(rate: ExchangeHeaderRate): ExchangeRateSource {
  return rate.source === 'BCV' && !rate.valueDate ? 'AUTOMATIC' : rate.source;
}

/** Lo que va bajo la cifra en el popover: fuente y día, o la fecha valor del BCV. */
function rowMeta(rate: ExchangeHeaderRate, fmt: RegionalFormat | null): string {
  if (rate.source === 'BCV' && rate.valueDate) return copy.bcvMeta(day(rate.valueDate, fmt));
  return copy.meta(copy.sourceLabel[rowSource(rate)], day(rate.date, fmt));
}

export type RateIndicatorVariant = 'block' | 'rail' | 'phone';

/**
 * DX-584: la tasa vigente en el menú, junto al selector de sede: «1 USD =
 * 918,77 Bs.» (con el texto propio de DX-517) y, si la clínica acepta más
 * monedas, «+N». Pulsarlo abre un popover con todas, su fuente y su día; a
 * ADMIN además le lleva a Ajustes › Tasa de cambio. Sin tasa: «Sin tasa hoy»
 * en tono de aviso. No pinta nada mientras carga, si la lectura falla o si la
 * API dice `visible: false` (clínica de una sola moneda, o «Nunca»).
 *
 * - `block`: fila a lo ancho del pie del sidebar.
 * - `rail`: botón de icono de 40 px del raíl (el texto, en el nombre y el `title`).
 * - `phone`: pastilla de 44 px de la barra superior del teléfono, a dos líneas.
 */
export function RateIndicator({ token, variant }: { token: string; variant: RateIndicatorVariant }) {
  const state = useExchangeHeader();
  const fmt = readyFormat(useSedeFormat(token));
  if (state.status !== 'ready') return null;
  const { header } = state;
  if (!header.visible || header.rates.length === 0) return null;

  const [first] = header.rates;
  const more = header.rates.length - 1;
  const line = describeRate(header, first, fmt, more);
  const admin = canManageExchangeRates(getTokenRole(token));

  const Icon = line.missing ? TriangleAlert : ArrowLeftRight;
  const toneText = line.missing ? 'text-warning-text' : 'text-ink';
  const moreBadge =
    more > 0 ? (
      <span
        aria-hidden
        className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-active px-1.5 text-xs font-semibold tabular-nums text-ink"
      >
        +{more}
      </span>
    ) : null;

  let trigger: ReactNode;
  if (variant === 'rail') {
    trigger = (
      <button
        type="button"
        aria-label={line.name}
        title={line.name}
        data-testid="rate-indicator"
        className={cn(
          'relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text',
          line.missing ? 'text-warning-text' : 'text-muted hover:text-ink',
        )}
      >
        <Icon aria-hidden className="size-4" />
      </button>
    );
  } else if (variant === 'phone') {
    const [left, right] = line.missing ? [null, line.visible] : splitPair(line.visible);
    trigger = (
      <button
        type="button"
        aria-label={line.name}
        data-testid="rate-indicator"
        className="flex h-11 min-w-0 max-w-[7.5rem] shrink-0 items-center gap-1 rounded-lg px-1.5 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
      >
        <span aria-hidden className="flex min-w-0 flex-col items-start text-left text-xs leading-tight tabular-nums">
          {left ? <span className="truncate text-muted">{left}</span> : null}
          <span className={cn('max-w-full truncate font-medium', toneText)}>{right}</span>
        </span>
        {moreBadge}
      </button>
    );
  } else {
    trigger = (
      <button
        type="button"
        aria-label={line.name}
        data-testid="rate-indicator"
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
      >
        <Icon aria-hidden className={cn('size-4 shrink-0', line.missing ? 'text-warning-text' : 'text-muted')} />
        <span aria-hidden className={cn('min-w-0 flex-1 truncate text-left tabular-nums', toneText)}>
          {line.visible}
        </span>
        {moreBadge}
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={variant === 'phone' ? 'bottom' : 'right'}
        align="end"
        aria-label={copy.heading}
        data-testid="rate-indicator-popover"
      >
        <p className="t-label text-muted">{copy.heading}</p>
        <ul className="mt-2 flex flex-col divide-y divide-border-subtle">
          {header.rates.map((rate) => {
            const row = describeRate(header, rate, fmt, 0);
            return (
              <li key={rate.currency} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                <span className={cn('font-medium tabular-nums', row.missing ? 'text-warning-text' : 'text-ink')}>
                  {row.missing ? `${rate.label ?? rate.currency}: ${copy.missing}` : row.visible}
                </span>
                <span className="text-xs text-muted">
                  {row.missing ? copy.missingMeta : rowMeta(rate, fmt)}
                </span>
              </li>
            );
          })}
        </ul>
        {admin ? (
          <PopoverClose asChild>
            <Link
              href={RATE_SETTINGS_HREF}
              className="mt-3 inline-flex text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
            >
              {copy.settings}
            </Link>
          </PopoverClose>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** «1 USD = 918,77 Bs.» → [«1 USD =», «918,77 Bs.»] para la pastilla a dos líneas. */
function splitPair(text: string): [string, string] {
  const at = text.indexOf(' = ');
  return at < 0 ? ['', text] : [text.slice(0, at + 2), text.slice(at + 3)];
}
