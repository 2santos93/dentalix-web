'use client';
import * as React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MonitorOff, WifiOff } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  getPublicWaitingRoomBoard,
  type PublicWaitingRoomCalledItemDto,
  type PublicWaitingRoomWaitingItemDto,
  type WaitingRoomBoard,
} from '@/lib/waiting-room/waiting-room-api';
import {
  backoffDelayMs,
  HIGHLIGHT_MS,
  MESSAGE_ROTATION_MS,
  minutesAgo,
  newKeys,
  pollDelayMs,
  visibleCapacity,
} from '@/lib/waiting-room/board-logic';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import type { HourCycle } from '@/lib/format/regional-format';
import { useClinicBranding } from '@/components/brand/branding-context';
import { cn } from '@/lib/utils';

// Copy como constantes (i18n-ready). Lo lee la sala de espera: frases cortas.
export const waitingRoomCopy = {
  loading: 'Cargando la sala de espera…',
  connecting: 'Conectando…',
  waiting: 'En espera',
  called: 'Pasando a consulta',
  waitingEmpty: 'Nadie en espera',
  calledEmpty: 'Nadie pasando a consulta ahora',
  turnHint: 'Atento a tu número de turno',
  more: (n: number) => (n === 1 ? 'y 1 más' : `y ${n} más`),
  calledTo: (chair: string | null, provider: string | null) =>
    [chair, provider].filter((part): part is string => !!part).join(' · ') || 'Pase a consulta',
  now: 'Ahora',
  offline: 'Sin conexión',
  inactiveTitle: 'Esta pantalla ya no está activa',
  inactiveMessage: 'Pide a la clínica un enlace nuevo desde Ajustes › Pantallas de sala de espera.',
  fallbackClinic: 'Sala de espera',
};
const copy = waitingRoomCopy;

/**
 * Tamaños del televisor (DX-588). Pensados para 1920×1080 leído a 4 m:
 *
 * | Uso                     | Variable          | En 1080 px | Mínimo |
 * |-------------------------|-------------------|-----------:|-------:|
 * | Nombre / turno          | `--wr-name`       |    ≈ 60 px |  36 px |
 * | Títulos de columna      | `--wr-heading`    |    ≈ 48 px |  36 px |
 * | Reloj                   | `--wr-clock`      |    ≈ 69 px |  40 px |
 * | Secundario (sillón…)    | `--wr-secondary`  |    ≈ 39 px |  32 px |
 * | Meta («hace 5 min»)     | `--wr-meta`       |    ≈ 35 px |  32 px |
 * | Mensajes de la franja   | `--wr-message`    |    ≈ 41 px |  32 px |
 *
 * En 1080 p: nombres ≥ 56 px, secundarios ≥ 36 px y nada por debajo de 32 px.
 * Van en `vh` con `clamp`: en apaisados menores (1366×768, 1280×720) bajan
 * con la altura sin pasar del mínimo, y las listas se recortan con «y N más»
 * en vez de desplazarse (no hay scroll).
 */
const SIZES = {
  '--wr-name': 'clamp(36px, 5.6vh, 88px)',
  '--wr-heading': 'clamp(36px, 4.4vh, 68px)',
  '--wr-clock': 'clamp(40px, 6.4vh, 100px)',
  '--wr-secondary': 'clamp(32px, 3.6vh, 56px)',
  '--wr-meta': 'clamp(32px, 3.2vh, 50px)',
  '--wr-message': 'clamp(32px, 3.8vh, 58px)',
} as React.CSSProperties;

type BoardState =
  | { kind: 'loading'; offline: boolean }
  | { kind: 'inactive' }
  | { kind: 'ready'; board: WaitingRoomBoard; offline: boolean; clockOffsetMs: number };

/**
 * El tablero de la sala de espera: sondea `GET /public/waiting-room/:token`
 * cada `refreshSeconds` (con jitter). Un fallo de red, 5xx o 429 conserva lo
 * último con «Sin conexión» y reintenta 8 → 15 → 30 s (y al volver la red);
 * un 404 deja el aviso «Esta pantalla ya no está activa» y para.
 * Quien entra en «Pasando a consulta» (no en la primera carga) se destaca 8 s.
 */
