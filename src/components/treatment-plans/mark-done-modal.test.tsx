import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkDoneModal } from './mark-done-modal';
import { listStaff } from '@/lib/appointments/staff-api';
import { updateItem, type TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { ApiError } from '@/lib/api/client';
import { getTokenUserId } from '@/lib/auth/token-role';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/appointments/staff-api', () => ({ listStaff: jest.fn() }));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  updateItem: jest.fn(),
}));
jest.mock('../../lib/auth/token-role', () => ({ getTokenUserId: jest.fn() }));

const mockedStaff = jest.mocked(listStaff);
const mockedUpdate = jest.mocked(updateItem);
const mockedMe = jest.mocked(getTokenUserId);

const STAFF = [
  {
    userId: 'reception',
    fullName: 'Aarón Recepción',
    role: 'RECEPTION' as const,
    locationIds: null,
  },
  {
    userId: 'assistant',
    fullName: 'Ana Asistente',
    role: 'ASSISTANT' as const,
    locationIds: null,
  },
  {
    userId: 'norte',
    fullName: 'Berta Norte',
    role: 'DENTIST' as const,
    locationIds: ['loc-norte'],
  },
  {
    userId: 'laura',
    fullName: 'Dra. Laura Gómez',
    role: 'DENTIST' as const,
    locationIds: null,
  },
  {
    userId: 'owner',
    fullName: 'Dr. Owner',
    role: 'ADMIN' as const,
    locationIds: null,
  },
];

const item = {
  id: 'item-1',
  status: 'ACCEPTED',
  performedById: null,
} as TreatmentPlanItem;

function renderModal(overrides: Partial<React.ComponentProps<typeof MarkDoneModal>> = {}) {
  const props: React.ComponentProps<typeof MarkDoneModal> = {
    open: true,
    onOpenChange: jest.fn(),
    onSaved: jest.fn(),
    onRetryLocations: jest.fn(),
    token: 'tok',
    planId: 'plan-1',
    item,
    subject: 'Resina · diente 16',
    mode: 'done',
    activeLocationId: 'loc-main',
    locationName: 'Sede Principal',
    ...overrides,
  };
  render(<MarkDoneModal {...props} />);
  return props;
}

