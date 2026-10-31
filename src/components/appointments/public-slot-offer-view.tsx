'use client';
import { useEffect, useState } from 'react';
import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Clock,
  LinkIcon,
  MapPin,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  acceptPublicSlotOffer,
  declinePublicSlotOffer,
  getPublicSlotOffer,
  type PublicSlotOffer,
  type PublicSlotOfferDetails,
  type PublicSlotOfferState,
} from '@/lib/appointments/slot-offers-api';
import { longAppointmentDay } from '@/lib/appointments/confirmation-message';
import { locationClock, sedeTimeRange, sedeTime } from '@/lib/locations/sede-clock';
import { PublicNotice as Notice, publicBrandStyle } from '@/components/shared/public-page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';

// Copy as constants (i18n-ready, es-first).
export const publicSlotOfferCopy = {
  loading: 'Cargando el hueco…',
  loadError: 'No pudimos cargar el hueco. Revisa tu conexión.',
  greeting: (name: string) => (name ? `Hola ${name},` : 'Hola,'),
  openLead: 'se liberó este hueco en la clínica. Si te viene bien, acéptalo: se lo queda el primero que lo acepte.',
  movesFrom: (when: string) => `Si lo aceptas, tu cita del ${when} se adelanta a este hueco y esa hora queda libre.`,
  dayLabel: 'Fecha',
  timeLabel: 'Hora',
  providerLabel: 'Profesional',
  locationLabel: 'Sede',
  accept: 'Aceptar el hueco',
  decline: 'No me viene bien',
  respondError: 'No pudimos enviar tu respuesta. Revisa tu conexión e intenta de nuevo.',
  acceptedLead: 'Te esperamos. Si después no puedes venir, avisa a la clínica.',
  takenMessage: 'Otra persona lo aceptó antes. Si quieres otra hora, comunícate con la clínica.',
  unavailableMessage: 'La clínica ya lo ocupó. Si quieres otra hora, comunícate con la clínica.',
  expiredMessage: 'Ya no se puede aceptar. Si quieres otra hora, comunícate con la clínica.',
  declinedMessage: 'Gracias por avisar. La clínica se lo ofrecerá a otra persona.',
  invalidTitle: 'Enlace no válido',
  invalidMessage:
    'No encontramos este enlace. Revisa que esté completo o pide a la clínica que te lo envíe de nuevo.',
  fallbackClinic: 'Tu clínica',
};

/** Estados sin el hueco a la vista: icono y explicación. */
const CLOSED: Record<Exclude<PublicSlotOfferState, 'OPEN' | 'ACCEPTED'>, { icon: LucideIcon; message: string }> = {
  TAKEN: { icon: CalendarX, message: publicSlotOfferCopy.takenMessage },
  UNAVAILABLE: { icon: CalendarX, message: publicSlotOfferCopy.unavailableMessage },
  EXPIRED: { icon: CalendarClock, message: publicSlotOfferCopy.expiredMessage },
  DECLINED: { icon: CalendarX, message: publicSlotOfferCopy.declinedMessage },
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: PublicSlotOffer };

/** Reloj de la sede del hueco (zona y formato que manda la API). */
function slotClock(details: PublicSlotOfferDetails) {
  const hourCycle = details.hourCycle === 'h12' || details.hourCycle === 'h23' ? details.hourCycle : null;
  return locationClock({ timeZone: details.timeZone, locale: details.locale, hourCycle });
}

