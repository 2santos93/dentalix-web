import { regionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode, NO_SEDE_FORMAT, sedeCivilDate, sedeMoney, sedeNumber } from './sede-number';

describe('sedeNumber (G1-B)', () => {
  it('separa los miles con el formato de la sede, o «—» sin él', () => {
    expect(sedeNumber(1234, regionalFormat({ locale: 'en-US', hourCycle: 'h12' }))).toBe('1,234');
    expect(sedeNumber(1234, regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }))).toBe('1.234');
    expect(sedeNumber(1234, null)).toBe(NO_SEDE_FORMAT);
    expect(NO_SEDE_FORMAT).toBe('—');
  });
});

describe('sedeMoney / sedeCivilDate (DX-378)', () => {
  const us = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
  it('con el formato de la sede, o «—» sin él', () => {
    expect(sedeMoney(1234.5, 'USD', us)).toBe('USD\u00a01,234.50');
    expect(sedeMoney(1234.5, 'USD', null)).toBe(NO_SEDE_FORMAT);
    expect(sedeCivilDate('2026-10-31', us)).toBe('10/31/2026');
    expect(sedeCivilDate('2026-10-31', null)).toBe(NO_SEDE_FORMAT);
  });
});

describe('moneyWithCode (DX-378: producto bimonetario)', () => {
  const co = regionalFormat({ locale: 'es-CO', hourCycle: 'h12' });
  const ve = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
  const es = regionalFormat({ locale: 'es', hourCycle: 'h23' });
  const us = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
  const plain = (text: string) => text.replace(/\u00a0/g, ' ');

  it('siempre el código ISO, nunca «$» ni «US$» ni «Bs.S»: separadores de la sede', () => {
    expect(plain(moneyWithCode(2195000, 'COP', co))).toBe('COP 2.195.000,00');
    expect(plain(moneyWithCode(2195000, 'USD', co))).toBe('USD 2.195.000,00');
    expect(plain(moneyWithCode(2195000, 'VES', ve))).toBe('VES 2.195.000,00');
    expect(plain(moneyWithCode(2195000, 'COP', es))).toBe('2.195.000,00 COP');
    expect(plain(moneyWithCode(2195000.5, 'COP', us))).toBe('COP 2,195,000.50');
    for (const fmt of [co, ve, es, us]) expect(moneyWithCode(10, 'USD', fmt)).not.toMatch(/\$/);
  });

  it('mismos decimales que formatCurrency: sin decimales solo en una moneda sin unidad menor con importe entero', () => {
    expect(plain(moneyWithCode(1234, 'JPY', us))).toBe('JPY 1,234');
    expect(plain(moneyWithCode(1234.5, 'JPY', us))).toBe('JPY 1,234.50');
  });

  it('un código mal formado no rompe la pantalla', () => {
    expect(moneyWithCode(1234.5, 'US', us)).toBe('US 1,234.50');
  });
});
