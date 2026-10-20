import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
 * Guardián de DX-241 (corre en CI con el resto de jest): ningún componente lee
 * el texto de un campo de importe con `Number(…)`/`parseFloat(…)`/`parseInt(…)` — cada uno
 * lo interpretaba a su manera y «150.50» acababa en 15 050. El texto de un
 * campo de dinero se lee con `parseMoneyInput` (`@/lib/format/money`) y se
 * escribe con `<MoneyInput>`.
 *
 * Detecta la conversión por el nombre de lo que se convierte: los textos de
 * importe de la app se llaman así (amount, price, discount, total, pie…).
 */
const SCANNED = [join(process.cwd(), 'src', 'components'), join(process.cwd(), 'src', 'app')];
const MONEY_NAME = /amount|price|discount|total|downpayment|\bpie\b|counted|balance|importe|monto|fondo/i;
const NUMERIC_CALL = /\b(?:Number|parseFloat|parseInt)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
/** Un parser propio de importes: `parseAmount`, `toPrice`, `readTotal`… */
const MONEY_PARSER = /^(?:export\s+)?(?:async\s+)?function\s+((?:parse|read|to|normalize)\w*)\s*\(|^(?:export\s+)?const\s+((?:parse|read|to|normalize)\w*)\s*=/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Rangos [inicio, fin) de los parsers de nivel superior con nombre de dinero. */
function moneyParserRanges(source: string): [number, number][] {
  const ranges: [number, number][] = [];
  let offset = 0;
  let open: number | null = null;
  for (const line of source.split('\n')) {
    const start = line.match(MONEY_PARSER);
    if (open === null && start && MONEY_NAME.test(start[1] ?? start[2])) open = offset;
    else if (open !== null && /^\}/.test(line)) {
      ranges.push([open, offset + line.length]);
      open = null;
    }
    offset += line.length + 1;
  }
  return ranges;
}

/**
 * Las conversiones numéricas de un texto de importe: por lo que se convierte
 * (`Number(form.amount)`), por dónde va a parar (`setPrice(Number(…))`,
 * `const amount = Number(…)`) o por estar dentro de un parser de dinero propio
 * (`function parseAmount(…) { … Number(normalized) … }`).
 */
function moneyNumberCalls(source: string): string[] {
  const parsers = moneyParserRanges(source);
  return [...source.matchAll(NUMERIC_CALL)]
    .filter((m) => {
      const at = m.index ?? 0;
      const linePrefix = source.slice(source.lastIndexOf('\n', at - 1) + 1, at);
      return (
        MONEY_NAME.test(m[0]) ||
        MONEY_NAME.test(linePrefix) ||
        parsers.some(([from, to]) => at >= from && at < to)
      );
    })
    .map((m) => m[0]);
}

/** La etiqueta JSX completa que empieza en `start` (respeta `{…}` y comillas). */
function jsxTag(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** Campos `type="number"` cuyo id, valor o manejador hablan de dinero. */
function moneyNumberInputs(source: string): string[] {
  return [...source.matchAll(/<(?:Input|input)\b/g)]
    .map((m) => jsxTag(source, m.index ?? 0))
    .filter((tag) => /\btype=(?:"number"|\{'number'\})/.test(tag) && MONEY_NAME.test(tag))
    .map((tag) => tag.replace(/\s+/g, ' '));
}

describe('DX-241: sin Number( sobre el texto de un campo de importe', () => {
  it('el detector reconoce los patrones que había', () => {
    expect(moneyNumberCalls("const amount = Number(form.amount.trim());")).toHaveLength(1);
    expect(moneyNumberCalls("Number(trimmedPrice)")).toHaveLength(1);
    expect(moneyNumberCalls("Number(form.downPayment || '0')")).toHaveLength(1);
    expect(moneyNumberCalls('Number(form.installmentsCount)')).toEqual([]);
    expect(moneyNumberCalls('Number(e.target.value)')).toEqual([]);
    // Revisión DX-241: también parseInt y las formas `Number.parse…`, y en
    // varias líneas.
    expect(moneyNumberCalls('parseInt(amountText, 10)')).toHaveLength(1);
    expect(moneyNumberCalls('Number.parseFloat(form.price)')).toHaveLength(1);
    expect(moneyNumberCalls('Number(\n  totalText.trim(),\n)')).toHaveLength(1);
    // Lo que no es dinero no salta (minutos, cuotas, días).
    expect(moneyNumberCalls('Number(duration)')).toEqual([]);
    expect(moneyNumberCalls("Number(day.date.slice(8, 10))")).toEqual([]);
  });

  it('también caza la conversión cuando el nombre de dinero está a la izquierda o en el parser propio', () => {
    // Revisión DX-241 (2.ª pasada): el bug ×100 de «Compromiso de pago» vivía en
    // un `parseAmount(text)` con `Number(normalized)` dentro, que el detector
    // por argumento no veía.
    expect(moneyNumberCalls('onChange={(e) => setPrice(Number(e.target.value))}')).toHaveLength(1);
    expect(moneyNumberCalls('const amountValue = Number(text);')).toHaveLength(1);
    expect(moneyNumberCalls('patch({ downPayment: parseFloat(e.target.value) })')).toHaveLength(1);
    expect(
      moneyNumberCalls(
        [
          'function parseAmount(text: string): number | null {',
          "  const normalized = text.replace(/\\./g, '').replace(',', '.').trim();",
          '  const value = Number(normalized);',
          '  return Number.isFinite(value) ? value : null;',
          '}',
        ].join('\n'),
      ),
    ).toHaveLength(1);
    // Un parser que no es de dinero, aunque esté al lado, no salta.
    expect(
      moneyNumberCalls(['function parseMm(text: string) {', '  const value = Number(text);', '  return value;', '}'].join('\n')),
    ).toEqual([]);
    expect(moneyNumberCalls('const count = Number(form.installmentsCount);')).toEqual([]);
  });

  it('caza un <Input type="number"> de dinero (descarta la coma de un teclado en español)', () => {
    expect(
      moneyNumberInputs('<Input id="rp-amount" type="number" step="0.01" onChange={(e) => patch({ amount: e.target.value })} />'),
    ).toHaveLength(1);
    expect(moneyNumberInputs('<input\n  type="number"\n  value={price}\n  onChange={(e) => setPrice(e.target.value)}\n/>')).toHaveLength(1);
    expect(moneyNumberInputs('<Input id="edit-min" type="number" step="0.001" value={eMinStock} />')).toEqual([]);
    expect(moneyNumberInputs('<Input id="pp-total" value={total} onChange={(e) => setTotal(e.target.value)} />')).toEqual([]);
  });

  it('ningún componente de src/components (ni página de src/app) lo hace', () => {
    const offenders = SCANNED.flatMap(sources).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...moneyNumberCalls(source), ...moneyNumberInputs(source)].map(
        (hit) => `${relative(process.cwd(), file)}: ${hit}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});
