import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/**
 * DX-515: el recibo de caja NO es una factura. La clínica le da un título
 * propio y una leyenda (y cada sede puede tener la suya); en cada abono se
 * anota el nº de la factura fiscal que se emitió fuera de Dentalix. Todo es
 * texto libre y opcional: sin configurar, el recibo sale como siempre.
 */
export type ReceiptSettings = components['schemas']['ReceiptSettingsViewDto'];
export type ClinicReceiptSettings = components['schemas']['ReceiptSettingsDto'];
export type LocationReceiptLegend = components['schemas']['LocationReceiptLegendViewDto'];
export type ExternalInvoiceNumberResult = components['schemas']['ExternalInvoiceNumberResultDto'];

/** Los mismos topes que la API (y que la BD). */
export const RECEIPT_TITLE_MAX = 60;
export const RECEIPT_LEGEND_MAX = 250;
export const EXTERNAL_INVOICE_NUMBER_MAX = 64;

/** El título que se imprime si la clínica no puso otro. */
export const DEFAULT_RECEIPT_TITLE = 'Recibo de caja';
/** La sugerencia de leyenda: genérica, sin país, ley ni autoridad. */
export const SUGGESTED_RECEIPT_LEGEND = 'Este recibo no es una factura';

/** Solo administración configura el título y la leyenda (la API lo exige). */
export function canManageReceiptSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /payment-receipts/settings` (solo ADMIN). */
export function getReceiptSettings(token: string): Promise<ReceiptSettings> {
  return apiFetch<ReceiptSettings>('/payment-receipts/settings', { token });
}

/** `PUT /payment-receipts/settings`: vacío = sin configurar. Auditado. */
export function saveReceiptSettings(
  token: string,
  settings: { title: string | null; legend: string | null },
): Promise<ClinicReceiptSettings> {
  return apiFetch<ClinicReceiptSettings>('/payment-receipts/settings', {
    method: 'PUT',
    body: settings,
    token,
  });
}

/**
 * `PUT /payment-receipts/settings/locations/:id`: `override` false = la sede
 * usa la leyenda de la clínica; true con leyenda vacía = ninguna. Auditado.
 */
export function saveLocationReceiptLegend(
  token: string,
  locationId: string,
  body: { override: boolean; legend: string | null },
): Promise<LocationReceiptLegend> {
  return apiFetch<LocationReceiptLegend>(
    `/payment-receipts/settings/locations/${encodeURIComponent(locationId)}`,
    { method: 'PUT', body, token },
  );
}

/**
 * `PUT /payments/:id/external-invoice-number` (ADMIN y recepción): el nº de
 * la factura fiscal emitida fuera, texto libre; vacío lo quita. El recibo ya
 * emitido no cambia. En un cobro dividido va en todas sus líneas.
 */
export function saveExternalInvoiceNumber(
  token: string,
  paymentId: string,
  externalInvoiceNumber: string | null,
): Promise<ExternalInvoiceNumberResult> {
  return apiFetch<ExternalInvoiceNumberResult>(
    `/payments/${encodeURIComponent(paymentId)}/external-invoice-number`,
    { method: 'PUT', body: { externalInvoiceNumber }, token },
  );
}
