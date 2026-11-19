import { configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentForm } from './appointment-form';
import { createAppointment } from '@/lib/appointments/appointments-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { listPatients } from '@/lib/patients/patients-api';
import { getLocationSchedule } from '@/lib/locations/schedule-api';
import { listAppointmentTypes } from '@/lib/appointments/appointment-types-api';
import { getProviderScheduleSettings } from '@/lib/locations/provider-schedule-api';
import { getPatientMedicalAlerts } from '@/lib/clinical/medical-alerts';
import { getHolidayOnDay } from '@/lib/locations/location-calendar-api';
import { dateGroup, typeDate } from './date-segments-for-tests';

/**
 * DX-562: «Repetir» del formulario de cita. Solo con `allowRepeat` (el diálogo
 * de nueva cita de la agenda); los otros cinco usos no cambian.
 */
configure({ asyncUtilTimeout: 5_000 });

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/appointments/appointments-api', () => ({ createAppointment: jest.fn() }));
jest.mock('../../lib/appointments/staff-api', () => ({ listStaff: jest.fn() }));
jest.mock('../../lib/locations/location-calendar-api', () => ({ getHolidayOnDay: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede()]),
}));
jest.mock('../../lib/locations/schedule-api', () => ({
  ...jest.requireActual('../../lib/locations/schedule-api'),
  getLocationSchedule: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({ listPatients: jest.fn(), createPatient: jest.fn() }));
jest.mock('../../lib/patients/document-type-names-api', () => ({
  getDocumentTypeNames: jest.fn().mockRejectedValue(new Error('sin nombres')),
}));
jest.mock('../../lib/appointments/appointment-types-api', () => ({ listAppointmentTypes: jest.fn() }));
jest.mock('../../lib/locations/provider-schedule-api', () => ({
  ...jest.requireActual('../../lib/locations/provider-schedule-api'),
  getRoster: jest.fn(),
  getProviderScheduleSettings: jest.fn(),
}));
jest.mock('../../lib/chairs/chairs-api', () => ({ listChairs: jest.fn().mockResolvedValue([]) }));
jest.mock('../../lib/clinical/medical-alerts', () => ({
  ...jest.requireActual('../../lib/clinical/medical-alerts'),
  getPatientMedicalAlerts: jest.fn(),
}));
// El paso 2 se prueba aparte (series-preview-step.test.tsx): aquí, qué recibe.
const previewProps = jest.fn();
jest.mock('./series-preview-step', () => ({
  SeriesPreviewStep: (props: { request: unknown; onBack: () => void }) => {
    previewProps(props);
    return (
      <div data-testid="series-preview-stub">
        <button type="button" onClick={props.onBack}>
          Volver
        </button>
      </div>
    );
  },
}));

const patient = {
  id: 'pat-1',
  tenantId: 't1',
  patientCode: '1109',
  firstName: 'María',
  lastName: 'López',
  docType: 'NATIONAL_ID' as const,
  docTypeLabel: null,
  docTypeName: 'ID local',
  docNumber: '123',
  birthDate: null,
  sex: 'F' as const,
  phone: null,
  email: null,
  address: null,
  notes: null,
  createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Mañana (UTC, el reloj de la sede de prueba). */
const FUTURE_DATE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function renderForm(props: Partial<React.ComponentProps<typeof AppointmentForm>> = {}) {
  render(
    <AppointmentForm
      token="tok"
      onCreated={jest.fn()}
      defaultPatient={patient}
      defaultProviderId="staff-1"
      defaultDate={FUTURE_DATE}
      defaultStartTime="09:00"
      defaultEndTime="09:30"
      {...props}
    />,
  );
}

async function waitForLoad() {
  await screen.findByRole('option', { name: /dra\. ana ríos/i });
  await waitFor(() =>
    expect(dateGroup(/^fecha$/i).querySelector('[role="spinbutton"]')).not.toHaveAttribute('aria-disabled', 'true'),
  );
}

describe('AppointmentForm · Repetir (DX-562)', () => {
  beforeEach(() => {
    previewProps.mockReset();
    jest.mocked(createAppointment).mockReset();
    jest.mocked(listStaff).mockResolvedValue([
      { userId: 'staff-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST', locationIds: null },
    ]);
    jest.mocked(listPatients).mockResolvedValue({ items: [patient], total: 1, page: 1, pageSize: 20 });
    jest.mocked(getHolidayOnDay).mockImplementation((_t, _l, date) => Promise.resolve({ date, name: null }));
    jest.mocked(getLocationSchedule).mockResolvedValue(null);
    jest.mocked(listAppointmentTypes).mockResolvedValue([]);
    jest.mocked(getProviderScheduleSettings).mockResolvedValue({ strictProviderSchedule: false } as never);
    jest.mocked(getPatientMedicalAlerts).mockResolvedValue({
      hasCriticalAlert: false,
      requiresPremedication: false,
      anamnesisStatus: 'CURRENT',
      alerts: [],
    } as never);
  });

  it('sin allowRepeat no hay «Repetir» (los otros usos del formulario no cambian)', async () => {
    renderForm({ onSeriesCreated: jest.fn() });
    await waitForLoad();
    expect(screen.queryByRole('checkbox', { name: /^repetir/i })).not.toBeInTheDocument();
  });

  it('con planItemIds tampoco: un tratamiento reserva una sola cita', async () => {
    renderForm({ allowRepeat: true, onSeriesCreated: jest.fn(), planItemIds: ['pi-1'] });
    await waitForLoad();
    expect(screen.queryByRole('checkbox', { name: /^repetir/i })).not.toBeInTheDocument();
  });

  it('desactivada por defecto; al marcarla, «Ver fechas» abre la vista previa con la recurrencia', async () => {
    const user = userEvent.setup();
    renderForm({ allowRepeat: true, onSeriesCreated: jest.fn() });
    await waitForLoad();
    const repeat = screen.getByRole('checkbox', { name: /^repetir/i });
    expect(repeat).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Agendar cita' })).toBeInTheDocument();

    await user.click(repeat);
    // «Adelantar si hay hueco» no se aplica a una serie.
    expect(screen.queryByRole('checkbox', { name: /adelantar si hay hueco/i })).not.toBeInTheDocument();
    const interval = await screen.findByLabelText('Cada (semanas)');
    await user.clear(interval);
    await user.type(interval, '4');
    const count = screen.getByLabelText('Veces (incluida esta)');
    await user.clear(count);
    await user.type(count, '6');
    await user.click(screen.getByRole('button', { name: 'Ver fechas' }));

    expect(await screen.findByTestId('series-preview-stub')).toBeInTheDocument();
    expect(previewProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        request: {
          patientId: 'pat-1',
          providerId: 'staff-1',
          start: `${FUTURE_DATE}T09:00:00.000Z`,
          end: `${FUTURE_DATE}T09:30:00.000Z`,
          intervalWeeks: 4,
          count: 6,
        },
      }),
    );
    expect(createAppointment).not.toHaveBeenCalled();

    // «Volver» conserva lo escrito en el paso 1.
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(await screen.findByLabelText('Cada (semanas)')).toHaveValue(4);
    expect(screen.getByRole('checkbox', { name: /^repetir/i })).toBeChecked();
  });

  it('valida los topes (1–12 semanas, 2–26 veces) y «Hasta el» posterior a la primera cita', async () => {
    const user = userEvent.setup();
    renderForm({ allowRepeat: true, onSeriesCreated: jest.fn() });
    await waitForLoad();
    await user.click(screen.getByRole('checkbox', { name: /^repetir/i }));
    const interval = await screen.findByLabelText('Cada (semanas)');
    await user.clear(interval);
    await user.type(interval, '13');
    const count = screen.getByLabelText('Veces (incluida esta)');
    await user.clear(count);
    await user.type(count, '27');
    await user.click(screen.getByRole('button', { name: 'Ver fechas' }));
    expect(screen.getByText('Indica cada cuántas semanas: de 1 a 12.')).toBeInTheDocument();
    expect(screen.getByText('Indica cuántas veces: de 2 a 26.')).toBeInTheDocument();
    expect(previewProps).not.toHaveBeenCalled();

    await user.clear(interval);
    await user.type(interval, '2');
    await user.click(screen.getByRole('radio', { name: 'Hasta una fecha' }));
    await user.click(screen.getByRole('button', { name: 'Ver fechas' }));
    expect(screen.getByText('Elige una fecha final posterior a la primera cita.')).toBeInTheDocument();

    const until = new Date(Date.parse(`${FUTURE_DATE}T12:00:00Z`) + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await typeDate(user, 'Hasta el', until);
    await user.click(screen.getByRole('button', { name: 'Ver fechas' }));
    await screen.findByTestId('series-preview-stub');
    expect(previewProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ intervalWeeks: 2, until }) }),
    );
    expect(previewProps.mock.lastCall?.[0].request).not.toHaveProperty('count');
  });
});
