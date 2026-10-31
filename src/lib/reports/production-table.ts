import type { CategoryTotals, ProcedureRow, ProductionAmounts, ProductionByProcedure, ProductionTotals } from './reports-api';

/** Mismo texto que la API (`UNCATEGORIZED_LABEL`) y el CSV. */
export const UNCATEGORIZED = 'Sin categoría';

export type ProductionLine =
  | { kind: 'category'; key: string; category: string; currency: '' }
  | { kind: 'procedure'; key: string; category: string; currency: string; row: ProcedureRow }
  | { kind: 'subtotal'; key: string; category: string; currency: string; totals: CategoryTotals }
  | { kind: 'total'; key: string; category: null; currency: string; totals: ProductionTotals }
  | { kind: 'unattributed'; key: string; category: null; currency: string; totals: ProductionAmounts };

const nameOf = (category: string | null) => category ?? UNCATEGORIZED;

/**
 * Las líneas de la tabla en el MISMO orden que el CSV de la API: cada
 * categoría (cabecera, sus procedimientos y su subtotal por moneda), después
 * el total de cada moneda y los «Sin atribuir». Así lo que se ve y lo que se
 * exporta coinciden fila a fila.
 */
export function productionLines(report: Pick<ProductionByProcedure, 'rows' | 'categoryTotals' | 'totals' | 'unattributed'>): ProductionLine[] {
  const lines: ProductionLine[] = [];
  const categories: (string | null)[] = [];
  for (const c of report.categoryTotals) {
    if (!categories.includes(c.category)) categories.push(c.category);
  }
  for (const category of categories) {
    const name = nameOf(category);
    lines.push({ kind: 'category', key: `category|${name}`, category: name, currency: '' });
    for (const row of report.rows.filter((r) => r.category === category)) {
      lines.push({
        kind: 'procedure',
        key: `procedure|${row.catalogItemId}|${row.currency}`,
        category: name,
        currency: row.currency,
        row,
      });
    }
    for (const totals of report.categoryTotals.filter((c) => c.category === category)) {
      lines.push({ kind: 'subtotal', key: `subtotal|${name}|${totals.currency}`, category: name, currency: totals.currency, totals });
    }
  }
  for (const totals of report.totals) {
    lines.push({ kind: 'total', key: `total|${totals.currency}`, category: null, currency: totals.currency, totals });
  }
  for (const totals of report.unattributed) {
    lines.push({ kind: 'unattributed', key: `unattributed|${totals.currency}`, category: null, currency: totals.currency, totals });
  }
  return lines;
}
