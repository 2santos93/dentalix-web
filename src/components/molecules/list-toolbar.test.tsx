import { render, screen } from '@testing-library/react';
import { setupUser } from '@/lib/test/user';
import { ListToolbar, ResultCount } from './list-toolbar';

function Toolbar(
  props: Partial<React.ComponentProps<typeof ListToolbar>> = {},
) {
  return (
    <ListToolbar
      searchLabel="Buscar por nombre"
      searchPlaceholder="Buscar…"
      value=""
      onChange={jest.fn()}
      {...props}
    />
  );
}

describe('ListToolbar', () => {
  it('el campo se anuncia por lo que busca, no como "Buscar" a secas', () => {
    render(Toolbar());

    expect(
      screen.getByRole('searchbox', { name: 'Buscar por nombre' }),
    ).toBeInTheDocument();
  });

  it('cada pulsación sube al padre sin rebotar aquí', async () => {
    const onChange = jest.fn();
    const user = setupUser();
    render(Toolbar({ onChange }));

    await user.type(screen.getByRole('searchbox'), 'ab');

    // El debounce es de la vista, no de la barra: aquí llega tecla a tecla.
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('el botón de limpiar solo existe cuando hay algo que limpiar', async () => {
    const onChange = jest.fn();
    const user = setupUser();
    const { rerender } = render(Toolbar({ value: '', onChange }));

    expect(
      screen.queryByRole('button', { name: /limpiar/i }),
    ).not.toBeInTheDocument();

    rerender(Toolbar({ value: 'resina', onChange }));
    await user.click(screen.getByRole('button', { name: /limpiar/i }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('pinta los filtros y la acción primaria que le pasen', () => {
    render(
      Toolbar({
        children: (
          <select aria-label="Filtrar por tipo">
            <option>Todos</option>
          </select>
        ),
        action: <button type="button">Agregar</button>,
      }),
    );

    expect(screen.getByLabelText('Filtrar por tipo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument();
  });
});

describe('ResultCount', () => {
  it('concuerda el singular con el plural', () => {
    const { rerender } = render(
      <ResultCount total={1} noun="ítem" nounPlural="ítems" />,
    );
    expect(screen.getByText('1 ítem')).toBeInTheDocument();

    rerender(<ResultCount total={137} noun="ítem" nounPlural="ítems" />);
    expect(screen.getByText('137 ítems')).toBeInTheDocument();
  });

  it('cero es un resultado, no una ausencia de conteo', () => {
    render(<ResultCount total={0} noun="ítem" nounPlural="ítems" />);

    // Es la señal de que la búsqueda corrió y no encontró nada.
    expect(screen.getByText('0 ítems')).toBeInTheDocument();
  });

  it('se anuncia al cambiar, para quien no ve encogerse la tabla', () => {
    render(<ResultCount total={3} noun="ítem" nounPlural="ítems" />);

    expect(screen.getByText('3 ítems')).toHaveAttribute('aria-live', 'polite');
  });
});
