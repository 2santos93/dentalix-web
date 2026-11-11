import { apiFetch } from '@/lib/api/client';

/*
 * Recibo resumen de un periodo por paciente (DX-401): los recibos de caja del
 * paciente entre dos días civiles, con los totales por moneda (nunca sumados
 * entre monedas) y el aviso de que no es factura.
 *
 * TODO(DX-401): derive from schema.d.ts after codegen. La API de DX-401 va en
 * paralelo y `schema.d.ts` todavía no trae estas rutas; los tipos son el
 * contrato acordado, escritos a mano. Tras el merge de la API y `npm run codegen`
 * se cambian por `components['schemas'][…]`.
 */

/**
 * Una fila del periodo: una forma de pago de un recibo. Un cobro dividido trae
 * una fila por forma de pago, seguidas y con el mismo `paymentId` y número.
 * Los anulados vienen marcados y no cuentan en los totales.
 */
export interface ReceiptsSummaryReceipt {
  paymentId: string;
  /** Número de la serie de la sede (`PRI-000123`) o la referencia antigua (`REC-xxxxxxxx`). */
  receiptNumber: string;
  /** Día civil de emisión del recibo en su sede, `YYYY-MM-DD` (por él se filtra el periodo). */
  issuedOn: string;
  locationName: string;
  methodLabel: string;
  amount: number;
  currency: string;
  voided: boolean;
  voidReason: string | null;
}

/** La fila `i` es otra forma de pago del mismo recibo que la anterior (cobro dividido). */
export function isContinuation(rows: readonly ReceiptsSummaryReceipt[], i: number): boolean {
  return i > 0 && rows[i - 1].paymentId === rows[i].paymentId;
}

/** Total de una moneda: solo las filas no anuladas de esa moneda. */
export interface ReceiptsSummaryTotal {
  currency: string;
  amount: number;
  /** Filas (formas de pago) no anuladas en esa moneda. */
  count: number;
}

export interface ReceiptsSummary {
  patient: {
    id: string;
    fullName: string;
    /** Nombre del tipo de documento, el que le da la clínica («Documento de identidad»). */
    documentTypeName: string;
    /** Solo el número enmascarado («****5678»), o `null` sin documento. */
    documentMasked: string | null;
    patientCode: string;
  };
  clinic: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    taxIdLabel?: string;
    address: string | null;
  };
  /** Primer día del periodo, `YYYY-MM-DD`, inclusive. */
  from: string;
  /** Último día del periodo, `YYYY-MM-DD`, inclusive. */
  to: string;
  /** Instante ISO en que la API armó el resumen. */
  generatedAt: string;
  /** `true` si quien lo pide solo ve sus sedes: el resumen no trae los abonos de las demás. */
  restrictedToLocations: boolean;
  receipts: ReceiptsSummaryReceipt[];
  totals: ReceiptsSummaryTotal[];
  /** Recibos anulados (no filas). */
  voidedCount: number;
  /** Aviso del pie (no es factura), redactado por la API. */
  notice: string;
}

export interface SendReceiptsSummaryResult {
  /** Destino enmascarado («an***@example.com»). */
  sentTo: string;
  /** Salió al email del responsable del paciente (menor o paciente sin email). */
  sentToResponsible: boolean;
}

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
