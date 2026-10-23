import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { uploadImportFile } from './import-upload';

// DX-107: tipos del contrato generado (openapi-typescript).
export type ImportInspect = components['schemas']['PatientImportInspectDto'];
export type ImportBatch = components['schemas']['PatientImportBatchDto'];
export type ImportBatchDetail = components['schemas']['PatientImportBatchDetailDto'];
export type ImportBatchList = components['schemas']['PatientImportListDto'];
export type ImportIssue = components['schemas']['ImportIssueDto'];
export type ImportPreviewRow = components['schemas']['ImportPreviewRowDto'];
export type ImportStatus = components['schemas']['PatientImportStatus'];
export type DuplicateMode = components['schemas']['PatientImportDuplicateMode'];
export type DocType = components['schemas']['DocType'];
export type ColumnMapping = components['schemas']['ColumnMappingDto'];
export type ImportFieldKey = keyof ColumnMapping;

/** Igual que la API (PATIENT_IMPORT_ROLES): solo ADMIN. */
export function canImportPatients(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** Tope de la API: se comprueba antes de subir para no esperar al 413. */
export { MAX_IMPORT_BYTES } from './import-upload-routes';
export const IMPORT_ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const STATUS_LABELS: Record<ImportStatus, string> = {
  VALIDATED: 'Validado, sin importar',
  QUEUED: 'En cola',
  RUNNING: 'Importando',
  COMPLETED: 'Importado',
  FAILED: 'Con errores',
  UNDONE: 'Deshecho',
  EXPIRED: 'Caducado',
};

export const ISSUE_KIND_LABELS: Record<ImportIssue['kind'], string> = {
  ERROR: 'Error',
  DUPLICATE_FILE: 'Repetido en el archivo',
  DUPLICATE_EXISTING: 'Ya existe en la clínica',
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  CC: 'Cédula de ciudadanía (CC)',
  TI: 'Tarjeta de identidad (TI)',
  CE: 'Cédula de extranjería (CE)',
  PASSPORT: 'Pasaporte',
  OTHER: 'Otro',
};

/** ¿Sigue trabajando la cola? (la pantalla consulta el progreso). */
export function isInProgress(status: ImportStatus): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}

export function downloadTemplate(token: string): Promise<string> {
  return apiFetchText('/patient-imports/template', { token });
}

function fileForm(file: File, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('file', file);
  return form;
}

/** Paso 1: cabeceras, mapeo sugerido y primeras filas. No crea nada. */
export function inspectFile(
  token: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<ImportInspect> {
  return uploadImportFile<ImportInspect>('inspect', fileForm(file), { token, onProgress });
}

/** Paso 2: dry-run con el mapeo elegido. No escribe pacientes. */
export function validateImport(
  token: string,
  file: File,
  mapping: ColumnMapping,
  defaultDocType: DocType | null,
  onProgress?: (fraction: number) => void,
): Promise<ImportBatchDetail> {
  const fields: Record<string, string> = { mapping: JSON.stringify(mapping) };
  if (defaultDocType) fields.defaultDocType = defaultDocType;
  return uploadImportFile<ImportBatchDetail>('validate', fileForm(file, fields), { token, onProgress });
}

/** Paso 3: confirma; la importación corre en segundo plano. */
export function confirmImport(
  token: string,
  id: string,
  duplicateMode: DuplicateMode,
): Promise<ImportBatchDetail> {
  return apiFetch<ImportBatchDetail>(`/patient-imports/${id}/confirm`, {
    method: 'POST',
    body: { duplicateMode },
    token,
  });
}

export function getImport(token: string, id: string): Promise<ImportBatchDetail> {
  return apiFetch<ImportBatchDetail>(`/patient-imports/${id}`, { token });
}

export function listImports(token: string, page = 1): Promise<ImportBatchList> {
  return apiFetch<ImportBatchList>(`/patient-imports?page=${page}&pageSize=20`, { token });
}

export function downloadErrorsCsv(token: string, id: string): Promise<string> {
  return apiFetchText(`/patient-imports/${id}/errors.csv`, { token });
}

export function undoImport(token: string, id: string): Promise<ImportBatchDetail> {
  return apiFetch<ImportBatchDetail>(`/patient-imports/${id}/undo`, { method: 'POST', token });
}

/**
 * Guarda un CSV de la API con su BOM (Excel lo necesita para leer bien las
 * tildes; `fetch().text()` lo quita al decodificar).
 */
export function saveCsv(text: string, fileName: string): void {
  const withBom = text.startsWith('﻿') ? text : `﻿${text}`;
  const url = URL.createObjectURL(new Blob([withBom], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Nombre del informe de errores a partir del archivo subido. */
export function errorsFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'pacientes';
  return `errores-${base}.csv`;
}
