import type { AccountStatement } from '@/lib/account-statement/account-statement-api';
import type { PlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import type { PatientPortal, PortalPlan } from './patient-access-api';

/**
 * DX-101: la API del portal manda proyecciones de LISTA BLANCA (sin ids
 * internos, autores ni evidencias). Los documentos imprimibles ya existentes
 * (`PlanQuoteDocument`, `AccountStatementDocument`) esperan la forma completa
 * del personal: aquí se completa con valores neutros lo que el paciente no
 * recibe, para pintar el MISMO documento sin inventar datos.
 */

export type PortalAccount = NonNullable<PatientPortal['account']>;

export function printableQuote(plan: PortalPlan): PlanQuote {
  const { quote } = plan;
  return {
    ...quote,
    planId: plan.id,
    patientId: '',
    planStatus: plan.status,
    location: {
      id: '',
      name: quote.location.name,
      address: quote.location.address,
    },
    items: quote.items.map((item, index) => ({ ...item, id: `item-${index}` })),
    // DX-560: el portal no recibe la presentación; el documento usa sus líneas.
    presentation: { language: 'es', items: [] },
    acceptance: quote.acceptance
      ? {
          signerName: quote.acceptance.signerName,
          signature: quote.acceptance.signature,
          acceptedAt: quote.acceptance.acceptedAt,
          // Lo que el paciente no recibe: vacío (el documento no lo pinta).
          acceptedByName: '',
          acceptanceHash: '',
          integrityOk: true,
          remote: null,
          portal: null,
          ipAddress: null,
          userAgent: null,
          quoteValidUntil: null,
          expiredMode: null,
          expiredReason: null,
          expiredNote: null,
          repricingId: null,
          pendingPlanId: null,
          pendingItemIds: null,
          pendingTotal: null,
        }
      : null,
  };
}

export function printableStatement(account: PortalAccount): AccountStatement {
  return {
    ...account,
    patient: { ...account.patient, id: '' },
    addressee: { ...account.addressee, email: null },
    plans: account.plans.map((p) => ({ ...p, paymentsWithoutRate: [] })),
    movements: account.movements.map((m, index) => ({
      id: `movement-${index}`,
      paidAt: m.paidAt,
      paidOn: m.paidOn,
      amount: m.amount,
      currency: m.currency,
      method: m.method,
      paymentMethod: m.paymentMethodName
        ? { id: '', name: m.paymentMethodName }
        : null,
      reference: m.reference,
      externalInvoiceNumber: m.externalInvoiceNumber,
      splitId: null,
      splitLines: m.splitLines,
      receiptNumber: m.receiptNumber,
      hasProof: false,
      location: { id: '', name: m.locationName },
      treatmentPlanId: m.treatmentPlanId,
      openingBalanceId: m.openingBalanceId,
      createdById: null,
      canVoid: false,
      voidBlockedReason: null,
      periodLocked: false,
      voided: m.voided,
      voidedAt: m.voidedAt,
      voidedBy: null,
      voidReason: null,
    })),
    openingBalances: account.openingBalances.map((o) => ({
      ...o,
      importBatchId: '',
    })),
  };
}
