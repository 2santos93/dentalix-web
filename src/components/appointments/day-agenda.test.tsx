import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayAgenda } from './day-agenda';
import type { Appointment } from '@/lib/appointments/appointments-api';
import { caracasSede, testAgendaClock } from '@/lib/test/sede-clock';
import { clinicLocation } from '@/lib/test/locations';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

function timeLabel(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(startIso)}–${fmt(endIso)}`;
}

const later: Appointment = {
  id: 'apt-2',
  tenantId: 't1',
  patientId: 'pat-2',
  patientFirstName: null,
  patientLastName: null,
  providerId: 'prov-1',
  start: '2026-07-23T14:00:00.000Z',
  end: '2026-07-23T14:30:00.000Z',
  status: 'CONFIRMED',
  reason: 'Control',
  notes: null,
  createdById: 'u1',
  locationId: 'loc-1',
  appointmentTypeId: null,
  appointmentType: null,
  confirmationSentAt: null,
  callbackRequestedAt: null,
  wantsEarlier: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const earlier: Appointment = {
  id: 'apt-1',
  tenantId: 't1',
  patientId: 'pat-1',
  patientFirstName: null,
  patientLastName: null,
  providerId: 'prov-1',
  start: '2026-07-23T09:00:00.000Z',
  end: '2026-07-23T09:30:00.000Z',
  status: 'SCHEDULED',
  reason: null,
  notes: null,
  createdById: 'u1',
  locationId: 'loc-1',
  appointmentTypeId: null,
  appointmentType: null,
  confirmationSentAt: null,
  callbackRequestedAt: null,
  wantsEarlier: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('DayAgenda', () => {
  it('shows a loading state', () => {
    render(<DayAgenda clock={CLOCK} appointments={[]} loading={true} />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
  });

  it('shows an empty state when there are no appointments and it is not loading', () => {
    render(<DayAgenda clock={CLOCK} appointments={[]} loading={false} />);
    expect(screen.getByText(/no hay citas/i)).toBeInTheDocument();
  });

  it('does not show the empty message while loading', () => {
    render(<DayAgenda clock={CLOCK} appointments={[]} loading={true} />);
    expect(screen.queryByText(/no hay citas/i)).not.toBeInTheDocument();
  });

  it('shows an alert with the error message and no empty/loading state when loading failed', () => {
    render(<DayAgenda clock={CLOCK} appointments={[]} loading={false} error="Error del servidor" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Error del servidor');
    expect(screen.queryByText(/no hay citas/i)).not.toBeInTheDocument();
  });

  it('renders one row per appointment, ordered by start time ascending regardless of input order', () => {
    render(<DayAgenda clock={CLOCK} appointments={[later, earlier]} loading={false} />);

    const rows = screen.getAllByRole('row').slice(1); // skip header row
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(timeLabel(earlier.start, earlier.end))).toBeInTheDocument();
    expect(within(rows[1]).getByText(timeLabel(later.start, later.end))).toBeInTheDocument();
  });

  it('shows patient, reason (with a fallback when absent) and a status label per appointment', () => {
    render(<DayAgenda clock={CLOCK} appointments={[earlier, later]} loading={false} />);

    const rows = screen.getAllByRole('row').slice(1);
    // earlier: no reason -> fallback dash; patientNames not provided -> raw id
    expect(within(rows[0]).getByText('pat-1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('—')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/agendada/i)).toBeInTheDocument();

    // later: has a reason
    expect(within(rows[1]).getByText('pat-2')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Control')).toBeInTheDocument();
    expect(within(rows[1]).getByText(/confirmada/i)).toBeInTheDocument();
  });

  it('resolves the patient label from patientNames when available, falling back to the raw id otherwise', () => {
    render(
      <DayAgenda clock={CLOCK}
        appointments={[earlier]}
        loading={false}
        patientNames={{ 'pat-1': 'Ana García' }}
      />,
    );
    expect(screen.getAllByText('Ana García').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('pat-1')).toHaveLength(0);
  });

  it('gives each of the five statuses a distinct semantic-token color class (no raw color utilities)', () => {
    const statuses: Array<Appointment['status']> = [
      'SCHEDULED',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ];
    const appointments: Appointment[] = statuses.map((status, i) => ({
      ...earlier,
      id: `apt-${i}`,
      start: new Date(Date.parse(earlier.start) + i * 3600_000).toISOString(),
      end: new Date(Date.parse(earlier.end) + i * 3600_000).toISOString(),
      status,
    }));
    const { container } = render(<DayAgenda clock={CLOCK} appointments={appointments} loading={false} />);

    // Scope to the desktop table only — the mobile cards render the same
    // badges again (duplicate testids across the two responsive variants).
    const table = container.querySelector('table') as HTMLElement;
    const badges = within(table).getAllByTestId('appointment-status-badge');
    expect(badges).toHaveLength(5);
    const classSets = badges.map((b) => b.className);
    // Every badge class string must be unique across the 5 statuses.
    expect(new Set(classSets).size).toBe(5);
    for (const cls of classSets) {
      expect(cls).not.toMatch(/-(red|blue|green|amber|yellow|violet|emerald|orange)-\d/);
      expect(cls).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it('switches table/cards on its CONTAINER width, not the viewport — so it also fits the agenda day drawer', () => {
    const { container } = render(<DayAgenda clock={CLOCK} appointments={[earlier]} loading={false} />);
    // The component declares itself a query container...
    expect(container.querySelector('.\\@container')).toBeInTheDocument();

    // ...and both variants key off that container (`@2xl` = 42rem), not the
    // viewport: keyed on `md:` the wide table also rendered inside the ~384px
    // day drawer, where it got clipped.
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(table?.closest('.hidden.\\@2xl\\:block')).toBeInTheDocument();

    const narrowWrapper = container.querySelector('.\\@2xl\\:hidden');
    expect(narrowWrapper).toBeInTheDocument();
  });

  it('gives each appointment an accessible label combining time, patient and status (mobile cards)', () => {
    render(<DayAgenda clock={CLOCK} appointments={[earlier]} loading={false} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveAccessibleName(
      new RegExp(`${timeLabel(earlier.start, earlier.end)}.*pat-1.*agendada`, 'i'),
    );
  });

  it('does NOT render a status select when onStatusChange is not provided (backward compatible, read-only badge only)', () => {
    render(<DayAgenda clock={CLOCK} appointments={[earlier]} loading={false} />);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  describe('status-change control (onStatusChange provided)', () => {
    it('renders a labeled status select per row, in both the desktop table and the mobile cards, with the current status selected', () => {
      const onStatusChange = jest.fn();
      const { container } = render(
        <DayAgenda clock={CLOCK} appointments={[earlier, later]} loading={false} onStatusChange={onStatusChange} />,
      );

      const table = container.querySelector('table') as HTMLElement;
      const desktopSelects = within(table).getAllByRole('combobox');
      expect(desktopSelects).toHaveLength(2);
      expect(desktopSelects[0]).toHaveTextContent('Agendada');
      expect(desktopSelects[1]).toHaveTextContent('Confirmada');
      // DX-295: el nombre lleva el estado actual para el lector de pantalla.
      expect(desktopSelects[0]).toHaveAccessibleName(
        `Estado de la cita de ${timeLabel(earlier.start, earlier.end)}: Agendada`,
      );

      const mobileList = screen.getAllByRole('list').find((l) => l.tagName === 'UL') as HTMLElement;
      const mobileSelects = within(mobileList).getAllByRole('combobox');
      expect(mobileSelects).toHaveLength(2);
    });

    it('calls onStatusChange with the appointment id and the newly picked status when changed', async () => {
      const onStatusChange = jest.fn();
      const user = userEvent.setup();
      const { container } = render(
        <DayAgenda clock={CLOCK} appointments={[earlier]} loading={false} onStatusChange={onStatusChange} />,
      );

      const table = container.querySelector('table') as HTMLElement;
      await user.click(within(table).getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: 'Confirmada' }));

      expect(onStatusChange).toHaveBeenCalledWith('apt-1', 'CONFIRMED', expect.any(HTMLButtonElement));
    });

    it('DX-295: ↑/↓ en el selector de la fila no cambian la cita; Enter sí', async () => {
      const onStatusChange = jest.fn();
      const user = userEvent.setup();
      const { container } = render(
        <DayAgenda clock={CLOCK} appointments={[earlier]} loading={false} onStatusChange={onStatusChange} />,
      );

      const table = container.querySelector('table') as HTMLElement;
      within(table).getByRole('combobox').focus();
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}');
      expect(onStatusChange).not.toHaveBeenCalled();

      await user.keyboard('{Enter}');
      expect(onStatusChange).toHaveBeenCalledTimes(1);
      expect(onStatusChange).toHaveBeenCalledWith('apt-1', 'CONFIRMED', expect.any(HTMLButtonElement));
    });

    it('disables the status select (both desktop and mobile) only for the row matching updatingId', () => {
      const onStatusChange = jest.fn();
      const { container } = render(
        <DayAgenda clock={CLOCK}
          appointments={[earlier, later]}
          loading={false}
          onStatusChange={onStatusChange}
          updatingId={earlier.id}
        />,
      );

      const table = container.querySelector('table') as HTMLElement;
      const desktopSelects = within(table).getAllByRole('combobox');
      expect(desktopSelects[0]).toBeDisabled();
      expect(desktopSelects[1]).not.toBeDisabled();
    });
  });

  describe('confirmación por enlace (DX-005)', () => {
    // TZ=UTC en jest (jest.config.ts): la hora Z es la hora local.
    const apt = (id: string, from: string, to: string): Appointment => ({
      ...earlier,
      id,
      status: 'SCHEDULED',
      start: `2026-07-23T${from}:00.000Z`,
      end: `2026-07-23T${to}:00.000Z`,
    });
    it('muestra "Pide llamada" y "Confirmación pendiente" en la tarjeta de la cita agendada', () => {
      const appointments = [
        { ...apt('a-call', '09:00', '09:30'), callbackRequestedAt: '2026-03-01T00:00:00.000Z' },
        { ...apt('a-sent', '10:00', '10:30'), confirmationSentAt: '2026-03-01T00:00:00.000Z' },
        {
          ...apt('a-done', '11:00', '11:30'),
          status: 'CONFIRMED' as const,
          locationId: 'loc-1',
          appointmentTypeId: null,
          appointmentType: null,
          confirmationSentAt: '2026-03-01T00:00:00.000Z',
        },
      ];
      render(<DayAgenda clock={CLOCK} appointments={appointments} loading={false} />);
      // Tabla + tarjetas (las dos variantes responsive están en el DOM).
      expect(screen.getAllByText('Pide llamada')).toHaveLength(2);
      expect(screen.getAllByText('Confirmación pendiente')).toHaveLength(2);
      expect(screen.getAllByTestId('appointment-confirmation-indicator')).toHaveLength(4);
    });

    it('"Detalle" abre la cita de esa fila', async () => {
      const onSelect = jest.fn();
      const appointment = apt('a-1', '09:00', '09:30');
      render(
        <DayAgenda clock={CLOCK} appointments={[appointment]} loading={false} onSelectAppointment={onSelect} />,
      );
      const [first] = screen.getAllByRole('button', { name: 'Detalle de la cita de 09:00–09:30' });
      await userEvent.click(first);
      expect(onSelect).toHaveBeenCalledWith(appointment);
    });

    it('sin onSelectAppointment no hay botón de detalle', () => {
      render(<DayAgenda clock={CLOCK} appointments={[apt('a-1', '09:00', '09:30')]} loading={false} />);
      expect(screen.queryByRole('button', { name: /detalle/i })).not.toBeInTheDocument();
    });
  });

  it('DX-200: en el flujo el selector solo ofrece su estado y la salida, y la fila lleva sus botones', async () => {
    const arrived: Appointment = { ...later, status: 'ARRIVED', arrivedAt: '2026-07-23T13:55:00.000Z' };
    render(
      <DayAgenda clock={CLOCK}
        appointments={[arrived]}
        loading={false}
        onStatusChange={jest.fn()}
        renderActions={(a) => <button type="button">{`Acción ${a.id}`}</button>}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Acción apt-2' }).length).toBeGreaterThan(0);
    const [select] = screen.getAllByTestId('appointment-status-select');
    await userEvent.click(select);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'En espera',
      'Completada',
      'Cancelada',
    ]);
  });
});

describe('DayAgenda · cobertura (DX-153)', () => {
  it('muestra el chip «Cobertura vencida» solo en la cita con cobertura vencida', () => {
    const expired = {
      status: 'EXPIRED' as const,
      payerName: 'Sura EPS',
      planName: null,
      validTo: '2026-01-31',
    };
    render(
      <DayAgenda clock={CLOCK}
        appointments={[
          { ...earlier, coverage: expired },
          { ...later, coverage: { ...expired, status: 'ACTIVE' as const } },
        ]}
        loading={false}
      />,
    );
    // Tabla ancha y tarjetas estrechas se montan a la vez: una marca por cada una.
    const chips = screen.getAllByTestId('coverage-chip');
    expect(chips.length).toBeGreaterThan(0);
    chips.forEach((c) => expect(c).toHaveTextContent('Cobertura vencida'));
  });
});

describe('DayAgenda con el reloj de la sede (DX-378)', () => {
  it('sede en 12 h en Caracas: la hora de la sede, no la del navegador (TZ=UTC)', () => {
    render(<DayAgenda clock={testAgendaClock([caracasSede()])} appointments={[later]} loading={false} />);
    // 14:00 UTC son las 10:00 a. m. en Caracas.
    expect(screen.getAllByText('10:00 a. m. – 10:30 a. m.').length).toBeGreaterThan(0);
  });

  it('cada cita, con el reloj de su sede; sin reloj de su sede, «—» y nunca otro', () => {
    const madrid = clinicLocation({ id: 'madrid', timeZone: 'Europe/Madrid', locale: 'es-ES', hourCycle: 'h23' });
    const sinReloj = clinicLocation({ id: 'sin-reloj', hourCycle: null });
    render(
      <DayAgenda
        clock={testAgendaClock([caracasSede(), madrid, sinReloj])}
        appointments={[{ ...later, locationId: 'madrid' }, { ...earlier, locationId: 'sin-reloj' }]}
        loading={false}
      />,
    );
    expect(screen.getAllByText('16:00–16:30').length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
