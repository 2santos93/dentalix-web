import { render, screen } from '@testing-library/react';
import { setupUser } from '@/lib/test/user';
import { RowActions } from './row-actions';

describe('RowActions', () => {
  it('el disparador se nombra por su fila, no "Acciones" a secas', () => {
    render(
      <RowActions
        label="Acciones de Ana Ruiz"
        actions={[{ label: 'Editar', onSelect: jest.fn() }]}
      />,
    );

    // Veinte botones llamados "Acciones" hacen inservible la lista de un
    // lector de pantalla; el nombre tiene que decir de qué fila es.
    expect(
      screen.getByRole('button', { name: 'Acciones de Ana Ruiz' }),
    ).toBeInTheDocument();
  });

  it('abre el menú y ejecuta la acción elegida', async () => {
    const onSelect = jest.fn();
    const user = setupUser();
    render(
      <RowActions
        label="Acciones de X"
        actions={[{ label: 'Editar', onSelect }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /acciones de x/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('se puede recorrer con el teclado', async () => {
    const onSelect = jest.fn();
    const user = setupUser();
    render(
      <RowActions
        label="Acciones de X"
        actions={[
          { label: 'Editar', onSelect: jest.fn() },
          { label: 'Eliminar', onSelect, destructive: true },
        ]}
      />,
    );

    screen.getByRole('button', { name: /acciones de x/i }).focus();
    // Enter abre y deja el foco en el primer ítem; una flecha baja al segundo.
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('no ejecuta una acción deshabilitada', async () => {
    const onSelect = jest.fn();
    const user = setupUser();
    render(
      <RowActions
        label="Acciones de X"
        actions={[{ label: 'Editar', onSelect, disabled: true }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /acciones de x/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('sin acciones no pinta un botón que abriría un menú vacío', () => {
    render(<RowActions label="Acciones de X" actions={[]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('mientras hay una acción en vuelo el disparador se bloquea', () => {
    render(
      <RowActions
        label="Acciones de X"
        busy
        actions={[{ label: 'Editar', onSelect: jest.fn() }]}
      />,
    );

    expect(
      screen.getByRole('button', { name: /acciones de x/i }),
    ).toBeDisabled();
  });
});
