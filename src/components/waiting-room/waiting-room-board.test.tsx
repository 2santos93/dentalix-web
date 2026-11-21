import { act, render, screen, within } from '@testing-library/react';
import { WaitingRoomBoardView, waitingRoomCopy as copy } from './waiting-room-board';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { getPublicWaitingRoomBoard, type WaitingRoomBoard } from '@/lib/waiting-room/waiting-room-api';
import { BrandingProvider } from '@/components/brand/branding-context';

jest.mock('../../lib/waiting-room/waiting-room-api', () => ({
  ...jest.requireActual('../../lib/waiting-room/waiting-room-api'),
  getPublicWaitingRoomBoard: jest.fn(),
}));
jest.mock('next/navigation', () => ({ usePathname: () => '/sala/tok' }));

const mockedGet = getPublicWaitingRoomBoard as jest.MockedFunction<typeof getPublicWaitingRoomBoard>;

function board(over: Partial<WaitingRoomBoard> = {}): WaitingRoomBoard {
  const waiting = over.waiting ?? [
    { key: 'w1', label: 'Ana R.', minutesWaiting: 12 },
    { key: 'w2', label: 'José P.', minutesWaiting: 0 },
  ];
  const called = over.called ?? [
    { key: 'c1', label: 'María G.', chairName: 'Sillón 2', providerName: 'Dra. Pérez', minutesSinceCalled: 3 },
  ];
  return {
    screenName: 'Televisor recepción',
    locationName: 'Sede Chacao',
    nameMode: 'NAME_INITIAL',
    messages: [],
    soundEnabled: false,
    timeZone: 'America/Caracas',
    locale: 'es-VE',
    hourCycle: 'h12',
    now: '2026-11-21T14:05:00.000Z',
    refreshSeconds: 8,
    waitingTotal: waiting.length,
    calledTotal: called.length,
    ...over,
    waiting,
    called,
  };
}

function renderBoard() {
  return render(
    <BrandingProvider status="clinic" value={{ name: 'Clínica Ávila', logoUrl: null, primaryColor: null }}>
      <WaitingRoomBoardView screenToken="tok" />
    </BrandingProvider>,
  );
}

