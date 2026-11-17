import { render, screen, waitFor, within } from '@testing-library/react';
import { WeeklyDigestSettingsForm } from './weekly-digest-settings-form';
import {
  getWeeklyDigestSettings,
  updateWeeklyDigestSettings,
  type WeeklyDigestSettings,
} from '@/lib/clinic/weekly-digest-api';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { ApiError } from '@/lib/api/client';
import { clinicLocation } from '@/lib/test/locations';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/clinic/weekly-digest-api', () => ({
  ...jest.requireActual('../../lib/clinic/weekly-digest-api'),
  getWeeklyDigestSettings: jest.fn(),
  updateWeeklyDigestSettings: jest.fn(),
}));
jest.mock('../../lib/locations/use-locations-state', () => ({ useLocationsState: jest.fn() }));

const OWNER = '0193b2a4-5c6d-7e8f-9a0b-000000000001';
const PARTNER = '0193b2a4-5c6d-7e8f-9a0b-000000000002';

const settings = (over: Partial<WeeklyDigestSettings> = {}): WeeklyDigestSettings => ({
  enabled: false,
  weekday: 1,
  hour: 7,
  recipientMembershipIds: [],
  candidates: [
    { membershipId: OWNER, name: 'María Pérez', email: 'ma***@sonrisas.com.ve', verified: true },
    { membershipId: PARTNER, name: 'José Rondón', email: 'jo***@sonrisas.com.ve', verified: false },
  ],
  warnings: [],
  ...over,
});

const retry = jest.fn();

describe('WeeklyDigestSettingsForm (DX-568)', () => {
  beforeEach(() => {
    jest.mocked(getWeeklyDigestSettings).mockReset().mockResolvedValue(settings());
    jest.mocked(updateWeeklyDigestSettings).mockReset();
    jest.mocked(useLocationsState).mockReturnValue({
      status: 'ready',
      locations: [
        clinicLocation({ id: 'l1', name: 'Sede Caracas', timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' }),
        clinicLocation({ id: 'l2', name: 'Sede Valencia' }),
      ],
      activeLocationId: 'l2',
      retry,
    });
  });

  it('carga los ajustes: día desde el lunes, horas con el reloj de la sede principal y cuándo llega', async () => {
    render(<WeeklyDigestSettingsForm token="tok" />);
    const enabled = await screen.findByLabelText('Enviar el resumen semanal', { exact: true });
    expect(enabled).not.toBeChecked();
    const day = screen.getByLabelText('Día', { exact: true });
    expect(day).toHaveValue('1');
    expect(within(day).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ]);
    const hour = screen.getByLabelText('Hora', { exact: true });
    expect(hour).toHaveValue('7');
    expect(within(hour).getAllByRole('option')).toHaveLength(24);
    expect(screen.getByTestId('weekly-digest-when')).toHaveTextContent(
      /^Llega cada lunes a las 7:00\sa\.\sm\., hora de Sede Caracas \(America\/Caracas\), con las cifras de la semana anterior completa \(de lunes a domingo\)\.$/,
    );
    expect(screen.getByText(/Solo cifras: ningún dato de pacientes\./)).toBeInTheDocument();
    // Sin cambios no hay barra de guardar.
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('cada candidato con su correo enmascarado; el no verificado lo dice', async () => {
    render(<WeeklyDigestSettingsForm token="tok" />);
    const group = await screen.findByRole('group', { name: 'Destinatarios' });
    expect(within(group).getByLabelText('María Pérez', { exact: true })).toHaveAccessibleDescription(
      'ma***@sonrisas.com.ve',
    );
    expect(within(group).getByLabelText('José Rondón', { exact: true })).toHaveAccessibleDescription(
      /jo\*\*\*@sonrisas\.com\.ve\s*Sin verificar: no lo recibirá hasta confirmar su correo\./,
    );
  });

  it('activar, elegir día, hora y destinatario y guardar manda el cuerpo entero', async () => {
    const user = setupUser();
    jest
      .mocked(updateWeeklyDigestSettings)
      .mockResolvedValue(settings({ enabled: true, weekday: 5, hour: 18, recipientMembershipIds: [OWNER] }));
    render(<WeeklyDigestSettingsForm token="tok" />);
    await user.click(await screen.findByLabelText('Enviar el resumen semanal', { exact: true }));
    // Activado sin destinatarios: aviso antes de guardar.
    expect(screen.getByTestId('weekly-digest-no-recipients')).toHaveTextContent(
      'Está activado pero sin destinatarios: no saldrá ningún resumen hasta que elijas al menos uno.',
    );
    await user.selectOptions(screen.getByLabelText('Día', { exact: true }), '5');
    await user.selectOptions(screen.getByLabelText('Hora', { exact: true }), '18');
    await user.click(screen.getByLabelText('María Pérez', { exact: true }));
    expect(screen.queryByTestId('weekly-digest-no-recipients')).not.toBeInTheDocument();
    expect(screen.getByTestId('weekly-digest-when')).toHaveTextContent(/^Llega cada viernes a las 6:00\sp\.\sm\./);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(updateWeeklyDigestSettings).toHaveBeenCalledWith('tok', {
        enabled: true,
        weekday: 5,
        hour: 18,
        recipientMembershipIds: [OWNER],
      }),
    );
    expect(await screen.findByText('Resumen semanal guardado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('lo guardado activado y sin destinatarios avisa (NO_RECIPIENTS)', async () => {
    jest.mocked(getWeeklyDigestSettings).mockResolvedValue(settings({ enabled: true, warnings: ['NO_RECIPIENTS'] }));
    render(<WeeklyDigestSettingsForm token="tok" />);
    expect(await screen.findByTestId('weekly-digest-no-recipients')).toBeInTheDocument();
  });

  it('el 400 de la API se dice en la barra y relee los candidatos', async () => {
    const user = setupUser();
    jest
      .mocked(updateWeeklyDigestSettings)
      .mockRejectedValue(new ApiError(400, 'Los destinatarios tienen que ser administradores activos de la clínica.'));
    render(<WeeklyDigestSettingsForm token="tok" />);
    await user.click(await screen.findByLabelText('José Rondón', { exact: true }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('Los destinatarios tienen que ser administradores activos de la clínica.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(getWeeklyDigestSettings).toHaveBeenCalledTimes(2));
    // El borrador no se pierde.
    expect(screen.getByLabelText('José Rondón', { exact: true })).toBeChecked();
  });

  it('sin formato de la sede principal no inventa la hora: «7 h» y la zona sin nombre', async () => {
    jest.mocked(useLocationsState).mockReturnValue({
      status: 'ready',
      locations: [clinicLocation({ id: 'l1', locale: null, hourCycle: null })],
      activeLocationId: null,
      retry,
    });
    render(<WeeklyDigestSettingsForm token="tok" />);
    const hour = await screen.findByLabelText('Hora', { exact: true });
    expect(within(hour).getByRole('option', { name: '7 h' })).toBeInTheDocument();
    expect(screen.getByTestId('weekly-digest-when')).toHaveTextContent(
      'Llega cada lunes a la hora elegida en la zona de la sede principal',
    );
  });

  it('si no carga, error de sección con reintento', async () => {
    const user = setupUser();
    jest.mocked(getWeeklyDigestSettings).mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<WeeklyDigestSettingsForm token="tok" />);
    expect(await screen.findByText('No pudimos cargar el resumen semanal.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Enviar el resumen semanal', { exact: true })).toBeInTheDocument();
  });
});
