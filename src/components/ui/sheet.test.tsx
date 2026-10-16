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
