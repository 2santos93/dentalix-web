# Week Calendar Grid — Design

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Area:** `dentalix-web` · agenda (vista Semana)

## Problem

La vista Semana de la agenda hoy es una reja de 7 tarjetas por día que solo
listan las citas (o muestran "Sin citas"). No transmite la sensación de un
calendario ni permite ver huecos/solapes a lo largo del día. El usuario pidió
"poner un calendario ahí": una rejilla semanal con eje de horas tipo
Google/Outlook.

## Goal

Reemplazar, **solo en modo Semana**, la reja de tarjetas por una **rejilla
semanal con eje de horas** donde las citas se dibujan como bloques ubicados en
su hora real. La vista Día y el resto de la agenda no cambian.

Non-goals (follow-ups, fuera de alcance):
- Reprogramar/editar cita completa (cambiar hora/paciente/profesional) desde la
  rejilla. El MVP solo permite ver detalle + cambiar **estado** (capacidad ya
  existente vía PATCH).
- Drag & drop de citas.
- Configuración de horario laboral por clínica.

## Approach

Componente **nuevo** `WeekTimeGrid` (no se reescribe `week-agenda.tsx`), para
minimizar el choque con la rama `design/frontend-overhaul` que está editando
`week-agenda.tsx`. `AgendaView` renderiza `WeekTimeGrid` en la rama
`viewMode === 'week'` en lugar de `WeekAgenda`. Hand-rolled con CSS (sin
librería de calendario: no hay ninguna instalada y una rejilla posicionada es
directa).

## Components

### `WeekTimeGrid` (nuevo) — `src/components/appointments/week-time-grid.tsx`
Presentacional. Recibe las citas ya cargadas por `AgendaView` (no hace fetch).

**Props**
- `appointments: Appointment[]` — todas las de la semana (cualquier orden).
- `weekStart: string` — `YYYY-MM-DD` local del lunes (igual que `WeekAgenda`).
- `patientNames?: Record<string,string>` — para mostrar el nombre en el bloque.
- `onSelectDay(date: string)` — click en encabezado de día → vista Día.
- `onSelectSlot(date: string, startTime: string)` — click en hueco vacío →
  crear cita (fecha + `HH:mm`).
- `onSelectAppointment(appointment: Appointment)` — click en bloque → detalle.
- `onStatusChange(id, status)` / `updatingId` — para el `<select>` de estado en
  el detalle (mismo contrato que `DayAgenda`).

**Layout**
- Eje de horas 00:00–24:00, filas de 30 min → 48 filas. Constante
  `ROW_HEIGHT_PX` (p. ej. 40px) y `SLOT_MINUTES = 30`.
- CSS grid: 1 columna de gutter de horas (sticky-left) + 7 columnas de día.
  Encabezados de día sticky-top. Contenedor con `overflow: auto`.
- Al montar: auto-scroll a la primera cita de la semana; si no hay citas,
  a las 07:00.
- Responsive: bajo `lg`, `min-width` por columna + scroll horizontal; el gutter
  de horas queda sticky a la izquierda.

**Bloques de cita**
- Posición absoluta dentro de la columna del día:
  `top = (minutesFromMidnight(start) / SLOT_MINUTES) * ROW_HEIGHT_PX`,
  `height = (durationMinutes / SLOT_MINUTES) * ROW_HEIGHT_PX`
  (altura mínima ~ media fila para citas muy cortas, para que sean clickeables).
- Color por estado, reutilizando los tokens de `appointment-display`
  (`STATUS_BADGE_CLASSES`).
- Contenido: rango horario (`formatTimeRange`) + nombre de paciente
  (`patientLabel`).

**Solapes (lane-splitting)**
- Por día, se agrupan las citas que se cruzan en el tiempo y cada grupo se
  reparte en N sub-columnas de igual ancho (`width = 100%/N`, `left = i·width`).
  Algoritmo simple de barrido por hora de inicio.

