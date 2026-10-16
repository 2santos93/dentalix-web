import * as React from 'react';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

/**
 * Los diálogos de la app se abren con `open` (sin `DialogTrigger`): al cerrar,
 * el foco debe volver al botón que los abrió y no quedarse en <body>.
 */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Descripción</DialogDescription>
          <input aria-label="Campo" />
        </DialogContent>
      </Dialog>
    </>
  );
}

test('al cerrar con Esc el foco vuelve al botón que abrió el diálogo', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Abrir' });
  await user.click(opener);
  expect(await screen.findByRole('dialog', { name: 'Título' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});

test('al cerrar con la X el foco vuelve al botón que abrió el diálogo', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Abrir' });
  await user.click(opener);
  await user.click(await screen.findByRole('button', { name: 'Cerrar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});
