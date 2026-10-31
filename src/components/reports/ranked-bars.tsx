import * as React from 'react';
import { cn } from '@/lib/utils';

export interface RankedBar {
  key: string;
  name: React.ReactNode;
  value: number;
  /** El valor ya formateado (con su moneda): la etiqueta de la punta. */
  display: string;
}

/**
 * Barras horizontales ordenadas de mayor a menor, de UNA serie (skill dataviz:
 * «ranked horizontal bars, one hue»). Pensadas para pocas filas (sedes,
 * categorías) junto a la tabla que da el detalle.
 *
 * - Un solo color, `muted` (grafito): la serie no es una identidad que
 *   distinguir y el acento del tenant no se gasta en datos; contraste ≥ 3:1
 *   con la superficie en claro (6,0:1) y en oscuro (7,6:1).
 * - Marca fina (10 px), extremo de dato redondeado a 4 px, recto en la base.
 * - Cada barra lleva su nombre y su valor en texto de tinta (nunca del color de
 *   la marca): no hace falta leyenda ni tooltip, y el lector de pantalla lee
 *   una lista de «nombre: valor». La barra es decorativa (`aria-hidden`).
 * - `max` permite que dos gráficos vecinos (Producción y Cobrado) compartan
 *   escala y se puedan comparar a ojo.
 */
export function RankedBars({
  title,
  caption,
  bars,
  max,
  className,
}: {
  title: string;
  caption?: React.ReactNode;
  bars: readonly RankedBar[];
  max?: number;
  className?: string;
}) {
  const titleId = React.useId();
  const sorted = [...bars].sort((a, b) => b.value - a.value);
  const top = Math.max(max ?? 0, ...sorted.map((b) => b.value), 0);
  return (
    <figure aria-labelledby={titleId} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <figcaption className="flex flex-col gap-0.5">
        <span id={titleId} className="t-label text-ink">
          {title}
        </span>
        {caption ? <span className="t-caption">{caption}</span> : null}
      </figcaption>
      <ul className="flex flex-col gap-2.5">
        {sorted.map((bar) => {
          const width = top > 0 ? Math.max(0, (bar.value / top) * 100) : 0;
          return (
            <li
              key={bar.key}
              data-testid="ranked-bar"
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
            >
              <span className="min-w-0 text-ink max-sm:col-span-2">{bar.name}</span>
              <span aria-hidden className="block h-2.5 min-w-0">
                <span
                  className="block h-full rounded-r-[4px] bg-muted"
                  style={{ width: `${width}%`, minWidth: bar.value > 0 ? 2 : 0 }}
                />
              </span>
              <span className="whitespace-nowrap text-right tabular-nums text-ink">
                <span className="sr-only">: </span>
                {bar.display}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
