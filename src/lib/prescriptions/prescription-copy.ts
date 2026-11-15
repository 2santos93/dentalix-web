import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * DX-468: copia INFORMATIVA de una receta emitida para el paciente (o el
 * responsable de un menor), por un enlace caducable. No es la receta
 * electrónica oficial: para retirar el medicamento vale la impresa y firmada.
 */
export type PrescriptionCopyChannel = components['schemas']['PrescriptionCopyChannel'];
export type PrescriptionCopySent = components['schemas']['PrescriptionCopySentDto'];
export type PublicPrescriptionCopy = components['schemas']['PublicPrescriptionCopyDto'];

/** Código del 410 de un enlace caducado (la API lo manda en `code`). */
export const PRESCRIPTION_COPY_EXPIRED_CODE = 'PRESCRIPTION_COPY_LINK_EXPIRED';

/**
 * `POST /prescriptions/:id/patient-copy`. Por email lo envía la API; por
 * WhatsApp devuelve `whatsapp` (número, enlace y texto) para abrir `wa.me`.
 * 403 sede no permitida, 404 de otra clínica, 409 anulada o paciente
 * archivado, 422 sin a quién enviarla por ese canal, 429 tope de emails.
 */
export function sendPrescriptionCopy(
  token: string,
  prescriptionId: string,
  channel: PrescriptionCopyChannel,
): Promise<PrescriptionCopySent> {
  return apiFetch<PrescriptionCopySent>(
    `/prescriptions/${encodeURIComponent(prescriptionId)}/patient-copy`,
    { method: 'POST', body: { channel }, token },
  );
}

/**
 * `GET /public/prescription-copies/:token`, sin sesión: la clínica sale del
 * host (el cliente manda `X-Tenant-Host`). 404 inventado, de otra clínica o
 * invalidado; 410 caducado. `no-store`: si la receta se anula, la siguiente
 * carga ya lo dice.
 */
export function getPublicPrescriptionCopy(token: string): Promise<PublicPrescriptionCopy> {
  return apiFetch<PublicPrescriptionCopy>(`/public/prescription-copies/${encodeURIComponent(token)}`);
}
