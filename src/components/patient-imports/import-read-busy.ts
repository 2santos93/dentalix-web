/**
 * SEC-046: la API lee como mucho 2 archivos de importación a la vez (1 por
 * clínica) y, sin plaza, responde 503 con `Retry-After`. `apiErrorMessage`
 * nunca enseña el texto de un 5xx, así que la pantalla trae el suyo.
 */
export const IMPORT_READ_BUSY_MESSAGE =
  "Hay otra lectura de archivo en curso; vuelve a intentarlo en unos segundos.";

/** `byStatus` de `apiErrorMessage` para las llamadas que suben un archivo. */
export const IMPORT_READ_BY_STATUS = { 503: IMPORT_READ_BUSY_MESSAGE };