### `WeekAppointmentDetail` (nuevo, ligero) — popover/panel de detalle
- Abierto por `onSelectAppointment`. Muestra paciente, rango horario, motivo y
  el `<select>` de estado (reusa `onStatusChange`/`updatingId`).
- Implementado inline (la app no tiene primitiva de modal para esto; se sigue
  el patrón de sección inline). Puede vivir dentro de `WeekTimeGrid` o como
  subcomponente en el mismo archivo.

### Cambios en componentes existentes (mínimos)
- `AppointmentForm` (`appointment-form.tsx`): agregar props opcionales
  `defaultStartTime?` y `defaultEndTime?` (además del `defaultDate` ya
  existente), y usarlas como estado inicial de `startTime`/`endTime`.
  Backward-compatible (omitirlas mantiene el comportamiento actual).
- `AgendaView` (`agenda-view.tsx`):
  - En modo Semana, renderizar `WeekTimeGrid` (en vez de `WeekAgenda`).
  - Estado `slotPrefill: { date, startTime, endTime } | null`. `onSelectSlot`
    lo setea (fin = inicio + 30 min), abre el form (`setShowForm(true)`) y pasa
    los defaults a `AppointmentForm`. Al crear/cancelar se limpia.
  - `onSelectAppointment` abre el detalle (estado local del detalle
    seleccionado). `onStatusChange` reusa el `handleStatusChange` actual.
  - `onSelectDay` reusa el `handleSelectDay` actual.

## Data flow

Sin API nueva. `AgendaView` ya hace `listAppointments({ from, to, providerId })`
con `localWeekRange(selectedDate)` en modo Semana. `WeekTimeGrid` solo consume
ese array + `weekStart`. Crear cita = `createAppointment` (vía `AppointmentForm`,
ya existente). Cambiar estado = `updateAppointment(id, { status })`
(`handleStatusChange`, ya existente). Tras crear/cambiar estado, `AgendaView`
refresca en sitio (`refreshAppointmentsInPlace`, ya existente).

## Error / edge handling

- Citas fuera de 00:00–24:00 no ocurren (start/end son instantes del mismo día
  local; una cita que cruza medianoche se recorta visualmente al final del día).
- Cita con `end <= start` (dato inválido): se le da altura mínima y no rompe el
  layout.
- Semana sin citas: rejilla vacía con las líneas de hora; auto-scroll a 07:00.
- Duración muy corta: altura mínima clickeable.
- Estados de loading/error/refresh los sigue manejando `AgendaView` (igual que
  hoy con `WeekAgenda`).

## Testing

Unitarios (Jest + Testing Library), en `week-time-grid.test.tsx` + helpers:
- **Posición**: `minutesFromMidnight`, cálculo de `top`/`height` para horas y
  duraciones representativas (incluida altura mínima).
- **Lane-splitting**: 0 solapes → 1 lane full-width; 2 citas cruzadas →
  2 lanes; casos borde (mismo inicio, contención parcial).
- **Interacción**: click en encabezado → `onSelectDay(fecha)`; click en hueco →
  `onSelectSlot(fecha, HH:mm)` con la hora correcta de la fila; click en bloque
  → `onSelectAppointment(cita)`; detalle → `<select>` dispara `onStatusChange`.
- `AppointmentForm`: `defaultStartTime`/`defaultEndTime` pre-rellenan.

## Isolation / coordination note

- Todo el trabajo va en la rama `feat/week-calendar-grid` (worktree
  `dentalix-web-weekcal`) desde `origin/main`.
- `WeekTimeGrid` y `WeekAppointmentDetail` son archivos nuevos (sin conflicto).
- Los toques a `agenda-view.tsx` y `appointment-form.tsx` **sí** los edita en
  paralelo `design/frontend-overhaul`. Al integrar: quien mergee segundo rebasa
  sobre `main`; los cambios aquí son aditivos y localizados (una rama de render
  + props opcionales), así que el conflicto esperado es pequeño y mecánico.
