import * as React from 'react';
import { cn } from '@/lib/utils';

const COLUMNS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
} as const;

export interface DescriptionListProps extends React.HTMLAttributes<HTMLDListElement> {
  /** Columnas en escritorio; en móvil siempre una. */
  columns?: 1 | 2 | 3;
  /** `stacked`: etiqueta encima del valor. `inline`: etiqueta a la izquierda (fichas estrechas, recibos). */
  layout?: 'stacked' | 'inline';
}

/**
 * Pares etiqueta/valor (DESIGN.md → Description list): datos del paciente,
 * del gasto, de la sesión de caja. Etiqueta `t-overline` (muted), valor en
 * tinta; los números con `numeric` van tabulares.
 */
export function DescriptionList({ columns = 2, layout = 'stacked', className, ...props }: DescriptionListProps) {
  return (
    <dl
      data-layout={layout}
      className={cn(
        'group/dl grid gap-x-6',
        layout === 'stacked' ? cn('gap-y-4', COLUMNS[columns]) : 'grid-cols-[auto_minmax(0,1fr)] gap-y-2',
        className,
      )}
      {...props}
    />
  );
}

export interface DescriptionItemProps {
  label: React.ReactNode;
  children: React.ReactNode;
  /** Valor numérico (dinero, fechas, cantidades): tabular. */
  numeric?: boolean;
  /** Ocupa toda la fila (notas, direcciones largas). */
  wide?: boolean;
  className?: string;
  'data-testid'?: string;
}

export function DescriptionItem({ label, children, numeric = false, wide = false, className, ...props }: DescriptionItemProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1',
        // En `inline` el par se reparte en las dos columnas de la rejilla.
        'group-data-[layout=inline]/dl:contents',
        wide && 'sm:col-span-full',
        className,
      )}
      {...props}
    >
      <dt className="t-overline group-data-[layout=inline]/dl:pt-px">{label}</dt>
      <dd className={cn('min-w-0 break-words text-sm text-ink', numeric && 't-data')}>{children}</dd>
    </div>
  );
}
