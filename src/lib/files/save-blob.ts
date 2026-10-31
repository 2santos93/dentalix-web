/**
 * Descarga un fichero ya generado (un PDF de la API, un CSV) con un enlace
 * temporal al `Blob`, y suelta la URL al terminar. Única copia en la web.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
