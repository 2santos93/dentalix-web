import { backoffDelayMs, minutesAgo, newKeys, pollDelayMs, visibleCapacity } from './board-logic';

describe('DX-588 · lógica del tablero de sala de espera', () => {
  it('sondea cada refreshSeconds con ±15 % de jitter', () => {
    expect(pollDelayMs(8, () => 0.5)).toBe(8000);
    expect(pollDelayMs(8, () => 0)).toBe(6800);
    expect(pollDelayMs(8, () => 1)).toBe(9200);
    // Un valor absurdo de la API no hace sondear en bucle.
    expect(pollDelayMs(0, () => 0.5)).toBe(3000);
  });

  it('tras fallos espera 8 → 15 → 30 s, con tope de 30 s (también con Retry-After)', () => {
    expect([1, 2, 3, 4, 10].map((n) => backoffDelayMs(n))).toEqual([8000, 15000, 30000, 30000, 30000]);
    expect(backoffDelayMs(1, 20)).toBe(20000);
    expect(backoffDelayMs(1, 600)).toBe(30000);
  });

  it('las claves nuevas son las que no estaban en el sondeo anterior', () => {
    expect(newKeys(new Set(['a', 'b']), [{ key: 'c' }, { key: 'a' }, { key: 'd' }])).toEqual(['c', 'd']);
    expect(newKeys(new Set(['a']), [{ key: 'a' }])).toEqual([]);
  });

  it('recorta la lista dejando una plaza para «y N más»; sin medidas, todas', () => {
    expect(visibleCapacity(5, 1000, 100)).toBe(5);
    expect(visibleCapacity(12, 1000, 100)).toBe(9);
    expect(visibleCapacity(10, 1000, 100)).toBe(10);
    expect(visibleCapacity(7, 0, 0)).toBe(7);
    expect(visibleCapacity(0, 1000, 100)).toBe(0);
    expect(visibleCapacity(5, 50, 100)).toBe(1);
    // «y N más» más bajo que una fila: cabe una fila más.
    expect(visibleCapacity(12, 1000, 100, 50)).toBe(9);
    expect(visibleCapacity(12, 1000, 100, 40)).toBe(9);
    expect(visibleCapacity(12, 1050, 100, 40)).toBe(10);
  });

  it('«hace N min»', () => {
    expect(minutesAgo(0)).toBe('Acaba de llegar');
    expect(minutesAgo(1)).toBe('hace 1 min');
    expect(minutesAgo(59)).toBe('hace 59 min');
    expect(minutesAgo(60)).toBe('hace 1 h');
    expect(minutesAgo(75)).toBe('hace 1 h 15 min');
  });
});
