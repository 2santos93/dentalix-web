const BOM = '﻿';

export interface SaveCsvOptions {
  /**
   * Antepone el BOM si no lo trae: Excel lo necesita para leer bien las
   * tildes, y `fetch().text()` lo quita al decodificar la respuesta de la API.
   */
  bom?: boolean;
}

/**
 * Descarga un CSV ya generado (la API lo construye) como fichero, con un
 * enlace temporal al `Blob`. Única copia en la web: antes vivía repetida en
 * cada pantalla con exportación.
 */
export function saveCsv(text: string, fileName: string, opts: SaveCsvOptions = {}): void {
  const content = opts.bom && !text.startsWith(BOM) ? `${BOM}${text}` : text;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
