import * as React from 'react';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from './command-palette';
import {
  UnsavedChangesGuard,
  resetUnsavedChangesForTests,
  unsavedChangesCopy,
  useUnsavedChanges,
} from '@/components/settings/unsaved-changes';

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/settings/recetas',
}));
jest.mock('../../lib/patients/patients-api', () => ({ listPatients: jest.fn() }));

function Harness() {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <CommandPalette open={open} onOpenChange={setOpen} token="t" role="ADMIN" />
      <UnsavedChangesGuard />
    </>
  );
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  resetUnsavedChangesForTests();
});

describe('CommandPalette con cambios sin guardar', () => {
  it('sin cambios, elegir un destino navega', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('option', { name: /Agenda/ }));
    expect(push).toHaveBeenCalledWith('/agenda');
  });

  it('con cambios, cierra la paleta y pregunta; «Seguir editando» no navega', async () => {
    const user = userEvent.setup();
    const draft = renderHook(() => useUnsavedChanges(true));
    render(<Harness />);
    await user.click(screen.getByRole('option', { name: /Agenda/ }));
    expect(push).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: unsavedChangesCopy.title })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: unsavedChangesCopy.stay }));
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    draft.unmount();
  });

  it('con cambios, «Salir sin guardar» lleva al destino elegido', async () => {
    const user = userEvent.setup();
    const draft = renderHook(() => useUnsavedChanges(true));
    render(<Harness />);
    await user.click(screen.getByRole('option', { name: /Agenda/ }));
    await user.click(await screen.findByRole('button', { name: unsavedChangesCopy.leave }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/agenda'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    draft.unmount();
  });
});
