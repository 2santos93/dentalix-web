import { attendsAt, attributionText, isAttendingRole } from './item-attribution';

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
    const at = new Date(2026, 9, 20, 10, 0).toISOString();
    expect(
      attributionText({
        status: 'DONE',
        performedByName: 'Dra. Laura Gómez',
        completedAt: at,
        performedLocationName: 'Sede Norte',
      }),
    ).toBe('Realizado por Dra. Laura Gómez · 20/10/2026 · Sede Norte');
    expect(
      attributionText({
        status: 'DONE',
        performedByName: 'Dra. Laura Gómez',
        completedAt: at,
        performedLocationName: null,
      }),
    ).toBe('Realizado por Dra. Laura Gómez · 20/10/2026');
    expect(
      attributionText({
        status: 'DONE',
        performedByName: null,
        completedAt: null,
        performedLocationName: null,
      }),
    ).toBe('Sin atribuir');
    expect(
      attributionText({
        status: 'ACCEPTED',
        performedByName: null,
        completedAt: null,
        performedLocationName: null,
      }),
    ).toBeNull();
  });
});
