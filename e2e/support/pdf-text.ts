import { inflateSync } from 'node:zlib';

/**
 * Texto que pinta un PDF de pdfkit (DX-534): pdfkit comprime cada flujo con
 * Flate y escribe el texto de las fuentes estándar en hex de WinAnsi dentro de
 * operadores `TJ`.
 *
 * pdfkit escribe `stream\n<datos>\nendstream`: el único separador antes de
 * `endstream` es UN `\n`. La versión anterior aceptaba `\r?\n` y, cuando el
 * último byte de los datos (el final del checksum Adler-32) era 0x0D, se lo
 * comía; zlib rechaza un flujo truncado («unexpected end of file»), el flujo
 * se saltaba en silencio y el texto salía vacío (~1 de cada 256 PDF).
 */
export function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const lines: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue; // un flujo que no es Flate (no lleva texto)
    }
    for (const op of content.matchAll(/\[([^\]]*)\] TJ/g)) {
      lines.push(
        [...op[1].matchAll(/<([0-9a-f]*)>/gi)]
          .map((hex) => Buffer.from(hex[1], 'hex').toString('latin1').replace(/\x96/g, '–'))
          .join(''),
      );
    }
  }
  return lines.join('\n');
}
