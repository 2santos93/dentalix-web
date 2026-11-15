import { apiFetch } from '@/lib/api/client';
import { API_PROXY_PATH } from '@/lib/api/api-base';
import type { components } from '@/lib/api/schema';

/**
 * DX-306: copia de un certificado (justificante o reposo) para el paciente, o el
 * responsable de un menor, por WhatsApp con un enlace personal que caduca.
 */
export type CertificateCopySent = components['schemas']['CertificateCopySentDto'];
export type PublicCertificateCopy = components['schemas']['PublicCertificateCopyDto'];
export type PublicCertificate = components['schemas']['PublicCertificateDto'];

/** Código del 410 de un enlace caducado (la API lo manda en `code`). */
export const CERTIFICATE_COPY_EXPIRED_CODE = 'CERTIFICATE_COPY_LINK_EXPIRED';

/** Ruta de la página pública de la copia. */
export const CERTIFICATE_COPY_PATH = '/certificado/copia';

/**
 * `POST /patients/:patientId/certificates/:id/patient-copy` (sin cuerpo): crea el
 * enlace (el anterior deja de servir) y devuelve lo necesario para abrir `wa.me`.
 * 403 sede no permitida o recepción con un reposo con diagnóstico; 409 anulado,
 * paciente archivado o sede sin formato; 422 sin teléfono, de baja de los envíos
 * o menor sin responsable con teléfono.
 */
export function sendCertificateCopy(
  token: string,
  patientId: string,
  certificateId: string,
): Promise<CertificateCopySent> {
  return apiFetch<CertificateCopySent>(
    `/patients/${encodeURIComponent(patientId)}/certificates/${encodeURIComponent(certificateId)}/patient-copy`,
    { method: 'POST', token },
  );
}

/**
 * `GET /public/certificate-copies/:token`, sin sesión: la clínica sale del host.
 * 404 inventado, de otra clínica o invalidado; 410 caducado.
 */
export function getPublicCertificateCopy(token: string): Promise<PublicCertificateCopy> {
  return apiFetch<PublicCertificateCopy>(`/public/certificate-copies/${encodeURIComponent(token)}`);
}

/**
 * Enlace de «Descargar PDF»: el proxy del mismo origen (`/api/v1`), como el
 * `.ics` de la confirmación de cita, para que la API reconozca la clínica por el host.
 */
export function publicCertificateCopyPdfHref(token: string): string {
  return `${API_PROXY_PATH}/public/certificate-copies/${encodeURIComponent(token)}/pdf`;
}
