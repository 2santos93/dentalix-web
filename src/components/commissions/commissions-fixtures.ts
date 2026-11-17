import type {
  CommissionLine,
  CommissionPayment,
  CommissionSettlementSummary,
  CommissionPreview,
  CommissionSettlement,
  ProfessionalCommissionRule,
} from '@/lib/commissions/commissions-api';

// DX-018: datos de prueba de honorarios (Venezuela, USD y VES).
export const DRA_X = {
  userId: 'u-x',
  membershipId: 'm-x',
  name: 'Dra. Ximena Rivas',
  role: 'DENTIST' as const,
  active: true,
};

export function makeRuleRow(over: Partial<ProfessionalCommissionRule> = {}): ProfessionalCommissionRule {
  return {
    professional: DRA_X,
    rule: {
      id: 'r1',
      basis: 'COLLECTED',
      releaseMode: 'PER_ITEM',
      percent: 35,
      categories: [{ category: 'Higiene', percent: 20 }],
      active: true,
      deductLabCost: false,
      deductCardFee: false,
      updatedAt: '2026-10-01T12:00:00.000Z',
    },
    ...over,
  };
}

export function makeLine(over: Partial<CommissionLine> = {}): CommissionLine {
  return {
    id: null,
    kind: 'ACCRUAL',
    adjustsLineId: null,
    patient: { id: 'p1', name: 'Carmen Pérez' },
    treatmentPlanId: 'plan1',
    treatmentPlanItemId: 'item1',
    locationId: 'loc1',
    catalogCode: 'END-01',
    catalogLabel: 'Endodoncia unirradicular',
    category: 'Endodoncia',
    toothNumber: '11',
    completedAt: '2026-10-05T15:00:00.000Z',
    payment: { id: 'pay1', paidAt: '2026-10-06T15:00:00.000Z', amount: 100, currency: 'USD' },
    releasedAt: '2026-10-06T15:00:00.000Z',
    currency: 'USD',
    base: 100,
    percent: 35,
    amount: 35,
    paidInPaymentId: null,
    ...over,
  };
}

export function makePreview(over: Partial<CommissionPreview> = {}): CommissionPreview {
  return {
    professional: DRA_X,
    period: { from: '2026-10-01', to: '2026-10-31' },
    rule: makeRuleRow().rule,
    lines: [
      makeLine(),
      makeLine({
        treatmentPlanItemId: 'item2',
        catalogLabel: 'Limpieza',
        category: 'Higiene',
        currency: 'VES',
        payment: { id: 'pay2', paidAt: '2026-10-08T15:00:00.000Z', amount: 18250, currency: 'VES' },
        base: 18250,
        percent: 20,
        amount: 3650,
      }),
      makeLine({
        kind: 'ADJUSTMENT',
        adjustsLineId: 'old-line',
        treatmentPlanItemId: 'item3',
        catalogLabel: 'Corona',
        releasedAt: null,
        base: -50,
        amount: -17.5,
      }),
    ],
    totals: [
      { currency: 'USD', accrued: 35, adjustments: -17.5, total: 17.5, lines: 2 },
      { currency: 'VES', accrued: 3650, adjustments: 0, total: 3650, lines: 1 },
    ],
    lastClosedTo: null,
    nextFrom: null,
    canClose: true,
    blocker: null,
    blockerMessage: null,
    deductionsAvailable: { labCost: false, cardFee: false },
    ...over,
  };
}

export function makeSettlement(over: Partial<CommissionSettlement> = {}): CommissionSettlement {
  const preview = makePreview();
  return {
    id: 's1',
    professional: DRA_X,
    period: preview.period,
    basis: 'COLLECTED',
    releaseMode: 'PER_ITEM',
    percent: 35,
    closedAt: '2026-11-02T14:00:00.000Z',
    closedBy: { userId: 'admin', name: 'Dr. Owner' },
    lockDateBefore: null,
    lockDateAfter: '2026-10-31',
    totals: preview.totals,
    categoryPercents: [{ category: 'Higiene', percent: 20 }],
    lines: preview.lines.map((l, i) => ({ ...l, id: `line-${i}` })),
    payment: {
      status: 'UNPAID',
      currencies: [
        { currency: 'USD', total: 17.5, paid: 0, pending: 17.5, pendingLines: 2 },
        { currency: 'VES', total: 3650, paid: 0, pending: 3650, pendingLines: 1 },
      ],
    },
    payments: [],
    professionalEmail: 'ximena.rivas@example.com',
    ...over,
  };
}

/** DX-464: un pago de la liquidación s1 (USD, transferencia, Sede Centro). */
export function makePayment(over: Partial<CommissionPayment> = {}): CommissionPayment {
  return {
    id: 'cp1',
    settlementId: 's1',
    currency: 'USD',
    amount: 17.5,
    method: 'TRANSFER',
    paidOn: '2026-11-05',
    reference: 'TRF-8841',
    location: { id: 'loc1', name: 'Sede Centro' },
    expenseId: 'exp1',
    lineIds: ['line-0', 'line-2'],
    createdAt: '2026-11-05T14:00:00.000Z',
    createdBy: { userId: 'admin', name: 'Dr. Owner' },
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    receipt: { status: 'NONE', requestedAt: null, expiresAt: null, signedAt: null, signerName: null },
    ...over,
  };
}

/** DX-464: la fila de la lista de liquidaciones. */
export function makeSettlementSummary(over: Partial<CommissionSettlementSummary> = {}): CommissionSettlementSummary {
  const { id, professional, period, basis, releaseMode, percent, closedAt, closedBy, lockDateBefore, lockDateAfter, totals, payment } =
    makeSettlement();
  return {
    id,
    professional,
    period,
    basis,
    releaseMode,
    percent,
    closedAt,
    closedBy,
    lockDateBefore,
    lockDateAfter,
    totals,
    payment,
    ...over,
  };
}
