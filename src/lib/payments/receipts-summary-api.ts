import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/*
 * Recibo resumen de un periodo por paciente (DX-401): los recibos de caja del
 * paciente entre dos días civiles, con los totales por moneda (nunca sumados
 * entre monedas) y el aviso de que no es factura. Los tipos salen del OpenAPI.
 */

type Schemas = components['schemas'];

/**
 * Una fila del periodo: una forma de pago de un recibo. Un cobro dividido trae
 * una fila por forma de pago, seguidas y con el mismo `paymentId` y número
 * (`PRI-000123`, o la referencia antigua `REC-xxxxxxxx`). `issuedOn` es el día
 * civil de emisión en su sede. Los anulados vienen marcados y no cuentan en
 * los totales.
 */
export type ReceiptsSummaryReceipt = Schemas['ReceiptSummaryLineDto'];

/** La fila `i` es otra forma de pago del mismo recibo que la anterior (cobro dividido). */
export function isContinuation(rows: readonly ReceiptsSummaryReceipt[], i: number): boolean {
  return i > 0 && rows[i - 1].paymentId === rows[i].paymentId;
}

/** Total de una moneda: solo las filas no anuladas; `count` cuenta filas (formas de pago). */
export type ReceiptsSummaryTotal = Schemas['ReceiptSummaryTotalDto'];

/**
 * El resumen: `from`/`to` inclusive (`YYYY-MM-DD`); `restrictedToLocations`
 * si quien lo pide solo ve sus sedes; `voidedCount` cuenta recibos, no filas;
 * `notice` es el pie (no es factura) que redacta la API.
 */
export type ReceiptsSummary = Schemas['PaymentReceiptSummaryDto'];

/** Destino enmascarado («an***@example.com») y si salió al responsable. */
export type SendReceiptsSummaryResult = Schemas['SendPaymentReceiptResponseDto'];

export interface ReceiptsSummaryRange {
  from: string;
  to: string;
}

function summaryPath(patientId: string, range: ReceiptsSummaryRange, action?: 'print' | 'email'): string {
  const search = new URLSearchParams({ from: range.from, to: range.to });
  const tail = action ? `/${action}` : '';
  return `/patients/${encodeURIComponent(patientId)}/payment-receipts/summary${tail}?${search.toString()}`;
}

/**
 * `GET /patients/:id/payment-receipts/summary?from&to` — la vista previa (la
 * API la deja en la auditoría como consulta). 400 con el periodo mal, 403 para
 * los roles sin cobro y 404 si el paciente no es de la clínica.
 */
export function getReceiptsSummary(
  token: string,
  patientId: string,
  range: ReceiptsSummaryRange,
): Promise<ReceiptsSummary> {
  return apiFetch<ReceiptsSummary>(summaryPath(patientId, range), { token });
}

/**
 * `POST /patients/:id/payment-receipts/summary/print?from&to` — el MISMO
 * resumen, pedido para imprimirlo: cada impresión queda en la auditoría.
 */
export function printReceiptsSummary(
  token: string,
  patientId: string,
  range: ReceiptsSummaryRange,
): Promise<ReceiptsSummary> {
  return apiFetch<ReceiptsSummary>(summaryPath(patientId, range, 'print'), { method: 'POST', token });
}

/**
 * `POST /patients/:id/payment-receipts/summary/email?from&to` — encola el
 * resumen al email del paciente (o de su responsable). Periodo en la query,
 * sin cuerpo. 422 sin email o sin recibos en el periodo; 429 con los topes de envío. Los dos en español.
 */
export function sendReceiptsSummary(
  token: string,
  patientId: string,
  range: ReceiptsSummaryRange,
): Promise<SendReceiptsSummaryResult> {
  return apiFetch<SendReceiptsSummaryResult>(summaryPath(patientId, range, 'email'), {
    method: 'POST',
    token,
  });
}

/** Vista imprimible del resumen (fuera del shell, se abre en otra pestaña). */
export function receiptsSummaryPrintHref(patientId: string, range: ReceiptsSummaryRange): string {
  const search = new URLSearchParams({ from: range.from, to: range.to });
  return `/print/patients/${encodeURIComponent(patientId)}/receipts-summary?${search.toString()}`;
}
