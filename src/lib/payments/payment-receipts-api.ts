import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * Recibo de caja de un abono (DX-136) tal como lo sirve la API: número de la
 * serie de la sede (o la referencia antigua `REC-xxxxxxxx` si es «sin serie»),
 * marca de anulado y la foto inmutable de lo que se imprime.
 */
export type PaymentReceipt = components['schemas']['PaymentReceiptDto'];
export type ReceiptSnapshot = components['schemas']['ReceiptSnapshotDto'];
export type SendPaymentReceiptResponse = components['schemas']['SendPaymentReceiptResponseDto'];

/** Formatos de impresión: hoja A4 o tirilla de impresora térmica de 80 mm. */
export type ReceiptPrintFormat = 'a4' | '80mm';

/** `GET /payments/:id/receipt` — ver el recibo (la API lo deja en la auditoría). */
export function getPaymentReceipt(token: string, paymentId: string): Promise<PaymentReceipt> {
  return apiFetch<PaymentReceipt>(`/payments/${encodeURIComponent(paymentId)}/receipt`, { token });
}

/**
 * `POST /payments/:id/receipt/print` — el MISMO recibo, pedido para
 * imprimirlo: la API registra la reimpresión en la auditoría.
 */
export function printPaymentReceipt(token: string, paymentId: string): Promise<PaymentReceipt> {
  return apiFetch<PaymentReceipt>(`/payments/${encodeURIComponent(paymentId)}/receipt/print`, {
    method: 'POST',
    token,
  });
}

/**
 * `POST /payments/:id/receipt/email` — encola el recibo al email de la ficha
 * del paciente. Devuelve el destino enmascarado. 422 si el paciente no tiene
 * email y 429 con los topes de envío: los dos con mensaje en español.
 */
export function sendPaymentReceipt(
  token: string,
  paymentId: string,
): Promise<SendPaymentReceiptResponse> {
  return apiFetch<SendPaymentReceiptResponse>(
    `/payments/${encodeURIComponent(paymentId)}/receipt/email`,
    { method: 'POST', token },
  );
}

/** Vista imprimible del recibo (fuera del shell, se abre en otra pestaña). */
export function receiptPrintHref(paymentId: string, format: ReceiptPrintFormat = 'a4'): string {
  const base = `/print/payments/${encodeURIComponent(paymentId)}/receipt`;
  return format === '80mm' ? `${base}?formato=80mm` : base;
}