/** Deja correr los timers y resolver las promesas del sondeo. */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Math, 'random').mockReturnValue(0.5); // sin jitter: 8 s justos
  mockedGet.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('DX-588 · pantalla de sala de espera', () => {
  it('pinta las dos columnas, la marca y el reloj de la sede; nada interactivo ni enfocable', async () => {
    mockedGet.mockResolvedValue(board());
    const { container } = renderBoard();
    await advance(0);

    expect(screen.getByRole('heading', { level: 1, name: 'Clínica Ávila' })).toBeInTheDocument();
    expect(screen.getByText('Sede Chacao')).toBeInTheDocument();
    const waiting = screen.getByRole('region', { name: copy.waiting });
    expect(
      within(waiting)
        .getAllByTestId('waiting-room-waiting-item')
        .map((li) => li.textContent),
    ).toEqual(['Ana R.hace 12 min', 'José P.Acaba de llegar']);
    const called = screen.getByRole('region', { name: copy.called });
    expect(within(called).getByText('María G.')).toBeInTheDocument();
    expect(within(called).getByText('Sillón 2 · Dra. Pérez')).toBeInTheDocument();
    // 14:05 UTC = 10:05 a. m. en Caracas, con el reloj de 12 h de la sede.
    expect(screen.getByTestId('waiting-room-clock').textContent).toMatch(/^10:05/);

    const root = screen.getByTestId('waiting-room-board');
    expect(root).toHaveClass('dark', 'cursor-none');
    expect(container.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0);
  });

  it('lista blanca: nunca pinta campos fuera del contrato aunque la API los mande', async () => {
    const leaky = board({
      waiting: [
        {
          key: 'w1',
          label: 'Ana R.',
          minutesWaiting: 4,
          // Campos que NO están en el contrato: no deben salir nunca.
          ...({ phone: '+58 412 555 0101', reason: 'Dolor en el 36', fullName: 'Ana Rodríguez' } as object),
        },
      ],
      called: [
        {
          key: 'c1',
          label: 'José P.',
          chairName: null,
          providerName: null,
          minutesSinceCalled: 1,
          ...({ docNumber: 'V-12345678', amount: '40.00' } as object),
        },
      ],
    });
    mockedGet.mockResolvedValue(leaky);
    const { container } = renderBoard();
    await advance(0);
    const text = container.textContent ?? '';
    for (const forbidden of ['412', 'Dolor', 'Rodríguez', 'V-12345678', '40.00', 'Televisor recepción']) {
      expect(text).not.toContain(forbidden);
    }
    expect(screen.getByText(copy.calledTo(null, null))).toBeInTheDocument();
  });

  it('lista blanca del contrato: las claves del tablero y de cada fila', () => {
    const b = board();
    expect(Object.keys(b).sort()).toEqual(
      [
        'screenName',
        'locationName',
        'nameMode',
        'messages',
        'soundEnabled',
        'timeZone',
        'locale',
        'hourCycle',
        'now',
        'refreshSeconds',
        'waiting',
        'waitingTotal',
        'called',
        'calledTotal',
      ].sort(),
    );
    expect(Object.keys(b.waiting[0]).sort()).toEqual(['key', 'label', 'minutesWaiting']);
    expect(Object.keys(b.called[0]).sort()).toEqual(
      ['key', 'label', 'chairName', 'providerName', 'minutesSinceCalled'].sort(),
    );
  });

  it('«y N más» cuenta el total de la API (corta cada columna a 40 filas), no solo las filas recibidas', async () => {
    mockedGet.mockResolvedValue(board({ waitingTotal: 45, calledTotal: 1 }));
    renderBoard();
    await advance(0);
    // jsdom no mide: se pintan las 2 filas recibidas y el resto hasta 45 va en «y N más».
    expect(screen.getAllByTestId('waiting-room-waiting-item')).toHaveLength(2);
    expect(screen.getByTestId('waiting-room-more')).toHaveTextContent(copy.more(43));
    // En «Pasando a consulta» caben todas: no hay «y N más» visible.
    expect(within(screen.getByRole('region', { name: copy.called })).queryByTestId('waiting-room-more')).toBeNull();
  });

  it('modo turno: solo «Turno N», sin nombres, con la pista del turno', async () => {
    mockedGet.mockResolvedValue(
      board({
        nameMode: 'TURN_NUMBER',
        waiting: [
          { key: 'w1', label: 'Turno 7', minutesWaiting: 3 },
          { key: 'w2', label: 'Turno 8', minutesWaiting: 1 },
        ],
        called: [{ key: 'c1', label: 'Turno 6', chairName: 'Sillón 1', providerName: null, minutesSinceCalled: 0 }],
      }),
    );
    renderBoard();
    await advance(0);
    expect(screen.getByText(copy.turnHint)).toBeInTheDocument();
    const labels = screen
      .getAllByTestId(/waiting-room-(waiting|called)-item/)
      .map((li) => li.querySelector('span')?.textContent?.replace(copy.now, ''));
    expect(labels.every((l) => /^Turno \d+$/.test(l ?? ''))).toBe(true);
  });

  it('estados vacíos dignos', async () => {
    mockedGet.mockResolvedValue(board({ waiting: [], called: [] }));
    renderBoard();
    await advance(0);
    expect(screen.getByText(copy.waitingEmpty)).toBeInTheDocument();
    expect(screen.getByText(copy.calledEmpty)).toBeInTheDocument();
  });

  it('destaca solo a quien entra en «Pasando a consulta» después de la primera carga, 8 s', async () => {
    mockedGet.mockResolvedValueOnce(board());
    renderBoard();
    await advance(0);
    // En la primera carga no se destaca nada.
    expect(screen.getByTestId('waiting-room-called-item')).not.toHaveAttribute('data-highlighted');

    mockedGet.mockResolvedValue(
      board({
        waiting: [{ key: 'w2', label: 'José P.', minutesWaiting: 1 }],
        called: [
          { key: 'c2', label: 'Ana R.', chairName: 'Sillón 1', providerName: 'Dr. Rojas', minutesSinceCalled: 0 },
          { key: 'c1', label: 'María G.', chairName: 'Sillón 2', providerName: 'Dra. Pérez', minutesSinceCalled: 3 },
        ],
      }),
    );
    await advance(8000);
    const [fresh, old] = screen.getAllByTestId('waiting-room-called-item');
    expect(fresh).toHaveAttribute('data-highlighted', 'true');
    expect(within(fresh).getByText(copy.now)).toBeInTheDocument();
    expect(old).not.toHaveAttribute('data-highlighted');

    await advance(8000);
    expect(screen.getAllByTestId('waiting-room-called-item')[0]).not.toHaveAttribute('data-highlighted');
  });

  it('pita con Web Audio solo si la pantalla tiene el aviso sonoro (y sin audio no falla)', async () => {
    const start = jest.fn();
    const ctx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: jest.fn(),
      createOscillator: () => ({
        type: '',
        frequency: { value: 0 },
        connect: (g: unknown) => g,
        start,
        stop: jest.fn(),
      }),
      createGain: () => ({
        gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
        connect: jest.fn(),
      }),
    };
    (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => ctx);
    mockedGet.mockResolvedValueOnce(board({ soundEnabled: true, called: [] }));
    renderBoard();
    await advance(0);
    expect(start).not.toHaveBeenCalled();
    mockedGet.mockResolvedValue(board({ soundEnabled: true }));
    await advance(8000);
    expect(start).toHaveBeenCalled();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('sin conexión conserva lo último con el indicador, reintenta 8 → 15 → 30 s y se recupera solo', async () => {
    mockedGet.mockResolvedValueOnce(board());
    renderBoard();
    await advance(0);
    expect(screen.queryByTestId('waiting-room-offline')).toBeNull();

    mockedGet.mockRejectedValue(new NetworkError(new TypeError('fetch failed')));
    await advance(8000);
    expect(screen.getByTestId('waiting-room-offline')).toHaveTextContent(copy.offline);
    expect(screen.getByText('Ana R.')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);

    await advance(7999);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    await advance(1); // 8 s tras el 1.er fallo
    expect(mockedGet).toHaveBeenCalledTimes(3);
    await advance(15000); // 15 s tras el 2.º
    expect(mockedGet).toHaveBeenCalledTimes(4);
    await advance(29999); // 30 s tras el 3.º
    expect(mockedGet).toHaveBeenCalledTimes(4);
    await advance(1);
    expect(mockedGet).toHaveBeenCalledTimes(5);

    // Vuelve la red: el evento `online` pide ya, sin esperar.
    mockedGet.mockResolvedValue(board({ waiting: [{ key: 'w3', label: 'Luis M.', minutesWaiting: 2 }] }));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(mockedGet).toHaveBeenCalledTimes(6);
    expect(screen.queryByTestId('waiting-room-offline')).toBeNull();
    expect(screen.getByText('Luis M.')).toBeInTheDocument();
  });

  it('un 5xx o un 429 cuentan como sin conexión, no como pantalla inactiva', async () => {
    mockedGet.mockResolvedValueOnce(board());
    renderBoard();
    await advance(0);
    mockedGet.mockRejectedValueOnce(new ApiError(503, 'down'));
    await advance(8000);
    expect(screen.getByTestId('waiting-room-offline')).toBeInTheDocument();
    mockedGet.mockRejectedValueOnce(new ApiError(429, 'slow down'));
    await advance(8000);
    expect(screen.getByTestId('waiting-room-offline')).toBeInTheDocument();
    expect(screen.queryByText(copy.inactiveTitle)).toBeNull();
  });

  it('sin datos y sin red: «Conectando…» y sigue intentando', async () => {
    mockedGet.mockRejectedValueOnce(new NetworkError(new TypeError('fetch failed')));
    renderBoard();
    await advance(0);
    expect(screen.getByText(copy.connecting)).toBeInTheDocument();
    mockedGet.mockResolvedValue(board());
    await advance(8000);
    expect(screen.getByText('Ana R.')).toBeInTheDocument();
  });

  it('404: «Esta pantalla ya no está activa» y deja de sondear', async () => {
    mockedGet.mockResolvedValueOnce(board());
    renderBoard();
    await advance(0);
    mockedGet.mockRejectedValue(
      new ApiError(404, 'Esta pantalla ya no está activa.', { code: 'WAITING_ROOM_SCREEN_INACTIVE' }),
    );
    await advance(8000);
    expect(screen.getByRole('heading', { name: copy.inactiveTitle })).toBeInTheDocument();
    expect(screen.queryByText('Ana R.')).toBeNull();
    expect(screen.queryByTestId('waiting-room-offline')).toBeNull();
    const calls = mockedGet.mock.calls.length;
    await advance(120_000);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(mockedGet).toHaveBeenCalledTimes(calls);
  });

  it('mensajes rotativos cada 10 s', async () => {
    mockedGet.mockResolvedValue(
      board({ messages: ['Horario: lunes a viernes de 8:00 a 17:00', 'Recuerda tu cita de control'] }),
    );
    renderBoard();
    await advance(0);
    expect(screen.getByTestId('waiting-room-message')).toHaveTextContent('Horario: lunes a viernes de 8:00 a 17:00');
    await advance(10_000);
    expect(screen.getByTestId('waiting-room-message')).toHaveTextContent('Recuerda tu cita de control');
  });

  it('pide el Wake Lock y lo vuelve a pedir al recuperar la visibilidad', async () => {
    const request = jest.fn().mockResolvedValue({ release: jest.fn().mockResolvedValue(undefined) });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    mockedGet.mockResolvedValue(board());
    renderBoard();
    await advance(0);
    expect(request).toHaveBeenCalledWith('screen');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(request).toHaveBeenCalledTimes(2);
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  });
});
