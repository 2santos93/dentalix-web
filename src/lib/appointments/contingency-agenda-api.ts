import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/** Estado de la copia nocturna de una sede (tipo del cliente generado). */
export type ContingencyNightly = components['schemas']['ContingencyNightlyInfoDto'];

export interface ContingencyPdf {
  blob: Blob;
  fileName: string;
}

/** CONTINGENCY_AGENDA_ROLES en la API (DX-339): recepción y gestión. */
export function canDownloadContingencyAgenda(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/** Nombre si la respuesta no trae uno (la API siempre lo manda). */
export function contingencyFallbackFileName(): string {
  return 'agenda-contingencia.pdf';
}

function base(locationId: string): string {
  return `/locations/${encodeURIComponent(locationId)}/contingency-agenda`;
}

async function pdf(token: string, path: string): Promise<ContingencyPdf> {
  const { blob, fileName } = await apiFetchBlob(path, { token });
  return { blob, fileName: fileName ?? contingencyFallbackFileName() };
}

/** `GET /locations/:id/contingency-agenda` — el PDF de hoy y mañana, generado ahora (auditado). */
export function downloadContingencyAgenda(token: string, locationId: string): Promise<ContingencyPdf> {
  return pdf(token, base(locationId));
}

/** `GET /locations/:id/contingency-agenda/nightly` — si hay copia nocturna y de qué día. */
export function getContingencyNightly(token: string, locationId: string): Promise<ContingencyNightly> {
  return apiFetch<ContingencyNightly>(`${base(locationId)}/nightly`, { token });
}

/** `GET /locations/:id/contingency-agenda/nightly/pdf` — la última copia nocturna (auditado). */
export function downloadContingencyNightly(token: string, locationId: string): Promise<ContingencyPdf> {
  return pdf(token, `${base(locationId)}/nightly/pdf`);
}
