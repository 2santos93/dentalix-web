import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayColumns } from './day-columns';
import type { Appointment } from '@/lib/appointments/appointments-api';
import type { BusinessHours } from '@/lib/locations/schedule-api';
import { PX_PER_MINUTE } from '@/lib/appointments/day-grid';
import { caracasSede, testAgendaClock } from '@/lib/test/sede-clock';
import { clinicLocation } from '@/lib/test/locations';
import { wallInstant } from '@/lib/time/wall-clock';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

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
  { userId: 'prov-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST' as const, locationIds: null },
  { userId: 'prov-2', fullName: 'Dr. Luis Gómez', role: 'DENTIST' as const, locationIds: null },
  { userId: 'prov-3', fullName: 'Dra. Sara Paz', role: 'ADMIN' as const, locationIds: null },
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
    wantsEarlier: false,
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
    <DayColumns clock={CLOCK}
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

  // DX-233: el horario del profesional en la sede.
  it('sombrea en cada columna el tiempo fuera del horario del profesional en la sede', () => {
    renderColumns({
      providerRanges: {
        'prov-1': [{ startMinute: 9 * 60, endMinute: 13 * 60 }],
        'prov-2': null,
      },
    });
    const [first, second, third] = screen.getAllByTestId('day-column');
    // prov-1: antes de las 9 y de las 13 al final (dos franjas).
    expect(within(first).getAllByTestId('provider-off-band')).toHaveLength(2);
    // Sin horario propio (null) o sin dato: nada.
    expect(within(second).queryAllByTestId('provider-off-band')).toHaveLength(0);
    expect(within(third).queryAllByTestId('provider-off-band')).toHaveLength(0);
    expect(screen.getByText('Fuera del horario del profesional en esta sede')).toBeInTheDocument();
    // La cabecera dice su horario de ese día en la sede.
    const headers = screen.getAllByTestId('day-column-header');
    expect(within(headers[0]).getByTestId('provider-hours')).toHaveTextContent('09:00–13:00');
    expect(within(headers[1]).queryByTestId('provider-hours')).not.toBeInTheDocument();
  });

  it('no propone huecos libres fuera del horario del profesional', () => {
    renderColumns({
      onFillOpening: jest.fn(),
      now: new Date(`${DATE}T06:00:00`),
      appointments: [],
      providerRanges: { 'prov-1': [{ startMinute: 15 * 60, endMinute: 17 * 60 }] },
    });
    const [first, second] = screen.getAllByTestId('day-column');
    const gaps = within(first).getAllByTestId('free-gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toHaveTextContent('15:00–17:00');
    expect(within(second).getAllByTestId('free-gap')).toHaveLength(2);
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
      <DayColumns clock={CLOCK}
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

    it('sin permiso sobre ese bloqueo, la etiqueta no ofrece quitarlo', () => {
      renderColumns({ blocks: [lunch], activeLocationId: 'loc-1', onSelectBlock: jest.fn(), canSelectBlock: () => false });
      expect(screen.queryByRole('button', { name: /^Quitar bloqueo/ })).not.toBeInTheDocument();
      expect(screen.getAllByText(/^Almuerzo/).length).toBeGreaterThan(0);
    });
  });
});

