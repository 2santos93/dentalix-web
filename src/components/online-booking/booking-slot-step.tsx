'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarX, ChevronLeft, ChevronRight } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { civilDateLabel } from '@/lib/format/date';
import { sedeTime, type SedeClock } from '@/lib/locations/sede-clock';
import { addCivilDays } from '@/lib/time/wall-clock';
import {
  listPublicSlots,
  type OnlinePatientKind,
  type PublicSlot,
  type PublicSlots,
} from '@/lib/online-booking/online-booking-api';
import { groupSlotsByDay, SLOT_WINDOW_DAYS, uniqueStarts } from '@/lib/online-booking/booking-flow';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const slotStepCopy = {
  loading: 'Buscando horas libres…',
  loadError: 'No pudimos cargar las horas libres. Revisa tu conexión.',
  daysLabel: 'Día',
  timesLabel: (day: string) => `Horas libres el ${day}`,
  prevWeek: 'Días anteriores',
  nextWeek: 'Días siguientes',
  noSlotsTitle: 'No hay horas libres en estos días',
  noSlotsHint: 'Prueba con los días siguientes o con otro profesional.',
  noSlotsDay: 'Este día no tiene horas libres. Elige otro.',
  tryNextWeek: 'Ver días siguientes',
  tryAnyProvider: 'Cualquier profesional disponible',
  zoneNote: (zone: string) => `Horas de la sede (${zone}).`,
  pick: (time: string, day: string) => `Elegir las ${time} del ${day}`,
  noDayChip: 'sin horas',
};

type SlotsState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; key: string }
  | { kind: 'ready'; data: PublicSlots; key: string };

/**
 * Paso «Hora» de /reservar: una tira de 7 días (en la zona de la SEDE, nunca la
 * del navegador) y las horas libres del día elegido como botones grandes. Tocar
 * una hora la elige y pasa al paso siguiente. Al volver tras un 409 (`notice`)
 * la lista se recarga (`reloadKey`).
 */
