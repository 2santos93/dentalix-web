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

/** Primer día del mes de `day` (`AAAA-MM-DD`). */
export function firstOfMonth(day: string): string {
  return `${day.slice(0, 8)}01`;
}
