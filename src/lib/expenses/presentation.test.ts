import { validateSingleFile } from '@/lib/files/upload-single-file';
import { expenseFixture } from '@/lib/test/expenses';
import {
  EXPENSE_RECEIPT_RULES,
  daysInRange,
  expenseSummaryCsvFileName,
  expensesCsvFileName,
  isExpenseOverdue,
  isImageReceipt,
  shiftMonth,
  summaryMonthLabel,
  summaryRangeDays,
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

  it('el rango del resumen va del primer al último día de los meses elegidos', () => {
    expect(summaryRangeDays('2026-05', '2026-10')).toEqual({
      from: '2026-05-01',
      to: '2026-10-31',
    });
    expect(summaryRangeDays('2028-02', '2028-02')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(summaryRangeDays('2026-13', '2026-10')).toBeNull();
    expect(daysInRange('2026-01-01', '2026-12-31')).toBe(365);
    expect(daysInRange('2028-01-01', '2028-12-31')).toBe(366);
  });

  it('desplaza meses a través del año y rotula en español', () => {
    expect(shiftMonth('2026-10', -9)).toBe('2026-01');
    expect(shiftMonth('2026-02', -5)).toBe('2025-09');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('nope', 1)).toBeNull();
    expect(summaryMonthLabel('2026-10')).toBe('Octubre de 2026');
    expect(expenseSummaryCsvFileName('2026-05-01', '2026-10-31')).toBe('resumen-gastos-2026-05-01-2026-10-31.csv');
  });
});
