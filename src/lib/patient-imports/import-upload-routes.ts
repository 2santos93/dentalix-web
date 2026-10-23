/**
 * Rutas de la subida del archivo de la importación de pacientes (DX-107),
 * compartidas por el navegador (`import-upload.ts`) y la web
 * (`import-upload-proxy.ts`, en `src/app/api/import-upload/*`).
 *
 * DX-259 dejó el proxy `/api/v1` en 1 MB (`API_PROXY_MAX_BODY_BYTES`) y la
 * importación sube hasta 5 MB, así que el multipart NO va por `/api/v1`: va a
 * una ruta propia de la web, fuera del rewrite y del `proxy.ts`, que lo pasa a
 * la API en streaming (Next no copia ese cuerpo en memoria).
 */
export const IMPORT_UPLOAD_ROUTES = {
  /** Paso 1: cabeceras, mapeo sugerido y primeras filas. */
  inspect: { web: '/api/import-upload/inspect', api: '/patient-imports/inspect' },
  /** Paso 2: dry-run con el mapeo elegido. */
  validate: { web: '/api/import-upload/validate', api: '/patient-imports' },
} as const;

export type ImportUploadStep = keyof typeof IMPORT_UPLOAD_ROUTES;

/**
 * Qué se sube: un paso del asistente o la hoja de saldos («Saldo migrado»,
 * DX-262) de un lote validado (`/api/import-upload/balances/:id` →
 * `POST /patient-imports/:id/balances`).
 */
export type ImportUploadTarget = ImportUploadStep | { balancesOf: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El id del lote, solo si es un UUID (nunca un trozo de ruta). */
export function balancesBatchId(target: ImportUploadTarget): string | null {
  if (typeof target === 'string') return null;
  return UUID.test(target.balancesOf) ? target.balancesOf : null;
}

/** Ruta de la web (navegador) y de la API para lo que se sube. */
export function importUploadPaths(target: ImportUploadTarget): { web: string; api: string } | null {
  if (typeof target === 'string') return IMPORT_UPLOAD_ROUTES[target];
  const id = balancesBatchId(target);
  if (id === null) return null;
  return { web: `/api/import-upload/balances/${id}`, api: `/patient-imports/${id}/balances` };
}

/** Tope de la API para el archivo (MAX_IMPORT_BYTES de dentalix-api): 5 MB. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
