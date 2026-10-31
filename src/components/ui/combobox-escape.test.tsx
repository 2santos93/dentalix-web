import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';
import { DatePicker } from './date-picker';

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

/**
 * F1: el calendario de un DatePicker vive en su propio portal (react-aria) y
 * Radix no lo veía como capa: la trampa de foco del diálogo le quitaba el
 * foco, un clic en un día contaba como «fuera» y el Escape que lo cerraba
 * cerraba también el diálogo, con lo escrito.
 */
describe.each(Object.entries(containers))('DatePicker calendar inside a %s', (_, wrap) => {
  function Host() {
    const [open, setOpen] = React.useState(true);
    const [value, setValue] = React.useState<string | null>('2026-10-30');
    const content = wrap(<DatePicker aria-label="Fecha" value={value} onChange={setValue} />);
    return open ? (
      <>
        {React.cloneElement(content as React.ReactElement<{ onOpenChange: (o: boolean) => void }>, {
          onOpenChange: setOpen,
        })}
      </>
    ) : (
      <p>cerrado</p>
    );
  }

  it('the calendar keeps focus, a day click picks it and Escape closes only the calendar', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: /calendario/i }));
    const grid = await screen.findByRole('grid');
    // La trampa del diálogo no se lleva el foco del calendario.
    await waitFor(() => expect(grid.contains(document.activeElement)).toBe(true));
    await user.keyboard('{ArrowRight}');
    expect(grid.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument());
    expect(screen.queryByText('cerrado')).not.toBeInTheDocument();
    // Un día elegido con el ratón tampoco cierra el diálogo.
    await user.click(screen.getByRole('button', { name: /calendario/i }));
    const again = await screen.findByRole('grid');
    await user.click(within(again).getByRole('button', { name: /28 de octubre/ }));
    await waitFor(() =>
      expect(within(screen.getByRole('group', { name: 'Fecha' })).getByRole('spinbutton', { name: /^día/ })).toHaveAttribute(
        'aria-valuenow',
        '28',
      ),
    );
    expect(screen.queryByText('cerrado')).not.toBeInTheDocument();
    // Con el calendario cerrado, Escape sí cierra el diálogo.
    screen.getByRole('group', { name: 'Fecha' }).querySelector<HTMLElement>('[role="spinbutton"]')!.focus();
    await user.keyboard('{Escape}');
    await screen.findByText('cerrado');
  });
});
