import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationRegistrationForm } from './location-registration-form';
import { updateLocationHealthRegistration, type ClinicLocation } from '@/lib/locations/locations-api';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  updateLocationHealthRegistration: jest.fn(),
}));
const mockedUpdate = jest.mocked(updateLocationHealthRegistration);

const base: ClinicLocation = clinicLocation({
  id: 'l1',
  name: 'Sede principal',
  healthRegistrationNumber: null,
  showHealthRegistrationNumber: false,
});

const field = () => screen.getByLabelText(/Nº de registro sanitario · Sede principal/);
const toggle = () => screen.getByRole('checkbox', { name: /Mostrar el nº de registro en los documentos/ });
const bar = () => screen.queryByRole('region', { name: 'Cambios sin guardar' });
const save = () => screen.getByRole('button', { name: 'Guardar el nº de registro sanitario de Sede principal' });

function renderForm(location = base, canEdit = true, onSaved = jest.fn()) {
  render(<LocationRegistrationForm token="tok" location={location} canEdit={canEdit} onSaved={onSaved} />);
  return onSaved;
}

describe('LocationRegistrationForm (DX-319, B6)', () => {
  beforeEach(() => mockedUpdate.mockReset());

  it('texto libre con tope de 64, casilla con su ayuda; sin cambios no hay barra de guardado', () => {
    renderForm();
    expect(field()).toHaveAttribute('maxLength', '64');
    expect(field()).toHaveAccessibleDescription(expect.stringContaining('Tal como te lo asignó la autoridad sanitaria.'));
    expect(toggle()).not.toBeChecked();
    expect(toggle()).toHaveAccessibleDescription('Aparecerá en los documentos de esta sede que lo incluyan.');
    expect(bar()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
  });

  it('ADMIN guarda el nº recortado y la casilla desde la barra', async () => {
    const saved = { ...base, healthRegistrationNumber: 'NRS 28/1234-AB', showHealthRegistrationNumber: true };
    mockedUpdate.mockResolvedValue(saved);
    const user = userEvent.setup();
    const onSaved = renderForm();
    await user.type(field(), '  NRS 28/1234-AB ');
    await user.click(toggle());
    expect(bar()).toBeInTheDocument();
    await user.click(save());
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'l1', {
        healthRegistrationNumber: 'NRS 28/1234-AB',
        showHealthRegistrationNumber: true,
      }),
    );
    await waitFor(() => expect(bar()).not.toBeInTheDocument());
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ healthRegistrationNumber: 'NRS 28/1234-AB' }));
    expect(field()).toHaveValue('NRS 28/1234-AB');
  });

  it('«Descartar» vuelve a lo guardado', async () => {
    const user = userEvent.setup();
    renderForm({ ...base, healthRegistrationNumber: 'NRS-1' });
    await user.clear(field());
    await user.click(within(bar()!).getByRole('button', { name: 'Descartar' }));
    expect(field()).toHaveValue('NRS-1');
    expect(bar()).not.toBeInTheDocument();
  });

  it('vaciarlo lo quita (null)', async () => {
    mockedUpdate.mockResolvedValue(base);
    const user = userEvent.setup();
    renderForm({ ...base, healthRegistrationNumber: 'NRS-1' });
    await user.clear(field());
    await user.click(save());
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'l1', {
        healthRegistrationNumber: null,
        showHealthRegistrationNumber: false,
      }),
    );
  });

  it('un 400: error junto al campo, enlazado y con el foco en él', async () => {
    mockedUpdate.mockRejectedValue(
      new ApiError(400, 'Bad Request', { messages: ['El nº de registro sanitario admite hasta 64 caracteres.'] }),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(field(), 'NRS-1');
    await user.click(save());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El nº de registro sanitario admite hasta 64 caracteres.');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription(expect.stringContaining('admite hasta 64 caracteres'));
    expect(field()).toHaveFocus();
  });

  it.each([
    ['403', new ApiError(403, 'Forbidden')],
    ['red', new NetworkError(new TypeError('Failed to fetch'))],
  ])('un fallo que no es del campo (%s): error en la barra, el campo no queda inválido', async (_, err) => {
    mockedUpdate.mockRejectedValue(err);
    const user = userEvent.setup();
    renderForm();
    await user.type(field(), 'NRS-1');
    await user.click(save());
    expect(await within(bar()!).findByRole('alert')).toBeInTheDocument();
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(field()).toHaveValue('NRS-1');
  });

  it('sin ser ADMIN: solo lectura, sin campo, casilla ni botón', () => {
    renderForm({ ...base, healthRegistrationNumber: 'NRS-1', showHealthRegistrationNumber: true }, false);
    expect(screen.getByText('NRS-1')).toBeInTheDocument();
    expect(screen.getByText('Aparece en los documentos')).toBeInTheDocument();
    expect(screen.getByText('Solo un administrador puede cambiarlo.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