export function useWaitingRoomBoard(screenToken: string, onCalled: (keys: string[], sound: boolean) => void) {
  const [state, setState] = useState<BoardState>({ kind: 'loading', offline: false });
  const onCalledRef = useRef(onCalled);
  useEffect(() => {
    onCalledRef.current = onCalled;
  }, [onCalled]);

  useEffect(() => {
    let cancelled = false;
    let stopped = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previousCalled: Set<string> | null = null;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void poll(), ms);
    };

    async function poll() {
      if (cancelled || stopped || inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      try {
        const board = await getPublicWaitingRoomBoard(screenToken);
        if (cancelled) return;
        failures = 0;
        const fresh = previousCalled ? newKeys(previousCalled, board.called) : [];
        previousCalled = new Set(board.called.map((c) => c.key));
        const serverNow = Date.parse(board.now);
        const clockOffsetMs = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
        setState({ kind: 'ready', board, offline: false, clockOffsetMs });
        if (fresh.length > 0) onCalledRef.current(fresh, board.soundEnabled);
        schedule(pollDelayMs(board.refreshSeconds));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          stopped = true;
          setState({ kind: 'inactive' });
          return;
        }
        failures += 1;
        setState((prev) => (prev.kind === 'inactive' ? prev : { ...prev, offline: true }));
        schedule(backoffDelayMs(failures, err instanceof ApiError ? err.retryAfterSeconds : null));
      } finally {
        inFlight = false;
      }
    }

    const onOnline = () => void poll();
    window.addEventListener('online', onOnline);
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [screenToken]);

  return state;
}

/** No deja que el televisor apague la pantalla; lo vuelve a pedir al recuperar la visibilidad. Silencioso si no existe. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (
      navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }
    ).wakeLock;
    if (!wakeLock) return;
    let sentinel: { release(): Promise<void> } | null = null;
    let cancelled = false;
    const request = () => {
      wakeLock
        .request('screen')
        .then((s) => {
          if (cancelled) void s.release().catch(() => undefined);
          else sentinel = s;
        })
        .catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') request();
    };
    request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

/** Pitido corto con Web Audio (sin ficheros). Si el navegador bloquea el audio, no suena y no pasa nada. */
function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback(() => {
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = ctxRef.current ?? new Ctor();
      ctxRef.current = ctx;
      const play = () => {
        const t = ctx.currentTime;
        for (const [i, freq] of [880, 660].entries()) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const start = t + i * 0.22;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.21);
        }
      };
      if (ctx.state === 'suspended') void ctx.resume().then(play, () => undefined);
      else play();
    } catch {
      // Audio bloqueado o no disponible: el destacado visual basta.
    }
  }, []);
}

/** Cuántas filas caben en la lista (mide la primera fila y el hueco de la lista). */
function useCapacity(count: number) {
  const listRef = useRef<HTMLUListElement>(null);
  const [capacity, setCapacity] = useState(count);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const first = el.querySelector<HTMLElement>('[data-board-row]');
      if (!first) return setCapacity(count);
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      setCapacity(visibleCapacity(count, el.clientHeight + gap, first.offsetHeight + gap));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count]);
  return [listRef, Math.min(capacity, count)] as const;
}

function useClock(board: WaitingRoomBoard | null, offsetMs: number): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  if (!board) return null;
  const fmt = locationRegionalFormat({ locale: board.locale, hourCycle: board.hourCycle as HourCycle | null });
  if (!fmt) return null;
  try {
    return fmt.time(new Date(now + offsetMs), board.timeZone);
  } catch {
    return null;
  }
}

function useRotatingMessage(messages: readonly string[]): string | null {
  const [index, setIndex] = useState(0);
  const count = messages.length;
  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), MESSAGE_ROTATION_MS);
    return () => clearInterval(id);
  }, [count]);
  if (count === 0) return null;
  return messages[index % count] ?? null;
}

/**
 * `/sala/[token]` (DX-588): el televisor de la sala de espera. Solo lectura,
 * sin cursor ni nada que se pueda enfocar; tema oscuro siempre (contenedor
 * `.dark`, con el acento de la clínica en su variante oscura); marca de la
 * clínica por el host; Wake Lock. Solo pinta los campos de la lista blanca de
 * la API: etiqueta («Ana R.» o «Turno 7»), minutos, sillón y profesional.
 */