export function BookingSlotStep({
  locationId,
  appointmentTypeId,
  providerId,
  patientKind,
  sessionToken,
  today,
  lastDay,
  clock,
  zoneLabel,
  notice,
  reloadKey,
  onPick,
  onAnyProvider,
  onUnavailable,
}: {
  locationId: string;
  appointmentTypeId: string;
  providerId: string | null;
  patientKind: OnlinePatientKind;
  sessionToken: string | null;
  /** Hoy en la zona de la sede (`YYYY-MM-DD`). */
  today: string;
  /** Último día reservable (antelación máxima). */
  lastDay: string;
  clock: SedeClock;
  zoneLabel: string;
  /** Por qué se volvió aquí (hueco ocupado, ya no disponible…). */
  notice: string | null;
  reloadKey: number;
  onPick: (slot: PublicSlot) => void;
  /** Sin huecos con un profesional concreto: probar con cualquiera. */
  onAnyProvider: (() => void) | null;
  onUnavailable: (message: string | null) => void;
}) {
  const [from, setFrom] = useState(today);
  const [loaded, setLoaded] = useState<SlotsState>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  // Cada lectura tiene su clave: mientras la respuesta no es la de la clave
  // actual (otra ventana de días, un reintento, la recarga tras un 409), se
  // pintan esqueletos.
  const requestKey = [locationId, appointmentTypeId, providerId, patientKind, from, sessionToken, retry, reloadKey].join('|');
  const state: SlotsState = loaded.kind !== 'loading' && loaded.key === requestKey ? loaded : { kind: 'loading' };

  useEffect(() => {
    let cancelled = false;
    listPublicSlots(
      { locationId, appointmentTypeId, providerId, patientKind, from, days: SLOT_WINDOW_DAYS },
      sessionToken,
    )
      .then((data) => {
        if (cancelled) return;
        setLoaded({ kind: 'ready', data, key: requestKey });
        setChosenDay(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          onUnavailable(apiErrorMessage(err, slotStepCopy.loadError));
          return;
        }
        setLoaded({ kind: 'error', message: apiErrorMessage(err, slotStepCopy.loadError), key: requestKey });
      });
    return () => {
      cancelled = true;
    };
    // `onUnavailable` es de quien llama; un cambio suyo no debe repetir la lectura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const readyData = state.kind === 'ready' ? state.data : null;
  const days = useMemo(() => {
    if (!readyData) return [];
    const grouped = groupSlotsByDay(readyData.slots, from, SLOT_WINDOW_DAYS, clock.timeZone);
    return grouped
      .filter((d) => d.day <= lastDay)
      .map((d) => ({ ...d, slots: providerId ? d.slots : uniqueStarts(d.slots) }));
  }, [readyData, from, clock.timeZone, lastDay, providerId]);

  const firstWithSlots = days.find((d) => d.slots.length > 0)?.day ?? null;
  const selectedDay = chosenDay ?? firstWithSlots ?? days[0]?.day ?? null;
  const selected = days.find((d) => d.day === selectedDay) ?? null;
  const canGoBack = from > today;
  const nextFrom = addCivilDays(from, SLOT_WINDOW_DAYS);
  const canGoForward = nextFrom <= lastDay;
  const dayWords = (day: string) => civilDateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' });

  const weekNav = (
    <div className="flex items-center justify-between gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="max-sm:min-h-11"
        disabled={!canGoBack || state.kind === 'loading'}
        onClick={() => setFrom((f) => {
          const prev = addCivilDays(f, -SLOT_WINDOW_DAYS);
          return prev < today ? today : prev;
        })}
      >
        <ChevronLeft aria-hidden /> {slotStepCopy.prevWeek}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="max-sm:min-h-11"
        disabled={!canGoForward || state.kind === 'loading'}
        onClick={() => setFrom(nextFrom)}
      >
        {slotStepCopy.nextWeek} <ChevronRight aria-hidden />
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Callout tone="warning" role="alert" data-testid="booking-slot-notice">
          {notice}
        </Callout>
      ) : null}
      <p className="t-caption text-muted">{slotStepCopy.zoneNote(zoneLabel)}</p>

      {state.kind === 'loading' && (
        <div role="status" className="flex flex-col gap-3" data-testid="booking-slots-loading">
          <span className="sr-only">{slotStepCopy.loading}</span>
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-16 shrink-0 rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {state.kind === 'error' && (
        <SectionError description={state.message} onRetry={() => setRetry((n) => n + 1)} />
      )}

      {state.kind === 'ready' && firstWithSlots === null && (
        <>
          <EmptyState
            role="status"
            icon={<CalendarX aria-hidden />}
            title={slotStepCopy.noSlotsTitle}
            description={slotStepCopy.noSlotsHint}
            actionClassName="w-full sm:w-auto"
            action={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {canGoForward ? (
                  <Button type="button" variant="secondary" className="max-sm:min-h-11" onClick={() => setFrom(nextFrom)}>
                    {slotStepCopy.tryNextWeek}
                  </Button>
                ) : null}
                {onAnyProvider ? (
                  <Button type="button" variant="secondary" className="max-sm:min-h-11" onClick={onAnyProvider}>
                    {slotStepCopy.tryAnyProvider}
                  </Button>
                ) : null}
              </div>
            }
          />
          {canGoBack ? weekNav : null}
        </>
      )}

      {state.kind === 'ready' && firstWithSlots !== null && (
        <>
          <div role="group" aria-label={slotStepCopy.daysLabel} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {days.map((d) => {
              const active = d.day === selectedDay;
              const empty = d.slots.length === 0;
              return (
                <button
                  key={d.day}
                  type="button"
                  aria-pressed={active}
                  data-testid={`booking-day-${d.day}`}
                  onClick={() => setChosenDay(d.day)}
                  className={cn(
                    'flex min-h-16 min-w-16 shrink-0 flex-col items-center justify-center rounded-lg border px-2 py-2 text-center transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text',
                    active
                      ? 'border-primary-border bg-primary-subtle text-primary-subtle-text'
                      : 'border-border bg-surface text-ink hover:bg-surface-sunken',
                    empty && !active && 'text-muted',
                  )}
                >
                  {/* Lo visible es corto; el nombre accesible, el día entero (sin aria-label: axe exige que contenga lo visible). */}
                  <span aria-hidden className="t-caption first-letter:uppercase">{civilDateLabel(d.day, { weekday: 'short' })}</span>
                  <span aria-hidden className="text-base font-semibold tabular-nums">{civilDateLabel(d.day, { day: 'numeric' })}</span>
                  <span aria-hidden className="t-caption">{civilDateLabel(d.day, { month: 'short' })}</span>
                  <span className="sr-only">{empty ? `${dayWords(d.day)}, ${slotStepCopy.noDayChip}` : dayWords(d.day)}</span>
                </button>
              );
            })}
          </div>
          {weekNav}
          {selected ? (
            <section aria-labelledby="booking-times-title" className="flex flex-col gap-3">
              <h3 id="booking-times-title" className="t-label text-ink first-letter:uppercase">
                {slotStepCopy.timesLabel(dayWords(selected.day))}
              </h3>
              {selected.slots.length === 0 ? (
                <p className="text-sm text-muted">{slotStepCopy.noSlotsDay}</p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="booking-times">
                  {selected.slots.map((slot) => {
                    const time = sedeTime(slot.start, clock);
                    return (
                      <li key={`${slot.start}-${slot.providerId}`}>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-12 w-full tabular-nums"
                          aria-label={slotStepCopy.pick(time, dayWords(selected.day))}
                          onClick={() => onPick(slot)}
                        >
                          {time}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
