import { openingsHolidaysNote } from './openings-holidays';

describe('openingsHolidaysNote (DX-263-bis)', () => {
  it('sin festivos en el rango no dice nada', () => {
    expect(openingsHolidaysNote([])).toBeNull();
    expect(openingsHolidaysNote(undefined)).toBeNull();
  });

  it('un festivo: el día y su nombre', () => {
    expect(
      openingsHolidaysNote([{ date: '2027-02-08', name: 'Carnaval' }]),
    ).toBe(
      'La sede cierra por festivo el lunes, 8 de febrero (Carnaval): ese día no hay huecos.',
    );
  });

  it('varios: todos, en orden', () => {
    expect(
      openingsHolidaysNote([
        { date: '2027-01-01', name: 'Año Nuevo' },
        { date: '2027-02-08', name: 'Carnaval' },
        { date: '2027-02-09', name: 'Carnaval' },
      ]),
    ).toBe(
      'La sede cierra por festivo el viernes, 1 de enero (Año Nuevo), el lunes, 8 de febrero (Carnaval) y el martes, 9 de febrero (Carnaval): esos días no hay huecos.',
    );
  });
});
