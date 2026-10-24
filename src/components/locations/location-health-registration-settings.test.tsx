import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationHealthRegistrationSettings } from './location-health-registration-settings';
import {
  listLocations,
  updateLocationHealthRegistration,
  type ClinicLocation,
} from '@/lib/locations/locations-api';
import { ApiError, NetworkError } from '@/lib/api/api-error';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
  updateLocationHealthRegistration: jest.fn(),
}));
const mockedList = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedUpdate = updateLocationHealthRegistration as jest.MockedFunction<
  typeof updateLocationHealthRegistration
>;

const base: ClinicLocation = {
  id: 'l1',
  name: 'Sede principal',
  address: null,
  country: 'CO',
  healthRegistrationNumber: null,
  showHealthRegistrationNumber: false,
  isActive: true,
  timeZone: 'America/Bogota',
  createdAt: '2026-01-01T00:00:00Z',
};
const madrid: ClinicLocation = { ...base, id: 'l2', name: 'Madrid', country: 'ES' };

const field = () => screen.findByLabelText(/Nº de registro sanitario · Sede principal/);
const toggle = () => screen.getByRole('checkbox', { name: /Mostrar en los documentos · Sede principal/ });
/** La región de estado de la fila de la sede principal (cada fila tiene la suya). */
const principalStatus = async () =>
  within((await field()).closest('form') as HTMLFormElement).getByRole('status');
const save = () =>
  screen.getByRole('button', { name: 'Guardar el nº de registro sanitario de Sede principal' });

describe('LocationHealthRegistrationSettings (DX-319)', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([base, madrid]);
    mockedUpdate.mockReset();
  });

  it('campo opcional de texto libre con su ayuda, tope de 64 y casilla con su ayuda', async () => {
    render(<LocationHealthRegistrationSettings token="tok" canEdit />);
    const input = await field();
    expect(input).toHaveAttribute('maxLength', '64');
    expect(input).toHaveAccessibleDescription(
      'Texto libre, tal como te lo asignó la autoridad sanitaria. Hasta 64 caracteres.',
    );
    expect(toggle()).not.toBeChecked();
    expect(toggle()).toHaveAccessibleDescription(
      'Si lo activas, aparecerá en los documentos de esta sede que lo incluyan.',
    );
    // Sin cambios no se puede guardar.
    expect(save()).toBeDisabled();
  });

  it('cualquier sede, de cualquier país, lo edita igual (sin formato por país)', async () => {
    render(<LocationHealthRegistrationSettings token="tok" canEdit />);
    expect(await screen.findByLabelText(/Nº de registro sanitario · Madrid/)).toBeInTheDocument();
    expect(screen.queryByText(/No aplica/)).toBeNull();
  });

  it('ADMIN guarda el nº recortado y la casilla', async () => {
    mockedUpdate.mockResolvedValue({
      ...base,
      healthRegistrationNumber: 'NRS 28/1234-AB',
      showHealthRegistrationNumber: true,
    });
    const user = userEvent.setup();
    render(<LocationHealthRegistrationSettings token="tok" canEdit />);
    await user.type(await field(), '  NRS 28/1234-AB ');
    await user.click(toggle());
    await user.click(save());
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'l1', {
        healthRegistrationNumber: 'NRS 28/1234-AB',
        showHealthRegistrationNumber: true,
      }),
    );
    const status = await principalStatus();
    await waitFor(() => expect(status).toHaveTextContent('Guardado'));
    expect(await field()).toHaveValue('NRS 28/1234-AB');
    expect(save()).toBeDisabled();
  });

  it('vaciarlo lo quita (null)', async () => {
    mockedList.mockResolvedValue([{ ...base, healthRegistrationNumber: 'NRS-1' }]);
    mockedUpdate.mockResolvedValue(base);
    const user = userEvent.setup();
    render(<LocationHealthRegistrationSettings token="tok" canEdit />);
    await user.clear(await field());
    await user.click(save());
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'l1', {
        healthRegistrationNumber: null,
        showHealthRegistrationNumber: false,
      }),
    );
  });

  it('si falla el guardado: error junto al campo, enlazado y con el foco en él', async () => {
    mockedUpdate.mockRejectedValue(
      new ApiError(400, 'Bad Request', {
        messages: ['El nº de registro sanitario admite hasta 64 caracteres.'],
      }),
    );
    const user = userEvent.setup();
    render(<LocationHealthRegistrationSettings token="tok" canEdit />);
    const input = await field();
    await user.type(input, 'NRS-1');
    await user.click(save());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El nº de registro sanitario admite hasta 64 caracteres.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(expect.stringContaining('admite hasta 64 caracteres'));
    expect(input).toHaveFocus();
  });

  it.each([
    ['403', new ApiError(403, 'Forbidden')],
    ['503', new ApiError(503, 'Service Unavailable')],
    ['red', new NetworkError(new TypeError('Failed to fetch'))],
  ])('si falla por %s (no es del campo): error visible y foco en «Guardar», el campo no queda inválido', async (_, err) => {
    mockedUpdate.mockRejectedValue(err);
    const user = userEvent.setup();
    render(<LocationHealthRegistrationSettings token="tok" canEdit />);
    const input = await field();
    await user.type(input, 'NRS-1');
    await user.click(save());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(save()).toHaveFocus();
    expect(save()).toHaveAccessibleDescription(expect.stringMatching(/\S/));
  });

  it('la región de estado está siempre montada y solo cambia su texto', async () => {
    mockedUpdate.mockResolvedValue({ ...base, healthRegistrationNumber: 'NRS-1' });
    const user = userEvent.setup();
    render(<LocationHealthRegistrationSettings token="tok" canEdit />);
    await user.type(await field(), 'NRS-1');
    const status = await principalStatus();
    expect(status).toHaveTextContent('');
    await user.click(save());
    await waitFor(() => expect(status).toHaveTextContent('Guardado'));
    expect(await principalStatus()).toBe(status);
  });

  it('sin ser ADMIN: solo lectura, sin campo, casilla ni botón', async () => {
    mockedList.mockResolvedValue([
      { ...base, healthRegistrationNumber: 'NRS-1', showHealthRegistrationNumber: true },
      madrid,
    ]);
    render(<LocationHealthRegistrationSettings token="tok" canEdit={false} />);
    expect(await screen.findByText('NRS-1')).toBeInTheDocument();
    expect(screen.getByText('Aparece en los documentos')).toBeInTheDocument();
    expect(screen.getByText('Sin nº')).toBeInTheDocument();
    expect(screen.getByText('No aparece en los documentos')).toBeInTheDocument();
    expect(screen.getAllByText('Solo un administrador puede cambiarlo.')).toHaveLength(2);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
  });

  it('si no cargan las sedes: error de sección con «Reintentar»', async () => {
    mockedList.mockRejectedValueOnce(new Error('red'));
    const user = userEvent.setup();
    render(<LocationHealthRegistrationSettings token="tok" canEdit />);
    await user.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('Sede principal')).toBeInTheDocument();
  });
});
