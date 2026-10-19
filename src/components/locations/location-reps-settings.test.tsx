import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationRepsSettings } from './location-reps-settings';
import {
  listLocations,
  updateLocationReps,
  type ClinicLocation,
} from '@/lib/locations/locations-api';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
  updateLocationReps: jest.fn(),
}));
const mockedList = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedUpdate = updateLocationReps as jest.MockedFunction<typeof updateLocationReps>;

const base: ClinicLocation = {
  id: 'l1',
  name: 'Sede principal',
  address: null,
  country: 'CO',
  repsHabilitationCode: null,
  isActive: true,
  timeZone: 'America/Bogota',
  createdAt: '2026-01-01T00:00:00Z',
};
const madrid: ClinicLocation = { ...base, id: 'l2', name: 'Madrid', country: 'ES' };

describe('LocationRepsSettings (DX-212)', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([base, madrid]);
    mockedUpdate.mockReset();
  });

  it('ADMIN guarda el código de 12 dígitos', async () => {
    mockedUpdate.mockResolvedValue({ ...base, repsHabilitationCode: '110010123401' });
    const user = userEvent.setup();
    render(<LocationRepsSettings token="tok" canEdit />);
    const field = await screen.findByLabelText(/Código de habilitación \(REPS\) · Sede principal/);
    await user.type(field, '110010123401');
    await user.click(screen.getByRole('button', { name: 'Guardar el código REPS de Sede principal' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'l1', '110010123401'));
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
  });

  it('formato inválido: error en el campo, sin enviar', async () => {
    const user = userEvent.setup();
    render(<LocationRepsSettings token="tok" canEdit />);
    await user.type(
      await screen.findByLabelText(/Código de habilitación \(REPS\) · Sede principal/),
      '12345',
    );
    await user.click(screen.getByRole('button', { name: /Guardar el código REPS/ }));
    expect(
      await screen.findByText('El código de habilitación REPS debe tener 12 dígitos (ej. 110010123401).'),
    ).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('una sede de España: no aplica', async () => {
    render(<LocationRepsSettings token="tok" canEdit />);
    expect(await screen.findByText('No aplica: el REPS es de Colombia.')).toBeInTheDocument();
  });

  it('sin ser ADMIN: solo lectura, sin campo ni botón', async () => {
    mockedList.mockResolvedValue([{ ...base, repsHabilitationCode: '110010123401' }]);
    render(<LocationRepsSettings token="tok" canEdit={false} />);
    expect(await screen.findByText('110010123401')).toBeInTheDocument();
    expect(screen.getByText('Solo un administrador puede cambiarlo.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
  });

  it('si no cargan las sedes: «Reintentar»', async () => {
    mockedList.mockRejectedValueOnce(new Error('red'));
    const user = userEvent.setup();
    render(<LocationRepsSettings token="tok" canEdit />);
    await user.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('Sede principal')).toBeInTheDocument();
  });
});
