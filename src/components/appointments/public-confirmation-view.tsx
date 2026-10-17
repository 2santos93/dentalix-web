'use client';
import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarX, Clock, LinkIcon, MapPin, Phone, UserRound } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  getPublicConfirmation,
  respondPublicConfirmation,
  type ConfirmationAction,
  type ConfirmationAppointment,
  type PublicConfirmation,
} from '@/lib/appointments/confirmations-api';
import { longAppointmentDay } from '@/lib/appointments/confirmation-message';
import { formatTimeRange } from '@/components/appointments/appointment-display';
import { PublicNotice as Notice, publicBrandStyle } from '@/components/shared/public-page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Cargando tu cita…',
  // Sin "Intenta de nuevo." — `SectionError` trae su propio botón.
  loadError: 'No pudimos cargar tu cita. Revisa tu conexión.',
  greeting: (name: string | null) => (name ? `Hola ${name},` : 'Hola,'),
  pendingLead: 'tienes esta cita. ¿Nos confirmas si vienes?',
  dayLabel: 'Fecha',
  timeLabel: 'Hora',
  providerLabel: 'Profesional',
  locationLabel: 'Sede',
  confirm: 'Confirmar asistencia',
  callMe: 'Quiero que me llamen',
  cancel: 'Cancelar cita',
  respondError: 'No pudimos enviar tu respuesta. Revisa tu conexión e intenta de nuevo.',
  respondedTitle: 'Ya respondiste',
  responded: {
    confirm: 'Confirmaste tu asistencia. ¡Te esperamos!',
    cancel: 'Cancelaste la cita. Si quieres otra fecha, comunícate con la clínica.',
    call_me: 'Te llamaremos pronto para coordinar tu cita.',
  } satisfies Record<ConfirmationAction, string>,
  expiredTitle: 'Este enlace ya no es válido',
  expiredMessage:
    'Caducó o la cita cambió después de enviarlo. Si necesitas confirmar o cambiar tu cita, comunícate con la clínica.',
  invalidTitle: 'Enlace no válido',
  invalidMessage:
    'No encontramos este enlace. Revisa que esté completo o pide a la clínica que te lo envíe de nuevo.',
  fallbackClinic: 'Tu clínica',
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: PublicConfirmation };

function AppointmentSummary({ appointment }: { appointment: ConfirmationAppointment }) {
  const rows = [
    { icon: CalendarCheck, label: copy.dayLabel, value: longAppointmentDay(appointment.start), sub: null },
    {
      icon: Clock,
      label: copy.timeLabel,
      value: formatTimeRange(appointment.start, appointment.end),
      sub: null,
    },
    ...(appointment.providerName
      ? [{ icon: UserRound, label: copy.providerLabel, value: appointment.providerName, sub: null }]
      : []),
    {
      icon: MapPin,
      label: copy.locationLabel,
      value: appointment.locationName,
      sub: appointment.locationAddress,
    },
  ];
  return (
    <dl className="divide-y divide-hairline rounded-xl border border-border bg-surface">
      {rows.map(({ icon: Icon, label, value, sub }) => (
        <div key={label} className="flex items-start gap-3 px-4 py-3">
          <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
          <div className="min-w-0">
            <dt className="text-xs font-medium tracking-wide text-muted">{label}</dt>
            <dd className="break-words font-medium tabular-nums text-ink first-letter:uppercase">{value}</dd>
            {sub && <dd className="break-words text-sm text-muted">{sub}</dd>}
          </div>
        </div>
      ))}
    </dl>
  );
}

/**
 * Página pública `/confirmar/[token]` (DX-005): el paciente ve su cita y, con
 * un SEGUNDO clic, confirma, cancela o pide que lo llamen. Abrir el enlace
 * solo lee (los previsualizadores de WhatsApp lo abren solos). Móvil primero:
 * una columna, botones de 48px a todo el ancho.
 */
export function PublicConfirmationView({ confirmationToken }: { confirmationToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<ConfirmationAction | null>(null);
  const [respondError, setRespondError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicConfirmation(confirmationToken)
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
  }, [confirmationToken, reloadKey]);

  async function handleRespond(action: ConfirmationAction) {
    if (state.kind !== 'ready') return;
    setPending(action);
    setRespondError(false);
    try {
      const data = await respondPublicConfirmation(confirmationToken, action);
      setState({ kind: 'ready', data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Otro clic (u otro dispositivo) ya respondió: se muestra lo registrado.
        setReloadKey((k) => k + 1);
      } else if (err instanceof ApiError && err.status === 410) {
        setState({ kind: 'ready', data: { ...state.data, status: 'EXPIRED', appointment: null } });
      } else if (err instanceof ApiError && err.status === 404) {
        setState({ kind: 'invalid' });
      } else {
        setRespondError(true);
      }
    } finally {
      setPending(null);
    }
  }

  const clinic = state.kind === 'ready' ? state.data.clinic : null;

  return (
    <div style={publicBrandStyle(clinic)} className="flex min-h-dvh flex-col bg-bg">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            description={copy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'invalid' && (
          <Notice icon={LinkIcon} title={copy.invalidTitle} message={copy.invalidMessage} />
        )}

        {state.kind === 'ready' && (
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
                {clinic?.name ?? copy.fallbackClinic}
              </h1>
            </header>

            {state.data.status === 'EXPIRED' && (
              <Notice icon={CalendarX} title={copy.expiredTitle} message={copy.expiredMessage} />
            )}

            {state.data.status === 'RESPONDED' && (
              <section aria-labelledby="confirmation-done" className="flex flex-col gap-4">
                <div role="status" className="rounded-xl border border-border bg-surface px-4 py-4">
                  <h2 id="confirmation-done" className="text-lg font-semibold text-ink">
                    {copy.respondedTitle}
                  </h2>
                  {state.data.response && (
                    <p className="mt-1 text-sm text-ink">{copy.responded[state.data.response]}</p>
                  )}
                </div>
                {state.data.appointment && <AppointmentSummary appointment={state.data.appointment} />}
              </section>
            )}

            {state.data.status === 'PENDING' && state.data.appointment && (
              <section aria-labelledby="confirmation-lead" className="flex flex-col gap-5">
                <p id="confirmation-lead" className="text-base text-ink">
                  <span className="font-semibold">
                    {copy.greeting(state.data.appointment.patientFirstName)}
                  </span>{' '}
                  {copy.pendingLead}
                </p>
                <AppointmentSummary appointment={state.data.appointment} />
                <div className="flex flex-col gap-3">
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full"
                    loading={pending === 'confirm'}
                    disabled={pending !== null}
                    onClick={() => void handleRespond('confirm')}
                  >
                    <CalendarCheck aria-hidden /> {copy.confirm}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="secondary"
                    className="h-12 w-full"
                    loading={pending === 'call_me'}
                    disabled={pending !== null}
                    onClick={() => void handleRespond('call_me')}
                  >
                    <Phone aria-hidden /> {copy.callMe}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="h-12 w-full"
                    loading={pending === 'cancel'}
                    disabled={pending !== null}
                    onClick={() => void handleRespond('cancel')}
                  >
                    <CalendarX aria-hidden /> {copy.cancel}
                  </Button>
                  {respondError && <InlineError>{copy.respondError}</InlineError>}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
