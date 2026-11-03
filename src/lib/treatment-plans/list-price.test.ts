import { FORMAT_DE, FORMAT_ES, FORMAT_US } from '@/lib/test/document-regional';
import { regionalFormat } from '@/lib/format/regional-format';
import {
  formatListPrice,
  listPriceInPlanCurrency,
  sedeListPriceFormat,
} from './list-price';

// `Intl` separa con espacios duros; se normalizan para leer.
const flat = (s: string) => s.replace(/\s/g, ' ');

describe('precio de lista en la moneda del catálogo (DX-489)', () => {
  describe('formatListPrice', () => {
    it('plan en EUR con catálogo en USD: el precio de lista lleva USD, nunca EUR', () => {
      const text = flat(formatListPrice(80000, 'USD', sedeListPriceFormat(FORMAT_ES.fmt)));
      expect(text).toBe('80.000,00 USD');
      expect(text).not.toContain('EUR');
    });

    it('sin moneda del catálogo conocida, la cifra sin moneda (nunca la del plan)', () => {
      expect(formatListPrice(80000, null, sedeListPriceFormat(FORMAT_ES.fmt))).toBe('80.000,00');
    });

    it('DX-354: el presupuesto impreso imprime con moneyWithCode, no con formatCurrency', () => {
      expect(flat(formatListPrice(80000, 'USD', sedeListPriceFormat(FORMAT_US.fmt)))).toBe('USD 80,000.00');
      expect(flat(formatListPrice(80000, 'USD', sedeListPriceFormat(FORMAT_DE.fmt)))).toBe('80.000,00 USD');
    });

    it('con el formato de la sede: su orden y separadores y el código ISO del catálogo', () => {
      const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
      expect(flat(formatListPrice(80000, 'USD', sedeListPriceFormat(fmt)))).toBe('USD 80.000,00');
      expect(formatListPrice(80000, null, sedeListPriceFormat(fmt))).toBe('80.000,00');
    });

    it('sin formato de sede todavía, «—» como el resto de importes de la sede', () => {
      expect(formatListPrice(80000, 'USD', sedeListPriceFormat(null))).toBe('—');
      expect(formatListPrice(80000, null, sedeListPriceFormat(null))).toBe('—');
    });
  });

  describe('listPriceInPlanCurrency', () => {
    it('solo cuando el catálogo está en la moneda del plan', () => {
      expect(listPriceInPlanCurrency('USD', 'USD')).toBe(true);
      expect(listPriceInPlanCurrency('USD', 'EUR')).toBe(false);
      expect(listPriceInPlanCurrency(null, 'EUR')).toBe(false);
    });
  });
});