describe('DayColumns · chip «Saldo vencido» (DX-150)', () => {
  it('la tarjeta lleva la marca y la anuncia en su nombre accesible; sin saldo vencido, nada', () => {
    renderColumns({
      appointments: [
        { ...endo, balance: { hasOverdue: true, overdueDays: 40 } },
        { ...light, balance: { hasOverdue: false, overdueDays: null } },
      ],
    });
    const chips = screen.getAllByTestId('overdue-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent('Saldo vencido · 40 días');
    expect(screen.getByRole('button', { name: /Saldo vencido · 40 días$/ })).toBeInTheDocument();
  });
});

describe('DayColumns · chip «Cobertura vencida» (DX-153)', () => {
  it('la tarjeta con cobertura vencida lleva la marca y la anuncia en su nombre accesible; el resto, nada', () => {
    const expired = { status: 'EXPIRED' as const, payerName: 'Surco Salud', planName: null, validTo: '2026-01-31' };
    const active = { status: 'ACTIVE' as const, payerName: 'Surco Salud', planName: null, validTo: null };
    renderColumns({
      appointments: [
        { ...endo, coverage: active },
        { ...light, coverage: expired },
      ],
    });
    // `light` dura 30 min: el aviso va como marca en la fila de la hora, no como chip recortable.
    const markers = screen.getAllByTestId('coverage-marker');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAttribute('title', 'Cobertura vencida');
    expect(screen.queryByTestId('coverage-chip')).not.toBeInTheDocument();
    const card = screen.getByRole('button', { name: /Cobertura vencida$/ });
    expect(card).toContainElement(markers[0]);
    expect(card).toHaveAccessibleName(/Cobertura vencida/);
  });
});

describe('«Ocupar este hueco» (DX-210)', () => {
  const BEFORE = new Date(`${DATE}T06:00:00`);

  it('cada hueco libre de la columna es un botón que abre el panel con su franja', async () => {
    const onFillOpening = jest.fn();
    renderColumns({ onFillOpening, now: BEFORE, appointments: [endo] });
    const gap = screen.getByRole('button', {
      name: 'Ocupar el hueco libre de 10:30–13:00 · Dra. Ana Ríos',
    });
    await userEvent.click(gap);
    expect(onFillOpening).toHaveBeenCalledWith('prov-1', {
      start: new Date(`${DATE}T10:30:00`).toISOString(),
      end: new Date(`${DATE}T13:00:00`).toISOString(),
    });
    // Teclado: el hueco se alcanza con Tab y se abre con Enter.
    onFillOpening.mockClear();
    gap.focus();
    await userEvent.keyboard('{Enter}');
    expect(onFillOpening).toHaveBeenCalledTimes(1);
  });

  it('el odontólogo solo ve los huecos de su columna; sin la acción no se pintan', () => {
    renderColumns({
      onFillOpening: jest.fn(),
      canFillOpening: (id) => id === 'prov-2',
      now: BEFORE,
    });
    const gaps = screen.getAllByTestId('free-gap');
    expect(gaps.every((g) => g.getAttribute('aria-label')?.includes('Dr. Luis Gómez'))).toBe(true);
  });

  it('sin onFillOpening no hay huecos', () => {
    renderColumns({ now: BEFORE });
    expect(screen.queryByTestId('free-gap')).not.toBeInTheDocument();
  });

  it('una cita recién cancelada ofrece «Ocupar este hueco» con SU hora, como el detalle', async () => {
    const onFillOpening = jest.fn();
    const cancelled = appointment({
      id: 'apt-c',
      status: 'CANCELLED',
      start: new Date(`${DATE}T10:00:00`).toISOString(),
      end: new Date(`${DATE}T10:30:00`).toISOString(),
    });
    const before = appointment({
      id: 'apt-b',
      start: new Date(`${DATE}T09:00:00`).toISOString(),
      end: new Date(`${DATE}T10:00:00`).toISOString(),
    });
    renderColumns({ onFillOpening, now: BEFORE, appointments: [before, cancelled] });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Ocupar el hueco de la cita cancelada de 10:00–10:30 · María López',
      }),
    );
    expect(onFillOpening).toHaveBeenCalledWith(
      'prov-1',
      {
        start: new Date(`${DATE}T10:00:00`).toISOString(),
        end: new Date(`${DATE}T10:30:00`).toISOString(),
      },
      'loc-1',
    );
  });

  it('la tarjeta lleva el chip «Adelantar si hay hueco»', () => {
    renderColumns({ appointments: [{ ...endo, wantsEarlier: true }] });
    expect(screen.getByTestId('wants-earlier-chip')).toHaveTextContent('Adelantar si hay hueco');
  });

  it('el chip va en la línea de la hora y el nombre no se encoge: en una cita corta se siguen leyendo', () => {
    renderColumns({ appointments: [{ ...endo, wantsEarlier: true }] });
    const card = screen.getByRole('button', { name: /^Detalle de la cita de / });
    const chip = within(card).getByTestId('wants-earlier-chip');
    const time = within(card).getByText(/^\d{2}:\d{2}–\d{2}:\d{2}$/);
    // Misma fila que la hora: no añade altura a la tarjeta de 30 min.
    expect(time.parentElement).toContainElement(chip);
    expect(time.parentElement).toHaveClass('shrink-0');
    expect(within(card).getByText('María López')).toHaveClass('shrink-0');
  });

  it('el nombre accesible de la tarjeta dice «Adelantar si hay hueco» (el aria-label tapa el chip)', () => {
    renderColumns({ appointments: [{ ...endo, wantsEarlier: true }] });
    expect(
      screen.getByRole('button', { name: /^Detalle de la cita de .* · Adelantar si hay hueco$/ }),
    ).toBeInTheDocument();
  });
});

