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

// DX-312 (I1): Escape con la lista de un combobox abierta cierra la lista, no el
// diálogo. Radix escucha Escape en `document` en captura, antes que el campo.
function ComboboxHarness() {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Título</DialogTitle>
        <DialogDescription>Descripción</DialogDescription>
        <input
          aria-label="País"
          role="combobox"
          aria-expanded={expanded}
          aria-controls="lista"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setExpanded(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

test('Escape on an expanded combobox does not dismiss the dialog; on a collapsed one it does', async () => {
  const onEscapeKeyDown = jest.fn();
  const onOpenChange = jest.fn();
  const user = userEvent.setup();
  render(<ComboboxHarness />);
  const field = screen.getByRole('combobox', { name: 'País' });
  field.focus();
  await user.keyboard('{Escape}');
  expect(field).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('dialog', { name: 'Título' })).toBeInTheDocument();
  // Con la lista cerrada, el siguiente Escape sí cierra el diálogo.
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Título' })).not.toBeInTheDocument());

  // Un campo normal (o el combobox ya cerrado): Escape cierra como siempre, y
  // el `onEscapeKeyDown` de quien monta el diálogo se sigue llamando.
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent onEscapeKeyDown={onEscapeKeyDown}>
        <DialogTitle>Otro</DialogTitle>
        <DialogDescription>Descripción</DialogDescription>
        <input aria-label="Nombre" />
      </DialogContent>
    </Dialog>,
  );
  screen.getByRole('textbox', { name: 'Nombre' }).focus();
  await user.keyboard('{Escape}');
  expect(onEscapeKeyDown).toHaveBeenCalledTimes(1);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
