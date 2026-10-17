import type { ClinicRole } from '@/lib/me/me-api';

/**
 * DX-210: quién marca «Adelantar si hay hueco»: recepción, odontología y ADMIN
 * (la asistente ve la agenda pero no la cambia; la API le responde 403).
 */
export function canChangeWantsEarlier(role: ClinicRole | null): boolean {
  return role === 'RECEPTION' || role === 'DENTIST' || role === 'ADMIN';
}