describe('DayColumns: alertas médicas (DX-247)', () => {
  const short = appointment({
    id: 'apt-15',
    start: new Date(`${DATE}T15:00:00`).toISOString(),
    end: new Date(`${DATE}T15:15:00`).toISOString(),
    medicalAlerts: {
      hasCriticalAlert: true,
      requiresPremedication: true,
      anamnesisStatus: 'CURRENT',
      alerts: ['profilaxisAntibiotica', 'alergiaMarcada'],
      anamnesisReviewedAt: '2030-12-01T00:00:00.000Z',
    },
  });
  const noHistory = appointment({
    id: 'apt-new',
    providerId: 'prov-2',
    patientFirstName: 'Leo',
    medicalAlerts: {
      hasCriticalAlert: false,
      requiresPremedication: false,
      anamnesisStatus: 'MISSING',
      alerts: [],
      anamnesisReviewedAt: null,
    },
  });

  it('la cita de 15 min con alerta lleva el icono y su resumen en el nombre de la tarjeta', () => {
    renderColumns({ appointments: [short, noHistory, light] });
    const indicators = screen.getAllByTestId('medical-alert-indicator');
    expect(indicators.map((i) => i.getAttribute('data-severity'))).toEqual(['critical', 'attention']);
    const card = screen.getByRole('button', { name: /María López.*Requiere premedicación/ });
    expect(card).not.toContainElement(indicators[0]);
    // Sin anamnesis: «Sin anamnesis», nunca «sin alertas».
    expect(screen.getByRole('button', { name: /Leo López.*Sin anamnesis/ })).toBeInTheDocument();
  });

  it('abrir las alertas con el teclado no abre la cita ni empieza a arrastrarla', async () => {
    const user = userEvent.setup();
    const handlers = renderColumns({ appointments: [short] });
    const indicator = screen.getByRole('button', { name: 'Alertas médicas de María López' });
    act(() => indicator.focus());
    expect(screen.getByTestId('medical-alert-popover')).toHaveTextContent('Requiere profilaxis antibiótica');
    expect(screen.getByTestId('medical-alert-popover')).toHaveTextContent('Alergia marcada como alerta');
    await user.keyboard('{Enter}');
    expect(handlers.onSelectAppointment).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId('medical-alert-popover'), { pointerType: 'mouse', clientY: 10 });
    expect(handlers.onDrop).not.toHaveBeenCalled();
  });
});


it.each(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'ARRIVED', 'IN_CHAIR', 'READY_FOR_CHECKOUT'] as const)('DX-242: Día %s anuncia estado y tipo', (status) => {
  const labels = { SCHEDULED:'Agendada', CONFIRMED:'Confirmada', COMPLETED:'Completada', CANCELLED:'Cancelada', NO_SHOW:'No asistió', ARRIVED:'En espera', IN_CHAIR:'En sillón', READY_FOR_CHECKOUT:'Listo para cobrar' };
  renderColumns({ appointments:[appointment({ id:'status', status })] });
  expect(screen.getByRole('button', { name: new RegExp('Detalle.*' + labels[status]) })).toHaveAccessibleName(expect.stringContaining('Endodoncia'));
});