describe('MarkDoneModal (DX-050)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStaff.mockResolvedValue(STAFF);
    mockedMe.mockReturnValue('laura');
  });

  it('ofrece solo a quien atiende en la sede activa y preselecciona a quien marca', async () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Marcar como realizado' })).toBeInTheDocument();
    expect(screen.getByText('Resina · diente 16')).toBeInTheDocument();
    const select = await screen.findByRole('combobox', {
      name: 'Profesional que lo realizó',
    });
    await waitFor(() => expect(select).toHaveValue('laura'));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Elige un profesional', 'Dr. Owner', 'Dra. Laura Gómez']);
    expect(screen.getByText('Se registra en Sede Principal.')).toBeInTheDocument();
  });

  it('quien no atiende (la asistente) no queda preseleccionado: tiene que elegir', async () => {
    mockedMe.mockReturnValue('assistant');
    const user = userEvent.setup();
    renderModal();
    const select = await screen.findByRole('combobox', {
      name: 'Profesional que lo realizó',
    });
    expect(select).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Marcar realizado' }));
    expect(await screen.findByText('Elige qué profesional lo realizó.')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('con un solo profesional posible, lo preselecciona', async () => {
    mockedMe.mockReturnValue('assistant');
    mockedStaff.mockResolvedValue([STAFF[1], STAFF[2]]);
    renderModal({ activeLocationId: 'loc-norte', locationName: 'Sede Norte' });
    const select = await screen.findByRole('combobox', {
      name: 'Profesional que lo realizó',
    });
    await waitFor(() => expect(select).toHaveValue('norte'));
  });

  it('marca realizado con el profesional elegido y avisa al padre', async () => {
    const user = userEvent.setup();
    const saved = {
      ...item,
      status: 'DONE',
      performedById: 'owner',
    } as TreatmentPlanItem;
    mockedUpdate.mockResolvedValue(saved);
    const props = renderModal();
    const select = await screen.findByRole('combobox', {
      name: 'Profesional que lo realizó',
    });
    await waitFor(() => expect(select).toHaveValue('laura'));
    await user.selectOptions(select, 'owner');
    await user.click(screen.getByRole('button', { name: 'Marcar realizado' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'plan-1', 'item-1', {
        status: 'DONE',
        performedById: 'owner',
      }),
    );
    expect(props.onSaved).toHaveBeenCalledWith(saved);
  });

  it('el error de la API (en español) queda en el modal', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValue(new ApiError(400, 'Ese profesional no atiende en esta sede.'));
    const props = renderModal();
    const select = await screen.findByRole('combobox', {
      name: 'Profesional que lo realizó',
    });
    await waitFor(() => expect(select).toHaveValue('laura'));
    await user.click(screen.getByRole('button', { name: 'Marcar realizado' }));
    expect(await screen.findByText('Ese profesional no atiende en esta sede.')).toBeInTheDocument();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it('si la lista no carga, el control se cambia por el error con reintento', async () => {
    const user = userEvent.setup();
    mockedStaff.mockRejectedValueOnce(new Error('red'));
    renderModal();
    expect(await screen.findByText('No pudimos cargar los profesionales')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('combobox', {
        name: 'Profesional que lo realizó',
      }),
    ).toBeInTheDocument();
  });

  it('corregir (ADMIN): parte de quien lo realizó y solo envía el profesional', async () => {
    const user = userEvent.setup();
    mockedMe.mockReturnValue('owner');
    const done = {
      ...item,
      status: 'DONE',
      performedById: 'laura',
    } as TreatmentPlanItem;
    mockedUpdate.mockResolvedValue({ ...done, performedById: 'owner' });
    renderModal({ mode: 'correct', item: done });
    expect(screen.getByRole('dialog', { name: 'Corregir quién lo realizó' })).toBeInTheDocument();
    const select = await screen.findByRole('combobox', {
      name: 'Profesional que lo realizó',
    });
    await waitFor(() => expect(select).toHaveValue('laura'));
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await user.selectOptions(select, 'owner');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'plan-1', 'item-1', {
        performedById: 'owner',
      }),
    );
  });

  describe('atribuir un «Sin atribuir» (DX-305)', () => {
    const LOCATIONS: ClinicLocation[] = [
      clinicLocation({ id: 'loc-main', name: 'Sede Principal' }),
      clinicLocation({ id: 'loc-norte', name: 'Sede Norte' }),
      clinicLocation({ id: 'loc-off', name: 'Sede Cerrada', isActive: false }),
    ];
    const unattributed = {
      ...item,
      status: 'DONE',
      performedById: null,
      performedLocationId: null,
      completedAt: null,
    } as TreatmentPlanItem;

    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-10-24T20:00:00Z'), advanceTimers: true });
    });
    afterEach(() => jest.useRealTimers());

    it('consumers render SedeConfigError without a zone', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const props = renderModal({
        mode: 'correct',
        item: unattributed,
        locations: [clinicLocation({ id: 'loc-main', name: 'Sede Principal', timeZone: null })],
        activeLocationId: null,
      });
      await user.selectOptions(screen.getByRole('combobox', { name: 'Sede donde se realizó' }), 'loc-main');
      // Sin zona de la sede no hay tope de «hoy»: la fecha se sustituye por el fallo y su reintento.
      expect(screen.getByText('Sin zona de sede')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(props.onRetryLocations).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it('pide sede, fecha y profesional; los profesionales son los de la sede elegida', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockedMe.mockReturnValue('owner');
      mockedUpdate.mockResolvedValue({ ...unattributed, performedById: 'norte' });
      const props = renderModal({ mode: 'correct', item: unattributed, locations: LOCATIONS, activeLocationId: null });
      expect(screen.getByRole('dialog', { name: 'Atribuir el procedimiento' })).toBeInTheDocument();
      const location = screen.getByRole('combobox', { name: 'Sede donde se realizó' });
      // Solo las sedes activas.
      expect(within(location).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Elige una sede',
        'Sede Principal',
        'Sede Norte',
      ]);
      const performer = await screen.findByRole('combobox', { name: 'Profesional que lo realizó' });
      expect(performer).toHaveValue('');

      // Sin sede: se dice junto al formulario y no se envía.
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      expect(await screen.findByText('Elige la sede donde se realizó.')).toBeInTheDocument();
      expect(mockedUpdate).not.toHaveBeenCalled();

      await user.selectOptions(location, 'loc-main');
      expect(within(performer).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Elige un profesional',
        'Dr. Owner',
        'Dra. Laura Gómez',
      ]);
      await user.selectOptions(location, 'loc-norte');
      expect(within(performer).getAllByRole('option').map((o) => o.textContent)).toContain('Berta Norte');
      await user.selectOptions(performer, 'norte');

      // Sin fecha, tampoco.
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      expect(await screen.findByText('Indica la fecha en que se realizó (no puede ser futura).')).toBeInTheDocument();

      const date = screen.getByLabelText('Fecha en que se realizó');
      expect(date).toHaveAttribute('max', '2026-10-24');
      fireEvent.change(date, { target: { value: '2026-09-14' } });
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() =>
        expect(mockedUpdate).toHaveBeenCalledWith('tok', 'plan-1', 'item-1', {
          performedById: 'norte',
          performedLocationId: 'loc-norte',
          // Mediodía del 14/09 en Bogotá.
          completedAt: '2026-09-14T17:00:00.000Z',
        }),
      );
      expect(props.onSaved).toHaveBeenCalled();
    });

    it('al cambiar a una sede donde no atiende, el profesional elegido se quita', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderModal({ mode: 'correct', item: unattributed, locations: LOCATIONS, activeLocationId: 'loc-norte' });
      const location = screen.getByRole('combobox', { name: 'Sede donde se realizó' });
      expect(location).toHaveValue('loc-norte');
      const performer = await screen.findByRole('combobox', { name: 'Profesional que lo realizó' });
      await user.selectOptions(performer, 'norte');
      await user.selectOptions(location, 'loc-main');
      expect(performer).toHaveValue('');
    });
  });
});
