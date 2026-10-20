import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
 * Guardián de DX-241 (corre en CI con el resto de jest): ningún componente lee
 * el texto de un campo de importe con `Number(…)`/`parseFloat(…)` — cada uno
 * lo interpretaba a su manera y «150.50» acababa en 15 050. El texto de un
 * campo de dinero se lee con `parseMoneyInput` (`@/lib/format/money`) y se
 * escribe con `<MoneyInput>`.
 *
 * Detecta la conversión por el nombre de lo que se convierte: los textos de
 * importe de la app se llaman así (amount, price, discount, total, pie…).
 */
const COMPONENTS = join(process.cwd(), 'src', 'components');
const MONEY_NAME = /amount|price|discount|total|downpayment|\bpie\b|counted|balance|importe|monto|fondo/i;
const NUMERIC_CALL = /\b(?:Number|parseFloat)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function moneyNumberCalls(source: string): string[] {
  return [...source.matchAll(NUMERIC_CALL)].map((m) => m[0]).filter((call) => MONEY_NAME.test(call));
}

describe('DX-241: sin Number( sobre el texto de un campo de importe', () => {
  it('el detector reconoce los patrones que había', () => {
    expect(moneyNumberCalls("const amount = Number(form.amount.trim());")).toHaveLength(1);
    expect(moneyNumberCalls("Number(trimmedPrice)")).toHaveLength(1);
    expect(moneyNumberCalls("Number(form.downPayment || '0')")).toHaveLength(1);
    expect(moneyNumberCalls('Number(form.installmentsCount)')).toEqual([]);
    expect(moneyNumberCalls('Number(e.target.value)')).toEqual([]);
  });

  it('ningún componente de src/components lo hace', () => {
    const offenders = sources(COMPONENTS).flatMap((file) =>
      moneyNumberCalls(readFileSync(file, 'utf8')).map((call) => `${relative(process.cwd(), file)}: ${call}`),
    );
    expect(offenders).toEqual([]);
  });
});
