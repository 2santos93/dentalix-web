import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import type { AgingBuckets } from './receivables-api';

export type BucketKey = keyof AgingBuckets;

/** Orden de los tramos, de lo que aún no vence a lo más antiguo. */
export const BUCKET_ORDER: readonly BucketKey[] = [
  'current',
  'days0to30',
  'days31to60',
  'days61to90',
  'over90',
];

export const BUCKET_LABELS: Record<BucketKey, string> = {
  current: 'Por vencer',
  days0to30: '0–30 días',
  days31to60: '31–60 días',
  days61to90: '61–90 días',
  over90: 'Más de 90 días',
};

/** Tramo de una antigüedad (`null` = nada vencido: «por vencer»). Espejo de la API. */
export function bucketOfAge(ageDays: number | null): BucketKey {
  if (ageDays === null) return 'current';
  if (ageDays <= 30) return 'days0to30';
  if (ageDays <= 60) return 'days31to60';
  if (ageDays <= 90) return 'days61to90';
  return 'over90';
}

export interface AgeFilter {
  value: string;
  label: string;
  /** Sin él, cualquier antigüedad. */
  minAgeDays?: number;
}

/** Antigüedad mínima de la deuda vencida más antigua (`minAgeDays` de la API). */
export const AGE_FILTERS: readonly AgeFilter[] = [
  { value: 'all', label: 'Cualquier antigüedad' },
  { value: '1', label: 'Vencidos', minAgeDays: 1 },
  { value: '31', label: 'Más de 30 días', minAgeDays: 31 },
  { value: '61', label: 'Más de 60 días', minAgeDays: 61 },
  { value: '91', label: 'Más de 90 días', minAgeDays: 91 },
];

/**
 * Mensaje prellenado de WhatsApp para gestionar el cobro. Lleva SOLO el nombre
 * del paciente, la clínica y, si lo hay, su teléfono de contacto: ni importes,
 * ni cuotas, ni tratamientos. Un chat no es un canal seguro y el número puede
 * no ser del paciente (mismo criterio que la confirmación de citas).
 */
export function collectionMessage({
  patientName,
  clinicName,
  contactPhone,
}: {
  patientName: string;
  clinicName: string | null;
  contactPhone?: string | null;
}): string {
  const firstName = patientName.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';
  const clinic = clinicName ? clinicName : 'la clínica';
  const reply = contactPhone
    ? `Puedes respondernos por aquí o llamarnos al ${contactPhone}.`
    : 'Puedes respondernos por aquí.';
  return `${greeting}, te escribimos de ${clinic}. ¿Tienes un momento para hablar con nosotros? ${reply}`;
}

/** `https://wa.me/…` con el mensaje, o `null` si el teléfono no sirve para WhatsApp. */
export function collectionWhatsAppHref(
  patient: { fullName: string; whatsApp: string | null },
  clinicName: string | null,
): string | null {
  if (!patient.whatsApp) return null;
  return whatsAppUrl(patient.whatsApp, collectionMessage({ patientName: patient.fullName, clinicName }));
}

/** `tel:` sin espacios ni guiones (el `+` se conserva). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function csvFileName(asOf: string): string {
  return `cartera-${asOf}.csv`;
}

export interface PromiseFilter {
  value: string;
  label: string;
  hasPromise?: boolean;
}

/** DX-150: filtro por compromiso de pago abierto (`hasPromise` de la API). */
export const PROMISE_FILTERS: readonly PromiseFilter[] = [
  { value: 'all', label: 'Con y sin compromiso' },
  { value: 'yes', label: 'Con compromiso abierto', hasPromise: true },
  { value: 'no', label: 'Sin compromiso abierto', hasPromise: false },
];
