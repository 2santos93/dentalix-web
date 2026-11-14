import { moneyWithCode } from './sede-number';
import { regionalFormat, type HourCycle } from './regional-format';
// Copia byte a byte de `src/shared/format/receipt-format.cases.json` de la API: no se edita aquí.
// La fuente es la API; `scripts/check-api-reference-sync.mjs` (CI) falla si
// divergen. Generado con Node 24.1 / ICU 77.1 (DX-521, PF10): un vector que
// cambie con otra versión de ICU se corrige en la API y se vuelve a copiar.
import cases from './receipt-format.cases.json';

interface Case {
  locale: string;
  hourCycle: HourCycle;
  op: string;
  args: unknown[];
  expected: string;
}

/** DX-521: los mismos vectores que la API, byte a byte, para el papel y el email. */
describe('recibo con el formato y la zona de su sede (vectores compartidos con la API)', () => {
  it('los vectores cubren las cuatro operaciones del recibo', () => {
    expect(new Set((cases as Case[]).map((c) => c.op))).toEqual(
      new Set(['moneyWithCode', 'dateTime', 'date', 'civilDate']),
    );
  });

  it.each((cases as Case[]).map((c) => [`${c.locale} ${c.hourCycle} ${c.op}(${JSON.stringify(c.args)})`, c] as const))(
    '%s',
    (_name, c) => {
      const fmt = regionalFormat({ locale: c.locale, hourCycle: c.hourCycle });
      switch (c.op) {
        case 'moneyWithCode': {
          const [amount, currency, texts] = c.args as [number, string, Record<string, string>];
          expect(moneyWithCode(amount, currency, fmt, texts)).toBe(c.expected);
          break;
        }
        case 'dateTime':
          expect(fmt.dateTime(new Date(c.args[0] as string), c.args[1] as string)).toBe(c.expected);
          break;
        case 'date':
          expect(fmt.date(new Date(c.args[0] as string), c.args[1] as string)).toBe(c.expected);
          break;
        case 'civilDate':
          expect(fmt.civilDate(c.args[0] as string)).toBe(c.expected);
          break;
        default:
          throw new Error(`Operación sin probar: ${c.op}`);
      }
    },
  );
});