/** Cuándo, a qué hora, con quién y dónde, en el reloj de la sede (nada clínico). */
function SlotSummary({ details }: { details: PublicSlotOfferDetails }) {
  const clock = slotClock(details);
  const rows = [
    { icon: CalendarCheck, label: publicSlotOfferCopy.dayLabel, value: longAppointmentDay(details.start, details.timeZone), sub: null },
    { icon: Clock, label: publicSlotOfferCopy.timeLabel, value: sedeTimeRange(details.start, details.end, clock), sub: null },
    ...(details.providerName
      ? [{ icon: UserRound, label: publicSlotOfferCopy.providerLabel, value: details.providerName, sub: null }]
      : []),
    { icon: MapPin, label: publicSlotOfferCopy.locationLabel, value: details.locationName, sub: details.locationAddress },
  ];
  return (
    <dl className="divide-y divide-border-subtle rounded-xl border border-border bg-surface">
      {rows.map(({ icon: Icon, label, value, sub }) => (
        <div key={label} className="relative min-w-0 py-3 pl-12 pr-4">
          <dt className="text-xs font-medium tracking-wide text-muted">
            <Icon aria-hidden className="absolute left-4 top-3.5 size-5 text-muted" />
            {label}
          </dt>
          <dd className="break-words font-medium tabular-nums text-ink first-letter:uppercase">{value}</dd>
          {sub && <dd className="break-words text-sm text-muted">{sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/**
 * Página pública `/hueco/[token]` (DX-435): el paciente ve el hueco que le
 * ofrecen y, con un SEGUNDO clic, lo acepta o lo rechaza. Abrir el enlace
 * solo lee. Si otro aceptó antes, «Este hueco ya se ocupó». Móvil primero:
 * una columna, botones de 48 px a todo el ancho.
 */
export function PublicSlotOfferView({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicSlotOffer(token)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 404 ? { kind: 'invalid' } : { kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  async function respond(action: 'accept' | 'decline') {
    setPending(action);
    setRespondError(null);
    try {
      const data = await (action === 'accept' ? acceptPublicSlotOffer(token) : declinePublicSlotOffer(token));
      setState({ kind: 'ready', data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState({ kind: 'invalid' });
      else setRespondError(publicSlotOfferCopy.respondError);
    } finally {
      setPending(null);
    }
  }

  const clinic = state.kind === 'ready' ? state.data.clinic : null;
  const data = state.kind === 'ready' ? state.data : null;
  const details = data?.offer ?? null;
  const clock = details ? slotClock(details) : null;

  return (
    <div style={publicBrandStyle(clinic)} className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{publicSlotOfferCopy.loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            description={publicSlotOfferCopy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'invalid' && (
          <Notice icon={LinkIcon} title={publicSlotOfferCopy.invalidTitle} message={publicSlotOfferCopy.invalidMessage} />
        )}

        {data && (
          <>
            <header className="flex items-center gap-3">
              {clinic?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- logo de la clínica en un host arbitrario; next/image exigiría whitelistear cada dominio
                <img
                  src={clinic.logoUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-10 shrink-0 rounded-lg object-contain"
                />
              )}
              <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-ink">
                {clinic?.name ?? publicSlotOfferCopy.fallbackClinic}
              </h1>
            </header>

            {data.state !== 'OPEN' && data.state !== 'ACCEPTED' && (
              <div role="status" data-testid="public-slot-offer-closed">
                <Notice icon={CLOSED[data.state].icon} title={data.message} message={CLOSED[data.state].message} />
              </div>
            )}

            {data.state === 'ACCEPTED' && (
              <section aria-labelledby="slot-offer-accepted" className="flex flex-col gap-4">
                <div role="status" className="rounded-xl border border-border bg-surface px-4 py-4">
                  <h2 id="slot-offer-accepted" className="text-lg font-semibold text-ink">
                    {data.message}
                  </h2>
                  <p className="mt-1 text-sm text-ink">{publicSlotOfferCopy.acceptedLead}</p>
                </div>
                {details && <SlotSummary details={details} />}
              </section>
            )}

            {data.state === 'OPEN' && details && (
              <section aria-labelledby="slot-offer-lead" className="flex flex-col gap-5">
                <p id="slot-offer-lead" className="text-base text-ink">
                  <span className="font-semibold">{publicSlotOfferCopy.greeting(details.patientFirstName)}</span>{' '}
                  {publicSlotOfferCopy.openLead}
                </p>
                <SlotSummary details={details} />
                {details.currentAppointmentStart ? (
                  <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm tabular-nums text-ink">
                    {publicSlotOfferCopy.movesFrom(
                      `${longAppointmentDay(details.currentAppointmentStart, details.timeZone)} a las ${sedeTime(details.currentAppointmentStart, clock)}`,
                    )}
                  </p>
                ) : null}
                <div className="flex flex-col gap-3">
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full"
                    loading={pending === 'accept'}
                    disabled={pending !== null}
                    onClick={() => void respond('accept')}
                  >
                    <CalendarCheck aria-hidden /> {publicSlotOfferCopy.accept}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="h-12 w-full"
                    loading={pending === 'decline'}
                    disabled={pending !== null}
                    onClick={() => void respond('decline')}
                  >
                    <CalendarX aria-hidden /> {publicSlotOfferCopy.decline}
                  </Button>
                  {respondError && <InlineError>{respondError}</InlineError>}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
