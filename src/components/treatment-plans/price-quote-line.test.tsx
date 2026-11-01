import { PRINTED_LIST_PRICE_FORMAT, formatListPrice } from '@/lib/treatment-plans/list-price';
import { itemPriceOriginText, priceSourceText } from './price-quote-line';

/** Catálogo en la moneda del plan (COP). */
const cop = (v: number) => formatListPrice(v, 'COP', PRINTED_LIST_PRICE_FORMAT);

const quote = {
  source: 'AGREEMENT_PERCENT' as const,
  agreementName: 'Seguros Sol',
  basePrice: 50000,
  price: 40000,
};

// `Intl` separa con espacios duros; se normalizan para leer.
const flat = (s: string | null) => (s ?? '').replace(/\s/g, ' ');

describe('origen del precio (DX-105)', () => {
  it('convenio: etiqueta, convenio y precio de lista cuando difiere', () => {
    expect(flat(priceSourceText(quote, cop))).toMatch(/^Convenio · Seguros Sol · precio de lista .*50\.000/);
  });

  it('lista de precios de la sede', () => {
    expect(flat(priceSourceText({ ...quote, source: 'PRICE_LIST', agreementName: null }, cop))).toMatch(
      /^Lista de precios de la sede · precio de lista /,
    );
  });

  it('catálogo con el mismo precio no añade precio de lista', () => {
    expect(
      priceSourceText({ source: 'CATALOG', agreementName: null, basePrice: 50000, price: 50000 }, cop),
    ).toBe('Precio de catálogo');
  });

  it('el nombre del convenio solo sale en un origen de convenio', () => {
    expect(
      priceSourceText({ source: 'CATALOG', agreementName: 'X', basePrice: null, price: 10 }, cop),
    ).toBe('Precio de catálogo');
  });

  describe('ítem agregado', () => {
    const base = { priceSource: null, agreementName: null, basePrice: null, catalogPrice: null };
    it('convenio: «Convenio X · precio de lista …»', () => {
      expect(
        flat(
          itemPriceOriginText(
            { ...base, priceSource: 'AGREEMENT_PRICE_LIST', agreementName: 'Seguros Sol', basePrice: 50000, catalogPrice: 40000 },
            cop,
          ),
        ),
      ).toMatch(/^Convenio Seguros Sol · precio de lista .*50\.000/);
    });
    it('lista de la sede solo si el precio de lista difiere', () => {
      expect(
        itemPriceOriginText({ ...base, priceSource: 'PRICE_LIST', basePrice: 50000, catalogPrice: 50000 }, cop),
      ).toBeNull();
      expect(
        flat(itemPriceOriginText({ ...base, priceSource: 'PRICE_LIST', basePrice: 50000, catalogPrice: 45000 }, cop)),
      ).toMatch(/^Lista de precios de la sede · precio de lista /);
    });
    it('catálogo o ítem anterior: nada', () => {
      expect(itemPriceOriginText({ ...base, priceSource: 'CATALOG', basePrice: 5, catalogPrice: 5 }, cop)).toBeNull();
      expect(itemPriceOriginText(base, cop)).toBeNull();
    });
  });

  describe('DX-489: plan en EUR con catálogo en COP', () => {
    const cat = (v: number) => formatListPrice(v, 'COP', PRINTED_LIST_PRICE_FORMAT);
    it('el formulario pinta el precio de lista en COP, nunca en EUR', () => {
      const text = flat(priceSourceText(quote, cat));
      expect(text).toMatch(/precio de lista 50\.000,00 COP$/);
      expect(text).not.toContain('EUR');
    });
    it('el ítem agregado también', () => {
      const text = flat(
        itemPriceOriginText(
          { priceSource: 'AGREEMENT_PRICE_LIST', agreementName: 'Seguros Sol', basePrice: 50000, catalogPrice: 40 },
          cat,
        ),
      );
      expect(text).toBe('Convenio Seguros Sol · precio de lista 50.000,00 COP');
    });
  });

  describe('DX-502: moneda del catálogo desconocida', () => {
    const unknown = (v: number) => formatListPrice(v, null, PRINTED_LIST_PRICE_FORMAT);
    it('el formulario oculta la cifra y lo dice', () => {
      const text = flat(priceSourceText(quote, unknown));
      expect(text).toBe('Convenio · Seguros Sol · precio de lista oculto: moneda del catálogo desconocida');
      expect(text).not.toMatch(/50\.000/);
    });
    it('el ítem agregado también', () => {
      const text = flat(
        itemPriceOriginText(
          { priceSource: 'AGREEMENT_PRICE_LIST', agreementName: 'Seguros Sol', basePrice: 50000, catalogPrice: 40 },
          unknown,
        ),
      );
      expect(text).toBe('Convenio Seguros Sol · precio de lista oculto: moneda del catálogo desconocida');
    });
  });
});
