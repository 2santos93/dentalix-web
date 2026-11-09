import { dateTimeIn, STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { copy } from './treatment-plans-tab-copy';

describe('planOptionLabel (DX-354b)', () => {
  // 02:30Z: en Caracas (UTC-4) es el 4 de noviembre a las 10:30 p. m.; en Berlín, el 5 a las 03:30.
  const createdAt = '2026-11-05T02:30:00.000Z';

  it('lleva número, fecha y hora de la sede de la pantalla, estado y etiqueta de la opción', () => {
    const caracas = testStamp([STAMP_SEDES.caracas, STAMP_SEDES.berlin]);
    expect(copy.planOptionLabel(createdAt, 'DRAFT', 2, 'Opción A: implante', caracas)).toBe(
      `Plan 2 · ${dateTimeIn('caracas', createdAt)} — Borrador · Opción A: implante`,
    );
    expect(dateTimeIn('caracas', createdAt)).toContain('04/11/2026');
  });

  it('con la sede de Berlín en pantalla la misma entrada sale en 24 h y con su día', () => {
    const berlin = testStamp([STAMP_SEDES.berlin, STAMP_SEDES.caracas]);
    const label = copy.planOptionLabel(createdAt, 'DRAFT', 1, null, berlin);
    expect(label).toBe(`Plan 1 · ${dateTimeIn('berlin', createdAt)} — Borrador`);
    expect(label).not.toBe(copy.planOptionLabel(createdAt, 'DRAFT', 1, null, testStamp([STAMP_SEDES.caracas])));
  });

  it('sin formato de la sede la fecha es «—» (el aviso de la pantalla explica por qué)', () => {
    expect(copy.planOptionLabel(createdAt, 'DRAFT', 1, null, stampPainters(null))).toBe('Plan 1 · — — Borrador');
  });

  it('DX-417: el presupuesto pendiente de una aceptación parcial lleva «· pendiente» (no tiene etiqueta de opción)', () => {
    const caracas = testStamp([STAMP_SEDES.caracas]);
    expect(copy.planOptionLabel(createdAt, 'PRESENTED', 3, null, caracas, true)).toBe(
      `Plan 3 · ${dateTimeIn('caracas', createdAt)} — Presentado · pendiente`,
    );
  });
});
