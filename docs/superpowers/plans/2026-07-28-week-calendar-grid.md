# Week Calendar Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar, solo en modo Semana de la agenda, la reja de 7 tarjetas por una rejilla con eje de horas (00:00–24:00) donde las citas se dibujan como bloques posicionados por hora.

**Architecture:** Un módulo de helpers puros de layout (`week-grid-layout.ts`) hace la matemática (minutos→píxeles, reparto de solapes en carriles). Un componente presentacional nuevo `WeekTimeGrid` dibuja la rejilla y emite callbacks. `AgendaView` (ya existente) orquesta: lo renderiza en modo Semana, abre el `AppointmentForm` pre-rellenado al clickear un hueco, y muestra un panel inline de detalle (con cambio de estado) al clickear un bloque. `AppointmentForm` gana props opcionales para pre-rellenar hora.

**Tech Stack:** Next.js 15 (App Router, client components), React 19, TypeScript, Tailwind, Jest + @testing-library/react + userEvent.

## Global Constraints

- Copy en español, como constantes (patrón i18n-ready ya usado en la carpeta), no strings sueltos en el JSX.
- Sin librerías nuevas (no hay lib de calendario; rejilla hand-rolled con CSS).
- Sin API nueva: se consumen las citas que `AgendaView` ya carga con `localWeekRange`.
- Fechas civiles/horas: la matemática de posición usa hora **local** (`Date.getHours()/getMinutes()`), consistente con el resto de la agenda. Los tests asumen `TZ=UTC` (como los tests existentes de agenda, que tratan las horas `...Z` como locales).
- Clases de color por estado: reutilizar `STATUS_BADGE_CLASSES` de `appointment-display.tsx` (nunca colores crudos `bg-*-500`).
- Trabajo en la rama `feat/week-calendar-grid` (worktree `dentalix-web-weekcal`). Ejecutar `npx jest <archivo>` y `npx tsc --noEmit` para verificar.

---

### Task 1: Helpers puros de layout

**Files:**
- Create: `src/lib/appointments/week-grid-layout.ts`
- Test: `src/lib/appointments/week-grid-layout.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `SLOT_MINUTES = 30`, `ROW_HEIGHT_PX = 40`, `DAY_MINUTES = 1440`, `GRID_HEIGHT_PX = 1920`, `MIN_BLOCK_PX = 20` (constantes `number`).
  - `minutesFromMidnight(iso: string): number`
  - `blockGeometry(startIso: string, endIso: string): { topPx: number; heightPx: number }`
  - `interface Interval { start: number; end: number }`
  - `layoutLanes<T extends Interval>(items: T[]): Array<T & { lane: number; laneCount: number }>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/appointments/week-grid-layout.test.ts
import {
  minutesFromMidnight,
  blockGeometry,
  layoutLanes,
  ROW_HEIGHT_PX,
  GRID_HEIGHT_PX,
  MIN_BLOCK_PX,
} from './week-grid-layout';

describe('minutesFromMidnight', () => {
  it('returns local minutes since 00:00', () => {
    // TZ=UTC in tests, so the Z time equals local time.
    expect(minutesFromMidnight('2026-03-09T09:30:00.000Z')).toBe(9 * 60 + 30);
    expect(minutesFromMidnight('2026-03-09T00:00:00.000Z')).toBe(0);
  });
});

describe('blockGeometry', () => {
  it('positions a 30-min block at its start row', () => {
    const g = blockGeometry('2026-03-09T09:00:00.000Z', '2026-03-09T09:30:00.000Z');
    expect(g.topPx).toBe((9 * 60 / 30) * ROW_HEIGHT_PX); // 18 slots * 40 = 720
    expect(g.heightPx).toBe(ROW_HEIGHT_PX); // 30 min = 1 row
  });

  it('enforces a minimum height for zero/negative durations', () => {
    const g = blockGeometry('2026-03-09T09:00:00.000Z', '2026-03-09T09:00:00.000Z');
    expect(g.heightPx).toBe(MIN_BLOCK_PX);
  });

  it('clamps height to the bottom of the grid', () => {
    // Starts at 23:30, "ends" next day — height clamps to remaining grid.
    const g = blockGeometry('2026-03-09T23:30:00.000Z', '2026-03-10T02:00:00.000Z');
    expect(g.topPx).toBe((23 * 60 + 30) / 30 * ROW_HEIGHT_PX);
    expect(g.topPx + g.heightPx).toBeLessThanOrEqual(GRID_HEIGHT_PX);
  });
});

