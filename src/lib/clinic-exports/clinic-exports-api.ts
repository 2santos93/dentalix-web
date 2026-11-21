import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-053: exportación de los datos de la clínica (ZIP de CSV) desde Ajustes.
// Los tipos salen del contrato generado.
type Schemas = components['schemas'];

export type ClinicExport = Schemas['ClinicExportDto'];
export type ClinicExportState = Schemas['ClinicExportState'];
export type ClinicExportDownload = Schemas['ClinicExportDownloadDto'];

/** Pedir, ver y descargar: solo ADMIN (como la API). */
export function canExportClinicData(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** En cola o generándose: la pantalla vuelve a preguntar hasta que termine. */
export function isExportInProgress(e: Pick<ClinicExport, 'state'>): boolean {
  return e.state === 'PENDING' || e.state === 'RUNNING';
}

/** Las 20 últimas, las más recientes primero. */
export function listClinicExports(token: string): Promise<ClinicExport[]> {
  return apiFetch<ClinicExport[]>('/clinic-exports', { token });
}

/** 409 si ya hay una en curso. */
export function requestClinicExport(token: string): Promise<ClinicExport> {
  return apiFetch<ClinicExport>('/clinic-exports', { method: 'POST', token });
}

/**
 * Consume el enlace de un solo uso y devuelve una URL firmada de 60 s. 410 si
 * ya se descargó o caducó; 409 si aún no está lista.
 */
export function downloadClinicExport(token: string, id: string): Promise<ClinicExportDownload> {
  return apiFetch<ClinicExportDownload>(`/clinic-exports/${encodeURIComponent(id)}/download`, {
    method: 'POST',
    token,
  });
}

/**
 * Un decimal con coma: no es dinero, así que no pasa por @/lib/money/round
 * (y sin toFixed, que la guarda DX-488-bis trata como redondeo de importes).
 */
const FILE_SIZE_NUMBER = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** «2,4 MB»: tamaño de un fichero (no es dinero ni una fecha). */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${FILE_SIZE_NUMBER.format(value)} ${units[unit]}`;
}