export function WaitingRoomBoardView({ screenToken }: { screenToken: string }) {
  const branding = useClinicBranding();
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const chime = useChime();

  const onCalled = useCallback(
    (keys: string[], sound: boolean) => {
      setHighlighted((prev) => new Set([...prev, ...keys]));
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setHighlighted((prev) => {
          const next = new Set(prev);
          for (const k of keys) next.delete(k);
          return next;
        });
      }, HIGHLIGHT_MS);
      timers.current.add(timer);
      if (sound) chime();
    },
    [chime],
  );
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
    };
  }, []);

  const state = useWaitingRoomBoard(screenToken, onCalled);
  useWakeLock(state.kind !== 'inactive');
  const board = state.kind === 'ready' ? state.board : null;
  const clock = useClock(board, state.kind === 'ready' ? state.clockOffsetMs : 0);
  const message = useRotatingMessage(board?.messages ?? []);
  const offline = state.kind !== 'inactive' && state.offline;
  const clinicName = branding.name ?? copy.fallbackClinic;

  return (
    <div
      data-testid="waiting-room-board"
      // Oscuro siempre, aunque el sistema o la persona tengan claro: los tokens
      // y el acento de la clínica se definen por la clase `.dark`.
      className="dark fixed inset-0 flex cursor-none select-none flex-col overflow-hidden bg-canvas text-ink"
      style={{ ...SIZES, colorScheme: 'dark' }}
    >
      <header className="flex shrink-0 items-center gap-[2vw] border-b border-border px-[3vw] py-[2vh]">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo del tenant en un host arbitrario
          <img
            src={branding.logoUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-[clamp(48px,8vh,120px)] w-auto max-w-[20vw] shrink-0 object-contain"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[length:var(--wr-heading)] font-semibold leading-tight tracking-tight">
            {clinicName}
          </h1>
          {board ? (
            <p className="truncate text-[length:var(--wr-meta)] leading-tight text-muted">{board.locationName}</p>
          ) : null}
        </div>
        {offline ? (
          <p
            data-testid="waiting-room-offline"
            className="flex shrink-0 items-center gap-3 rounded-full bg-warning-subtle px-[1.4vw] py-[0.8vh] text-[length:var(--wr-meta)] font-medium leading-tight text-warning-text"
          >
            <WifiOff aria-hidden className="size-[1em] shrink-0" />
            {copy.offline}
          </p>
        ) : null}
        {clock ? (
          <p
            data-testid="waiting-room-clock"
            className="shrink-0 text-[length:var(--wr-clock)] font-semibold leading-none tabular-nums"
          >
            {clock}
          </p>
        ) : null}
      </header>

      {state.kind === 'inactive' ? (
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[3vh] px-[6vw] text-center">
          <MonitorOff aria-hidden className="size-[clamp(64px,10vh,160px)] text-muted" />
          <h2 className="text-[length:var(--wr-heading)] font-semibold leading-tight">{copy.inactiveTitle}</h2>
          <p className="max-w-[60ch] text-[length:var(--wr-secondary)] leading-snug text-muted">
            {copy.inactiveMessage}
          </p>
        </main>
      ) : board ? (
        <main className="grid min-h-0 flex-1 grid-cols-2 gap-[3vw] px-[3vw] py-[3vh]">
          <WaitingColumn items={board.waiting} turnMode={board.nameMode === 'TURN_NUMBER'} />
          <CalledColumn items={board.called} highlighted={highlighted} />
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 items-center justify-center">
          <p role="status" className="text-[length:var(--wr-secondary)] text-muted">
            {offline ? copy.connecting : copy.loading}
          </p>
        </main>
      )}

      {state.kind !== 'inactive' && message ? (
        <footer
          data-testid="waiting-room-message"
          className="shrink-0 border-t border-border bg-surface px-[3vw] py-[2.2vh]"
        >
          <p key={message} className="truncate text-center text-[length:var(--wr-message)] leading-tight">
            {message}
          </p>
        </footer>
      ) : null}
    </div>
  );
}

