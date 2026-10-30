import * as React from 'react';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';

/** Como los diálogos (DX-122, cajón de pendientes): el foco vuelve a quien abrió la hoja. */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Pendientes
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetTitle>Pendientes por agendar</SheetTitle>
          <SheetDescription>Lista</SheetDescription>
        </SheetContent>
      </Sheet>
    </>
  );
}

test('al cerrar la hoja con Esc el foco vuelve al botón que la abrió', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Pendientes' });
  await user.click(opener);
  expect(await screen.findByRole('dialog', { name: 'Pendientes por agendar' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});

// DX-312 (M1): la misma guarda que el diálogo. Escape con la lista de un
// combobox abierta cierra la lista, no la hoja.
function ComboboxHarness({ onEscapeKeyDown }: { onEscapeKeyDown?: (event: KeyboardEvent) => void }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(true);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent onEscapeKeyDown={onEscapeKeyDown}>
        <SheetTitle>Paciente nuevo</SheetTitle>
        <SheetDescription>Alta rápida</SheetDescription>
        <input
          aria-label="Ciudad"
          role="combobox"
          aria-expanded={expanded}
          aria-controls="lista"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setExpanded(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

test('Escape on an expanded combobox does not dismiss the sheet; on a collapsed one it does', async () => {
  const onEscapeKeyDown = jest.fn();
  const user = userEvent.setup();
  render(<ComboboxHarness onEscapeKeyDown={onEscapeKeyDown} />);
  const field = screen.getByRole('combobox', { name: 'Ciudad' });
  field.focus();
  await user.keyboard('{Escape}');
  expect(field).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('dialog', { name: 'Paciente nuevo' })).toBeInTheDocument();
  // El `onEscapeKeyDown` de quien monta la hoja se sigue llamando.
  expect(onEscapeKeyDown).toHaveBeenCalledTimes(1);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Paciente nuevo' })).not.toBeInTheDocument());
  expect(onEscapeKeyDown).toHaveBeenCalledTimes(2);
});
