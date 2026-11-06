import { FORMAT_DE, FORMAT_ES, FORMAT_US } from '@/lib/test/document-regional';
import { regionalFormat } from '@/lib/format/regional-format';
import {
  formatListPrice,
  listPriceHiddenNote,
  listPriceInPlanCurrency,
  listPriceNote,
  listPricesCurrency,
  listPricesInPlanCurrency,
  sedeListPriceFormat,
} from './list-price';

// `Intl` separa con espacios duros; se normalizan para leer.
const flat = (s: string | null) => (s ?? '').replace(/\s/g, ' ');

describe('precio de lista en la moneda del catálogo (DX-489)', () => {
  describe('formatListPrice', () => {
    it('plan en EUR con catálogo en USD: el precio de lista lleva USD, nunca EUR', () => {
      const text = flat(formatListPrice(80000, 'USD', sedeListPriceFormat(FORMAT_ES.fmt)));
      expect(text).toBe('80.000,00 USD');
      expect(text).not.toContain('EUR');
    });

    it('DX-502: sin moneda del catálogo conocida, no hay cifra (null): ni sin moneda ni con la del plan', () => {
      expect(formatListPrice(80000, null, sedeListPriceFormat(FORMAT_ES.fmt))).toBeNull();
      expect(formatListPrice(80000, null, sedeListPriceFormat(regionalFormat({ locale: 'es-VE', hourCycle: 'h12' })))).toBeNull();
      expect(formatListPrice(80000, null, sedeListPriceFormat(null))).toBeNull();
    });

    it('DX-354: el presupuesto impreso imprime con moneyWithCode, no con formatCurrency', () => {
      expect(flat(formatListPrice(80000, 'USD', sedeListPriceFormat(FORMAT_US.fmt)))).toBe('USD 80,000.00');
      expect(flat(formatListPrice(80000, 'USD', sedeListPriceFormat(FORMAT_DE.fmt)))).toBe('80.000,00 USD');
    });

    it('con el formato de la sede: su orden y separadores y el código ISO del catálogo', () => {
      const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
      expect(flat(formatListPrice(80000, 'USD', sedeListPriceFormat(fmt)))).toBe('USD 80.000,00');
      expect(flat(formatListPrice(80000, 'VES', sedeListPriceFormat(fmt)))).toBe('VES 80.000,00');
    });

    it('sin formato de sede todavía, «—» como el resto de importes de la sede', () => {
      expect(formatListPrice(80000, 'USD', sedeListPriceFormat(null))).toBe('—');
    });
  });

  describe('listPriceInPlanCurrency', () => {
    it('solo cuando el catálogo está en la moneda del plan', () => {
      expect(listPriceInPlanCurrency('USD', 'USD')).toBe(true);
      expect(listPriceInPlanCurrency('USD', 'EUR')).toBe(false);
      expect(listPriceInPlanCurrency(null, 'EUR')).toBe(false);
    });
  });

  describe('varios precios de lista con su moneda congelada (DX-502)', () => {
    it('listPricesCurrency: la moneda común de los precios de lista, o null si no la hay', () => {
      expect(listPricesCurrency(['VES', 'VES'])).toBe('VES');
      expect(listPricesCurrency(['VES', 'USD'])).toBeNull();
      expect(listPricesCurrency(['VES', null])).toBeNull();
      expect(listPricesCurrency([])).toBeNull();
    });

    it('listPricesInPlanCurrency: solo si TODOS están en la moneda del plan (sin precios, también)', () => {
      expect(listPricesInPlanCurrency(['EUR', 'EUR'], 'EUR')).toBe(true);
      expect(listPricesInPlanCurrency(['EUR', 'VES'], 'EUR')).toBe(false);
      expect(listPricesInPlanCurrency([null], 'EUR')).toBe(false);
      expect(listPricesInPlanCurrency([], 'EUR')).toBe(true);
    });

    it('listPriceNote: la nota de los precios de lista que se ven en otra moneda', () => {
      expect(listPriceNote('VES', 'EUR')).toBe(
        'El precio de lista es el del catálogo de la clínica, en VES: es de referencia y no se convierte a EUR.',
      );
      expect(listPriceNote(null, 'EUR')).toBe(
        'El precio de lista es el del catálogo de la clínica, en su moneda: es de referencia y no se convierte a EUR.',
      );
    });

    it('listPriceHiddenNote: por qué no se ve el precio de lista cuando su moneda no se sabe', () => {
      expect(listPriceHiddenNote('EUR')).toBe(
        'El precio de lista del catálogo de la clínica no se muestra: no se sabe en qué moneda está y no se convierte a EUR.',
      );
    });
  });
});
