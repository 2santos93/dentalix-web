import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/**
 * DX-019: Ajustes › Datos de la clínica — nombre comercial, datos fiscales
 * (identificador libre con su nombre propio), contacto, color y logo. Solo
 * administración (la API responde 403 al resto).
 */
export type ClinicSettings = components['schemas']['ClinicSettingsDto'];
export type ClinicSettingsPatch = components['schemas']['UpdateClinicSettingsDto'];
export type ClinicFiscal = components['schemas']['ClinicFiscalDto'];

/** Solo administración (la API lo exige). */
export function canManageClinicSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Tope del logo (la API rechaza más de 1 MB; el proxy de la web copia como mucho 1 MB del cuerpo). */
export const LOGO_MAX_BYTES = 1024 * 1024;
/** Lo que sube por el proxy con el sobre del multipart dentro de su MB. */
export const LOGO_UPLOAD_MAX_BYTES = LOGO_MAX_BYTES - 16 * 1024;
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg';

/** `GET /clinic/settings`. */
export function getClinicSettings(token: string): Promise<ClinicSettings> {
  return apiFetch<ClinicSettings>('/clinic/settings', { token });
}

/** `PATCH /clinic/settings`: solo los campos enviados; vacío borra. Auditado. */
export function updateClinicSettings(token: string, patch: ClinicSettingsPatch): Promise<ClinicSettings> {
  return apiFetch<ClinicSettings>('/clinic/settings', { method: 'PATCH', body: patch, token });
}

/** `POST /clinic/settings/logo` (multipart). La API lo valida por sus bytes y lo re-escribe. */
export function uploadClinicLogo(token: string, file: File): Promise<ClinicSettings> {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch<ClinicSettings>('/clinic/settings/logo', { method: 'POST', body: fd, token });
}

/** `DELETE /clinic/settings/logo`. */
export function removeClinicLogo(token: string): Promise<ClinicSettings> {
  return apiFetch<ClinicSettings>('/clinic/settings/logo', { method: 'DELETE', token });
}

/** El nombre del identificador fiscal que se imprime: el de la clínica o el genérico. */
export const GENERIC_TAX_ID_LABEL = 'Id. fiscal';

export function taxIdLine(taxId: string, label: string | null | undefined): string {
  return `${label?.trim() || GENERIC_TAX_ID_LABEL} ${taxId}`;
}

/** Sin datos fiscales (fixtures y valores por defecto). */
export const EMPTY_CLINIC_FISCAL: ClinicFiscal = {
  legalName: null,
  taxIdLabel: null,
  taxId: null,
  address: null,
  email: null,
  phone: null,
};
