'use client';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect, useId, useRef, useState } from 'react';
import {
  BellRing,
  CalendarCheck,
  CalendarX,
  Clock,
  FileText,
  LinkIcon,
  MapPin,
  Phone,
  UserRound,
} from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPublicConfirmation,
  respondPublicConfirmation,
  setPublicWantsEarlier,
  type ConfirmationAction,
  type ConfirmationAppointment,
  type EarlierWindow,
  type PublicCancellationPolicy,
  type PublicConfirmation,
} from '@/lib/appointments/confirmations-api';
import { NativeSelect } from '@/components/ui/native-select';
import { documentFormat, documentTexts, type DocumentFormat } from '@/lib/format/document-format';
import { PublicNotice as Notice, publicBrandStyle } from '@/components/shared/public-page';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { MissingValue } from '@/components/ui/missing-value';
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
  // DX-354: la sede de la cita no tiene zona, formato o reloj: no hay quien lo configure, así que se manda a la clínica.
  noFormat: 'Llama a la clínica para confirmar la hora de tu cita.',
  // DX-354: con la sede sin formato no se puede escribir el cargo: nunca «—» en su lugar; se cancela por teléfono.
  feeNeedsClinicTitle: 'Para cancelar ahora, llama a la clínica',
  feeNeedsClinicMessage:
    'Cancelar con tan poco aviso tiene un cargo según la política de la clínica y aquí no podemos mostrártelo. Llama a la clínica para cancelar o para que te llamemos a ti.',
  acknowledgeRequired: (hours: number) =>
    `Para cancelar con menos de ${hours} h de aviso, marca que aceptas la política de cancelación.`,
  // DX-437: «Avisarme si se libera un hueco antes».
  earlierTitle: '¿Quieres venir antes?',
  earlierLabel: 'Si se libera un hueco antes, avísame',
  earlierHint: 'Tu cita de ahora se mantiene. Te avisaremos solo si queda un hueco que te sirva.',
  earlierWindowLabel: 'Franja',
  earlierWindows: {
    ANY: 'Cualquier hora',
    MORNING: 'Mañanas',
    AFTERNOON: 'Tardes',
  } satisfies Record<EarlierWindow, string>,
  earlierSaved: (window: EarlierWindow) =>
    window === 'ANY'
      ? 'Listo. Te avisaremos si se libera un hueco antes.'
      : `Listo. Te avisaremos si se libera un hueco antes (${copy.earlierWindows[window].toLowerCase()}).`,
  earlierCleared: 'Listo. No te avisaremos de huecos anteriores.',
  earlierError: 'No pudimos guardar tu preferencia. Revisa tu conexión e intenta de nuevo.',
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: PublicConfirmation };

/**
 * DX-354: el formato de la sede de la cita (zona, locale y reloj que manda la
 * API, en crudo), no el del navegador del paciente. Si la sede no lo tiene,
 * `null`: el día y la hora salen «—» y se manda a llamar a la clínica.
 */
function appointmentFormat(appointment: ConfirmationAppointment): DocumentFormat | null {
  return documentFormat({
    timeZone: appointment.timeZone ?? null,
    locale: appointment.locale ?? null,
    hourCycle: appointment.hourCycle ?? null,
  });
}

/**
 * DX-354: cancelar tarde con cargo cuando la sede no tiene formato. El importe
 * no se puede escribir (ni se pinta «—» en su lugar), así que el paciente no
 * puede aceptar el cargo en línea: cancela llamando a la clínica.
 */
function cancelNeedsClinic(data: PublicConfirmation): boolean {
  const policy = data.cancellationPolicy;
  const appointment = data.appointment;
  if (!policy || !appointment || !data.isLate) return false;
  const hasFee = policy.suggestedFee !== null && policy.suggestedFee > 0 && Boolean(policy.currency);
  return hasFee && appointmentFormat(appointment) === null;
}

