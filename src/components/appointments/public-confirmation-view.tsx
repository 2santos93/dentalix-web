'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { 
  CalendarCheck,
  CalendarX,
  Clock,
  FileText,
  LinkIcon,
  MapPin,
  Phone,
  UserRound
} from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPublicConfirmation,
  respondPublicConfirmation,
  type ConfirmationAction,
  type ConfirmationAppointment,
  type PublicCancellationPolicy,
  type PublicConfirmation,
} from '@/lib/appointments/confirmations-api';
import { formatCurrency } from '@/lib/format/currency';
import { formatDateLabel, formatTime } from '@/lib/format/date';
import { PublicNotice as Notice, publicBrandStyle } from '@/components/shared/public-page';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { ClinicBrand } from '@/components/brand/clinic-brand';

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
  // DX-291: la política de cancelación de la sede.
  policyTitle: 'Política de cancelación',
  policyNotice: (hours: number) => `Si no puedes asistir, avísanos con al menos ${hours} h de antelación.`,
  policyFee: (amount: string) => `Cargo por inasistencia o cancelación tardía: ${amount}.`,
  lateTitle: (hours: number) => `Cancelación con menos de ${hours} h de aviso`,
  lateMessage:
    'Si cancelas ahora, cuenta como cancelación tardía según la política de la clínica. Si prefieres, pide que te llamemos para buscar otra hora.',
  acknowledge: 'He leído y acepto la política de cancelación de la clínica',
  acknowledgeRequired: (hours: number) =>
    `Para cancelar con menos de ${hours} h de aviso, marca que aceptas la política de cancelación.`,
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: PublicConfirmation };

/**
 * La página pública no recibe la zona ni el reloj de la sede (la API no los
 * manda en la confirmación): el día y la hora salen en los del navegador del
 * paciente. Excepción listada en `src/architecture/sede-clock-guard.test.ts`.
 */
function AppointmentSummary({ appointment }: { appointment: ConfirmationAppointment }) {
  const rows = [
    {
      icon: CalendarCheck,
      label: copy.dayLabel,
      value: formatDateLabel(appointment.start, { weekday: 'long', day: 'numeric', month: 'long' }),
      sub: null,
    },
    {
      icon: Clock,
      label: copy.timeLabel,
      value: `${formatTime(appointment.start)}–${formatTime(appointment.end)}`,
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
      {/* Cada grupo solo lleva dt/dd (axe definition-list): el icono va
          dentro del dt, colocado a la izquierda. */}
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
 * DX-291: la política de la sede tal como la lee el paciente (horas, texto de
 * la clínica e importe) y, si cancelar ahora sería tardío, el aviso. Va en
 * tinta sobre tintes neutros o de aviso: el color de la clínica solo marca
 * los botones (AA con cualquier marca).
 */
function CancellationPolicyNotice({
  policy,
  isLate,
}: {
  policy: PublicCancellationPolicy;
  isLate: boolean;
}) {
  const fee =
    policy.suggestedFee !== null && policy.suggestedFee > 0 && policy.currency
      ? formatCurrency(policy.suggestedFee, policy.currency)
      : null;
  return (
    <section
      aria-labelledby="cancellation-policy-title"
      data-testid="public-cancellation-policy"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4"
    >
      <h2 id="cancellation-policy-title" className="flex items-center gap-2 text-base font-semibold text-ink">
        <FileText aria-hidden className="size-4 shrink-0 text-muted" />
        {copy.policyTitle}
      </h2>
      <div className="flex flex-col gap-2 text-sm text-ink">
        <p>{copy.policyNotice(policy.noticeHours)}</p>
        {policy.text ? <p className="whitespace-pre-line break-words">{policy.text}</p> : null}
        {fee ? <p className="tabular-nums">{copy.policyFee(fee)}</p> : null}
      </div>
      {isLate ? (
        <Callout
          tone="warning"
          role="note"
          data-testid="public-late-cancellation"
          title={copy.lateTitle(policy.noticeHours)}
        >
          {copy.lateMessage}
        </Callout>
      ) : null}
    </section>
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
  const [respondError, setRespondError] = useState<string | null>(null);
  // DX-291: aceptación de la política al cancelar tarde.
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackError, setAckError] = useState(false);
  const ackRef = useRef<HTMLInputElement>(null);
  const ackId = useId();

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
    const policy = state.data.cancellationPolicy;
    const mustAcknowledge = action === 'cancel' && state.data.isLate && policy !== null;
    if (mustAcknowledge && !acknowledged) {
      setAckError(true);
      ackRef.current?.focus();
      return;
    }
    setPending(action);
    setRespondError(null);
    try {
      const data = await respondPublicConfirmation(confirmationToken, action, {
        policyVersionId: policy?.policyVersionId ?? null,
        acknowledgePolicy: mustAcknowledge ? true : undefined,
      });
      setState({ kind: 'ready', data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Otro clic (u otro dispositivo) ya respondió, o la política cambió:
        // se relee y se muestra lo vigente.
        setAcknowledged(false);
        setReloadKey((k) => k + 1);
      } else if (err instanceof ApiError && err.status === 410) {
        setState({ kind: 'ready', data: { ...state.data, status: 'EXPIRED', appointment: null } });
      } else if (err instanceof ApiError && err.status === 404) {
        setState({ kind: 'invalid' });
      } else if (err instanceof ApiError && err.status === 400) {
        // La política exige aceptarla (la hora cambió mientras leía): se relee.
        setRespondError(apiErrorMessage(err, copy.respondError));
        setReloadKey((k) => k + 1);
      } else {
        setRespondError(copy.respondError);
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
            <ClinicBrand variant="public" name={clinic?.name ?? copy.fallbackClinic} logoUrl={clinic?.logoUrl} />

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
                {state.data.cancellationPolicy ? (
                  <CancellationPolicyNotice
                    policy={state.data.cancellationPolicy}
                    isLate={state.data.isLate}
                  />
                ) : null}
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
                  {state.data.isLate && state.data.cancellationPolicy ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3">
                        <input
                          ref={ackRef}
                          id={ackId}
                          type="checkbox"
                          checked={acknowledged}
                          disabled={pending !== null}
                          onChange={(e) => {
                            setAcknowledged(e.target.checked);
                            if (e.target.checked) setAckError(false);
                          }}
                          aria-invalid={ackError ? true : undefined}
                          aria-describedby={ackError ? `${ackId}-error` : undefined}
                          className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
                        />
                        <label htmlFor={ackId} className="text-sm font-medium text-ink">
                          {copy.acknowledge}
                        </label>
                      </div>
                      {ackError ? (
                        <InlineError id={`${ackId}-error`}>
                          {copy.acknowledgeRequired(state.data.cancellationPolicy.noticeHours)}
                        </InlineError>
                      ) : null}
                    </div>
                  ) : null}
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
