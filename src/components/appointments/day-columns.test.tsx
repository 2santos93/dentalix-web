import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayColumns } from './day-columns';
import type { Appointment } from '@/lib/appointments/appointments-api';
import type { BusinessHours } from '@/lib/locations/schedule-api';
import { PX_PER_MINUTE } from '@/lib/appointments/day-grid';

// jsdom no trae PointerEvent: sin él, `fireEvent.pointerDown` crea un Event
// genérico sin `pointerType` ni coordenadas. Un MouseEvent con los dos campos
// que usa el arrastre basta.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

const DATE = '2031-03-03'; // lunes
const providers = [
  { userId: 'prov-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST' as const },
  { userId: 'prov-2', fullName: 'Dr. Luis Gómez', role: 'DENTIST' as const },
  { userId: 'prov-3', fullName: 'Dra. Sara Paz', role: 'ADMIN' as const },
];
const hours: BusinessHours = {
  timezone: 'America/Bogota',
  ranges: [
    { weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60 },
    { weekday: 1, startMinute: 15 * 60, endMinute: 19 * 60 },
  ],
};

function appointment(overrides: Partial<Appointment> & { id: string }): Appointment {
  return {
    tenantId: 't1',
    locationId: 'loc-1',
    patientId: 'pat-1',
    patientFirstName: 'María',
    patientLastName: 'López',
    providerId: 'prov-1',
    start: new Date(`${DATE}T09:00:00`).toISOString(),
    end: new Date(`${DATE}T10:30:00`).toISOString(),
    status: 'SCHEDULED',
    reason: null,
    notes: null,
    createdById: null,
    appointmentTypeId: 'type-1',
    appointmentType: { id: 'type-1', name: 'Endodoncia', durationMinutes: 90, color: '#7C3AED' },
    confirmationSentAt: null,
    callbackRequestedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const endo = appointment({ id: 'apt-1' });
const light = appointment({
  id: 'apt-2',
  providerId: 'prov-2',
  patientFirstName: 'Juan',
  start: new Date(`${DATE}T11:00:00`).toISOString(),
  end: new Date(`${DATE}T11:30:00`).toISOString(),
  appointmentType: { id: 'type-2', name: 'Ortodoncia', durationMinutes: 30, color: '#FBBF24' },
});

function renderColumns(props: Partial<React.ComponentProps<typeof DayColumns>> = {}) {
  const handlers = {
    onRetry: jest.fn(),
    onSelectAppointment: jest.fn(),
    onMoveRequest: jest.fn(),
    onDrop: jest.fn(),
    onNewAppointment: jest.fn(),
  };
  render(
    <DayColumns
      date={DATE}
      providers={providers}
      appointments={[endo, light]}
      hours={hours}
      loading={false}
      error={null}
      canMove
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('DayColumns (DX-121)', () => {
  it('pinta una columna por profesional con sus citas', () => {
    renderColumns();
    const columns = screen.getAllByTestId('day-column');
    expect(columns).toHaveLength(3);
    expect(within(columns[0]).getByText('María López')).toBeInTheDocument();
    expect(within(columns[1]).getByText('Juan López')).toBeInTheDocument();
    expect(screen.getAllByTestId('day-column-header').map((h) => h.textContent)).toEqual([
      'Dra. Ana Ríos1 cita',
      'Dr. Luis Gómez1 cita',
      'Dra. Sara Paz0 citas',
    ]);
  });

  it('colorea la tarjeta con el tipo y elige texto legible (AA) según el fondo', () => {
    renderColumns();
    const [dark, bright] = screen.getAllByTestId('day-column-appointment');
    expect(dark).toHaveStyle({ backgroundColor: '#7C3AED', color: '#FFFFFF' });
    expect(bright).toHaveStyle({ backgroundColor: '#FBBF24', color: '#0F172A' });
    expect(within(dark).getByText(/Endodoncia · Agendada/)).toBeInTheDocument();
  });

  it('un color que no es #RRGGBB nunca llega al estilo (cae al neutro)', () => {
    renderColumns({
      appointments: [
        appointment({
          id: 'apt-x',
          appointmentType: { id: 't', name: 'Raro', durationMinutes: 30, color: 'red;background:url(x)' },
        }),
      ],
    });
    const card = screen.getByTestId('day-column-appointment');
    expect(card.getAttribute('style')).not.toMatch(/url|red/);
  });

  it('sombrea la franja fuera del horario de la sede (antes, mediodía y después)', () => {
    renderColumns();
    // 3 franjas cerradas por columna × 3 columnas.
    expect(screen.getAllByTestId('closed-band')).toHaveLength(9);
    expect(screen.getByText('Fuera del horario de la sede')).toBeInTheDocument();
  });

  it('columna vacía: «Sin citas hoy» y «Nueva cita» con ese profesional', async () => {
    const user = userEvent.setup();
    const { onNewAppointment } = renderColumns();
    const third = screen.getAllByTestId('day-column')[2];
    expect(within(third).getByText('Sin citas hoy')).toBeInTheDocument();
    await user.click(within(third).getByRole('button', { name: 'Nueva cita con Dra. Sara Paz' }));
    expect(onNewAppointment).toHaveBeenCalledWith('prov-3');
  });

  it('estados de carga (esqueleto) y de error (con Reintentar)', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <DayColumns
        date={DATE}
        providers={providers}
        appointments={[]}
        hours={null}
        loading
        error={null}
        onRetry={jest.fn()}
        canMove
        onSelectAppointment={jest.fn()}
        onMoveRequest={jest.fn()}
        onDrop={jest.fn()}
        onNewAppointment={jest.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Cargando agenda…');
    unmount();

    const { onRetry } = renderColumns({ error: 'No pudimos cargar la agenda.' });
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar la agenda.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('«Mover a…» se ofrece por teclado; sin permiso no hay ni «Mover a…» ni arrastre', async () => {
    const user = userEvent.setup();
    const { onMoveRequest } = renderColumns();
    const move = screen.getByRole('button', { name: 'Mover a… la cita de María López' });
    move.focus();
    await user.keyboard('{Enter}');
    expect(onMoveRequest).toHaveBeenCalledWith(endo);
  });

  it('sin permiso de agenda no hay «Mover a…» y el arrastre no hace nada', () => {
    const { onDrop } = renderColumns({ canMove: false });
    expect(screen.queryByRole('button', { name: /mover a…/i })).not.toBeInTheDocument();
    const card = screen.getAllByTestId('day-column-appointment')[0];
    fireEvent.pointerDown(card, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 400, clientY: 200 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 400, clientY: 200 });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('el detalle se abre con el nombre accesible de la cita', async () => {
    const user = userEvent.setup();
    const { onSelectAppointment } = renderColumns();
    await user.click(screen.getByRole('button', { name: /detalle de la cita de 09:00–10:30 · maría lópez/i }));
    expect(onSelectAppointment).toHaveBeenCalledWith(endo);
  });

  it('en móvil, el selector cambia la columna visible', async () => {
    const user = userEvent.setup();
    renderColumns();
    const picker = screen.getByRole('group', { name: 'Profesional visible' });
    const luis = within(picker).getByRole('button', { name: 'Dr. Luis Gómez' });
    expect(within(picker).getByRole('button', { name: 'Dra. Ana Ríos' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(luis);
    expect(luis).toHaveAttribute('aria-pressed', 'true');
    const [first, second] = screen.getAllByTestId('day-column');
    expect(first.className).toMatch(/hidden sm:block/);
    expect(second.className).not.toMatch(/hidden sm:block/);
  });

  describe('arrastre con ratón', () => {
    // jsdom no maqueta: cada columna ocupa 200 px de ancho a partir de x = 100,
    // y su borde superior está en y = 0.
    let rectSpy: jest.SpyInstance;
    beforeEach(() => {
      rectSpy = jest
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          const index = providers.findIndex((p) => p.userId === this.dataset.providerId);
          if (index >= 0) {
            return { left: 100 + index * 200, right: 300 + index * 200, top: 0, bottom: 2000 } as DOMRect;
          }
          return { left: 0, right: 0, top: 0, bottom: 0 } as DOMRect;
        });
    });
    afterEach(() => rectSpy.mockRestore());

    it('soltar en otra columna y hora llama a onDrop con el destino (duración conservada) y muestra la vista previa', () => {
      const { onDrop, onSelectAppointment } = renderColumns();
      const card = screen.getAllByTestId('day-column-appointment')[0];
      // La franja visible empieza a las 08:30: 11:00 está 150 min más abajo.
      const y = 150 * PX_PER_MINUTE;
      fireEvent.pointerDown(card, { pointerId: 7, pointerType: 'mouse', button: 0, clientX: 150, clientY: 0 });
      fireEvent.pointerMove(window, { pointerId: 7, clientX: 650, clientY: y });
      expect(screen.getByTestId('drag-preview')).toHaveTextContent('Mover a las 11:00 · Dra. Sara Paz');
      fireEvent.pointerUp(window, { pointerId: 7, clientX: 650, clientY: y });
      fireEvent.click(within(card).getAllByRole('button')[0]);

      expect(onDrop).toHaveBeenCalledWith(endo, {
        start: new Date(`${DATE}T11:00:00`).toISOString(),
        end: new Date(`${DATE}T12:30:00`).toISOString(),
        providerId: 'prov-3',
      });
      // Soltar no abre el detalle.
      expect(onSelectAppointment).not.toHaveBeenCalled();
      expect(screen.queryByTestId('drag-preview')).not.toBeInTheDocument();
    });

    it('Escape cancela el arrastre sin mover nada; un toque (no ratón) no arrastra', () => {
      const { onDrop } = renderColumns();
      const card = screen.getAllByTestId('day-column-appointment')[0];
      fireEvent.pointerDown(card, { pointerId: 8, pointerType: 'mouse', button: 0, clientX: 150, clientY: 0 });
      fireEvent.pointerMove(window, { pointerId: 8, clientX: 450, clientY: 100 });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.pointerUp(window, { pointerId: 8, clientX: 450, clientY: 100 });

      fireEvent.pointerDown(card, { pointerId: 9, pointerType: 'touch', button: 0, clientX: 150, clientY: 0 });
      fireEvent.pointerMove(window, { pointerId: 9, clientX: 450, clientY: 100 });
      fireEvent.pointerUp(window, { pointerId: 9, clientX: 450, clientY: 100 });
      expect(onDrop).not.toHaveBeenCalled();
    });
  });

  describe('bloqueos de agenda (DX-122)', () => {
    const vacation = {
      id: 'b-1',
      providerId: 'prov-1',
      locationId: null,
      start: new Date('2031-03-01T00:00:00').toISOString(),
      end: new Date('2031-03-08T00:00:00').toISOString(),
      kind: 'VACATION' as const,
      allowsBooking: false,
      note: 'Congreso',
    };
    const lunch = {
      id: 'b-2',
      providerId: null,
      locationId: 'loc-1',
      start: new Date(`${DATE}T13:00:00`).toISOString(),
      end: new Date(`${DATE}T14:00:00`).toISOString(),
      kind: 'LUNCH' as const,
      allowsBooking: true,
      note: null,
    };

    it('pinta el del profesional en su columna y el de la sede en todas, con etiqueta y leyenda', () => {
      renderColumns({ blocks: [vacation, lunch], activeLocationId: 'loc-1' });
      const columns = screen.getAllByTestId('day-column');
      expect(within(columns[0]).getAllByTestId('schedule-block')).toHaveLength(2);
      expect(within(columns[1]).getAllByTestId('schedule-block')).toHaveLength(1);
      expect(within(columns[0]).getByRole('note', { name: /^Bloqueo: Vacaciones: Congreso, / })).toBeInTheDocument();
      expect(
        within(columns[2]).getByRole('note', { name: 'Bloqueo: Almuerzo · toda la sede · se puede agendar, 13:00–14:00' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Horario bloqueado (vacaciones, reunión, almuerzo…)')).toBeInTheDocument();
    });

    it('el bloqueo de otra sede no se pinta con una sede activa', () => {
      renderColumns({ blocks: [{ ...lunch, locationId: 'loc-2' }], activeLocationId: 'loc-1' });
      expect(screen.queryByTestId('schedule-block')).not.toBeInTheDocument();
    });

    it('con permiso, la etiqueta abre el bloqueo para quitarlo', async () => {
      const onSelectBlock = jest.fn();
      renderColumns({ blocks: [lunch], activeLocationId: 'loc-1', onSelectBlock });
      await userEvent.click(screen.getAllByRole('button', { name: /^Quitar bloqueo: Almuerzo/ })[0]);
      expect(onSelectBlock).toHaveBeenCalledWith(lunch);
    });
  });
});
