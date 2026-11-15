import {
  canManagePayments,
  canRegisterPayments,
  canViewFinancialReports,
  hasPermission,
} from './permissions';

describe('permisos extra (DX-090)', () => {
  it('registrar abonos: ADMIN, recepción o PAYMENT_REGISTER; nunca sin sesión', () => {
    expect(canRegisterPayments('ADMIN', [])).toBe(true);
    expect(canRegisterPayments('RECEPTION', [])).toBe(true);
    expect(canRegisterPayments('ASSISTANT', [])).toBe(false);
    expect(canRegisterPayments('ASSISTANT', ['PAYMENT_REGISTER'])).toBe(true);
    expect(canRegisterPayments('DENTIST', ['FINANCIAL_REPORTS_VIEW'])).toBe(false);
    expect(canRegisterPayments(null, undefined)).toBe(false);
  });

  it('anular y demás gestión de pagos: solo los roles de cobro, el permiso no basta', () => {
    expect(canManagePayments('ADMIN')).toBe(true);
    expect(canManagePayments('RECEPTION')).toBe(true);
    expect(canManagePayments('ASSISTANT')).toBe(false);
    expect(canManagePayments(null)).toBe(false);
  });

  it('reportes financieros: ADMIN o FINANCIAL_REPORTS_VIEW', () => {
    expect(canViewFinancialReports('ADMIN', [])).toBe(true);
    expect(canViewFinancialReports('RECEPTION', ['PAYMENT_REGISTER'])).toBe(false);
    expect(canViewFinancialReports('ASSISTANT', ['FINANCIAL_REPORTS_VIEW'])).toBe(true);
    expect(hasPermission(undefined, 'PAYMENT_REGISTER')).toBe(false);
  });
});
