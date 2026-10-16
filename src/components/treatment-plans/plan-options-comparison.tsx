'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { getPlan, type TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { PLAN_STATUS_BADGE_VARIANT, PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';
import { formatCurrency } from '@/lib/format/currency';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { cn } from '@/lib/utils';

const copy = {
  heading: 'Comparar opciones',
  loading: 'Cargando la comparación…',
  // Sin «Intenta de nuevo.»: `SectionError` trae su botón.
  loadError: 'No pudimos cargar la comparación de opciones.',
  unnamed: 'Opción sin nombre',
  total: 'Total',
  items: (n: number) => (n === 1 ? '1 procedimiento' : `${n} procedimientos`),
  view: (label: string) => `Ver ${label}`,
  viewShort: 'Ver esta opción',
  current: 'Abierta',
  mixedCurrencies: 'Las opciones están en monedas distintas: compara cada total en su moneda.',
};

interface PlanOptionsComparisonProps {
  token: string;
  /** Las opciones del grupo (de `listPlans`, sin ítems), ya ordenadas. */
  options: TreatmentPlan[];
  currentPlanId: string;
  /** Cambia cuando cambian los ítems de la opción abierta (total y número). */
  currentPlanKey?: string;
  onSelect: (planId: string) => void;
}

/**
 * Las opciones A/B de un plan lado a lado (DX-040): total, número de
 * procedimientos y estado de cada una. Cada total va en la moneda de SU plan;
 * nada se suma ni se convierte entre opciones. Pide el detalle de cada opción
 * (el total lo calcula la API) y lo vuelve a pedir cuando cambia el grupo.
 */
export function PlanOptionsComparison({
  token,
  options,
  currentPlanId,
  currentPlanKey = '',
  onSelect,
}: PlanOptionsComparisonProps) {
  const headingId = useId();
  const [details, setDetails] = useState<TreatmentPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Clave del contenido del grupo: cambia si cambia una opción (estado,
  // etiqueta) o los ítems de la abierta, y entonces se recargan los totales.
  const groupKey = `${options.map((o) => `${o.id}:${o.status}:${o.updatedAt}`).join('|')}#${currentPlanKey}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDetails(null);
      setError(null);
      try {
        const loaded = await Promise.all(options.map((o) => getPlan(token, o.id)));
        if (!cancelled) setDetails(loaded);
      } catch {
        if (!cancelled) setError(copy.loadError);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // `options` se resume en `groupKey`: el array cambia de identidad en cada
    // render del padre aunque el grupo sea el mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, groupKey, reloadKey]);

  const currencies = new Set(options.map((o) => o.currency));

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-base font-semibold text-ink">
        {copy.heading}
      </h3>
      {error ? (
        <SectionError description={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !details ? (
        <div role="status" className="grid gap-3 sm:grid-cols-2">
          <span className="sr-only">{copy.loading}</span>
          {options.map((o) => (
            <Skeleton key={o.id} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <ul className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
            {details.map((option) => {
              const label = option.optionLabel ?? copy.unnamed;
              const current = option.id === currentPlanId;
              return (
                <li
                  key={option.id}
                  aria-label={label}
                  aria-current={current ? true : undefined}
                  className={cn('flex min-w-0 flex-col gap-2 bg-surface p-4', current && 'bg-surface-2')}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 font-medium text-ink">{label}</span>
                    <Badge variant={PLAN_STATUS_BADGE_VARIANT[option.status]}>
                      {PLAN_STATUS_LABELS[option.status]}
                    </Badge>
                  </div>
                  <dl className="flex flex-col gap-1 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="t-label text-muted">{copy.total}</dt>
                      <dd className="text-base font-semibold text-ink tabular-nums">
                        {formatCurrency(option.total ?? 0, option.currency)}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-sm text-muted tabular-nums">{copy.items(option.items?.length ?? 0)}</p>
                  {current ? (
                    <p className="t-label text-muted">{copy.current}</p>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      aria-label={copy.view(label)}
                      onClick={() => onSelect(option.id)}
                    >
                      {copy.viewShort}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {currencies.size > 1 ? <p className="text-sm text-muted">{copy.mixedCurrencies}</p> : null}
        </>
      )}
    </section>
  );
}
