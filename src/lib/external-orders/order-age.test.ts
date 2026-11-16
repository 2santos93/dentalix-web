import { externalOrderAgeDays, externalOrderAgeLabel } from './order-age';

describe('externalOrderAgeDays (DX-572)', () => {
  it('cuenta días civiles de la sede, no del navegador', () => {
    // 2026-11-10 23:30 en Caracas (UTC-4) es 2026-11-11 03:30 UTC.
    const issuedAt = '2026-11-11T03:30:00.000Z';
    const now = new Date('2026-11-13T12:00:00.000Z');
    expect(externalOrderAgeDays(issuedAt, 'America/Caracas', now)).toBe(3);
    expect(externalOrderAgeDays(issuedAt, 'UTC', now)).toBe(2);
  });

  it('hoy es 0 y sin zona no cuenta', () => {
    const now = new Date('2026-11-13T12:00:00.000Z');
    expect(externalOrderAgeDays('2026-11-13T08:00:00.000Z', 'UTC', now)).toBe(0);
    expect(externalOrderAgeDays('2026-11-13T08:00:00.000Z', null, now)).toBeNull();
  });

  it('etiqueta', () => {
    expect(externalOrderAgeLabel(0)).toBe('Hoy');
    expect(externalOrderAgeLabel(1)).toBe('1 día');
    expect(externalOrderAgeLabel(16)).toBe('16 días');
  });
});