function AppointmentSummary({
  appointment,
  format,
}: {
  appointment: ConfirmationAppointment;
  format: DocumentFormat | null;
}) {
  const doc = documentTexts(format);
  // En 12 h el rango lleva espacios alrededor del guion («9:00 a. m. – 9:30 a. m.»).
  const separator = format?.fmt.hourCycle === 'h12' ? ' – ' : '–';
  const rows = [
    {
      icon: CalendarCheck,
      label: copy.dayLabel,
      value: format
        ? format.fmt.longDate(new Date(appointment.start), format.timeZone)
        : <MissingValue />,
      sub: null,
    },
    {
      icon: Clock,
      label: copy.timeLabel,
      value: format
        ? `${doc.time(appointment.start)}${separator}${doc.time(appointment.end)}`
        : <MissingValue />,
      sub: format ? null : copy.noFormat,
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
    <dl className="divide-y divide-border-subtle rounded-xl border border-border bg-surface">
      {/* Cada grupo solo lleva dt/dd (axe definition-list): el icono va
          dentro del dt, colocado a la izquierda. */}
      {rows.map(({ icon: Icon, label, value, sub }) => (
        <div key={label} className="relative min-w-0 py-3 pl-12 pr-4">
          <dt className="t-caption text-muted">
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
  format,
  feeBlocked,
}: {
  policy: PublicCancellationPolicy;
  isLate: boolean;
  format: DocumentFormat | null;
  /** Tarde, con cargo y sin formato de sede: el paciente no puede cancelar en línea. */
  feeBlocked: boolean;
}) {
  const fee =
    format && policy.suggestedFee !== null && policy.suggestedFee > 0 && policy.currency
      ? documentTexts(format).amount(policy.suggestedFee, policy.currency)
      : null;
  return (
    <section
      aria-labelledby="cancellation-policy-title"
      data-testid="public-cancellation-policy"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4"
    >
      <h2 id="cancellation-policy-title" className="t-title flex items-center gap-2 text-ink">
        <FileText aria-hidden className="size-4 shrink-0 text-muted" />
        {copy.policyTitle}
      </h2>
      <div className="flex flex-col gap-2 text-sm text-ink">
        <p>{copy.policyNotice(policy.noticeHours)}</p>
        {policy.text ? <p className="whitespace-pre-line break-words">{policy.text}</p> : null}
        {fee ? <p className="tabular-nums">{copy.policyFee(fee)}</p> : null}
      </div>
      {feeBlocked ? (
        <Callout
          tone="warning"
          role="note"
          data-testid="public-fee-needs-clinic"
          title={copy.feeNeedsClinicTitle}
        >
          {copy.feeNeedsClinicMessage}
        </Callout>
      ) : isLate ? (
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

/** Franjas en el orden del selector (DX-437). */
const EARLIER_WINDOWS: readonly EarlierWindow[] = ['ANY', 'MORNING', 'AFTERNOON'];

/**
 * DX-437: «Si se libera un hueco antes, avísame», con la franja. Cada cambio
 * se guarda al momento y se anuncia (región viva); la cita de ahora no cambia.
 * Solo si la API dice que se puede (`earlierAllowed`): cita agendada o
 * confirmada, futura y de un día posterior a hoy en la sede.
 */
function EarlierRequestSection({
  appointment,
  pending,
  notice,
  error,
  onChange,
}: {
  appointment: ConfirmationAppointment;
  pending: boolean;
  notice: string | null;
  error: string | null;
  onChange: (wantsEarlier: boolean, window: EarlierWindow) => void;
}) {
  const checkboxId = useId();
  const selectId = useId();
  const window: EarlierWindow = appointment.earlierWindow ?? 'ANY';
  return (
    <section
      aria-labelledby="earlier-request-title"
      data-testid="public-earlier-request"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4"
    >
      <h2 id="earlier-request-title" className="t-title flex items-center gap-2 text-ink">
        <BellRing aria-hidden className="size-4 shrink-0 text-muted" />
        {copy.earlierTitle}
      </h2>
      {/* 44 px: la casilla y el selector se tocan con el dedo. */}
      <Checkbox
        id={checkboxId}
        checked={appointment.wantsEarlier}
        disabled={pending}
        onChange={(e) => onChange(e.target.checked, window)}
        label={copy.earlierLabel}
        description={copy.earlierHint}
        className="min-h-11"
      />
      {appointment.wantsEarlier ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="t-caption text-muted">
            {copy.earlierWindowLabel}
          </label>
          <NativeSelect
            id={selectId}
            value={window}
            disabled={pending}
            onChange={(e) => onChange(true, e.target.value as EarlierWindow)}
            selectClassName="h-11"
          >
            {EARLIER_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {copy.earlierWindows[w]}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>
      {error ? <InlineError>{error}</InlineError> : null}
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
  // DX-437: «Avisarme si se libera un hueco antes».
  const [earlierPending, setEarlierPending] = useState(false);
  const [earlierNotice, setEarlierNotice] = useState<string | null>(null);
  const [earlierError, setEarlierError] = useState<string | null>(null);

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
    if (action === 'cancel' && cancelNeedsClinic(state.data)) return;
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

  async function handleEarlierChange(wantsEarlier: boolean, window: EarlierWindow) {
    if (state.kind !== 'ready') return;
    setEarlierPending(true);
    setEarlierError(null);
    // Se vacía antes de anunciar: el mismo texto dos veces no se volvería a leer.
    setEarlierNotice(null);
    try {
      const data = await setPublicWantsEarlier(confirmationToken, {
        wantsEarlier,
        ...(wantsEarlier ? { preferredWindow: window } : {}),
      });
      setState({ kind: 'ready', data });
      setEarlierNotice(wantsEarlier ? copy.earlierSaved(window) : copy.earlierCleared);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setState({ kind: 'ready', data: { ...state.data, status: 'EXPIRED', appointment: null } });
      } else if (err instanceof ApiError && err.status === 404) {
        setState({ kind: 'invalid' });
      } else if (err instanceof ApiError && err.status === 400) {
        // Ya no se puede (la cita cambió o es hoy): el motivo de la API y se relee.
        setEarlierError(apiErrorMessage(err, copy.earlierError));
        setReloadKey((k) => k + 1);
      } else {
        setEarlierError(copy.earlierError);
      }
    } finally {
      setEarlierPending(false);
    }
  }

  const clinic = state.kind === 'ready' ? state.data.clinic : null;
  /** DX-437: con la cita a la vista, no cancelada, y si la API lo permite. */
  const earlierSection =
    state.kind === 'ready' &&
    state.data.appointment &&
    state.data.appointment.earlierAllowed &&
    state.data.response !== 'cancel' ? (
      <EarlierRequestSection
        appointment={state.data.appointment}
        pending={earlierPending}
        notice={earlierNotice}
        error={earlierError}
        onChange={(wantsEarlier, window) => void handleEarlierChange(wantsEarlier, window)}
      />
    ) : null;

  return (
    <div style={publicBrandStyle(clinic)} className="flex min-h-dvh flex-col bg-canvas">
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
          <Notice headingLevel={1} icon={LinkIcon} title={copy.invalidTitle} message={copy.invalidMessage} />
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
                  <h2 id="confirmation-done" className="t-title text-ink">
                    {copy.respondedTitle}
                  </h2>
                  {state.data.response && (
                    <p className="mt-1 text-sm text-ink">{copy.responded[state.data.response]}</p>
                  )}
                </div>
                {state.data.appointment && (
                  <AppointmentSummary
                    appointment={state.data.appointment}
                    format={appointmentFormat(state.data.appointment)}
                  />
                )}
                {earlierSection}
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
                <AppointmentSummary
                  appointment={state.data.appointment}
                  format={appointmentFormat(state.data.appointment)}
                />
                {earlierSection}
                {state.data.cancellationPolicy ? (
                  <CancellationPolicyNotice
                    policy={state.data.cancellationPolicy}
                    isLate={state.data.isLate}
                    format={appointmentFormat(state.data.appointment)}
                    feeBlocked={cancelNeedsClinic(state.data)}
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
                  {state.data.isLate && state.data.cancellationPolicy && !cancelNeedsClinic(state.data) ? (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <Checkbox
                        ref={ackRef}
                        id={ackId}
                        checked={acknowledged}
                        disabled={pending !== null}
                        onChange={(e) => {
                          setAcknowledged(e.target.checked);
                          if (e.target.checked) setAckError(false);
                        }}
                        label={copy.acknowledge}
                        error={ackError ? copy.acknowledgeRequired(state.data.cancellationPolicy.noticeHours) : null}
                      />
                    </div>
                  ) : null}
                  {cancelNeedsClinic(state.data) ? null : (
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
                  )}
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
