import { civilDateLabel } from '@/lib/format/date';
import type { BadgeProps } from '@/components/ui/badge';
import type { SingleFileRules } from '@/lib/files/upload-single-file';
import type { Expense, ExpenseStatus, ExpenseStatusFilter } from './expenses-api';

/** Mismos límites que la API (tras recortar). */
export const EXPENSE_SUPPLIER_MAX = 200;
export const EXPENSE_DESCRIPTION_MAX = 500;
export const EXPENSE_VOID_REASON_MIN = 5;
export const EXPENSE_VOID_REASON_MAX = 500;
export const EXPENSE_CATEGORY_NAME_MIN = 2;
export const EXPENSE_CATEGORY_NAME_MAX = 60;

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  VOIDED: 'Anulado',
};

export const EXPENSE_STATUS_VARIANT: Record<ExpenseStatus, BadgeProps['variant']> = {
  PENDING: 'warning',
  PARTIAL: 'secondary',
  PAID: 'success',
  VOIDED: 'muted',
};

export const EXPENSE_OVERDUE_LABEL = 'Vencido';

/** «Vencido» acompaña al estado: solo un gasto por pagar puede estarlo. */
export function isExpenseOverdue(expense: Pick<Expense, 'status' | 'overdue'>): boolean {
  return expense.overdue && (expense.status === 'PENDING' || expense.status === 'PARTIAL');
}

export const EXPENSE_STATUS_FILTERS: readonly { value: ExpenseStatusFilter | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'OPEN', label: 'Por pagar' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'PARTIAL', label: 'Parciales' },
  { value: 'PAID', label: 'Pagados' },
  { value: 'VOIDED', label: 'Anulados' },
];

/** Soporte de un gasto: PDF, JPG o PNG (la HEIC se pasa a JPG antes de subir). */
export const EXPENSE_RECEIPT_RULES: SingleFileRules = {
  maxBytes: 20 * 1024 * 1024,
  extensions: ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif'],
  mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'],
  messages: {
    tooLarge: 'El soporte supera el máximo de 20 MB.',
    empty: 'El archivo está vacío.',
    unsupported: 'Tipo de archivo no admitido. Sube un PDF, JPG, PNG o una foto HEIC.',
  },
};

/** Para el `accept` del selector de archivos. */
export const EXPENSE_RECEIPT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic';

export function isImageReceipt(mimeType: string): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/png';
}

export function expensesCsvFileName(from: string | undefined, to: string | undefined): string {
  return from && to ? `gastos-${from}-${to}.csv` : 'gastos.csv';
}

/** Tope del rango del resumen: el mismo que la API (366 días). */
export const EXPENSE_SUMMARY_MAX_DAYS = 366;
/** Meses que abarca el resumen por defecto, el en curso incluido. */
export const EXPENSE_SUMMARY_DEFAULT_MONTHS = 6;
/** Un año natural cabe siempre en 366 días: el máximo que ofrecen los selectores de mes. */
export const EXPENSE_SUMMARY_MAX_MONTHS = 12;

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** `YYYY-MM` desplazado `delta` meses; `null` si `month` no es un mes. */
export function shiftMonth(month: string, delta: number): string | null {
  const match = MONTH_PATTERN.exec(month);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Primer y último día (`YYYY-MM-DD`) del rango de meses `from`..`to` (ambos `YYYY-MM`). */
export function summaryRangeDays(fromMonth: string, toMonth: string): { from: string; to: string } | null {
  const next = shiftMonth(toMonth, 1);
  if (!next || !shiftMonth(fromMonth, 0)) return null;
  const last = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5)) - 1, 0));
  return {
    from: `${fromMonth}-01`,
    to: `${toMonth}-${String(last.getUTCDate()).padStart(2, '0')}`,
  };
}

/** Días naturales del rango (extremos incluidos). */
export function daysInRange(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** `2026-10` → «Octubre de 2026». */
export function summaryMonthLabel(month: string): string {
  const match = MONTH_PATTERN.exec(month);
  if (!match) return month;
  // DX-378 (FE-078): las palabras del mes, del idioma del producto (lib/format), sin «es» suelto.
  const label = civilDateLabel(`${month}-01`, { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function expenseSummaryCsvFileName(from: string, to: string): string {
  return `resumen-gastos-${from}-${to}.csv`;
}
