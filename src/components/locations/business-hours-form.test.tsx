import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusinessHoursForm } from './business-hours-form';
import { getLocationSchedule, replaceLocationSchedule } from '@/lib/locations/schedule-api';
import { ApiError } from '@/lib/api/client';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { tokenFor } from '@/lib/test/prescriptions';

// NOTE: el literal de `jest.mock` no pasa por la reescritura de alias del
// transform de SWC (solo los especificadores reales de `import`/`require`) —
// ruta relativa, misma convención que `pending-invitations.test.tsx`.
jest.mock('../../lib/locations/schedule-api', () => {
  const actual = jest.requireActual('../../lib/locations/schedule-api');
  return {
    ...actual,
    getLocationSchedule: jest.fn(),
    replaceLocationSchedule: jest.fn(),
  };
});

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));

const mockedGet = getLocationSchedule as jest.MockedFunction<typeof getLocationSchedule>;
const mockedReplace = replaceLocationSchedule as jest.MockedFunction<
  typeof replaceLocationSchedule
>;

/** Lunes 08:00–12:00 — un solo tramo, suficiente para un guardado válido. */
const schedule = {
  timezone: 'Asia/Tokyo',
  ranges: [{ weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 }],
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedReplace.mockReset();
  jest.mocked(listLocations).mockReset().mockResolvedValue([clinicLocation({ timeZone: 'Pacific/Auckland' })]);
});

describe('BusinessHoursForm', () => {
  it('un fallo de carga es escalón 1: ocupa el sitio del formulario y ofrece reintento', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

    render(<BusinessHoursForm token="tok" />);

    // `AsyncSection` -> `SectionError`, que renderiza `role="alert"`.
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el horario.');
    // El formulario no está: la sección no tiene nada que mostrar.
    expect(screen.queryByRole('form', { name: 'Guardar horario' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el reintento vuelve a pedir el horario y deja ver el formulario', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    mockedGet.mockResolvedValueOnce(schedule);
    const user = userEvent.setup();

    render(<BusinessHoursForm token="tok" />);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    // La superficie de error DESAPARECE y el contenido aparece — sin esto, un
    // reintento podría cargar los datos y dejarlos invisibles detrás del error.
    expect(await screen.findByRole('form', { name: 'Guardar horario' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('un fallo de guardado es escalón 4: mensaje junto al formulario, que sigue en pie', async () => {
    mockedGet.mockResolvedValue(schedule);
    mockedReplace.mockRejectedValueOnce(new ApiError(409, 'La sede ya cambió su horario'));
    const user = userEvent.setup();

    render(<BusinessHoursForm token="tok" />);
    const form = await screen.findByRole('form', { name: 'Guardar horario' });

    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La sede ya cambió su horario');
    // El formulario NO desaparece: el usuario acaba de actuar y sigue editando.
    expect(form).toBeInTheDocument();
  });

  it('la validación de tramos se muestra sin llamar a la API', async () => {
    mockedGet.mockResolvedValue({
      timezone: 'Asia/Tokyo',
      // fin ANTES del inicio — inválido.
      ranges: [{ weekday: 1, startMinute: 12 * 60, endMinute: 8 * 60 }],
    });
    const user = userEvent.setup();

    render(<BusinessHoursForm token="tok" />);
    await screen.findByRole('form', { name: 'Guardar horario' });

    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /fin posterior a la de inicio|tramo/i,
    );
    await waitFor(() => expect(mockedReplace).not.toHaveBeenCalled());
  });

  it('hours form has no zone field and the PUT has no timezone', async () => {
    mockedGet.mockResolvedValue(schedule);
    mockedReplace.mockResolvedValue(schedule);
    const user = userEvent.setup();

    render(<BusinessHoursForm token={tokenFor('ADMIN')} />);
    const form = await screen.findByRole('form', { name: 'Guardar horario' });

    // La zona se muestra (es la de la sede) pero no se edita aquí.
    expect(screen.queryByLabelText('Zona horaria')).not.toBeInTheDocument();
    expect(form).toHaveTextContent('Zona horaria: Asia/Tokyo · Se cambia en Ajustes → Sedes');
    expect(screen.getByRole('link', { name: 'Ajustes → Sedes' })).toHaveAttribute('href', '/settings/sedes');

    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));
    await waitFor(() => expect(mockedReplace).toHaveBeenCalledTimes(1));
    expect(mockedReplace.mock.calls[0][1]).toEqual({ ranges: schedule.ranges });
    expect(mockedReplace.mock.calls[0][1]).not.toHaveProperty('timezone');
  });

  it('without a schedule the zone is the location one, never a default; no link for non-ADMIN', async () => {
    mockedGet.mockResolvedValue(null);

    render(<BusinessHoursForm token={tokenFor('RECEPTIONIST')} />);
    const form = await screen.findByRole('form', { name: 'Guardar horario' });
    await waitFor(() => expect(form).toHaveTextContent('Zona horaria: Pacific/Auckland'));
    expect(form).not.toHaveTextContent('America/Bogota');
    expect(screen.queryByRole('link', { name: 'Ajustes → Sedes' })).not.toBeInTheDocument();
  });

  it('a location without zone shows the sede error with retry, never Bogotá', async () => {
    mockedGet.mockResolvedValue(null);
    jest.mocked(listLocations).mockResolvedValue([clinicLocation({ timeZone: null })]);

    render(<BusinessHoursForm token={tokenFor('ADMIN')} />);
    const form = await screen.findByRole('form', { name: 'Guardar horario' });
    expect(await within(form).findByText('Sin zona de sede')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(form).not.toHaveTextContent('Bogota');
  });

  it('while the location list loads the zone reads «…», not «por configurar»', async () => {
    mockedGet.mockResolvedValue(null);
    jest.mocked(listLocations).mockReturnValue(new Promise(() => {}));

    render(<BusinessHoursForm token={tokenFor('ADMIN')} />);
    const form = await screen.findByRole('form', { name: 'Guardar horario' });
    expect(form).toHaveTextContent('Zona horaria: …');
    expect(form).not.toHaveTextContent(/por configurar/i);
  });
});
