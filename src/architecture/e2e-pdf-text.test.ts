import { deflateSync, inflateSync } from 'node:zlib';
import { pdfText } from '../../e2e/support/pdf-text';

/**
 * DX-534: la e2e de la agenda de contingencia falló una vez con «PDF sin texto».
 * pdfkit escribe `stream\n<datos>\nendstream`; si el último byte del flujo Flate
 * (fin del Adler-32) es 0x0D, el extractor antiguo (`\r?\nendstream`) se lo comía,
 * zlib decía «unexpected end of file» y el flujo se saltaba: texto vacío.
 */
const hex = (s: string) => Buffer.from(s, 'latin1').toString('hex');

/** Contenido de página como lo pinta pdfkit, con un relleno que fija el último byte del flujo. */
function content(name: string, salt: number): string {
  return `BT\n/F1 9 Tf\n[<${hex(name)}>] TJ\nET\n% ${salt}\n`;
}

function pdfWith(stream: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-1.3\n4 0 obj\n<< /Length 1 /Filter /FlateDecode >>\nstream\n', 'latin1'),
    stream,
    Buffer.from('\nendstream\nendobj\ntrailer\n%%EOF\n', 'latin1'),
  ]);
}

function flateEndingWith(lastByte: number, name: string): Buffer {
  for (let salt = 0; salt < 100_000; salt++) {
    const z = deflateSync(Buffer.from(content(name, salt), 'latin1'));
    if (z[z.length - 1] === lastByte) return z;
  }
  throw new Error(`no hay un flujo que acabe en 0x${lastByte.toString(16)}`);
}

describe('pdfText (extractor de las e2e de PDF)', () => {
  const name = 'Sara Viene12345678';

  it('lee el texto de un flujo Flate cuyo último byte es 0x0D (el caso que fallaba)', () => {
    const z = flateEndingWith(0x0d, name);
    // Es el caso real: el extractor antiguo dejaba el flujo truncado y zlib lo rechaza.
    expect(() => inflateSync(z.subarray(0, -1))).toThrow(/unexpected end of file/);
    expect(pdfText(pdfWith(z))).toContain(name);
  });

  it('lee el texto de un flujo cuyo último byte es 0x0A', () => {
    expect(pdfText(pdfWith(flateEndingWith(0x0a, name)))).toContain(name);
  });

  it('lee el texto de un flujo cualquiera y hex en mayúsculas', () => {
    const z = deflateSync(Buffer.from(`BT\n[<${hex('Rita').toUpperCase()}> -20 <${hex(' Díaz')}>] TJ\nET`, 'latin1'));
    expect(pdfText(pdfWith(z))).toContain('Rita Díaz');
  });

  it('ignora los flujos que no son Flate', () => {
    expect(pdfText(pdfWith(Buffer.from('no es zlib')))).toBe('');
  });
});
