import type { AccountStatement } from '@/lib/account-statement/account-statement-api';

/**
 * Estado de cuenta de prueba: dos monedas, un abono anulado, un plan cancelado
 * y cuotas en los tres estados que importan (pagada, vencida, pendiente).
 */
export function accountStatementFixture(
  overrides: Partial<AccountStatement> = {},
): AccountStatement {
  return {
    issuedAt: '2026-10-15T15:30:00.000Z',
    clinic: { name: 'Clínica Sonrisas', logoUrl: null },
    patient: {
      id: 'pat-1',
      firstName: 'Ana',
      lastName: 'Gómez',
      docType: 'CC',
      docNumber: '1020304050',
    },
    range: { from: null, to: null },
    summary: [
      {
        currency: 'COP',
        budgeted: 3000000,
        paid: 1200000,
        balance: 1800000,
        overdueCount: 1,
        overdueAmount: 250000,
        nextInstallment: {
          treatmentPlanId: 'plan-1',
          sequence: 3,
          dueDate: '2026-11-10T00:00:00.000Z',
          amount: 250000,
        },
      },
      {
        currency: 'USD',
        budgeted: 0,
        paid: 50,
        balance: -50,
        overdueCount: 0,
        overdueAmount: 0,
        nextInstallment: null,
      },
    ],
    plans: [
      {
        id: 'plan-1',
        status: 'ACCEPTED',
        currency: 'COP',
        createdAt: '2026-08-01T15:00:00.000Z',
        budgeted: 3000000,
        countsTowardsBalance: true,
        paid: 1200000,
        paidOtherCurrencies: [],
        balance: 1800000,
      },
      {
        id: 'plan-2',
        status: 'CANCELLED',
        currency: 'USD',
        createdAt: '2026-06-01T15:00:00.000Z',
        budgeted: 500,
        countsTowardsBalance: false,
        paid: 50,
        paidOtherCurrencies: [],
        balance: -50,
      },
    ],
    movements: [
      {
        id: 'pay-3',
        paidAt: '2026-09-20T00:00:00.000Z',
        amount: 300000,
        currency: 'COP',
        method: 'CARD',
        location: { id: 'loc-1', name: 'Sede Norte' },
        treatmentPlanId: 'plan-1',
        voided: true,
        voidedAt: '2026-09-21T10:00:00.000Z',
      },
      {
        id: 'pay-2',
        paidAt: '2026-09-10T00:00:00.000Z',
        amount: 1200000,
        currency: 'COP',
        method: 'TRANSFER',
        location: { id: 'loc-2', name: 'Sede Principal' },
        treatmentPlanId: 'plan-1',
        voided: false,
        voidedAt: null,
      },
      {
        id: 'pay-1',
        paidAt: '2026-06-02T00:00:00.000Z',
        amount: 50,
        currency: 'USD',
        method: null,
        location: { id: 'loc-2', name: 'Sede Principal' },
        treatmentPlanId: 'plan-2',
        voided: false,
        voidedAt: null,
      },
    ],
    installments: [
      {
        paymentPlanId: 'pp-1',
        treatmentPlanId: 'plan-1',
        currency: 'COP',
        kind: 'DOWN_PAYMENT',
        sequence: null,
        dueDate: '2026-08-10T00:00:00.000Z',
        amount: 1000000,
        covered: 1000000,
        outstanding: 0,
        status: 'PAID',
      },
      {
        paymentPlanId: 'pp-1',
        treatmentPlanId: 'plan-1',
        currency: 'COP',
        kind: 'INSTALLMENT',
        sequence: 2,
        dueDate: '2026-10-10T00:00:00.000Z',
        amount: 250000,
        covered: 0,
        outstanding: 250000,
        status: 'OVERDUE',
      },
      {
        paymentPlanId: 'pp-1',
        treatmentPlanId: 'plan-1',
        currency: 'COP',
        kind: 'INSTALLMENT',
        sequence: 3,
        dueDate: '2026-11-10T00:00:00.000Z',
        amount: 250000,
        covered: 0,
        outstanding: 250000,
        status: 'PENDING',
      },
    ],
    ...overrides,
  };
}

/** Un paciente sin planes con valor ni abonos. */
export function emptyAccountStatementFixture(): AccountStatement {
  return accountStatementFixture({ summary: [], plans: [], movements: [], installments: [] });
}
