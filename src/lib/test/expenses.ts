import type { Expense, ExpenseDetail, ExpensePayment } from '@/lib/expenses/expenses-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

/** Sedes de prueba (DX-274): la principal en Bogotá y otra en Medellín. */
export const expenseLocations: ClinicLocation[] = [
  clinicLocation({
    id: 'loc-1',
    name: 'Sede principal',
    address: null,
    country: 'CO',
    isActive: true,
    timeZone: 'America/Bogota',
    createdAt: '2026-01-01T00:00:00.000Z',
  }),
  clinicLocation({
    id: 'loc-2',
    name: 'Sede norte',
    address: null,
    country: 'CO',
    isActive: true,
    timeZone: 'America/Bogota',
    createdAt: '2026-02-01T00:00:00.000Z',
  }),
];

/** Un gasto pendiente de 150.000 COP en la sede principal. */
export function expenseFixture(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    locationId: 'loc-1',
    category: 'Laboratorio',
    supplier: 'Lab Dental SAS',
    description: 'Coronas de octubre',
    amount: 150_000,
    currency: 'COP',
    invoiceDate: '2026-10-20',
    dueDate: null,
    paidAmount: 0,
    pendingAmount: 150_000,
    status: 'PENDING',
    overdue: false,
    attachment: null,
    createdById: 'u-admin',
    createdByName: 'Admin Demo',
    createdAt: '2026-10-20T15:00:00.000Z',
    updatedAt: '2026-10-20T15:00:00.000Z',
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    ...overrides,
  };
}

export function expensePaymentFixture(overrides: Partial<ExpensePayment> = {}): ExpensePayment {
  return {
    id: 'pay-1',
    amount: 50_000,
    currency: 'COP',
    method: 'CASH',
    paidOn: '2026-10-21',
    cashSessionId: null,
    createdById: 'u-admin',
    createdByName: 'Admin Demo',
    createdAt: '2026-10-21T15:00:00.000Z',
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    ...overrides,
  };
}

export function expenseDetailFixture(
  overrides: Partial<ExpenseDetail> = {},
  payments: ExpensePayment[] = [],
): ExpenseDetail {
  return { ...expenseFixture(), payments, ...overrides };
}
