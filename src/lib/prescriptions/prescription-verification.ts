import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * DX-467: verificación pública de una receta con el código (o el QR) de la
 * receta impresa, en `/receta/<código>` del host de la clínica.
 */
export type PublicPrescriptionVerification = components['schemas']['PublicPrescriptionVerificationDto'];
export type PublicPrescriptionVerificationState =
  components['schemas']['PublicPrescriptionVerificationState'];

const GROUP = 4;
/** El mismo alfabeto y largo que la API (sin 0/O, 1/I/L). */
const CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$/;

/**
 * Lo que llega en la URL o se teclea, en la forma guardada (mayúsculas, sin
 * espacios ni guiones), o `null` si no puede ser un código: entonces ni se
 * pregunta a la API ni se pinta.
 */
export function normalizeVerificationCode(raw: string): string | null {
  if (raw.length > 32) return null;
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  return CODE.test(code) ? code : null;
}

/** El código como se imprime y se dicta: `K7M2-P9QR-T4XW`. */
export function groupVerificationCode(code: string): string {
  const groups: string[] = [];
  for (let i = 0; i < code.length; i += GROUP) groups.push(code.slice(i, i + GROUP));
  return groups.join('-');
}

/** La URL del QR, sin protocolo, para leerla en el papel y teclearla. */
export function verificationUrlLabel(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/**
 * `GET /public/prescription-verifications/:code` — sin sesión (`apiFetch`
 * manda `X-Tenant-Host`). 404 genérico si el código no es de esta clínica.
 */
export function getPublicPrescriptionVerification(code: string): Promise<PublicPrescriptionVerification> {
  return apiFetch<PublicPrescriptionVerification>(
    `/public/prescription-verifications/${encodeURIComponent(code)}`,
  );
}
