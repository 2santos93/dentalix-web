import { render, screen, within } from '@testing-library/react';
import { RankedBars } from './ranked-bars';

const bars = [
  { key: 'a', name: 'Presentados', value: 10, display: '10' },
  { key: 'b', name: 'Aceptados', value: 4, display: '4' },
  { key: 'c', name: 'Cobrados', value: 6, display: '6' },
];

const names = () => screen.getAllByTestId('ranked-bar').map((li) => li.firstElementChild?.textContent);
const width = (i: number) =>
  (screen.getAllByTestId('ranked-bar')[i].querySelector('[aria-hidden] > span') as HTMLElement).style.width;

describe('RankedBars', () => {
  it('por defecto, de mayor a menor', () => {
    render(<RankedBars title="Serie" bars={bars} />);
    expect(names()).toEqual(['Presentados', 'Cobrados', 'Aceptados']);
  });

  it('DX-558: con sort={false}, en el orden recibido, y cada barra relativa a `max`', () => {
    render(<RankedBars title="Embudo" bars={bars} sort={false} max={10} />);
    expect(names()).toEqual(['Presentados', 'Aceptados', 'Cobrados']);
    expect(width(0)).toBe('100%');
    expect(width(1)).toBe('40%');
    expect(width(2)).toBe('60%');
  });

  it('la etiqueta de la punta puede ser un botón', () => {
    render(
      <RankedBars
        title="Embudo"
        sort={false}
        bars={[{ key: 'a', name: 'Presentados', value: 1, display: <button type="button">1</button> }]}
      />,
    );
    const figure = screen.getByRole('figure', { name: 'Embudo' });
    expect(within(figure).getByRole('button', { name: '1' })).toBeInTheDocument();
  });
});
