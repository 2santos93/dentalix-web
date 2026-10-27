import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffLocationsCard } from './staff-locations-card';
import { getStaffLocations, replaceStaffLocations } from '@/lib/staff/staff-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { Toaster } from '@/components/errors/toaster';
import { clinicLocation } from '@/lib/test/locations';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform — relative path, misma convención que el resto de tests.
jest.mock('../../lib/staff/staff-api', () => ({
  getStaffLocations: jest.fn(),
  replaceStaffLocations: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));

const mockedGet = getStaffLocations as jest.MockedFunction<typeof getStaffLocations>;
const mockedReplace = replaceStaffLocations as jest.MockedFunction<typeof replaceStaffLocations>;
const mockedList = listLocations as jest.MockedFunction<typeof listLocations>;

function sede(id: string, name: string, isActive = true): ClinicLocation {
  return clinicLocation({
    id,
    name,
    address: null,
    country: 'CO',
    isActive,
    timeZone: 'America/Bogota',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedReplace.mockReset();
  mockedList.mockReset();
  mockedList.mockResolvedValue([sede('l1', 'Sede principal'), sede('l2', 'Sede norte')]);
});

function renderCard(role: 'DENTIST' | 'ADMIN' | 'RECEPTION' = 'RECEPTION') {
  return render(
    <>
      <StaffLocationsCard token="tok" userId="u1" memberRole={role} />
      <Toaster />
    </>,
  );
}

describe('StaffLocationsCard (DX-089)', () => {
  it('con todas las sedes marca «Todas las sedes» y deja las sedes desactivadas', async () => {
    mockedGet.mockResolvedValue({ all: true, locationIds: [] });
    renderCard();

    const todas = await screen.findByRole('checkbox', { name: 'Todas las sedes' });
    expect(todas).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sede principal' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Sede norte' })).toBeDisabled();
    // Sin cambios no hay nada que guardar.
    expect(screen.getByRole('button', { name: 'Guardar sedes' })).toBeDisabled();
  });

  it('al acotarlo a una sede guarda solo esa y avisa de cuándo se aplica', async () => {
    mockedGet.mockResolvedValue({ all: true, locationIds: [] });
    mockedReplace.mockResolvedValue({ all: false, locationIds: ['l2'] });
    renderCard();

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Todas las sedes' }));
    const norte = screen.getByRole('checkbox', { name: 'Sede norte' });
    expect(norte).toBeEnabled();
    await userEvent.click(norte);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar sedes' }));

    expect(mockedReplace).toHaveBeenCalledWith('tok', 'u1', ['l2']);
    expect(
      await screen.findByText(
        'Sedes guardadas. Se aplican en la siguiente sesión del miembro (como mucho 15 minutos).',
      ),
    ).toBeInTheDocument();
  });

  it('volver a «Todas las sedes» manda la lista vacía', async () => {
    mockedGet.mockResolvedValue({ all: false, locationIds: ['l1'] });
    mockedReplace.mockResolvedValue({ all: true, locationIds: [] });
    renderCard();

    const todas = await screen.findByRole('checkbox', { name: 'Todas las sedes' });
    expect(todas).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sede principal' })).toBeChecked();
    await userEvent.click(todas);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar sedes' }));

    expect(mockedReplace).toHaveBeenCalledWith('tok', 'u1', []);
  });

  it('sin «Todas» ni ninguna sede marcada no envía y lo explica junto al botón', async () => {
    mockedGet.mockResolvedValue({ all: false, locationIds: ['l1'] });
    renderCard();

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Sede principal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar sedes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Elige al menos una sede o marca «Todas las sedes».',
    );
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('el error de la API (400/409) se queda en línea con su mensaje', async () => {
    mockedGet.mockResolvedValue({ all: true, locationIds: [] });
    mockedReplace.mockRejectedValue(
      new ApiError(400, 'Alguna sede no existe en esta clínica.'),
    );
    renderCard();

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Todas las sedes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sede principal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar sedes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Alguna sede no existe en esta clínica.',
    );
  });

  it('a un ADMIN no se le puede acotar: texto fijo, sin controles ni peticiones', async () => {
    renderCard('ADMIN');

    expect(screen.getByText('El ADMIN siempre tiene todas las sedes.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar sedes' })).not.toBeInTheDocument();
    // Ni siquiera hay efecto que pida nada: se comprueba tras vaciar la cola.
    await act(async () => {});
    expect(mockedGet).not.toHaveBeenCalled();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('acotado solo a sedes ya desactivadas: lo explica y no marca nada', async () => {
    // La API solo devuelve ids activos: `all: false` con lista vacía es eso.
    mockedGet.mockResolvedValue({ all: false, locationIds: [] });
    renderCard();

    expect(
      await screen.findByText(
        'Este miembro no tiene ninguna sede activa asignada; marca al menos una o «Todas las sedes».',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Todas las sedes' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sede principal' })).not.toBeChecked();
  });

  it('las sedes desactivadas no se ofrecen', async () => {
    mockedGet.mockResolvedValue({ all: true, locationIds: [] });
    mockedList.mockResolvedValue([sede('l1', 'Sede principal'), sede('l2', 'Sede cerrada', false)]);
    renderCard();

    await screen.findByRole('checkbox', { name: 'Sede principal' });
    expect(screen.queryByRole('checkbox', { name: /Sede cerrada/ })).not.toBeInTheDocument();
  });

  it('si no se pueden cargar sus sedes ofrece reintentar', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce({ all: true, locationIds: [] });
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('checkbox', { name: 'Todas las sedes' })).toBeChecked();
  });
});
