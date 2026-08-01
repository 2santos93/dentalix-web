import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusinessHoursForm } from './business-hours-form';
import { getLocationSchedule, replaceLocationSchedule } from '@/lib/locations/schedule-api';
import { ApiError } from '@/lib/api/client';

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

const mockedGet = getLocationSchedule as jest.MockedFunction<typeof getLocationSchedule>;
const mockedReplace = replaceLocationSchedule as jest.MockedFunction<
  typeof replaceLocationSchedule
>;

/** Lunes 08:00–12:00 — un solo tramo, suficiente para un guardado válido. */
const schedule = {
  timezone: 'America/Bogota',
  ranges: [{ weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 }],
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedReplace.mockReset();
});

describe('BusinessHoursForm', () => {
  it('un fallo de carga es escalón 1: ocupa el sitio del formulario y ofrece reintento', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

    render(<BusinessHoursForm token="tok" />);

    // `AsyncSection` -> `SectionError`, que renderiza `role="alert"`.
    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor');
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
      timezone: 'America/Bogota',
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
});
