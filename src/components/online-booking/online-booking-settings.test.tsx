import { render, screen, waitFor, within } from '@testing-library/react';
import { OnlineBookingSettingsSection, parseDuration, validateGeneral } from './online-booking-settings';
import {
  getOnlineBookingSettings,
  listOnlineTypes,
  saveOnlineBookingSettings,
  saveOnlineType,
  type OnlineBookingSettings,
  type OnlineType,
} from '../../lib/online-booking/online-booking-api';
import { listStaff } from '../../lib/appointments/staff-api';
import { clearSessionStore } from '../../lib/session/session-store';
import { setupUser } from '../../lib/test/user';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/settings/reserva-online',
}));
jest.mock('../../lib/locations/locations-api', () => {
  const { caracasSede } = jest.requireActual('../../lib/test/sede-clock');
  return { listLocations: jest.fn().mockResolvedValue([caracasSede({ id: 'loc-1', name: 'Sede Chacao' })]) };
});
jest.mock('../../lib/appointments/staff-api', () => ({ listStaff: jest.fn() }));
jest.mock('../../lib/online-booking/online-booking-api', () => ({
  ...jest.requireActual('../../lib/online-booking/online-booking-api'),
  getOnlineBookingSettings: jest.fn(),
  saveOnlineBookingSettings: jest.fn(),
  listOnlineTypes: jest.fn(),
  saveOnlineType: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const getSettings = jest.mocked(getOnlineBookingSettings);
const saveSettings = jest.mocked(saveOnlineBookingSettings);
const types = jest.mocked(listOnlineTypes);
const saveType = jest.mocked(saveOnlineType);

const SETTINGS: OnlineBookingSettings = {
  enabled: false,
  newPatientMode: 'REQUEST',
  existingPatientMode: 'REQUEST',
  minLeadMinutesNew: 120,
  minLeadMinutesExisting: 120,
  maxAdvanceDays: 60,
  slotStepMinutes: 15,
  updatedAt: null,
};

const TYPE: OnlineType = {
  appointmentTypeId: 't-1',
  name: 'Limpieza dental',
  color: '#0E7490',
  durationMinutes: 30,
  active: true,
  visibleOnline: false,
  durationNewMinutes: 45,
  durationExistingMinutes: null,
  providerIds: [],
  locationIds: [],
};

describe('Ajustes › Reserva online (DX-016)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
    getSettings.mockResolvedValue(SETTINGS);
    types.mockResolvedValue([TYPE]);
    jest.mocked(listStaff).mockResolvedValue([
      { userId: 'p-1', fullName: 'Dra. María Rodríguez', role: 'DENTIST', locationIds: null },
      { userId: 'r-1', fullName: 'Ana Recepción', role: 'RECEPTION', locationIds: null },
    ]);
  });

  it('valida como la API: enteros en rango y la antelación mínima dentro de la máxima', () => {
    const base = {
      enabled: true,
      newPatientMode: 'DIRECT' as const,
      existingPatientMode: 'REQUEST' as const,
      minLeadMinutesNew: '120',
      minLeadMinutesExisting: '60',
      maxAdvanceDays: '30',
      slotStepMinutes: 15,
    };
    expect(validateGeneral(base)).toEqual({
      input: { ...base, minLeadMinutesNew: 120, minLeadMinutesExisting: 60, maxAdvanceDays: 30 },
    });
    expect(validateGeneral({ ...base, minLeadMinutesNew: '1,5' })).toMatchObject({ errors: { minLeadMinutesNew: expect.any(String) } });
    expect(validateGeneral({ ...base, maxAdvanceDays: '0' })).toMatchObject({ errors: { maxAdvanceDays: expect.any(String) } });
    expect(validateGeneral({ ...base, maxAdvanceDays: '1', minLeadMinutesNew: '2000' })).toMatchObject({
      errors: { minLeadMinutesNew: 'La antelación mínima no puede ser mayor que la máxima: no quedaría ningún hueco.' },
    });
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('47')).toBeUndefined();
    expect(parseDuration('600')).toBeUndefined();
  });

  it('ADMIN: muestra la URL pública, activa la reserva con la barra de guardado y la guarda', async () => {
    const user = setupUser();
    saveSettings.mockResolvedValueOnce({ ...SETTINGS, enabled: true, newPatientMode: 'DIRECT' });
    render(<OnlineBookingSettingsSection token="tok" allowed />);
    await waitFor(() => expect(screen.getByTestId('online-booking-url')).toHaveTextContent('http://localhost/reservar'));
    expect(screen.getByTestId('online-booking-status')).toHaveTextContent('Desactivada');
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Reserva online activada/ }));
    const newGroup = screen.getByRole('radiogroup', { name: 'Pacientes nuevos' });
    await user.click(within(newGroup).getByRole('radio', { name: /Reserva directa/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith('tok', {
        enabled: true,
        newPatientMode: 'DIRECT',
        existingPatientMode: 'REQUEST',
        minLeadMinutesNew: 120,
        minLeadMinutesExisting: 120,
        maxAdvanceDays: 60,
        slotStepMinutes: 15,
      }),
    );
    expect(await screen.findByText('Ajustes de la reserva online guardados.')).toBeInTheDocument();
    expect(screen.getByTestId('online-booking-status')).toHaveTextContent('Activa');
  });

  it('un valor fuera de rango no se envía y se dice junto al campo', async () => {
    const user = setupUser();
    render(<OnlineBookingSettingsSection token="tok" allowed />);
    const field = await screen.findByLabelText('Antelación máxima (días)');
    await user.clear(field);
    await user.type(field, '0');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Escribe un número entero de días entre 1 y 365.')).toBeInTheDocument();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('la tabla de tipos: duración (vacía = la del tipo), «Todos» y el Switch guarda al momento', async () => {
    const user = setupUser();
    saveType.mockResolvedValueOnce({ ...TYPE, visibleOnline: true });
    render(<OnlineBookingSettingsSection token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Tipos de cita y su configuración online' });
    const [, row] = within(table).getAllByRole('row');
    expect(row).toHaveTextContent('45 min · 30 min');
    expect(row).toHaveTextContent('Todos');
    expect(row).toHaveTextContent('Todas');
    await user.click(within(row).getByRole('switch', { name: 'Ofrecer «Limpieza dental» online' }));
    await waitFor(() =>
      expect(saveType).toHaveBeenCalledWith('tok', 't-1', {
        visibleOnline: true,
        durationNewMinutes: 45,
        durationExistingMinutes: null,
        providerIds: [],
        locationIds: [],
      }),
    );
  });

  it('«Configurar» edita duraciones y profesionales (solo los que atienden) en su diálogo', async () => {
    const user = setupUser();
    saveType.mockResolvedValueOnce({ ...TYPE, durationExistingMinutes: 20, providerIds: ['p-1'] });
    render(<OnlineBookingSettingsSection token="tok" allowed />);
    await user.click(await screen.findByRole('button', { name: /Acciones de Limpieza dental/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Configurar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('checkbox', { name: 'Ana Recepción' })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Duración para pacientes con ficha (minutos)'), '20');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Dra. María Rodríguez' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(saveType).toHaveBeenCalledWith('tok', 't-1', {
        visibleOnline: false,
        durationNewMinutes: 45,
        durationExistingMinutes: 20,
        providerIds: ['p-1'],
        locationIds: [],
      }),
    );
  });

  it('sin ser ADMIN: solo lectura (campos desactivados, sin guardar ni configurar)', async () => {
    render(<OnlineBookingSettingsSection token="tok" allowed={false} />);
    expect(await screen.findByText('Lo cambia administración.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Reserva online activada/ })).toBeDisabled();
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('switch')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });
});
