'use client';
import { useEffect, useRef } from 'react';
import { CircleCheck, Clock, DoorOpen, MapPin } from 'lucide-react';
import { documentFormat, documentTexts } from '@/lib/format/document-format';
import type { PublicArrival } from '@/lib/appointments/arrival-api';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';
import type { ArrivalCopy } from './arrival-copy';

/** La hora de la sede (zona, formato y reloj de la API), o null si la sede no los tiene. */
function sedeTime(arrival: PublicArrival, iso: string | null): string | null {
  const a = arrival.appointment;
  if (!a || !iso) return null;
  const format = documentFormat({ timeZone: a.timeZone ?? null, locale: a.locale ?? null, hourCycle: a.hourCycle ?? null });
  return format ? documentTexts(format).time(iso) : null;
}

/**
 * DX-265: el resultado de «Ya llegué» (llegada marcada): «Toma asiento» o
 * «Pasa por recepción», con el turno del día si lo hay. Nunca dice qué está
 * pendiente. Recibe el foco al aparecer (región viva para el lector).
 */
export function ArrivalOutcome({ arrival, t }: { arrival: PublicArrival; t: ArrivalCopy }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const name = arrival.appointment?.patientFirstName ?? null;
  const seeReception = arrival.result === 'SEE_RECEPTION';
  const title =
    arrival.result === null ? t.arrivedNoResult : seeReception ? t.seeReceptionTitle(name) : t.takeSeatTitle(name);
  const message = arrival.result === null ? null : seeReception ? t.seeReception : t.takeSeat;
  const Icon = seeReception ? DoorOpen : CircleCheck;
  return (
    <section
      role="status"
      aria-labelledby="arrival-outcome-title"
      data-testid="arrival-outcome"
      data-result={arrival.result ?? 'ARRIVED'}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-5"
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden
          className={seeReception ? 'mt-0.5 size-6 shrink-0 text-warning-text' : 'mt-0.5 size-6 shrink-0 text-success-text'}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="arrival-outcome-title" ref={headingRef} tabIndex={-1} className="t-title text-ink focus-visible:outline-none">
            {title}
          </h2>
          {message ? <p className="text-base text-ink">{message}</p> : null}
        </div>
      </div>
      {arrival.turnNumber !== null ? (
        <p data-testid="arrival-turn" className="t-display tabular-nums text-ink">
          {t.turn(arrival.turnNumber)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * DX-265: «Ya llegué» en la página del enlace de la cita. AVAILABLE: el
 * botón; TOO_EARLY / TOO_LATE: el porqué, sin botón; ARRIVED: el resultado.
 * UNAVAILABLE no se pinta (quien lo monta lo decide).
 */
export function ArrivalCard({
  arrival,
  t,
  pending,
  error,
  onArrive,
}: {
  arrival: PublicArrival;
  t: ArrivalCopy;
  pending: boolean;
  error: string | null;
  onArrive: () => void;
}) {
  if (arrival.state === 'UNAVAILABLE') return null;
  if (arrival.state === 'ARRIVED') return <ArrivalOutcome arrival={arrival} t={t} />;
  const location = arrival.appointment?.locationName ?? '';
  const start = sedeTime(arrival, arrival.appointment?.start ?? null);
  return (
    <section
      aria-labelledby="arrival-title"
      data-testid="arrival-card"
      data-state={arrival.state}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4"
    >
      <h2 id="arrival-title" className="t-title flex items-center gap-2 text-ink">
        <MapPin aria-hidden className="size-4 shrink-0 text-muted" />
        {t.heading}
      </h2>
      {start ? <p className="text-sm text-muted tabular-nums">{t.appointmentAt(start, location)}</p> : null}
      {arrival.state === 'AVAILABLE' ? (
        <>
          <p className="text-sm text-ink">{t.lead(location)}</p>
          <Button type="button" size="lg" className="h-12 w-full" loading={pending} onClick={onArrive}>
            <CircleCheck aria-hidden /> {t.button}
          </Button>
          {error ? <InlineError>{error}</InlineError> : null}
        </>
      ) : (
        <p className="flex items-start gap-2 text-sm text-ink">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          {arrival.state === 'TOO_EARLY' ? t.tooEarly(sedeTime(arrival, arrival.opensAt)) : t.tooLate}
        </p>
      )}
    </section>
  );
}
