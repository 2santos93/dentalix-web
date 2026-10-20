import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationPhoneSettings } from './location-phone-settings';
import {
  listLocations,
  updateLocationPhone,
  type ClinicLocation,
} from '@/lib/locations/locations-api';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
  updateLocationPhone: jest.fn(),
}));
const mockedList = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedUpdate = updateLocationPhone as jest.MockedFunction<typeof updateLocationPhone>;

const base: ClinicLocation = {
  id: 'l1',
  name: 'Sede principal',
  address: null,
  country: 'CO',
  phone: null,
  isActive: true,
  timeZone: 'America/Bogota',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('LocationPhoneSettings (DX-222)', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([base]);
    mockedUpdate.mockReset();
  });

  it('muestra el campo opcional con su ayuda y limita a 40 caracteres', async () => {
    render(<LocationPhoneSettings token="tok" canEdit />);
    const field = await screen.findByLabelText(/Teléfono · Sede principal/);
    expect(field).toHaveAttribute('maxLength', '40');
    expect(field).toHaveAccessibleDescription('Con indicativo de país, p. ej. +57 601 555 0101');
  });

  it('ADMIN guarda el teléfono y se envía como phone', async () => {
    mockedUpdate.mockResolvedValue({ ...base, phone: '+57 601 555 0101' });
    const user = userEvent.setup();
    render(<LocationPhoneSettings token="tok" canEdit />);
    await user.type(await screen.findByLabelText(/Teléfono · Sede principal/), ' +57 601 555 0101 ');
    await user.click(screen.getByRole('button', { name: 'Guardar el teléfono de Sede principal' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'l1', '+57 601 555 0101'));
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
  });

  it('vaciar el campo envía null', async () => {
    mockedList.mockResolvedValue([{ ...base, phone: '+57 1' }]);
    mockedUpdate.mockResolvedValue(base);
    const user = userEvent.setup();
    render(<LocationPhoneSettings token="tok" canEdit />);
    await user.clear(await screen.findByLabelText(/Teléfono · Sede principal/));
    await user.click(screen.getByRole('button', { name: 'Guardar el teléfono de Sede principal' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'l1', null));
  });

  it('un fallo de la API se muestra en el campo', async () => {
    mockedUpdate.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<LocationPhoneSettings token="tok" canEdit />);
    await user.type(await screen.findByLabelText(/Teléfono · Sede principal/), '123');
    await user.click(screen.getByRole('button', { name: 'Guardar el teléfono de Sede principal' }));
    expect(await screen.findByText(/No pudimos guardar el teléfono|boom/)).toBeInTheDocument();
  });

  it('sin permiso de edición solo lo muestra', async () => {
    mockedList.mockResolvedValue([{ ...base, phone: '+57 601 555 0101' }]);
    render(<LocationPhoneSettings token="tok" canEdit={false} />);
    expect(await screen.findByText('+57 601 555 0101')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Solo un administrador puede cambiarlo.')).toBeInTheDocument();
  });
});