describe('layoutLanes', () => {
  it('gives a single full-width lane when nothing overlaps', () => {
    const out = layoutLanes([
      { id: 'a', start: 0, end: 30 },
      { id: 'b', start: 60, end: 90 },
    ]);
    expect(out.every((x) => x.laneCount === 1 && x.lane === 0)).toBe(true);
  });

  it('splits two overlapping items into 2 lanes', () => {
    const out = layoutLanes([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 },
    ]);
    expect(out.find((x) => x.id === 'a')).toMatchObject({ lane: 0, laneCount: 2 });
    expect(out.find((x) => x.id === 'b')).toMatchObject({ lane: 1, laneCount: 2 });
  });

  it('keeps separate clusters independent', () => {
    const out = layoutLanes([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 }, // overlaps a -> cluster of 2
      { id: 'c', start: 120, end: 150 }, // separate -> 1 lane
    ]);
    expect(out.find((x) => x.id === 'c')).toMatchObject({ lane: 0, laneCount: 1 });
    expect(out.find((x) => x.id === 'a')!.laneCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/appointments/week-grid-layout.test.ts`
Expected: FAIL — `Cannot find module './week-grid-layout'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/appointments/week-grid-layout.ts

/** Minutos por fila de la rejilla (media hora). */
export const SLOT_MINUTES = 30;
/** Alto en px de cada fila de 30 min. */
export const ROW_HEIGHT_PX = 40;
export const DAY_MINUTES = 24 * 60;
/** Alto total de la rejilla (48 filas). */
export const GRID_HEIGHT_PX = (DAY_MINUTES / SLOT_MINUTES) * ROW_HEIGHT_PX;
/** Alto mínimo de un bloque para que sea clickeable (media fila). */
export const MIN_BLOCK_PX = ROW_HEIGHT_PX / 2;

/** Minutos locales transcurridos desde 00:00 del instante `iso`. */
export function minutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Geometría vertical de un bloque de cita: `topPx` desde el inicio de la
 * rejilla y `heightPx` proporcional a la duración. Duraciones no positivas
 * (dato inválido) usan `MIN_BLOCK_PX`; el alto se recorta al fondo de la
 * rejilla (una cita que cruza medianoche se ve hasta las 24:00).
 */
export function blockGeometry(
  startIso: string,
  endIso: string,
): { topPx: number; heightPx: number } {
  const startMin = minutesFromMidnight(startIso);
  const durationMin = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
  );
  const topPx = (startMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
  const rawHeight = (durationMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
  const maxHeight = GRID_HEIGHT_PX - topPx;
  const heightPx = Math.max(MIN_BLOCK_PX, Math.min(rawHeight, maxHeight));
  return { topPx, heightPx };
}

export interface Interval {
  start: number;
  end: number;
}

/**
 * Reparte intervalos que se solapan en carriles (sub-columnas) lado a lado.
 * Agrupa en "clusters" de intervalos conectados por solape; dentro de cada
 * cluster asigna a cada intervalo el primer carril libre (greedy por hora de
 * inicio) y anota `laneCount` = número de carriles que usó ese cluster.
 */
export function layoutLanes<T extends Interval>(
  items: T[],
): Array<T & { lane: number; laneCount: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Array<T & { lane: number; laneCount: number }> = [];
  let cluster: T[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = []; // fin del último intervalo por carril
    const assigned = cluster.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.end);
      } else {
        laneEnds[lane] = it.end;
      }
      return { it, lane };
    });
    const laneCount = laneEnds.length;
    for (const { it, lane } of assigned) result.push({ ...it, lane, laneCount });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const it of sorted) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/appointments/week-grid-layout.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appointments/week-grid-layout.ts src/lib/appointments/week-grid-layout.test.ts
git commit -m "feat(agenda): pure layout helpers for the week time grid"
```

---

### Task 2: `WeekTimeGrid` — estructura, encabezados y hueco→crear

**Files:**
- Create: `src/components/appointments/week-time-grid.tsx`
- Test: `src/components/appointments/week-time-grid.test.tsx`

**Interfaces:**
- Consumes: `Appointment` (`@/lib/appointments/appointments-api`); `ROW_HEIGHT_PX`, `GRID_HEIGHT_PX`, `SLOT_MINUTES` (Task 1).
- Produces:
  ```ts
  interface WeekTimeGridProps {
    appointments: Appointment[];
    weekStart: string;                 // YYYY-MM-DD del lunes
    patientNames?: Record<string, string>;
    onSelectDay: (date: string) => void;
    onSelectSlot: (date: string, startTime: string) => void; // startTime "HH:mm"
    onSelectAppointment: (appointment: Appointment) => void;
  }
  export function WeekTimeGrid(props: WeekTimeGridProps): JSX.Element
  ```
  Helpers internos (no exportados): `localDateString(iso)`, `weekDates(weekStart)`, `dayHeaderLabel(date)`, `slotTime(index): "HH:mm"`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/appointments/week-time-grid.test.tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekTimeGrid } from './week-time-grid';
import type { Appointment } from '@/lib/appointments/appointments-api';

const WEEK_START = '2026-03-09'; // lunes

function appointment(o: Partial<Appointment> & { id: string }): Appointment {
  return {
    tenantId: 't1', patientId: 'pat-1', providerId: 'prov-1',
    start: '2026-03-09T09:00:00.000Z', end: '2026-03-09T09:30:00.000Z',
    status: 'SCHEDULED', reason: null, notes: null, createdById: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...o,
  };
}

function noop() {}

it('renders 7 day headers Mon..Sun', () => {
  render(
    <WeekTimeGrid
      appointments={[]} weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  // Reusa el mismo testid que WeekAgenda ('week-day-header') para que los
  // tests de agenda-view que ya lo usan sigan pasando tras el swap (Task 5).
  const headers = screen.getAllByTestId('week-day-header');
  expect(headers).toHaveLength(7);
  expect(headers[0]).toHaveAttribute('data-date', '2026-03-09');
  expect(headers[6]).toHaveAttribute('data-date', '2026-03-15');
});

it('clicking a day header calls onSelectDay with its date', async () => {
  const onSelectDay = jest.fn();
  render(
    <WeekTimeGrid
      appointments={[]} weekStart={WEEK_START}
      onSelectDay={onSelectDay} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  await userEvent.click(screen.getAllByTestId('week-day-header')[2]);
  expect(onSelectDay).toHaveBeenCalledWith('2026-03-11');
});

it('clicking an empty slot calls onSelectSlot with that day and time', async () => {
  const onSelectSlot = jest.fn();
  render(
    <WeekTimeGrid
      appointments={[]} weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={onSelectSlot} onSelectAppointment={noop}
    />,
  );
  // Slots are testid="week-grid-slot" with data-date + data-time.
  const slot = screen.getByTestId('week-grid-slot-2026-03-09-09:00');
  await userEvent.click(slot);
  expect(onSelectSlot).toHaveBeenCalledWith('2026-03-09', '09:00');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/appointments/week-time-grid.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/appointments/week-time-grid.tsx
'use client';
import { useEffect, useRef } from 'react';
import type { Appointment } from '@/lib/appointments/appointments-api';
import {
  ROW_HEIGHT_PX,
  GRID_HEIGHT_PX,
  SLOT_MINUTES,
  DAY_MINUTES,
} from '@/lib/appointments/week-grid-layout';

const copy = {
  heading: 'Agenda de la semana',
};

const SLOTS_PER_DAY = DAY_MINUTES / SLOT_MINUTES; // 48

/** Local YYYY-MM-DD del instante `iso` (mismo criterio que week-agenda.tsx). */
function localDateString(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Los 7 YYYY-MM-DD (lun..dom) de la semana que empieza en `weekStart`. */
function weekDates(weekStart: string): string[] {
  const monday = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

/** Etiqueta de encabezado, p. ej. "lun, 09/03". */
function dayHeaderLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** "HH:mm" del slot `index` (0 => "00:00", 18 => "09:00"). */
function slotTime(index: number): string {
  const mins = index * SLOT_MINUTES;
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

interface WeekTimeGridProps {
  appointments: Appointment[];
  weekStart: string;
  patientNames?: Record<string, string>;
  onSelectDay: (date: string) => void;
  onSelectSlot: (date: string, startTime: string) => void;
  onSelectAppointment: (appointment: Appointment) => void;
}

export function WeekTimeGrid({
  appointments,
  weekStart,
  patientNames,
  onSelectDay,
  onSelectSlot,
  onSelectAppointment,
}: WeekTimeGridProps) {
  const dates = weekDates(weekStart);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll: a la primera cita de la semana, o a las 07:00 si no hay.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstStartMin = appointments.length
      ? Math.min(
          ...appointments.map((a) => {
            const d = new Date(a.start);
            return d.getHours() * 60 + d.getMinutes();
          }),
        )
      : 7 * 60;
    el.scrollTop = (firstStartMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
  }, [appointments, weekStart]);

  return (
    <div
      aria-label={copy.heading}
      className="overflow-auto rounded-lg border border-border bg-surface"
      ref={scrollRef}
    >
      {/* min-width fuerza scroll horizontal en pantallas chicas */}
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: '4rem repeat(7, 1fr)' }}>
        {/* Fila de encabezados (sticky-top) */}
        <div className="sticky top-0 z-20 bg-surface" />
        {dates.map((date) => (
          <button
            key={date}
            type="button"
            data-testid="week-day-header"
            data-date={date}
            onClick={() => onSelectDay(date)}
            className="sticky top-0 z-20 border-b border-border bg-surface px-2 py-2 text-left text-sm font-medium text-ink hover:underline"
          >
            {dayHeaderLabel(date)}
          </button>
        ))}

        {/* Gutter de horas (sticky-left) */}
        <div className="sticky left-0 z-10 bg-surface" style={{ height: GRID_HEIGHT_PX }}>
          {Array.from({ length: SLOTS_PER_DAY }, (_, i) =>
            i % 2 === 0 ? (
              <div
                key={i}
                className="pr-1 text-right text-xs text-muted"
                style={{ height: ROW_HEIGHT_PX * 2 }}
              >
                {slotTime(i)}
              </div>
            ) : null,
          )}
        </div>

        {/* Columnas de día */}
        {dates.map((date) => (
          <div
            key={date}
            data-testid="week-grid-day-column"
            className="relative border-l border-border"
            style={{ height: GRID_HEIGHT_PX }}
          >
            {/* Celdas-hueco clickeables (una por slot) */}
            {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
              <button
                key={i}
                type="button"
                data-testid={`week-grid-slot-${date}-${slotTime(i)}`}
                onClick={() => onSelectSlot(date, slotTime(i))}
                className="block w-full border-b border-border/40 hover:bg-primary/5"
                style={{ height: ROW_HEIGHT_PX }}
                aria-label={`Crear cita ${date} ${slotTime(i)}`}
              />
            ))}
            {/* (Los bloques de cita se añaden en la Task 3) */}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/appointments/week-time-grid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/appointments/week-time-grid.tsx src/components/appointments/week-time-grid.test.tsx
git commit -m "feat(agenda): WeekTimeGrid structure — hour grid, day headers, empty-slot click"
```

---

### Task 3: `WeekTimeGrid` — bloques de cita posicionados + solapes + click

**Files:**
- Modify: `src/components/appointments/week-time-grid.tsx`
- Test: `src/components/appointments/week-time-grid.test.tsx` (añadir casos)

**Interfaces:**
- Consumes: `blockGeometry`, `layoutLanes`, `Interval` (Task 1); `STATUS_BADGE_CLASSES`, `formatTimeRange`, `patientLabel` (`./appointment-display`).
- Produces: mismos props; ahora renderiza bloques `data-testid="week-grid-appointment"` con `data-id`.

- [ ] **Step 1: Write the failing test (añadir al final del archivo de test)**

```tsx
it('renders an appointment block and calls onSelectAppointment on click', async () => {
  const onSelectAppointment = jest.fn();
  const apt = appointment({ id: 'apt-1', start: '2026-03-09T09:00:00.000Z', end: '2026-03-09T10:00:00.000Z' });
  render(
    <WeekTimeGrid
      appointments={[apt]} weekStart={WEEK_START} patientNames={{ 'pat-1': 'Ana García' }}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={onSelectAppointment}
    />,
  );
  const block = screen.getByTestId('week-grid-appointment');
  expect(block).toHaveAttribute('data-id', 'apt-1');
  expect(block).toHaveTextContent('Ana García');
  await userEvent.click(block);
  expect(onSelectAppointment).toHaveBeenCalledWith(expect.objectContaining({ id: 'apt-1' }));
});

it('places two overlapping same-day appointments in two lanes', () => {
  const a = appointment({ id: 'a', start: '2026-03-09T09:00:00.000Z', end: '2026-03-09T10:00:00.000Z' });
  const b = appointment({ id: 'b', start: '2026-03-09T09:30:00.000Z', end: '2026-03-09T10:30:00.000Z' });
  render(
    <WeekTimeGrid
      appointments={[a, b]} weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  const blocks = screen.getAllByTestId('week-grid-appointment');
  expect(blocks).toHaveLength(2);
  // Anchos ~50% (2 carriles) — se comprueba que declaran width con "50"
  expect(blocks[0].style.width).toContain('50');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/appointments/week-time-grid.test.tsx -t "appointment block"`
Expected: FAIL — `Unable to find ... week-grid-appointment`.

- [ ] **Step 3: Implement — añadir bloques por columna de día**

En `week-time-grid.tsx`: (a) añadir imports; (b) dentro del `map` de columnas de día, tras las celdas-hueco, renderizar los bloques del día.

```tsx
// imports nuevos (arriba)
import { blockGeometry, layoutLanes } from '@/lib/appointments/week-grid-layout';
import { STATUS_BADGE_CLASSES, formatTimeRange, patientLabel } from './appointment-display';
```

```tsx
// dentro de la columna de día, reemplazando el comentario "(Los bloques ...)":
{layoutLanes(
  appointments
    .filter((a) => localDateString(a.start) === date)
    .map((a) => ({
      appointment: a,
      start: new Date(a.start).getTime(),
      end: new Date(a.end).getTime(),
    })),
).map(({ appointment: a, lane, laneCount }) => {
  const { topPx, heightPx } = blockGeometry(a.start, a.end);
  const widthPct = 100 / laneCount;
  return (
    <button
      key={a.id}
      type="button"
      data-testid="week-grid-appointment"
      data-id={a.id}
      onClick={() => onSelectAppointment(a)}
      className={`absolute overflow-hidden rounded-md border px-1 py-0.5 text-left text-xs ${STATUS_BADGE_CLASSES[a.status]}`}
      style={{
        top: topPx,
        height: heightPx,
        left: `${lane * widthPct}%`,
        width: `calc(${widthPct}% - 2px)`,
      }}
    >
      <span className="block font-medium">{formatTimeRange(a.start, a.end)}</span>
      <span className="block truncate">{patientLabel(a, patientNames)}</span>
    </button>
  );
})}
```

Nota: las celdas-hueco y los bloques conviven en la columna `relative`; los bloques van con `absolute` encima. Como los bloques capturan su propio click, no disparan el `onSelectSlot` de la celda de abajo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/appointments/week-time-grid.test.tsx`
Expected: PASS (todos, incluidos los de Task 2).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/appointments/week-time-grid.tsx src/components/appointments/week-time-grid.test.tsx
git commit -m "feat(agenda): position appointment blocks with overlap lanes in WeekTimeGrid"
```

---

### Task 4: `AppointmentForm` — pre-relleno de hora

**Files:**
- Modify: `src/components/appointments/appointment-form.tsx`
- Test: `src/components/appointments/appointment-form.test.tsx` (añadir un caso)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `AppointmentFormProps` gana `defaultStartTime?: string` y `defaultEndTime?: string` (formato `"HH:mm"`), usados como estado inicial de `startTime`/`endTime`.

- [ ] **Step 1: Write the failing test (añadir)**

```tsx
it('prefills start and end time from props', () => {
  render(
    <AppointmentForm
      token="t" onCreated={() => {}}
      defaultDate="2026-03-09" defaultStartTime="09:00" defaultEndTime="09:30"
    />,
  );
  expect(screen.getByLabelText('Hora inicio')).toHaveValue('09:00');
  expect(screen.getByLabelText('Hora fin')).toHaveValue('09:30');
});
```

Nota para el implementador: usa las etiquetas reales de los inputs de hora del formulario (revisa las constantes `copy` de `appointment-form.tsx`; si difieren de "Hora inicio"/"Hora fin", ajusta el `getByLabelText` a las que existan).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/appointments/appointment-form.test.tsx -t "prefills start and end"`
Expected: FAIL — los inputs vienen vacíos.

- [ ] **Step 3: Implement**

En `AppointmentFormProps` añade:

```ts
  /** Pre-rellena la hora de inicio ("HH:mm"), p. ej. al crear desde un hueco del calendario. Opcional/backward-compatible. */
  defaultStartTime?: string;
  /** Pre-rellena la hora de fin ("HH:mm"). Opcional/backward-compatible. */
  defaultEndTime?: string;
```

En la firma y el estado inicial:

```ts
export function AppointmentForm({
  token, onCreated, defaultDate, defaultStartTime, defaultEndTime,
}: AppointmentFormProps) {
  // ...
  const [startTime, setStartTime] = useState(defaultStartTime ?? '');
  const [endTime, setEndTime] = useState(defaultEndTime ?? '');
```

(Reemplaza los `useState('')` existentes de `startTime`/`endTime`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/appointments/appointment-form.test.tsx`
Expected: PASS (nuevo caso + los existentes).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/appointments/appointment-form.tsx src/components/appointments/appointment-form.test.tsx
git commit -m "feat(agenda): AppointmentForm accepts default start/end time"
```

---

### Task 5: Integración en `AgendaView` (rejilla + hueco→crear + bloque→detalle)

**Files:**
- Modify: `src/components/appointments/agenda-view.tsx`
- Test: `src/components/appointments/agenda-view.test.tsx` (añadir casos)

**Interfaces:**
- Consumes: `WeekTimeGrid` (Task 2/3); `AppointmentForm` con `defaultStartTime/EndTime` (Task 4); `handleStatusChange`, `updatingId`, `refreshAppointmentsInPlace`, `selectedDate`, `weekStartOf` (ya existentes).
- Produces: en modo Semana renderiza `WeekTimeGrid`; estado nuevo `slotPrefill` y `detailAppointment`; helper `addMinutesToTime`.

- [ ] **Step 1: Write the failing test (añadir al `describe` existente)**

Usa los mocks/fixtures que YA existen en `agenda-view.test.tsx` (`mockedListStaff`, `mockedListAppointments`, `mockedListPatients`, `staff`, `patientsPage`). Copia el patrón de los tests de Semana existentes (activar "Semana", `findByLabelText(/agenda de la semana/i)`):

```tsx
it('week mode: clicking an empty slot opens the form prefilled with that date and time', async () => {
  mockedListStaff.mockResolvedValue(staff);
  mockedListAppointments.mockResolvedValue([]);
  mockedListPatients.mockResolvedValue(patientsPage);
  const user = userEvent.setup();

  render(<AgendaView token="tok" />);
  await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

  const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
  await user.clear(dateInput);
  await user.type(dateInput, '2026-03-11');
  await user.click(screen.getByRole('button', { name: /^semana$/i }));
  await screen.findByLabelText(/agenda de la semana/i);

  // Click en el hueco de las 09:00 del lunes 2026-03-09.
  await user.click(screen.getByTestId('week-grid-slot-2026-03-09-09:00'));

  // El form se abre pre-rellenado (fecha del slot + hora inicio 09:00).
  const formDate = await screen.findByLabelText<HTMLInputElement>(/^fecha$/i, {
    selector: '#appointment-date',
  });
  expect(formDate.value).toBe('2026-03-09');
  const startInput = document.querySelector<HTMLInputElement>('#appointment-start-time')!;
  expect(startInput.value).toBe('09:00');
});
```

**Importante (regresión):** al hacer el swap `WeekAgenda → WeekTimeGrid` en `AgendaView` (Step 3), los dos tests de Semana ya existentes siguen verdes **sin cambios** porque `WeekTimeGrid` reutiliza el `aria-label="Agenda de la semana"` y el `data-testid="week-day-header"`. Ejecuta todo el archivo para confirmarlo (Step 4). Si por diseño renombraras esos identificadores, actualiza también esos dos tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/appointments/agenda-view.test.tsx -t "empty slot opens the form"`
Expected: FAIL.

- [ ] **Step 3: Implement**

1. Import:
```ts
import { WeekTimeGrid } from '@/components/appointments/week-time-grid';
```

2. Helper (junto a los otros helpers del archivo):
```ts
/** Suma `mins` a una hora "HH:mm" y devuelve "HH:mm" (acota a 23:59). */
function addMinutesToTime(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + mins, 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
```

3. Estado nuevo (junto a `showForm`):
```ts
const [slotPrefill, setSlotPrefill] = useState<
  { date: string; startTime: string; endTime: string } | null
>(null);
const [detailAppointment, setDetailAppointment] = useState<Appointment | null>(null);
```

4. Handlers:
```ts
function handleSelectSlot(date: string, startTime: string) {
  setSlotPrefill({ date, startTime, endTime: addMinutesToTime(startTime, 30) });
  setDetailAppointment(null);
  setShowForm(true);
}
```
Y en `handleAppointmentCreated`, además de lo actual, limpiar: `setSlotPrefill(null);`.

5. Render del `AppointmentForm`: pasar los defaults desde `slotPrefill` (cae a `selectedDate` como hoy):
```tsx
<AppointmentForm
  token={token}
  onCreated={handleAppointmentCreated}
  defaultDate={slotPrefill?.date ?? selectedDate}
  defaultStartTime={slotPrefill?.startTime}
  defaultEndTime={slotPrefill?.endTime}
/>
```

6. Render en modo Semana: donde hoy se usa `<WeekAgenda ... />`, sustituir por:
```tsx
<WeekTimeGrid
  appointments={appointments}
  weekStart={weekStartOf(selectedDate)}
  patientNames={patientNames}
  onSelectDay={handleSelectDay}
  onSelectSlot={handleSelectSlot}
  onSelectAppointment={(a) => setDetailAppointment(a)}
/>
```
(Se deja de usar `WeekAgenda` en `AgendaView`; el componente sigue existiendo pero ya no se importa aquí — quita el import si queda sin uso para no romper el lint.)

7. Panel de detalle inline (cerca del render, cuando `detailAppointment`):
```tsx
{detailAppointment && (
  <Card>
    <CardContent className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-ink">
            {patientNames[detailAppointment.patientId] ?? detailAppointment.patientId}
          </p>
          <p className="text-sm text-muted">
            {formatTimeRange(detailAppointment.start, detailAppointment.end)}
          </p>
          {detailAppointment.reason && (
            <p className="text-sm text-ink">{detailAppointment.reason}</p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setDetailAppointment(null)}>
          {copy.cancel}
        </Button>
      </div>
      <FormField htmlFor="detail-status" label={copy.statusLabel}>
        <select
          id="detail-status"
          className={fieldClass}
          value={detailAppointment.status}
          disabled={updatingId === detailAppointment.id}
          onChange={(e) => {
            void handleStatusChange(detailAppointment.id, e.target.value as AppointmentStatus);
            setDetailAppointment((prev) =>
              prev ? { ...prev, status: e.target.value as AppointmentStatus } : prev,
            );
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </FormField>
    </CardContent>
  </Card>
)}
```
Requiere importar `formatTimeRange`, `STATUS_LABELS` de `./appointment-display`, y definir/usar la lista de estados. Añade estas constantes de copy al objeto `copy` del archivo: `statusLabel: 'Estado'`. Reutiliza `STATUS_OPTIONS` si ya existe en el archivo; si no, define:
```ts
const STATUS_OPTIONS: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
```
(importa `STATUS_LABELS` desde `./appointment-display`, que ya lo exporta).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/appointments/agenda-view.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, full test + commit**

```bash
npx tsc --noEmit
npx jest
git add src/components/appointments/agenda-view.tsx src/components/appointments/agenda-view.test.tsx
git commit -m "feat(agenda): render WeekTimeGrid in week mode with slot-create and appointment detail"
```

---

### Task 6: Verificación final e2e-lite + lint

**Files:** ninguno (verificación).

- [ ] **Step 1: Lint de los archivos tocados**

Run:
```bash
npx eslint src/lib/appointments/week-grid-layout.ts \
  src/components/appointments/week-time-grid.tsx \
  src/components/appointments/appointment-form.tsx \
  src/components/appointments/agenda-view.tsx
```
Expected: 0 errores.

- [ ] **Step 2: Suite completa + typecheck**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc sin errores; toda la suite en verde.

- [ ] **Step 3: Verificación manual (opcional pero recomendada)**

Levantar el front (`npm run dev`), ir a `/agenda`, cambiar a "Semana": ver la rejilla con horas, un bloque en su hora, click en hueco abre el form con fecha+hora, click en bloque abre el detalle con `<select>` de estado, click en encabezado va a vista Día.

- [ ] **Step 4: Commit final (si algún fix de lint)**

```bash
git add -A && git commit -m "chore(agenda): lint + verification fixes for week calendar grid"
```

---

## Notas de integración (post-implementación)

- Rama `feat/week-calendar-grid`. Al abrir PR, base `main`.
- `agenda-view.tsx` y `appointment-form.tsx` también los edita `design/frontend-overhaul`; si esa rama entra antes a `main`, rebasar esta sobre `main` y resolver (cambios aquí son aditivos: un import + una rama de render + props opcionales + un panel inline).
- Empujar con la cuenta con permisos (`2santos93`) y restaurar la cuenta activa después.
