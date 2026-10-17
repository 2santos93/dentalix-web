import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// SEC-009: la API documenta las respuestas con @ApiProperty; los tipos salen
// tal cual del contrato generado.
export type TenantDomain = components['schemas']['TenantDomainDto'];
export type TenantDomainState = components['schemas']['TenantDomainState'];
export type RegisterDomainResult = components['schemas']['RegisterDomainResponseDto'];

/** Registrar, verificar y eliminar dominios: solo ADMIN (como la API). */
export function canManageDomains(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Nombre del registro TXT que demuestra el control del dominio. */
export function verificationRecordName(host: string): string {
  return `_dentalix-verify.${host}`;
}

/** Los dominios vivos de la clínica, con su estado efectivo (EXPIRED incluido). */
export async function listDomains(token: string): Promise<TenantDomain[]> {
  return apiFetch<TenantDomain[]>('/domains', { token });
}

export async function registerDomain(
  token: string,
  host: string,
): Promise<RegisterDomainResult> {
  return apiFetch<RegisterDomainResult>('/domains', {
    method: 'POST',
    body: { host },
    token,
  });
}

/** Comprueba el TXT ahora. Sin TXT devuelve el estado de siempre (PENDING / DISABLED). */
export async function verifyDomain(
  token: string,
  id: string,
): Promise<{ status: TenantDomainState }> {
  return apiFetch<{ status: TenantDomainState }>(`/domains/${id}/verify`, {
    method: 'POST',
    token,
  });
}

/** Borrado lógico: deja de enrutar al momento y libera el host. 204 sin cuerpo. */
export async function deleteDomain(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/domains/${id}`, { method: 'DELETE', token });
}
