import { formatAmount, formatCurrency } from '@/lib/format/currency';
import { regionalFormat } from '@/lib/format/regional-format';
import {
  PRINTED_LIST_PRICE_FORMAT,
  formatListPrice,
  listPriceInPlanCurrency,
  sedeListPriceFormat,
} from './list-price';

// `Intl` separa con espacios duros; se normalizan para leer.
const flat = (s: string) => s.replace(/\s/g, ' ');

describe('precio de lista en la moneda del catálogo (DX-489)', () => {
  describe('formatListPrice', () => {
    it('plan en EUR con catálogo en USD: el precio de lista lleva USD, nunca EUR', () => {
      const text = flat(formatListPrice(80000, 'USD', PRINTED_LIST_PRICE_FORMAT));
      expect(text).toBe(flat(formatCurrency(80000, 'USD')));
      expect(text).toContain('USD');
      expect(text).not.toContain('EUR');
    });

    it('sin moneda del catálogo conocida, la cifra sin moneda (nunca la del plan)', () => {
      expect(formatListPrice(80000, null, PRINTED_LIST_PRICE_FORMAT)).toBe(formatAmount(80000));
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
