import { render, screen, waitFor } from '@testing-library/react';
import { LocationSwitcher } from './location-switcher';
import { useAuthStore } from '@/lib/auth/auth-store';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC transform
// (only real `import`/`require` specifiers are) — relative path, misma
// convención que el resto de tests del proyecto.
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));

const mockedList = listLocations as jest.MockedFunction<typeof listLocations>;

function sede(id: string, name: string, isActive = true): ClinicLocation {
  return {
    id,
    name,
    address: null,
    isActive,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mockedList.mockReset();
  useAuthStore.setState({ accessToken: 'tok' });
});

describe('LocationSwitcher', () => {
  it('con UNA sola sede se muestra igual', async () => {
    // La regla anterior lo escondía con menos de dos, y entonces la sede activa
    // no se veía en ninguna parte de la app.
    mockedList.mockResolvedValue([sede('l1', 'Sede principal')]);

    render(<LocationSwitcher />);

    expect(await screen.findByLabelText('Sede')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sede principal' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Todas las sedes' })).toBeInTheDocument();
  });

  it('con varias sedes las lista todas', async () => {
    mockedList.mockResolvedValue([
      sede('l1', 'Sede principal'),
      sede('l2', 'Sede norte'),
    ]);

    render(<LocationSwitcher />);

    expect(await screen.findByRole('option', { name: 'Sede norte' })).toBeInTheDocument();
  });

  it('sin ninguna sede no pinta nada: un selector vacío no ofrece nada', async () => {
    mockedList.mockResolvedValue([]);

    const { container } = render(<LocationSwitcher />);

    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('ignora las sedes desactivadas', async () => {
    mockedList.mockResolvedValue([
      sede('l1', 'Sede principal'),
      sede('l2', 'Sede cerrada', false),
    ]);

    render(<LocationSwitcher />);

    await screen.findByRole('option', { name: 'Sede principal' });
    expect(
      screen.queryByRole('option', { name: 'Sede cerrada' }),
    ).not.toBeInTheDocument();
  });
});
