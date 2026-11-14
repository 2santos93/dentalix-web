import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { SingleFileRules, SingleFileUploadRequest } from '@/lib/files/upload-single-file';

type Schemas = components['schemas'];

// DX-389: comprobante del cobro (la captura del pago móvil o de la transferencia).
export type PaymentProofUpload = Schemas['PaymentProofUploadDto'];
export type PaymentProofUrl = Schemas['PaymentProofUrlDto'];
export type PaymentProofDisposition = PaymentProofUrl['disposition'];

/** Código estable del 400 de un comprobante que no es lo que dice ser (la API ya lo borró). */
export const PAYMENT_PROOF_REJECTED = 'PAYMENT_PROOF_REJECTED';

/**
 * Comprobante del cobro: imagen JPG, PNG o WebP, o PDF, de hasta 10 MB (la HEIC
 * del iPhone se pasa a JPG antes de subir). La API vuelve a decidir por contenido.
 */
export const PAYMENT_PROOF_RULES: SingleFileRules = {
  maxBytes: 10 * 1024 * 1024,
  extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
  mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  messages: {
    tooLarge: 'El comprobante supera el máximo de 10 MB.',
    empty: 'El archivo está vacío.',
    unsupported: 'Tipo de archivo no admitido. Sube una imagen JPG, PNG o WebP, una foto HEIC o un PDF.',
  },
};

/** Para el `accept` del selector de archivos. */
export const PAYMENT_PROOF_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic';

/** ¿Se pinta en un `<img>`? (el PDF va en un marco o en otra pestaña) */
export function isImageProof(mimeType: string): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp';
}

/**
 * `POST /payments/proofs/upload-url` — autorización para subir el comprobante
 * directo al almacén privado (ADMIN y recepción). El `uploadId` va en
 * `proofUploadId` al registrar el abono.
 */
export function requestPaymentProofUpload(
  token: string,
  request: SingleFileUploadRequest,
): Promise<PaymentProofUpload> {
  return apiFetch<PaymentProofUpload>('/payments/proofs/upload-url', {
    method: 'POST',
    body: request,
    token,
  });
}

/**
 * `GET /payments/:id/proof/url` — URL firmada de vida corta (5 min) para ver
 * (`inline`) o descargar (`attachment`) el comprobante; cada una queda auditada.
 */
export function getPaymentProofUrl(
  token: string,
  paymentId: string,
  disposition: PaymentProofDisposition = 'inline',
): Promise<PaymentProofUrl> {
  return apiFetch<PaymentProofUrl>(`/payments/${paymentId}/proof/url?disposition=${disposition}`, { token });
}
