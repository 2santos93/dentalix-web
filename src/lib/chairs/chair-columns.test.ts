import {
  NO_CHAIR_COLUMN,
  chairColumnOf,
  chairColumns,
  chairDisplayName,
  moveChairInOrder,
  proposeProvider,
  readColumnsBy,
  writeColumnsBy,
} from './chair-columns';
import type { Chair } from './chairs-api';

function chair(partial: Partial<Chair> & { id: string }): Chair {
  return {
    tenantId: 't1',
    locationId: 'norte',
    name: partial.id,
    sortOrder: 0,
    defaultProviderId: null,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

describe('columnas por sillón (DX-211)', () => {
  const chairs = [
    chair({ id: 'b', name: 'Sillón 2', sortOrder: 1 }),
    chair({ id: 'a', name: 'Sillón 1', sortOrder: 0 }),
    chair({ id: 'old', name: 'Viejo', sortOrder: 2, active: false }),
    chair({ id: 'off', name: 'Sin uso', sortOrder: 3, active: false }),
  ];

  it('una columna por sillón activo en su orden, luego los inactivos con citas ese día y al final «Sin sillón»', () => {
    const columns = chairColumns(chairs, [{ chairId: 'old' }, { chairId: null }]);
    expect(columns.map((c) => [c.id, c.label])).toEqual([
      ['a', 'Sillón 1'],
      ['b', 'Sillón 2'],
      ['old', 'Viejo (inactivo)'],
      [NO_CHAIR_COLUMN, 'Sin sillón'],
    ]);
  });

  it('una cita va a la columna de su sillón; sin sillón, a «Sin sillón»', () => {
    expect(chairColumnOf({ chairId: 'a' })).toBe('a');
    expect(chairColumnOf({ chairId: null })).toBe(NO_CHAIR_COLUMN);
    expect(chairColumnOf({})).toBe(NO_CHAIR_COLUMN);
  });

  it('el nombre del sillón de una cita lleva «(inactivo)» si se desactivó', () => {
    expect(chairDisplayName({ id: 'a', name: 'Sillón 1', active: true })).toBe('Sillón 1');
    expect(chairDisplayName({ id: 'a', name: 'Sillón 1', active: false })).toBe('Sillón 1 (inactivo)');
  });

  describe('precedencia del profesional por defecto', () => {
    const withDefault = chair({ id: 'a', defaultProviderId: 'dr-sillon' });
    it('con el profesional vacío, propone el del sillón', () => {
      expect(proposeProvider('', withDefault, ['dr-sillon'])).toBe('dr-sillon');
    });
    it('nunca sobrescribe un profesional ya elegido', () => {
      expect(proposeProvider('dra-elegida', withDefault, ['dr-sillon', 'dra-elegida'])).toBe('dra-elegida');
    });
    it('sin profesional por defecto, o si ya no está en el personal, no cambia nada', () => {
      expect(proposeProvider('', chair({ id: 'b' }), ['dr-sillon'])).toBe('');
      expect(proposeProvider('', withDefault, ['otra'])).toBe('');
      expect(proposeProvider('', null, ['dr-sillon'])).toBe('');
    });
  });

  it('mover un sillón arriba o abajo cambia su puesto; en los bordes, nada', () => {
    expect(moveChairInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveChairInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveChairInOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveChairInOrder(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });

  describe('preferencia «Columnas» por usuario', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      window.localStorage.clear();
    });

    it('se recuerda por usuario y por defecto son los profesionales', () => {
      expect(readColumnsBy('u1')).toBe('providers');
      writeColumnsBy('u1', 'chairs');
      expect(readColumnsBy('u1')).toBe('chairs');
      expect(readColumnsBy('u2')).toBe('providers');
    });

    it('un valor raro o un almacenamiento bloqueado no rompen nada', () => {
      window.localStorage.setItem('dentalix.agenda.columnsBy.u1', 'mesas');
      expect(readColumnsBy('u1')).toBe('providers');
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('bloqueado');
      });
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('bloqueado');
      });
      expect(readColumnsBy('u1')).toBe('providers');
      expect(() => writeColumnsBy('u1', 'chairs')).not.toThrow();
    });
  });
});
