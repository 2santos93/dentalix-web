import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineAgendaView, offlineAgendaCopy } from './offline-agenda';
import type { OfflineAgenda } from '../../lib/offline/offline-agenda';

const mockRead = jest.fn();
jest.mock('../../lib/offline/offline-agenda', () => ({
  readOfflineAgenda: (...args: unknown[]) => mockRead(...args),
  offlineOwnerOf: () => null,
}));

// Caracas (UTC−4): «hoy» es el sábado 15 de noviembre de 2026.
const NOW = new Date('2026-11-15T16:00:00Z');

const AGENDA: OfflineAgenda = {
  locationId: 'sede-1',
  locationName: 'Sede Principal',
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h23',
  days: ['2026-11-15', '2026-11-16'],
  generatedAt: '2026-11-15T18:05:00Z',
  appointments: [
    {
      id: 'a1',
      start: '2026-11-15T13:00:00Z',
      end: '2026-11-15T13:30:00Z',
      status: 'CONFIRMED',
      chairName: 'Gabinete 1',
      professionalName: 'Dra. Ana Gómez',
      patientName: 'María Pérez',
      phone: '+58 412 1234567',
      appointmentTypeName: 'Limpieza',
      medicalAlert: true,
    },
    {
      id: 'a2',
      start: '2026-11-16T12:30:00Z',
      end: '2026-11-16T13:00:00Z',
      status: 'SCHEDULED',
      chairName: null,
      professionalName: 'Dr. Luis Rojas',
      patientName: 'José Rodríguez',
      phone: null,
      appointmentTypeName: null,
      medicalAlert: false,
    },
  ],
};

describe('OfflineAgendaView (DX-405)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
    mockRead.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it('aviso «Sin conexión · datos de las HH:MM» en el reloj de la sede, y hoy y mañana en solo lectura', async () => {
    mockRead.mockResolvedValue({ scope: {}, savedAt: NOW.getTime(), payload: AGENDA });
    render(<OfflineAgendaView token={null} />);
    expect(await screen.findByText('Sin conexión · datos de las 14:05')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Hoy · / })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Mañana · / })).toBeInTheDocument();

    const today = screen.getByRole('region', { name: /^Hoy/ });
    expect(within(today).getByText('María Pérez')).toBeInTheDocument();
    expect(within(today).getByText('09:00–09:30')).toBeInTheDocument();
    expect(within(today).getByText('Gabinete 1')).toBeInTheDocument();
    expect(within(today).getByText('Dra. Ana Gómez')).toBeInTheDocument();
    expect(within(today).getByText('Limpieza')).toBeInTheDocument();
    expect(within(today).getByText('Confirmada')).toBeInTheDocument();
    expect(within(today).getByText(offlineAgendaCopy.medicalAlert)).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: /Llamar a María Pérez/ })).toHaveAttribute(
      'href',
      'tel:+584121234567',
    );

    const tomorrow = screen.getByRole('region', { name: /^Mañana/ });
    expect(within(tomorrow).getByText('José Rodríguez')).toBeInTheDocument();
    expect(within(tomorrow).getByText(offlineAgendaCopy.noPhone)).toBeInTheDocument();
    expect(within(tomorrow).queryByText(offlineAgendaCopy.medicalAlert)).not.toBeInTheDocument();
  });

  it('«Nueva cita» está a la vista pero inactivo, con el motivo enlazado', async () => {
    mockRead.mockResolvedValue({ scope: {}, savedAt: NOW.getTime(), payload: AGENDA });
    render(<OfflineAgendaView token={null} />);
    const button = await screen.findByRole('button', { name: /Nueva cita/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(offlineAgendaCopy.readOnly);
  });

  it('pasada la medianoche no enseña el día que ya pasó', async () => {
    jest.setSystemTime(new Date('2026-11-16T14:00:00Z'));
    mockRead.mockResolvedValue({ scope: {}, savedAt: NOW.getTime(), payload: AGENDA });
    render(<OfflineAgendaView token={null} />);
    expect(await screen.findByText(/Sin conexión · datos del .* a las 14:05/)).toBeInTheDocument();
    expect(screen.queryByText('María Pérez')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Hoy · / })).toBeInTheDocument();
    expect(screen.getByText('José Rodríguez')).toBeInTheDocument();
  });

  it('sin copia guardada: lo dice, con una salida (comprobar de nuevo)', async () => {
    mockRead.mockResolvedValueOnce(null).mockResolvedValueOnce({ scope: {}, savedAt: NOW.getTime(), payload: AGENDA });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<OfflineAgendaView token={null} />);
    expect(await screen.findByText(offlineAgendaCopy.missingBody)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: offlineAgendaCopy.retry }));
    expect(await screen.findByText('María Pérez')).toBeInTheDocument();
  });
});
