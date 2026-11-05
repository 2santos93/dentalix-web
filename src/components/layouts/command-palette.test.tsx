import * as React from 'react';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listPatients } from '../../lib/patients/patients-api';
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

describe('CommandPalette: búsqueda de pacientes', () => {
  it('DX-487: si falla, lo dice y «Reintentar» vuelve a buscar', async () => {
    const search = jest.mocked(listPatients);
    search.mockReset();
    search.mockRejectedValueOnce(new Error('red'));
    search.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 5 } as never);
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Ana' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo buscar pacientes');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
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

describe('CommandPalette: «¿Quién llama?» (DX-224)', () => {
  it('la acción abre «¿Quién llama?» y cierra la paleta (en el raíl no hay botón)', async () => {
    const user = userEvent.setup();
    const onOpenCaller = jest.fn();
    const onOpenChange = jest.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} token="t" role="RECEPTION" onOpenCaller={onOpenCaller} />);
    await user.click(screen.getByRole('option', { name: /¿Quién llama\?/ }));
    expect(onOpenCaller).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sin el callback no ofrece la acción', () => {
    render(<CommandPalette open onOpenChange={jest.fn()} token="t" role="ADMIN" />);
    expect(screen.queryByRole('option', { name: /¿Quién llama\?/ })).not.toBeInTheDocument();
  });
});