describe('DayColumns con el reloj de la sede (DX-378)', () => {
  // Caracas (UTC−4) en 12 h; Jest corre con TZ=UTC: con la zona del navegador,
  // la cita de las 9:00 de la sede caería a las 13:00 de la rejilla.
  const caracas = testAgendaClock([caracasSede()]);
  const at = (minute: number) => wallInstant(DATE, minute, 'America/Caracas').toISOString();
  const nine = appointment({ id: 'apt-ccs', start: at(9 * 60), end: at(10 * 60 + 30) });

  it('coloca la cita en la fila de su hora en la sede y la pinta en 12 h', () => {
    renderColumns({ clock: caracas, appointments: [nine] });
    const card = screen.getByTestId('day-column-appointment');
    // La franja empieza a las 08:30 (horario 9–19 con media hora de margen).
    expect(card).toHaveStyle({ top: `${30 * PX_PER_MINUTE}px` });
    expect(
      screen.getByRole('button', { name: /detalle de la cita de 9:00 a\. m\. – 10:30 a\. m\. · maría lópez/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('9:00 a. m.')).toBeInTheDocument();
    expect(screen.getByText('12:00 p. m.')).toBeInTheDocument();
  });

  it('una cita de otra sede sale con la hora y el reloj de SU sede', () => {
    const madrid = clinicLocation({ id: 'madrid', timeZone: 'Europe/Madrid', locale: 'es-ES', hourCycle: 'h23' });
    renderColumns({
      clock: testAgendaClock([caracasSede(), madrid]),
      appointments: [{ ...nine, locationId: 'madrid' }],
    });
    // 13:00 UTC del 3 de marzo son las 14:00 en Madrid.
    expect(screen.getByRole('button', { name: /detalle de la cita de 14:00–15:30/i })).toBeInTheDocument();
  });

  it('el arrastre suelta en la hora de la sede, no en la del navegador', () => {
    const rectSpy = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const index = providers.findIndex((p) => p.userId === this.dataset.providerId);
        return (index >= 0
          ? { left: 100 + index * 200, right: 300 + index * 200, top: 0, bottom: 2000 }
          : { left: 0, right: 0, top: 0, bottom: 0 }) as DOMRect;
      });
    const { onDrop } = renderColumns({ clock: caracas, appointments: [nine] });
    const card = screen.getByTestId('day-column-appointment');
    const y = 150 * PX_PER_MINUTE; // 08:30 + 150 min = 11:00 en la sede
    fireEvent.pointerDown(card, { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 150, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 150, clientY: y });
    expect(screen.getByTestId('drag-preview')).toHaveTextContent('Mover a las 11:00 a. m. · Dra. Ana Ríos');
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 150, clientY: y });
    expect(onDrop).toHaveBeenCalledWith(nine, {
      start: '2031-03-03T15:00:00.000Z',
      end: '2031-03-03T16:30:00.000Z',
      providerId: 'prov-1',
    });
    rectSpy.mockRestore();
  });
});

describe('DayColumns por sillón (DX-211)', () => {
  const chairColumns = {
    columns: [
      { id: 'ch-1', label: 'Sillón 1' },
      { id: 'ch-2', label: 'Sillón 2' },
      { id: 'sin-sillon', label: 'Sin sillón' },
    ],
    columnOf: (a: Appointment) => a.chairId ?? 'sin-sillon',
  };
  const inChair = appointment({ id: 'apt-c', chairId: 'ch-2' });
  const noChair = appointment({
    id: 'apt-n',
    providerId: 'prov-2',
    patientFirstName: 'Juan',
    start: new Date(`${DATE}T11:00:00`).toISOString(),
    end: new Date(`${DATE}T11:30:00`).toISOString(),
  });

  it('una columna por sillón en su orden y «Sin sillón» al final; cada cita en la de su sillón', () => {
    renderColumns({ chairColumns, appointments: [inChair, noChair] });
    expect(screen.getByRole('region', { name: 'Agenda del día por sillón' })).toBeInTheDocument();
    const headers = screen.getAllByTestId('day-column-header').map((h) => h.textContent);
    expect(headers).toEqual([
      expect.stringContaining('Sillón 1'),
      expect.stringContaining('Sillón 2'),
      expect.stringContaining('Sin sillón'),
    ]);
    const columns = screen.getAllByTestId('day-column');
    expect(within(columns[0]).queryAllByTestId('day-column-appointment')).toHaveLength(0);
    expect(within(columns[1]).getByText('María López')).toBeInTheDocument();
    expect(within(columns[2]).getByText('Juan López')).toBeInTheDocument();
    // El detalle sigue nombrando al profesional de la cita.
    expect(
      screen.getByRole('button', { name: /detalle de la cita de .* · maría lópez · dra\. ana ríos/i }),
    ).toBeInTheDocument();
  });

  it('el arrastre está desactivado (mantiene el sillón) y «Mover a…» sigue', () => {
    const { onDrop } = renderColumns({ chairColumns, appointments: [inChair, noChair] });
    const card = screen.getAllByTestId('day-column-appointment')[0];
    fireEvent.pointerDown(card, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 400, clientY: 200 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 400, clientY: 200 });
    expect(onDrop).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: /mover a…/i })).toHaveLength(2);
  });

  it('«Nueva cita» de un sillón vacío pasa el id de esa columna', async () => {
    const user = userEvent.setup();
    const { onNewAppointment } = renderColumns({ chairColumns, appointments: [inChair, noChair] });
    await user.click(screen.getByRole('button', { name: 'Nueva cita en Sillón 1' }));
    expect(onNewAppointment).toHaveBeenCalledWith('ch-1');
  });
});

