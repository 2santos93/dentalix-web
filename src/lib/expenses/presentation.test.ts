import { validateSingleFile } from '@/lib/files/upload-single-file';
import { expenseFixture } from '@/lib/test/expenses';
import {
  EXPENSE_RECEIPT_RULES,
  expensesCsvFileName,
  isExpenseOverdue,
  isImageReceipt,
} from './presentation';

describe('presentación de gastos (DX-274)', () => {
  it('«Vencido» solo acompaña a un gasto por pagar', () => {
    expect(isExpenseOverdue(expenseFixture({ status: 'PENDING', overdue: true }))).toBe(true);
    expect(isExpenseOverdue(expenseFixture({ status: 'PARTIAL', overdue: true }))).toBe(true);
    expect(isExpenseOverdue(expenseFixture({ status: 'PAID', overdue: true }))).toBe(false);
    expect(isExpenseOverdue(expenseFixture({ status: 'VOIDED', overdue: true }))).toBe(false);
    expect(isExpenseOverdue(expenseFixture({ status: 'PENDING', overdue: false }))).toBe(false);
  });

  it('el soporte admite PDF, JPG, PNG y HEIC; no Word', () => {
    const ok = (name: string, type: string) => validateSingleFile({ name, type, size: 100 }, EXPENSE_RECEIPT_RULES);
    expect(ok('factura.pdf', 'application/pdf')).toBeNull();
    expect(ok('foto.jpeg', 'image/jpeg')).toBeNull();
    expect(ok('IMG_1.HEIC', '')).toBeNull();
    expect(ok('contrato.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(
      EXPENSE_RECEIPT_RULES.messages.unsupported,
    );
  });

  it('solo JPG y PNG se pintan como imagen', () => {
    expect(isImageReceipt('image/png')).toBe(true);
    expect(isImageReceipt('application/pdf')).toBe(false);
  });

  it('nombre del CSV', () => {
    expect(expensesCsvFileName('2026-10-01', '2026-10-24')).toBe('gastos-2026-10-01-2026-10-24.csv');
    expect(expensesCsvFileName(undefined, undefined)).toBe('gastos.csv');
  });
});
