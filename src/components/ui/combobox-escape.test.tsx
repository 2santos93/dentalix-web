import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';

/**
 * DX-312 (M2): un combobox expandido que no cierra su lista con Escape deja el
 * foco atrapado dentro del diálogo o de la hoja. Fuera de producción la guarda
 * lo avisa por consola.
 */
function Field({ closesOnEscape }: { closesOnEscape: boolean }) {
  const [expanded, setExpanded] = React.useState(true);
  return (
    <input
      aria-label="País"
      role="combobox"
      aria-expanded={expanded}
      aria-controls="lista"
      onKeyDown={(e) => {
        if (closesOnEscape && e.key === 'Escape') setExpanded(false);
      }}
    />
  );
}

const containers = {
  dialog: (children: React.ReactNode) => (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Título</DialogTitle>
        <DialogDescription>Descripción</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  ),
  sheet: (children: React.ReactNode) => (
    <Sheet open>
      <SheetContent>
        <SheetTitle>Título</SheetTitle>
        <SheetDescription>Descripción</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  ),
};

describe.each(Object.entries(containers))('combobox Escape contract in a %s', (_, wrap) => {
  let error: jest.SpyInstance;
  beforeEach(() => {
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => error.mockRestore());

  it('warns when an expanded combobox stays expanded after Escape', async () => {
    const user = userEvent.setup();
    render(wrap(<Field closesOnEscape={false} />));
    screen.getByRole('combobox', { name: 'País' }).focus();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/^Combobox sin Escape/), screen.getByRole('combobox')),
    );
  });

  it('stays silent when the combobox closes its list on Escape', async () => {
    const user = userEvent.setup();
    render(wrap(<Field closesOnEscape />));
    const field = screen.getByRole('combobox', { name: 'País' });
    field.focus();
    await user.keyboard('{Escape}');
    expect(field).toHaveAttribute('aria-expanded', 'false');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(error).not.toHaveBeenCalledWith(expect.stringMatching(/^Combobox sin Escape/), expect.anything());
  });
});
