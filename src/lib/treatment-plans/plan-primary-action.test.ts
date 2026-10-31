import { planPrimaryAction, type PlanPrimaryFacts } from './plan-primary-action';

function facts(over: Partial<PlanPrimaryFacts> = {}): PlanPrimaryFacts {
  return {
    status: 'DRAFT',
    role: 'DENTIST',
    signed: false,
    itemCount: 2,
    canAddItems: true,
    hasSchedulableVisit: false,
    canBill: false,
    balance: null,
    ...over,
  };
}

describe('planPrimaryAction (D2: una primaria por vista, según el estado)', () => {
  it('DRAFT: «Agregar ítem», también con ítems y para quien decide', () => {
    expect(planPrimaryAction(facts())).toBe('addItem');
    expect(planPrimaryAction(facts({ itemCount: 0 }))).toBe('addItem');
    expect(planPrimaryAction(facts({ role: 'ASSISTANT' }))).toBe('addItem');
  });

  it('DRAFT sin catálogo (no hay formulario): ninguna', () => {
    expect(planPrimaryAction(facts({ canAddItems: false }))).toBeNull();
  });

  it('PRESENTED: «Aceptar con firma» para odontólogo y ADMIN', () => {
    expect(planPrimaryAction(facts({ status: 'PRESENTED' }))).toBe('accept');
    expect(planPrimaryAction(facts({ status: 'PRESENTED', role: 'ADMIN' }))).toBe('accept');
  });

  it('PRESENTED: la asistente no decide → «Agregar ítem»', () => {
    expect(planPrimaryAction(facts({ status: 'PRESENTED', role: 'ASSISTANT' }))).toBe('addItem');
  });

  it('PRESENTED sin ítems no se firma → «Agregar ítem»', () => {
    expect(planPrimaryAction(facts({ status: 'PRESENTED', itemCount: 0 }))).toBe('addItem');
  });

  it('ACCEPTED: agendar la siguiente visita manda sobre cobrar y firmar', () => {
    expect(
      planPrimaryAction(
        facts({ status: 'ACCEPTED', hasSchedulableVisit: true, canBill: true, balance: 500 }),
      ),
    ).toBe('scheduleVisit');
  });

  it('ACCEPTED con todo agendado: cobrar si hay saldo y rol de cobro', () => {
    expect(planPrimaryAction(facts({ status: 'ACCEPTED', role: 'ADMIN', canBill: true, balance: 500 }))).toBe(
      'registerPayment',
    );
  });

  it('ACCEPTED sin saldo ni visitas: firmar el aceptado sin firma; firmado, nada', () => {
    expect(planPrimaryAction(facts({ status: 'ACCEPTED', canBill: true, balance: 0 }))).toBe('accept');
    expect(planPrimaryAction(facts({ status: 'ACCEPTED', signed: true }))).toBeNull();
    expect(planPrimaryAction(facts({ status: 'ACCEPTED', role: 'ASSISTANT' }))).toBeNull();
  });

  it('el saldo sin rol de cobro no cuenta', () => {
    expect(planPrimaryAction(facts({ status: 'COMPLETED', canBill: false, balance: 500 }))).toBeNull();
  });

  it('COMPLETED: cobrar lo pendiente o nada', () => {
    expect(planPrimaryAction(facts({ status: 'COMPLETED', canBill: true, balance: 10 }))).toBe('registerPayment');
    expect(planPrimaryAction(facts({ status: 'COMPLETED', canBill: true, balance: 0 }))).toBeNull();
  });

  it('REJECTED y CANCELLED: ninguna', () => {
    expect(planPrimaryAction(facts({ status: 'REJECTED' }))).toBeNull();
    expect(planPrimaryAction(facts({ status: 'CANCELLED', canBill: true, balance: 100 }))).toBeNull();
  });
});
