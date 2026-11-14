import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { regionalFormat } from '@/lib/format/regional-format';
import { NO_DOCUMENT_FORMAT } from '@/lib/format/document-format';

/**
 * DX-467: lo que la página pública `/receta/<código>` sabe de una receta (la
 * API lo recorta a lo mínimo: nada clínico).
 */
export type PublicPrescriptionVerification = components['schemas']['PublicPrescriptionVerificationDto'];
export type PublicPrescriptionVerificationStatus = PublicPrescriptionVerification['status'];

/** Ruta de la página pública de una receta (la que abre el QR impreso). */
export const PRESCRIPTION_VERIFY_PATH = '/receta';

/**
 * `GET /public/prescriptions/:code`, sin sesión: la clínica sale del host (el
 * cliente manda `X-Tenant-Host`). Código inexistente, mal formado o de otra
 * clínica: 404 (`ApiError`). La API responde `no-store`: tras anular una
 * receta, la siguiente consulta ya lo dice.
 */
export function getPublicPrescriptionVerification(code: string): Promise<PublicPrescriptionVerification> {
  return apiFetch<PublicPrescriptionVerification>(`/public/prescriptions/${encodeURIComponent(code)}`);
}

/** El código agrupado de 4 en 4 para leerlo en papel: `K7M3-QH9X-RT2W`. */
export function formatVerificationCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-');
}

/**
 * URL que lleva el QR impreso: la página pública en el MISMO host desde el
 * que se imprime (el de la clínica), porque la API resuelve la clínica por el
 * host. El código va sin guiones (la página también los admite).
 */
export function prescriptionVerificationUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}${PRESCRIPTION_VERIFY_PATH}/${encodeURIComponent(code)}`;
}

/**
 * Un día civil (`YYYY-MM-DD`) con el formato de la sede de la receta (DX-354:
 * nunca un `dd/mm/aaaa` armado a mano, ni el formato del navegador, ni un
 * reloj fijo). Sin día, o sin locale y reloj válidos de la sede, «—».
 */
export function verificationDate(
  day: string | null,
  sede: Pick<PublicPrescriptionVerification, 'locale' | 'hourCycle'>,
): string {
  const { locale, hourCycle } = sede;
  if (!day || !locale || !hourCycle) return NO_DOCUMENT_FORMAT;
  try {
    return regionalFormat({ locale, hourCycle }).civilDate(day);
  } catch (e) {
    if (e instanceof RangeError) return NO_DOCUMENT_FORMAT;
    throw e;
  }
}
