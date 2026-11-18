import { bottomTabsFor, canSee, visibleNavGroups, ALL_NAV_ITEMS } from './nav-config';

const item = (href: string) => ALL_NAV_ITEMS.find((i) => i.href === href)!;
const hrefs = (role: Parameters<typeof visibleNavGroups>[0], permissions: Parameters<typeof visibleNavGroups>[1] = []) =>
  visibleNavGroups(role, permissions).flatMap((g) => g.items.map((i) => i.href));

describe('menú con permisos extra (DX-090)', () => {
  it('la asistente sin permisos no ve Caja ni Reportes', () => {
    expect(hrefs('ASSISTANT')).not.toContain('/caja');
    expect(hrefs('ASSISTANT')).not.toContain('/reportes');
  });

  it('con PAYMENT_REGISTER ve la Caja (y la tiene en la barra del móvil), pero no Reportes, Cartera ni Gastos', () => {
    const visible = hrefs('ASSISTANT', ['PAYMENT_REGISTER']);
    expect(visible).toContain('/caja');
    expect(visible).not.toContain('/reportes');
    expect(visible).not.toContain('/caja/cartera');
    expect(visible).not.toContain('/caja/gastos');
    expect(bottomTabsFor('ASSISTANT', ['PAYMENT_REGISTER']).map((i) => i.href)).toContain('/caja');
  });

  it('con FINANCIAL_REPORTS_VIEW ve Caja y Reportes', () => {
    const visible = hrefs('ASSISTANT', ['FINANCIAL_REPORTS_VIEW']);
    expect(visible).toContain('/caja');
    expect(visible).toContain('/reportes');
  });

  it('sin rol legible, ningún permiso abre nada', () => {
    expect(canSee(item('/caja'), null, ['PAYMENT_REGISTER'])).toBe(false);
  });

  it('los roles de siempre no cambian', () => {
    expect(canSee(item('/caja'), 'RECEPTION')).toBe(true);
    expect(canSee(item('/caja'), 'DENTIST')).toBe(false);
    expect(canSee(item('/reportes'), 'DENTIST')).toBe(true);
  });
});

describe('DX-556: Prospectos en Atención', () => {
  it('lo ven ADMIN y recepción (LEAD_ROLES); los clínicos, no', () => {
    expect(hrefs('ADMIN')).toContain('/prospectos');
    expect(hrefs('RECEPTION')).toContain('/prospectos');
    expect(hrefs('DENTIST')).not.toContain('/prospectos');
    expect(hrefs('ASSISTANT')).not.toContain('/prospectos');
  });

  it('ADMIN sigue con 15 entradas: «Descuentos» deja la barra (presupuesto de 900 px)', () => {
    expect(hrefs('ADMIN')).toHaveLength(15);
    expect(hrefs('ADMIN')).not.toContain('/caja/descuentos');
  });
});
