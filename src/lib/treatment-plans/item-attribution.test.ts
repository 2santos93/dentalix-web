import { dateIn, STAMP_SEDES } from '@/lib/test/stamp';
import { testStamp } from '@/lib/test/stamp';
import { attendsAt, attributionInstant, attributionText, isAttendingRole } from './item-attribution';

describe('atribución del ítem realizado (DX-050)', () => {
  it('atienden DENTIST y ADMIN', () => {
    expect(isAttendingRole('DENTIST')).toBe(true);
    expect(isAttendingRole('ADMIN')).toBe(true);
    expect(isAttendingRole('ASSISTANT')).toBe(false);
    expect(isAttendingRole('RECEPTION')).toBe(false);
  });

  it('sin restricción atiende en todas; restringido, solo en las suyas; sin sede activa, cualquiera', () => {
    expect(attendsAt(null, 'l1')).toBe(true);
    expect(attendsAt(['l2'], 'l1')).toBe(false);
    expect(attendsAt(['l1'], 'l1')).toBe(true);
    expect(attendsAt(['l2'], null)).toBe(true);
  });

  it('«Realizado por X · fecha · sede», sin la sede si no se sabe, o «Sin atribuir»', () => {
    const at = '2026-10-20T10:00:00.000Z';
    const stamp = testStamp([STAMP_SEDES.caracas]);
    const expected = dateIn('caracas', at);
    expect(
      attributionText({
        status: 'DONE',
        performedByName: 'Dra. Laura Gómez',
        completedAt: at,
        performedLocationName: 'Sede Norte',
        performedLocationId: null,
      }, stamp),
    ).toBe(`Realizado por Dra. Laura Gómez · ${expected} · Sede Norte`);
    expect(
      attributionText({
        status: 'DONE',
        performedByName: 'Dra. Laura Gómez',
        completedAt: at,
        performedLocationName: null,
        performedLocationId: null,
      }, stamp),
    ).toBe(`Realizado por Dra. Laura Gómez · ${expected}`);
    expect(
      attributionText({
        status: 'DONE',
        performedByName: null,
        completedAt: null,
        performedLocationName: null,
        performedLocationId: null,
      }, stamp),
    ).toBe('Sin atribuir');
    expect(
      attributionText({
        status: 'ACCEPTED',
        performedByName: null,
        completedAt: null,
        performedLocationName: null,
        performedLocationId: null,
      }, stamp),
    ).toBeNull();
  });
});

describe('la fecha del realizado sale con la sede donde se realizó (DX-354b, E1)', () => {
  // 02:00Z: en Caracas aún es el 20; en Berlín ya es el 21.
  const at = '2026-10-21T02:00:00.000Z';
  const done = (performedLocationId: string | null) => ({
    status: 'DONE' as const,
    performedByName: 'Dra. Laura Gómez',
    completedAt: at,
    performedLocationName: null,
    performedLocationId,
  });
  const stamp = testStamp([STAMP_SEDES.caracas, STAMP_SEDES.berlin, STAMP_SEDES.miami]);

  it('con sede en el dato, su reloj; sin ella, el de la pantalla', () => {
    expect(attributionText(done(STAMP_SEDES.berlin.id), stamp)).toBe(
      `Realizado por Dra. Laura Gómez · ${dateIn('berlin', at)}`,
    );
    expect(attributionText(done(null), stamp)).toBe(`Realizado por Dra. Laura Gómez · ${dateIn('caracas', at)}`);
    expect(dateIn('berlin', at)).not.toBe(dateIn('caracas', at));
  });

  it('con una sede desconocida, «—»: nunca la de la pantalla', () => {
    expect(attributionText(done('sede-que-no-existe'), stamp)).toBe('Realizado por Dra. Laura Gómez · —');
  });
});

describe('attributionInstant (DX-305)', () => {
  const now = new Date('2026-10-24T14:00:00.000Z'); // 10:00 en Caracas

  it('el mediodía del día en la zona de la sede', () => {
    expect(attributionInstant('2026-09-14', 'America/Caracas', now)).toBe('2026-09-14T16:00:00.000Z');
    expect(attributionInstant('2026-09-14', 'Europe/Madrid', now)).toBe('2026-09-14T10:00:00.000Z');
  });

  it('hoy antes del mediodía: ahora (la API no admite una fecha futura)', () => {
    expect(attributionInstant('2026-10-24', 'America/Caracas', now)).toBe(now.toISOString());
  });
});
