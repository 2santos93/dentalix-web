import { render, screen, waitFor } from '@testing-library/react';
import { LocationSwitcher } from './location-switcher';
import { useAuthStore } from '@/lib/auth/auth-store';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import {
  getActiveLocationId,
  setActiveLocationId,
} from '@/lib/locations/location-store';

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
    country: 'CO',
    isActive,
    timeZone: 'America/Bogota',
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

  // La sede guardada sobrevive a la sede REAL: si se borra (o se reseedea la
  // base y cambian los ids), en localStorage queda un id huérfano que
  // `api/client.ts` sigue mandando como `X-Location-Id` en CADA request, y el
  // backend responde 400 "Unknown location for this clinic" a TODAS — la app
  // entera queda inutilizable hasta que alguien limpia localStorage a mano.
  // Al recibir la lista real hay que reconciliar y soltar lo que no exista.
  describe('sede guardada que ya no existe', () => {
    it('la descarta y cae a la vista consolidada', async () => {
      setActiveLocationId('sede-borrada');
      mockedList.mockResolvedValue([sede('l1', 'Sede principal')]);

      render(<LocationSwitcher />);

      await waitFor(() => expect(getActiveLocationId()).toBeNull());
    });

    it('deja el selector en «Todas las sedes», no en un valor fantasma', async () => {
      setActiveLocationId('sede-borrada');
      mockedList.mockResolvedValue([sede('l1', 'Sede principal')]);

      render(<LocationSwitcher />);

      const select = (await screen.findByLabelText('Sede')) as HTMLSelectElement;
      await waitFor(() => expect(select.value).toBe(''));
    });

    it('una sede desactivada también se descarta: no se puede operar en ella', async () => {
      setActiveLocationId('l2');
      mockedList.mockResolvedValue([
        sede('l1', 'Sede principal'),
        sede('l2', 'Sede cerrada', false),
      ]);

      render(<LocationSwitcher />);

      await waitFor(() => expect(getActiveLocationId()).toBeNull());
    });

    it('una sede que SÍ existe se respeta', async () => {
      setActiveLocationId('l2');
      mockedList.mockResolvedValue([
        sede('l1', 'Sede principal'),
        sede('l2', 'Sede norte'),
      ]);

      render(<LocationSwitcher />);

      await screen.findByRole('option', { name: 'Sede norte' });
      expect(getActiveLocationId()).toBe('l2');
    });

    it('si la lista no se puede cargar NO se descarta nada', async () => {
      // Un fallo de red no es prueba de que la sede haya desaparecido. Tirarla
      // aquí sacaría al usuario de su sede cada vez que la petición falle.
      setActiveLocationId('l1');
      mockedList.mockRejectedValue(new Error('network'));

      render(<LocationSwitcher />);

      await waitFor(() => expect(mockedList).toHaveBeenCalled());
      expect(getActiveLocationId()).toBe('l1');
    });
  });

  // DX-089: un miembro con sedes acotadas (claim `loc` del token) solo ve las
  // suyas y nunca «Todas las sedes»: la API rechazaría con 403 cualquier otra.
  describe('miembro con sedes acotadas (claim `loc`)', () => {
    function tokenWithLoc(loc: string[]): string {
      const b64url = (value: string) =>
        btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${b64url('{"alg":"HS256"}')}.${b64url(
        JSON.stringify({ sub: 'u1', role: 'RECEPTION', loc }),
      )}.firma`;
    }

    it('con varias permitidas ofrece «Mis sedes» y solo esas, sin «Todas las sedes»', async () => {
      useAuthStore.setState({ accessToken: tokenWithLoc(['l1', 'l2']) });
      // Aunque la API ya filtra, el selector también filtra por el claim.
      mockedList.mockResolvedValue([
        sede('l1', 'Sede principal'),
        sede('l2', 'Sede norte'),
        sede('l3', 'Sede sur'),
      ]);

      render(<LocationSwitcher />);

      const select = (await screen.findByLabelText('Sede')) as HTMLSelectElement;
      expect(screen.getByRole('option', { name: 'Mis sedes' })).toHaveValue('');
      expect(screen.getByRole('option', { name: 'Sede norte' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Sede sur' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Todas las sedes' })).not.toBeInTheDocument();
      expect(select.value).toBe('');
      expect(getActiveLocationId()).toBeNull();
    });

    it('con UNA permitida la deja elegida y guardada, sin opción vacía', async () => {
      useAuthStore.setState({ accessToken: tokenWithLoc(['l2']) });
      mockedList.mockResolvedValue([sede('l2', 'Sede norte')]);

      render(<LocationSwitcher />);

      const select = (await screen.findByLabelText('Sede')) as HTMLSelectElement;
      await waitFor(() => expect(select.value).toBe('l2'));
      expect(screen.getAllByRole('option')).toHaveLength(1);
      expect(screen.queryByRole('option', { name: 'Mis sedes' })).not.toBeInTheDocument();
      expect(getActiveLocationId()).toBe('l2');
    });

    it('si la guardada ya no está permitida la cambia por la primera permitida', async () => {
      setActiveLocationId('l3');
      useAuthStore.setState({ accessToken: tokenWithLoc(['l1', 'l2']) });
      mockedList.mockResolvedValue([
        sede('l1', 'Sede principal'),
        sede('l2', 'Sede norte'),
        sede('l3', 'Sede sur'),
      ]);

      render(<LocationSwitcher />);

      const select = (await screen.findByLabelText('Sede')) as HTMLSelectElement;
      await waitFor(() => expect(getActiveLocationId()).toBe('l1'));
      expect(select.value).toBe('l1');
    });
  });
});
