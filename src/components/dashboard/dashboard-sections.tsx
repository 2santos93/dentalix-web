'use client';
import Link from 'next/link';
import { listInventoryItems } from '@/lib/inventory/inventory-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { cn } from '@/lib/utils';
import { sectionLinkClass } from './today-section';
import { useLoad } from './use-load';

// Copy as constants (i18n-ready, es-first).
export const sectionsCopy = {
  lowStockHeading: 'Por reponer',
  lowStockDescription: 'Ítems en su mínimo o por debajo.',
  lowStockCount: (count: number) => `${count} ${count === 1 ? 'ítem' : 'ítems'}`,
  lowStockShowing: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
  lowStockLoading: 'Cargando lo que hay que reponer…',
  lowStockError: 'No pudimos cargar el inventario.',
  inventoryLink: 'Ver inventario',
  emptyLowStockTitle: 'No hay ítems en bajo stock.',
  emptyLowStockDescription: 'Todo el inventario está por encima de su mínimo.',
  colItem: 'Ítem',
  colStock: 'Stock',
  colMinStock: 'Mínimo',
  colMissing: 'Faltan',
};
const copy = sectionsCopy;

const headerRow = 'flex-row items-start justify-between';

/** Número con el formato de la sede; sin él, el número tal cual (nunca «—» para un conteo). */
function count(value: number, fmt: RegionalFormat | null): string {
  return fmt ? fmt.number(value) : String(value);
}

/** Cuántos ítems lista Inicio; el resto, en Inventario. */
export const LOW_STOCK_LIMIT = 8;

interface LowStockItem {
  id: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
}

/**
 * «Por reponer» de la asistente (I1): `GET /inventory/items?lowStockOnly` de la
 * sede activa (INVENTORY_ROLES). El total es el de la API, no el de la página.
 */
export function LowStockSection({ token, scopeKey, fmt }: { token: string; scopeKey: string; fmt: RegionalFormat | null }) {
  const load = useLoad(
    () => listInventoryItems(token, { lowStockOnly: true, pageSize: LOW_STOCK_LIMIT }),
    scopeKey,
    true,
    copy.lowStockError,
  );
  if (load.status === 'error') {
    return (
      <section aria-labelledby="dashboard-low-stock-title" className="flex flex-col gap-3">
        <SectionHeader titleId="dashboard-low-stock-title" title={copy.lowStockHeading} />
        <SectionError description={load.message} onRetry={load.reload} />
      </section>
    );
  }
  if (load.status !== 'ready') {
    return (
      <section aria-labelledby="dashboard-low-stock-title" className="flex flex-col gap-3">
        <SectionHeader titleId="dashboard-low-stock-title" title={copy.lowStockHeading} />
        <Skeleton role="status" aria-label={copy.lowStockLoading} className="h-40 w-full rounded-xl" />
      </section>
    );
  }
  const items: LowStockItem[] = load.data.items.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    stock: i.stock ?? 0,
    minStock: i.minStock,
  }));
  return <LowStock lowStockItems={{ count: load.data.total, items }} fmt={fmt} />;
}

/* ──────────────────────────────── Bajo stock ─────────────────────────────── */

/** Columnas de la tabla cuando el bloque tiene sitio (≥ 28rem); por debajo, filas etiquetadas. */
const stockGrid = '@md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem]';

export function LowStock({
  lowStockItems,
  fmt,
}: {
  lowStockItems: { count: number; items: LowStockItem[] };
  fmt: RegionalFormat | null;
}) {
  const { items } = lowStockItems;
  const total = lowStockItems.count;
  return (
    <section aria-labelledby="dashboard-low-stock-title" className="flex flex-col gap-3">
      <SectionHeader
        titleId="dashboard-low-stock-title"
        title={copy.lowStockHeading}
        description={
          <>
            <span className="t-data font-medium text-ink">{copy.lowStockCount(total)}</span>
            {' · '}
            {copy.lowStockDescription}
          </>
        }
        className={headerRow}
        actions={
          <Link href="/inventory" className={sectionLinkClass}>
            {copy.inventoryLink}
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState role="status" title={copy.emptyLowStockTitle} description={copy.emptyLowStockDescription} />
      ) : (
        <div className="@container overflow-hidden rounded-xl border border-border bg-surface">
          {/* La cabecera visible es solo para la vista; cada celda lleva su etiqueta (visible en estrecho). */}
          <div
            aria-hidden
            className={cn(
              't-label hidden gap-x-3 border-b border-border-subtle bg-surface-sunken px-4 py-2 text-muted sm:px-6 @md:grid',
              stockGrid,
            )}
          >
            <span>{copy.colItem}</span>
            <span className="text-right">{copy.colStock}</span>
            <span className="text-right">{copy.colMinStock}</span>
            <span className="text-right">{copy.colMissing}</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {items.map((item) => {
              const missing = Math.max(item.minStock - item.stock, 0);
              return (
                <li
                  key={item.id}
                  className={cn('grid grid-cols-3 items-baseline gap-x-3 gap-y-1 px-4 py-2.5 sm:px-6 @md:items-center', stockGrid)}
                >
                  <div className="col-span-3 min-w-0 @md:col-span-1">
                    <p className="break-words text-sm font-medium text-ink">{item.name}</p>
                    <p className="truncate text-xs text-muted">{item.unit}</p>
                  </div>
                  <StockCell label={copy.colStock} value={count(item.stock, fmt)} />
                  <StockCell label={copy.colMinStock} value={count(item.minStock, fmt)} />
                  <StockCell
                    label={copy.colMissing}
                    value={count(missing, fmt)}
                    valueClassName={missing > 0 ? 'font-semibold text-warning-text' : 'text-muted'}
                  />
                </li>
              );
            })}
          </ul>
          {total > items.length ? (
            <p className="border-t border-border-subtle px-4 py-2.5 text-sm text-muted sm:px-6">
              {copy.lowStockShowing(items.length, total)}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Celda numérica: etiqueta visible en estrecho, solo para lectores con la cabecera de tabla a la vista. */
function StockCell({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <p className="text-sm @md:text-right">
      <span className="text-muted @md:sr-only">{label} </span>
      <span className={cn('t-data text-ink', valueClassName)}>{value}</span>
    </p>
  );
}

