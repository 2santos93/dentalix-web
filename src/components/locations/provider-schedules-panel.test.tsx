import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderSchedulesPanel } from './provider-schedules-panel';
import {
  deleteProviderOverride,
  getProviderSchedule,
  getProviderScheduleSettings,
  getRoster,
  listProviderOverrides,
  replaceProviderSchedule,
  setProviderOverride,
  updateProviderScheduleSettings,
  type ProviderSchedule,
  type Roster,
} from '@/lib/locations/provider-schedule-api';
import { ApiError } from '@/lib/api/client';
import { listStaff } from '@/lib/appointments/staff-api';

// Ruta relativa: el literal de `jest.mock` no pasa por el alias (ver
// business-hours-form.test.tsx).
jest.mock('../../lib/locations/provider-schedule-api', () => {
  const actual = jest.requireActual('../../lib/locations/provider-schedule-api');
  return {
    ...actual,
    getRoster: jest.fn(),
    getProviderSchedule: jest.fn(),
    replaceProviderSchedule: jest.fn(),
    listProviderOverrides: jest.fn(),
    setProviderOverride: jest.fn(),
    deleteProviderOverride: jest.fn(),
    getProviderScheduleSettings: jest.fn(),
    updateProviderScheduleSettings: jest.fn(),
  };
});
jest.mock('../../lib/appointments/staff-api', () => ({ listStaff: jest.fn() }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const mockedRoster = getRoster as jest.MockedFunction<typeof getRoster>;
const mockedStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedGet = getProviderSchedule as jest.MockedFunction<typeof getProviderSchedule>;
const mockedReplace = replaceProviderSchedule as jest.MockedFunction<typeof replaceProviderSchedule>;
const mockedOverrides = listProviderOverrides as jest.MockedFunction<typeof listProviderOverrides>;
const mockedSetOverride = setProviderOverride as jest.MockedFunction<typeof setProviderOverride>;
const mockedDeleteOverride = deleteProviderOverride as jest.MockedFunction<typeof deleteProviderOverride>;
const mockedSettings = getProviderScheduleSettings as jest.MockedFunction<
  typeof getProviderScheduleSettings
>;
const mockedUpdateSettings = updateProviderScheduleSettings as jest.MockedFunction<
  typeof updateProviderScheduleSettings
>;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const roster: Roster = {
  from: '2026-10-19',
  to: '2026-10-25',
  locationId: null,
  locations: [
    { id: A, name: 'Sede A', timeZone: 'America/Bogota' },
    { id: B, name: 'Sede B', timeZone: 'America/Bogota' },
  ],
  providers: [
    { providerId: 'dra-x', fullName: 'Dra. Ximena', role: 'DENTIST', configured: false, days: [] },
    { providerId: 'dr-y', fullName: 'Dr. Yepes', role: 'DENTIST', configured: true, days: [] },
  ],
};

const unconfigured: ProviderSchedule = { providerId: 'dra-x', configured: false, locations: [] };
const configured: ProviderSchedule = {
  providerId: 'dra-x',
  configured: true,
  locations: [
    {
      locationId: A,
      locationName: 'Sede A',
      timeZone: 'America/Bogota',
      ranges: [{ weekday: 1, startMinute: 480, endMinute: 780 }],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedRoster.mockResolvedValue(roster);
  mockedStaff.mockResolvedValue([
    { userId: 'dra-x', fullName: 'Dra. Ximena', role: 'DENTIST', locationIds: null },
    { userId: 'dr-y', fullName: 'Dr. Yepes', role: 'DENTIST', locationIds: null },
  ]);
  mockedGet.mockResolvedValue(unconfigured);
  mockedOverrides.mockResolvedValue([]);
  mockedSettings.mockResolvedValue({ strictProviderSchedule: false });
});

function day(name: string) {
  return screen.getByRole('group', { name });
}

/** Los tramos son `TimeField` (segmentos hora/minuto, 24 h en `es`): se escribe por segmentos. */
async function typeTime(
  user: ReturnType<typeof userEvent.setup>,
  scope: ReturnType<typeof within>,
  name: string,
  digits: string,
) {
  const [hour] = scope.getAllByRole('spinbutton').filter((el: HTMLElement) => el.closest(`[aria-label="${name}"]`));
  await user.click(hour);
  await user.keyboard(digits);
}

describe('ProviderSchedulesPanel', () => {
  it('carga con esqueleto y, sin horario, muestra el estado vacío que explica la regla', async () => {
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Este profesional aún no tiene horario: se le puede citar en cualquier horario de la sede.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Profesional' })).toHaveValue('dra-x');
  });

  it('un fallo de carga es escalón 1 con reintento', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const user = userEvent.setup();
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el horario del profesional.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Guardar horario' })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('un ADMIN define lunes en la sede A y jueves en la B, y guarda con confirmación', async () => {
    mockedReplace.mockResolvedValue(configured);
    const user = userEvent.setup();
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    await screen.findByRole('button', { name: 'Guardar horario' });

    await user.click(within(day('Lunes')).getByRole('button', { name: 'Agregar tramo en Sede A' }));
    const lunesA = within(day('Lunes'));
    await typeTime(user, lunesA, 'Desde, Lunes, Sede A, tramo 1', '0800');
    await typeTime(user, lunesA, 'Hasta, Lunes, Sede A, tramo 1', '1300');

    await user.click(within(day('Jueves')).getByRole('button', { name: 'Agregar tramo en Sede B' }));
    const juevesB = within(day('Jueves'));
    await typeTime(user, juevesB, 'Desde, Jueves, Sede B, tramo 1', '1400');
    await typeTime(user, juevesB, 'Hasta, Jueves, Sede B, tramo 1', '1900');

    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));

    await waitFor(() =>
      expect(mockedReplace).toHaveBeenCalledWith('tok', 'dra-x', {
        locations: [
          { locationId: A, ranges: [{ weekday: 1, startMinute: 480, endMinute: 780 }] },
          { locationId: B, ranges: [{ weekday: 4, startMinute: 840, endMinute: 1140 }] },
        ],
      }),
    );
    expect(await screen.findByText('Horario guardado.')).toBeInTheDocument();
  });

  it('el solape del mismo día en dos sedes se avisa sin llamar a la API', async () => {
    mockedGet.mockResolvedValue({
      ...configured,
      locations: [
        ...configured.locations,
        {
          locationId: B,
          locationName: 'Sede B',
          timeZone: 'America/Bogota',
          ranges: [{ weekday: 1, startMinute: 600, endMinute: 900 }],
        },
      ],
    });
    const user = userEvent.setup();
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    await user.click(await screen.findByRole('button', { name: 'Guardar horario' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lunes: el tramo de Sede A se solapa con el de Sede B.',
    );
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('el 400 de la API se enseña junto al botón', async () => {
    mockedGet.mockResolvedValue(configured);
    mockedReplace.mockRejectedValue(
      new ApiError(400, 'El jueves ya trabaja en Sede B de 08:00 a 12:00 por una excepción.'),
    );
    const user = userEvent.setup();
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    await user.click(await screen.findByRole('button', { name: 'Guardar horario' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El jueves ya trabaja en Sede B');
  });

  it('«Copiar a…» lleva el lunes a los días elegidos', async () => {
    mockedGet.mockResolvedValue(configured);
    mockedReplace.mockResolvedValue(configured);
    const user = userEvent.setup();
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    await screen.findByRole('button', { name: 'Guardar horario' });

    await user.click(within(day('Lunes')).getByRole('button', { name: 'Copiar el lunes a otros días' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Miércoles' }));
    await user.click(within(dialog).getByRole('button', { name: 'Copiar' }));

    expect(within(day('Miércoles')).getByRole('group', { name: 'Desde, Miércoles, Sede A, tramo 1' })).toHaveTextContent(
      /08\D*00/,
    );
    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));
    await waitFor(() =>
      expect(mockedReplace).toHaveBeenCalledWith('tok', 'dra-x', {
        locations: [
          {
            locationId: A,
            ranges: [
              { weekday: 1, startMinute: 480, endMinute: 780 },
              { weekday: 3, startMinute: 480, endMinute: 780 },
            ],
          },
        ],
      }),
    );
  });

  it('a un profesional acotado a la sede A (DX-089) solo se le ofrece la sede A', async () => {
    mockedStaff.mockResolvedValue([
      { userId: 'dra-x', fullName: 'Dra. Ximena', role: 'DENTIST', locationIds: [A] },
      { userId: 'dr-y', fullName: 'Dr. Yepes', role: 'DENTIST', locationIds: null },
    ]);
    const user = userEvent.setup();
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    const monday = await screen.findByRole('group', { name: 'Lunes' });
    expect(within(monday).getByRole('button', { name: 'Agregar tramo en Sede A' })).toBeInTheDocument();
    expect(within(monday).queryByRole('button', { name: 'Agregar tramo en Sede B' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Añadir excepción' }));
    const dialog = await screen.findByRole('dialog');
    const options = within(within(dialog).getByLabelText('Sede')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Sede A']);

    // Sin restricción, las dos.
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Profesional' }), 'dr-y');
    const mondayY = await screen.findByRole('group', { name: 'Lunes' });
    expect(within(mondayY).getByRole('button', { name: 'Agregar tramo en Sede B' })).toBeInTheDocument();
  });

  it('un profesional acotado solo a sedes que ya no están se explica en lugar del editor', async () => {
    mockedStaff.mockResolvedValue([
      { userId: 'dra-x', fullName: 'Dra. Ximena', role: 'DENTIST', locationIds: [] },
      { userId: 'dr-y', fullName: 'Dr. Yepes', role: 'DENTIST', locationIds: null },
    ]);
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    expect(
      await screen.findByText('No atiende en ninguna de estas sedes: asígnale sedes en su ficha de Personal.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar horario' })).not.toBeInTheDocument();
  });

  it('otros roles lo ven en solo lectura: sin campos ni botones de guardar', async () => {
    mockedGet.mockResolvedValue(configured);
    render(<ProviderSchedulesPanel token="tok" canEdit={false} />);
    expect(await within(await screen.findByRole('group', { name: 'Lunes' })).findByText('08:00–13:00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar horario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir excepción' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Modo estricto/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo un administrador puede cambiar/)).toBeInTheDocument();
  });

  it('una excepción «no trabaja» se crea sin tramos y aparece en la lista', async () => {
    mockedGet.mockResolvedValue(configured);
    mockedSetOverride.mockResolvedValue({
      id: 'ov-1',
      providerId: 'dra-x',
      locationId: B,
      locationName: 'Sede B',
      date: '2031-10-23',
      ranges: [],
      off: true,
      note: 'Congreso',
      replaced: false,
    });
    const user = userEvent.setup();
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    await user.click(await screen.findByRole('button', { name: 'Añadir excepción' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Sede'), B);
    // `DatePicker` (B6): segmentos dd/mm/aaaa del formato «es».
    const [dayInput] = within(within(dialog).getByRole('group', { name: 'Fecha' })).getAllByRole('spinbutton');
    await user.click(dayInput);
    await user.keyboard('23102031');
    await user.type(within(dialog).getByLabelText('Nota (opcional)'), 'Congreso');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar excepción' }));

    await waitFor(() =>
      expect(mockedSetOverride).toHaveBeenCalledWith('tok', 'dra-x', {
        locationId: B,
        date: '2031-10-23',
        ranges: [],
        note: 'Congreso',
      }),
    );
    const list = await screen.findByRole('list', { name: 'Excepciones por fecha' });
    expect(within(list).getByText(/No trabaja/)).toBeInTheDocument();
    expect(within(list).getByText(/Sede B/)).toBeInTheDocument();
  });

  it('quitar una excepción pide confirmación', async () => {
    mockedOverrides.mockResolvedValue([
      {
        id: 'ov-1',
        providerId: 'dra-x',
        locationId: B,
        locationName: 'Sede B',
        date: '2031-10-23',
        ranges: [{ startMinute: 540, endMinute: 720 }],
        off: false,
        note: null,
      },
    ]);
    mockedDeleteOverride.mockResolvedValue();
    const user = userEvent.setup();
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    const list = await screen.findByRole('list', { name: 'Excepciones por fecha' });
    expect(within(list).getByText(/09:00–12:00/)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: /Quitar la excepción/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Quitar excepción' }));
    await waitFor(() => expect(mockedDeleteOverride).toHaveBeenCalledWith('tok', 'dra-x', 'ov-1'));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Excepciones por fecha' })).not.toBeInTheDocument());
  });

  it('el ADMIN activa el modo estricto', async () => {
    mockedUpdateSettings.mockResolvedValue({ strictProviderSchedule: true });
    const user = userEvent.setup();
    render(<ProviderSchedulesPanel token="tok" canEdit />);
    const toggle = await screen.findByRole('switch', { name: /Modo estricto/ });
    await user.click(toggle);
    await waitFor(() =>
      expect(mockedUpdateSettings).toHaveBeenCalledWith('tok', { strictProviderSchedule: true }),
    );
    await waitFor(() => expect(toggle).toBeChecked());
  });
});
