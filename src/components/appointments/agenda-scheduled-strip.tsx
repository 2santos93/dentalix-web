'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import {
  forecastReportHref,
  getScheduledProduction,
  type ScheduledProductionReport,
} from '@/lib/reports/scheduled-production-api';
import { FieldError } from '@/components/errors/field-error';

export const agendaScheduledStripCopy = {
  title: 'Agendado',
  label: (range: string) => `Agendado ${range}`,
  withoutItems: (n: string) => `${n} sin tratamiento ligado`,
  withoutItemsLinkHint: ' · ver en Reportes',
  error: 'Agendado sin cargar',
  retry: 'Reintentar lo agendado',
  noValue: '—',
};

/**
 * Tira «Agendado» de la agenda (DX-567), encima de Día y Semana: lo agendado
 * del rango visible por profesional (aceptados y realizados ligados a citas
 * que cuentan, en la moneda del catálogo) y cuántas citas no tienen
 * tratamiento ligado, con enlace a «Previsión» en Reportes con ese rango.
 *
 * Solo la monta quien puede verlo (`canSeeScheduledProduction`): un DENTIST
 * sin el permiso recibe solo su fila (`scope: 'OWN'`). Si la petición falla
 * queda un aviso pequeño con reintento y la agenda sigue; un 403 la oculta.
 * Sin citas que cuenten en el rango no pinta nada.
 */
export function AgendaScheduledStrip({
  token,
  from,
  to,
  rangeLabel,
  locationId,
  providerId,
  fmt,
  refreshKey,
}: {
  token: string;
  /** Días civiles del rango visible (Día: el mismo día; Semana: lunes a domingo). */
  from: string;
  to: string;
  /** «del martes 17 de noviembre», «de la semana»: completa el nombre accesible. */
  rangeLabel: string;
  /** La sede activa de la agenda (sin ella, todas las que ve). */
  locationId?: string | null;
  /** El profesional del filtro de la agenda, si hay (nunca en «solo lo suyo»). */
  providerId?: string | null;
  fmt: RegionalFormat;
  /** Cambia cuando cambian las citas en pantalla: vuelve a pedir lo agendado. */
  refreshKey?: string;
}) {
  const c = agendaScheduledStripCopy;
  const [data, setData] = useState<ScheduledProductionReport | null>(null);
  const [error, setError] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const query = JSON.stringify({ from, to, locationId: locationId || undefined, providerId: providerId || undefined });

  useEffect(() => {
    const filters = JSON.parse(query) as { from: string; to: string; locationId?: string; providerId?: string };
    let cancelled = false;
    async function load() {
      try {
        const res = await getScheduledProduction(token, filters);
        if (cancelled) return;
        setData(res);
        setError(false);
        setHidden(false);
      } catch (err) {
        if (cancelled) return;
        // 403: este rol (o esta sede) no ve importes: la tira no existe para él.
        const forbidden = err instanceof ApiError && err.status === 403;
        setHidden(forbidden);
        setError(!forbidden);
        setData(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, query, reloadKey, refreshKey]);

  if (hidden) return null;
  if (error) {
    return (
      <div data-testid="agenda-scheduled-strip-error">
        <FieldError label={c.error} retryLabel={c.retry} onRetry={() => setReloadKey((k) => k + 1)} className="h-9" />
      </div>
    );
  }
  if (!data || data.totals.appointments === 0) return null;

  const money = (amount: number | null) =>
    amount === null || data.currency === null ? c.noValue : moneyWithCode(amount, data.currency, fmt);
  const withoutItems = data.totals.appointmentsWithoutItems;
  return (
    <section
      aria-label={c.label(rangeLabel)}
      data-testid="agenda-scheduled-strip"
      className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm"
    >
      <span aria-hidden className="t-label shrink-0 text-ink">{c.title}</span>
      <ul className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        {data.byProfessional.map((row) => (
          <li key={row.professionalId} data-testid="agenda-scheduled-row" className="flex min-w-0 items-baseline gap-1.5">
            <span className="max-w-[14rem] truncate text-muted" title={row.name}>
              {row.name}
            </span>
            <span className="whitespace-nowrap font-medium tabular-nums text-ink">{money(row.scheduledAmount)}</span>
          </li>
        ))}
      </ul>
      {withoutItems > 0 ? (
        <Link
          href={forecastReportHref({ from, to }, { locationId, providerId })}
          data-testid="agenda-scheduled-without-items"
          className="inline-flex min-h-8 items-center whitespace-nowrap tabular-nums text-primary-text underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text max-sm:min-h-11 sm:ml-auto"
        >
          {c.withoutItems(fmt.number(withoutItems))}
          {/* El nombre accesible empieza por el texto visible (axe label-content-name-mismatch). */}
          <span className="sr-only">{c.withoutItemsLinkHint}</span>
        </Link>
      ) : null}
    </section>
  );
}
