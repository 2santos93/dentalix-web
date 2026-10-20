/**
 * Arranca la descarga de una URL firmada con `Content-Disposition: attachment`:
 * el navegador la guarda sin salir de la página. Aparte para poder simularla
 * en los tests (jsdom no navega).
 */
export function startDownload(url: string): void {
  window.location.assign(url);
}
