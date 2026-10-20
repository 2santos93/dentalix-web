import { itemPriceOriginText, priceSourceText } from './price-quote-line';

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
    expect(flat(priceSourceText(quote, 'COP'))).toMatch(/^Convenio · Seguros Sol · precio de lista .*50\.000/);
  });

  it('lista de precios de la sede', () => {
    expect(flat(priceSourceText({ ...quote, source: 'PRICE_LIST', agreementName: null }, 'COP'))).toMatch(
      /^Lista de precios de la sede · precio de lista /,
    );
  });

  it('catálogo con el mismo precio no añade precio de lista', () => {
    expect(
      priceSourceText({ source: 'CATALOG', agreementName: null, basePrice: 50000, price: 50000 }, 'COP'),
    ).toBe('Precio de catálogo');
  });

  it('el nombre del convenio solo sale en un origen de convenio', () => {
    expect(
      priceSourceText({ source: 'CATALOG', agreementName: 'X', basePrice: null, price: 10 }, 'COP'),
    ).toBe('Precio de catálogo');
  });

  describe('ítem agregado', () => {
    const base = { priceSource: null, agreementName: null, basePrice: null, catalogPrice: null };
    it('convenio: «Convenio X · precio de lista …»', () => {
      expect(
        flat(
          itemPriceOriginText(
            { ...base, priceSource: 'AGREEMENT_PRICE_LIST', agreementName: 'Seguros Sol', basePrice: 50000, catalogPrice: 40000 },
            'COP',
          ),
        ),
      ).toMatch(/^Convenio Seguros Sol · precio de lista .*50\.000/);
    });
    it('lista de la sede solo si el precio de lista difiere', () => {
      expect(
        itemPriceOriginText({ ...base, priceSource: 'PRICE_LIST', basePrice: 50000, catalogPrice: 50000 }, 'COP'),
      ).toBeNull();
      expect(
        flat(itemPriceOriginText({ ...base, priceSource: 'PRICE_LIST', basePrice: 50000, catalogPrice: 45000 }, 'COP')),
      ).toMatch(/^Lista de precios de la sede · precio de lista /);
    });
    it('catálogo o ítem anterior: nada', () => {
      expect(itemPriceOriginText({ ...base, priceSource: 'CATALOG', basePrice: 5, catalogPrice: 5 }, 'COP')).toBeNull();
      expect(itemPriceOriginText(base, 'COP')).toBeNull();
    });
  });
});