function ColumnHeading({ id, children, hint }: { id: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="shrink-0 border-b border-border pb-[1.2vh]">
      <h2 id={id} className="text-[length:var(--wr-heading)] font-semibold leading-tight">
        {children}
      </h2>
      {hint ? <p className="text-[length:var(--wr-meta)] leading-tight text-muted">{hint}</p> : null}
    </div>
  );
}

function MoreRow({ hidden }: { hidden: number }) {
  if (hidden <= 0) return null;
  return (
    <li data-testid="waiting-room-more" className="text-[length:var(--wr-meta)] leading-tight text-muted">
      {copy.more(hidden)}
    </li>
  );
}

function WaitingColumn({ items, turnMode }: { items: PublicWaitingRoomWaitingItemDto[]; turnMode: boolean }) {
  const [listRef, capacity] = useCapacity(items.length);
  const shown = items.slice(0, capacity);
  return (
    <section
      aria-labelledby="wr-waiting"
      data-testid="waiting-room-waiting"
      className="flex min-h-0 flex-col gap-[2vh]"
    >
      <ColumnHeading id="wr-waiting" hint={turnMode ? copy.turnHint : undefined}>
        {copy.waiting}
      </ColumnHeading>
      {items.length === 0 ? (
        <p className="text-[length:var(--wr-secondary)] text-muted">{copy.waitingEmpty}</p>
      ) : (
        <ul ref={listRef} className="flex min-h-0 flex-1 flex-col gap-[1.6vh] overflow-hidden">
          {shown.map((item) => (
            <li
              key={item.key}
              data-board-row
              data-testid="waiting-room-waiting-item"
              className="flex items-baseline justify-between gap-[1.5vw] border-b border-border-subtle pb-[1.2vh]"
            >
              <span className="min-w-0 truncate text-[length:var(--wr-name)] font-semibold leading-tight">
                {item.label}
              </span>
              <span className="shrink-0 text-[length:var(--wr-meta)] leading-tight text-muted tabular-nums">
                {minutesAgo(item.minutesWaiting)}
              </span>
            </li>
          ))}
          <MoreRow hidden={items.length - shown.length} />
        </ul>
      )}
    </section>
  );
}

function CalledColumn({
  items,
  highlighted,
}: {
  items: PublicWaitingRoomCalledItemDto[];
  highlighted: ReadonlySet<string>;
}) {
  const [listRef, capacity] = useCapacity(items.length);
  const shown = items.slice(0, capacity);
  return (
    <section aria-labelledby="wr-called" data-testid="waiting-room-called" className="flex min-h-0 flex-col gap-[2vh]">
      <ColumnHeading id="wr-called">{copy.called}</ColumnHeading>
      {items.length === 0 ? (
        <p className="text-[length:var(--wr-secondary)] text-muted">{copy.calledEmpty}</p>
      ) : (
        <ul ref={listRef} className="flex min-h-0 flex-1 flex-col gap-[1.6vh] overflow-hidden">
          {shown.map((item) => {
            const isNew = highlighted.has(item.key);
            return (
              <li
                key={item.key}
                data-board-row
                data-testid="waiting-room-called-item"
                data-highlighted={isNew ? 'true' : undefined}
                className={cn(
                  'flex flex-col rounded-xl border px-[1.4vw] py-[1.2vh] transition-colors duration-500',
                  isNew ? 'border-primary bg-primary-subtle text-primary-subtle-text' : 'border-border bg-surface',
                )}
              >
                <span className="flex min-w-0 items-baseline justify-between gap-[1.5vw]">
                  <span className="min-w-0 truncate text-[length:var(--wr-name)] font-semibold leading-tight">
                    {item.label}
                  </span>
                  {isNew ? (
                    <span className="shrink-0 rounded-full bg-primary px-[1vw] text-[length:var(--wr-meta)] font-semibold leading-snug text-primary-fg">
                      {copy.now}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'truncate text-[length:var(--wr-secondary)] leading-tight',
                    isNew ? 'text-primary-subtle-text' : 'text-muted',
                  )}
                >
                  {copy.calledTo(item.chairName, item.providerName)}
                </span>
              </li>
            );
          })}
          <MoreRow hidden={items.length - shown.length} />
        </ul>
      )}
    </section>
  );
}
