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

/** Tope de la API para el archivo (MAX_IMPORT_BYTES de dentalix-api): 5 MB. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
