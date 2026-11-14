import {
  checkoutRecallOffer,
  emptyEvolutionRecallDraft,
  evolutionRecallMonths,
  evolutionRecallPayload,
  monthOptions,
  monthsLabel,
} from './recall-offer';

const T = (id: string, months = 6) => ({ id, name: id, defaultIntervalMonths: months });

describe('checkoutRecallOffer (DX-015-bis D16)', () => {
  it('con el punto hecho o sin tipos no ofrece nada', () => {
    expect(checkoutRecallOffer(true, [T('a')])).toBeNull();
    expect(checkoutRecallOffer(false, [])).toBeNull();
    expect(checkoutRecallOffer(false, undefined)).toBeNull();
  });

  it('los dos primeros como botón y el resto en «Otros…», en el orden de la API', () => {
    expect(checkoutRecallOffer(false, [T('a')])).toEqual({ buttons: [T('a')], more: [] });
    expect(checkoutRecallOffer(false, [T('a'), T('b'), T('c'), T('d')])).toEqual({
      buttons: [T('a'), T('b')],
      more: [T('c'), T('d')],
    });
  });
});

describe('meses', () => {
  it('monthsLabel en singular y plural', () => {
    expect(monthsLabel(1)).toBe('1 mes');
    expect(monthsLabel(6)).toBe('6 meses');
  });

  it('monthOptions añade el valor elegido si no es de los habituales y está en 1–36', () => {
    expect(monthOptions(5)).toContain(5);
    expect(monthOptions(40)).not.toContain(40);
    expect(monthOptions(null)).toEqual([1, 2, 3, 4, 6, 9, 12, 18, 24, 36]);
  });
});

describe('evolutionRecallMonths (D18)', () => {
  it('prellena con el intervalo del recall que ya tiene de ese tipo', () => {
    expect(evolutionRecallMonths(T('hyg', 6), [{ recallTypeId: 'hyg', intervalMonths: 4 }])).toBe(4);
  });
  it('sin recall de ese tipo (o sin poder leerlos), el por defecto del tipo', () => {
    expect(evolutionRecallMonths(T('hyg', 6), [{ recallTypeId: 'ctl', intervalMonths: 12 }])).toBe(6);
    expect(evolutionRecallMonths(T('hyg', 6), null)).toBe(6);
  });
});

describe('evolutionRecallPayload (D18)', () => {
  it('«Sin cambios» no manda `recall`', () => {
    expect(evolutionRecallPayload(emptyEvolutionRecallDraft)).toEqual({});
  });
  it('activado manda tipo y meses', () => {
    expect(evolutionRecallPayload({ enabled: true, recallTypeId: 'hyg', intervalMonths: 3 })).toEqual({
      recall: { recallTypeId: 'hyg', intervalMonths: 3 },
    });
  });
  it('activado a medias o fuera de 1–36 es un error en español', () => {
    expect(evolutionRecallPayload({ enabled: true, recallTypeId: null, intervalMonths: 3 })).toHaveProperty('error');
    expect(evolutionRecallPayload({ enabled: true, recallTypeId: 'hyg', intervalMonths: 0 })).toHaveProperty('error');
    expect(evolutionRecallPayload({ enabled: true, recallTypeId: 'hyg', intervalMonths: 37 })).toHaveProperty('error');
    expect(evolutionRecallPayload({ enabled: true, recallTypeId: 'hyg', intervalMonths: null })).toHaveProperty('error');
  });
});
