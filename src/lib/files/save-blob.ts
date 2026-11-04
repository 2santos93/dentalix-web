/** Cuánto vive la URL temporal tras el clic (ms). */
export const BLOB_URL_LIFETIME_MS = 10_000;

/**
 * Descarga un fichero ya generado (un PDF de la API, un CSV) con un enlace
 * temporal al `Blob`. Única copia en la web.
 *
 * DX-181 (FE-050): la URL se suelta EN DIFERIDO, no en el mismo tick del clic:
 * Safari/WebKit (y Firefox con ficheros grandes) empiezan a leer el blob de
 * forma asíncrona y, si ya se revocó, la descarga falla o baja vacía. 10 s
 * sobra para arrancar la lectura y la memoria que retiene es la de un blob.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS);
}
