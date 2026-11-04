import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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

  it('si la opción abre un Dialog, al cerrarlo el foco vuelve al «⋯» de la fila (no a <body>)', async () => {
    const user = setupUser();
    function Row() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <RowActions label="Acciones de Ana" actions={[{ label: 'Editar', onSelect: () => setOpen(true) }]} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>Editar</DialogTitle>
              <button type="button">Dentro</button>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Row />);
    const trigger = screen.getByRole('button', { name: 'Acciones de Ana' });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    expect(await screen.findByRole('dialog', { name: 'Editar' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('DX-432: una acción con disabledReason no corre, sigue enfocable y dice por qué (accesible)', async () => {
    const onSelect = jest.fn();
    const user = setupUser();
    render(
      <RowActions
        label="Acciones de X"
        actions={[
          { label: 'Recibo', onSelect: jest.fn() },
          { label: 'Anular', onSelect, destructive: true, disabledReason: 'Es referencia de una devolución.' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /acciones de x/i }));
    const item = await screen.findByRole('menuitem', { name: /Anular/ });
    // No se rinde como «disabled» de Radix (saldría del orden de foco): aria-disabled y descripción.
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).not.toHaveAttribute('data-disabled');
    expect(item).toHaveAccessibleDescription('Es referencia de una devolución.');
    expect(screen.getByText('Es referencia de una devolución.')).toBeVisible();

    // Alcanzable con el teclado y sin efecto: el menú se queda abierto con la explicación.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(item).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(item);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
