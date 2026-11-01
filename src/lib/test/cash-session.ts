import type { CashSessionDetail } from '@/lib/cash-sessions/cash-sessions-api';

type CashOutflow = CashSessionDetail['outflows'][number];

/** Una salida de caja menor (DX-274): 8.000 COP de mensajería a las 11:30 de la sede. */
export function outflowFixture(overrides: Partial<CashOutflow> = {}): CashOutflow {
  return {
    id: 'ep-1',
    expenseId: 'exp-9',
    category: 'Mensajería',
    supplier: 'Mensajeros Ya',
    amount: 8_000,
    currency: 'COP',
    createdAt: '2026-10-17T16:30:00.000Z',
    createdBy: { id: 'u-recep', fullName: 'Paola Martínez' },
    ...overrides,
  };
}

/** Turno de caja de prueba (DX-027): abierto, con fondo, un cobro y lo esperado. */
export function cashSessionFixture(overrides: Partial<CashSessionDetail> = {}): CashSessionDetail {
  return {
    id: 'cs-1',
    status: 'OPEN',
    location: { id: 'loc-1', name: 'Sede principal' },
    openedBy: { id: 'u-recep', fullName: 'Paola Martínez' },
    openedAt: '2026-10-17T13:00:00.000Z',
    openedOn: '2026-10-17',
    closedAt: null,
    closedBy: null,
    reopenCount: 0,
    floats: [{ currency: 'COP', amount: 50_000 }],
    differences: [],
    notes: null,
    timeZone: 'America/Bogota',
    blindHidden: false,
    expected: [
      {
        currency: 'COP',
        method: 'CASH',
        opening: 50_000,
        payments: 30_000,
        paymentsCount: 1,
        adjustments: 0,
        outflows: 0,
        outflowsCount: 0,
        expected: 80_000,
      },
      {
        currency: 'COP',
        method: 'CARD',
        opening: 0,
        payments: 25_000,
        paymentsCount: 1,
        adjustments: 0,
        outflows: 0,
        outflowsCount: 0,
        expected: 25_000,
      },
    ],
    payments: [
      {
        id: 'pay-1',
        paidAt: '2026-10-17T17:00:00.000Z',
        paidOn: '2026-10-17',
        amount: 30_000,
        currency: 'COP',
        method: 'CASH',
        receiptNumber: 'PRI-000012',
        patient: { id: 'pat-1', fullName: 'Ana Gómez' },
        createdBy: { id: 'u-recep', fullName: 'Paola Martínez' },
      },
    ],
    voidedPayments: [],
    outflows: [],
    voidedOutflows: [],
    creditRefunds: [],
    adjustments: [],
    laterAdjustments: [],
    closing: null,
    closings: [],
    reopenings: [],
    can: { close: true, reopen: false, adjust: false },
    ...overrides,
  };
}

/** El mismo turno, ya cerrado con una diferencia explicada. */
export function closedCashSessionFixture(overrides: Partial<CashSessionDetail> = {}): CashSessionDetail {
  const closing = {
    id: 'cl-1',
    sequence: 1,
    closedAt: '2026-10-17T23:00:00.000Z',
    closedBy: { id: 'u-recep', fullName: 'Paola Martínez' },
    blind: false,
    hasDifference: true,
    differenceReason: 'Faltó cambio',
    notes: null,
    suggestedLockDate: '2026-10-17',
    lines: [
      { currency: 'COP', method: 'CASH' as const, opening: 50_000, expected: 80_000, counted: 79_000, difference: -1_000 },
      { currency: 'COP', method: 'CARD' as const, opening: 0, expected: 25_000, counted: 25_000, difference: 0 },
    ],
  };
  return cashSessionFixture({
    status: 'CLOSED',
    closedAt: closing.closedAt,
    closedBy: closing.closedBy,
    differences: [{ currency: 'COP', amount: -1_000 }],
    closing,
    closings: [closing],
    can: { close: false, reopen: true, adjust: true },
    ...overrides,
  });
}
