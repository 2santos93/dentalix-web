'use client';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect, useId, useRef, useState } from 'react';
import {
  BellRing,
  CalendarCheck,
  CalendarPlus,
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
import { ExternalLink } from '@/components/shared/external-link';
import { API_PROXY_PATH } from '@/lib/api/api-base';
import {
  PAGE_LANGUAGES,
  PUBLIC_CONFIRMATION_COPY,
  resolvePageLanguage,
  type PageLanguage,
  type PublicConfirmationCopy,
} from './public-confirmation-copy';

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
  t,
}: {
  appointment: ConfirmationAppointment;
  format: DocumentFormat | null;
  t: PublicConfirmationCopy;
}) {
  const doc = documentTexts(format);
  // En 12 h el rango lleva espacios alrededor del guion («9:00 a. m. – 9:30 a. m.»).
  const separator = format?.fmt.hourCycle === 'h12' ? ' – ' : '–';
  const rows = [
    {
      icon: CalendarCheck,
      label: t.dayLabel,
      value: format
        ? format.fmt.longDate(new Date(appointment.start), format.timeZone)
        : <MissingValue />,
      sub: null,
    },
    {
      icon: Clock,
      label: t.timeLabel,
      value: format
        ? `${doc.time(appointment.start)}${separator}${doc.time(appointment.end)}`
        : <MissingValue />,
      sub: format ? null : t.noFormat,
    },
    ...(appointment.providerName
      ? [{ icon: UserRound, label: t.providerLabel, value: appointment.providerName, sub: null }]
      : []),
    {
      icon: MapPin,
      label: t.locationLabel,
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
  t,
}: {
  t: PublicConfirmationCopy;
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
        {t.policyTitle}
      </h2>
      <div className="flex flex-col gap-2 text-sm text-ink">
        <p>{t.policyNotice(policy.noticeHours)}</p>
        {policy.text ? <p className="whitespace-pre-line break-words">{policy.text}</p> : null}
        {fee ? <p className="tabular-nums">{t.policyFee(fee)}</p> : null}
      </div>
      {feeBlocked ? (
        <Callout
          tone="warning"
          role="note"
          data-testid="public-fee-needs-clinic"
          title={t.feeNeedsClinicTitle}
        >
          {t.feeNeedsClinicMessage}
        </Callout>
      ) : isLate ? (
        <Callout
          tone="warning"
          role="note"
          data-testid="public-late-cancellation"
          title={t.lateTitle(policy.noticeHours)}
        >
          {t.lateMessage}
        </Callout>
      ) : null}
    </section>
  );
}

/**
 * DX-469: «Añadir a mi calendario»: el .ics del enlace (descarga, lo abre el
 * calendario del móvil) y Google Calendar en una pestaña nueva. Solo con
 * `calendarAvailable` (enlace válido, cita no cancelada y aún no terminada).
 */
function CalendarLinks({
  token,
  googleUrl,
  t,
}: {
  token: string;
  googleUrl: string | null;
  t: PublicConfirmationCopy;
}) {
  const ics = `${API_PROXY_PATH}/public/appointment-confirmations/${encodeURIComponent(token)}/calendar.ics`;
  const linkClass =
    'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text';
  return (
    <section
      aria-labelledby="calendar-links-title"
      data-testid="public-calendar-links"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4"
    >
      <h2 id="calendar-links-title" className="t-title flex items-center gap-2 text-ink">
        <CalendarPlus aria-hidden className="size-4 shrink-0 text-muted" />
        {t.calendarTitle}
      </h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a href={ics} download="cita.ics" className={linkClass}>
          {t.calendarIcs}
        </a>
        {googleUrl ? (
          <ExternalLink href={googleUrl} className={linkClass}>
            {t.calendarGoogle}
          </ExternalLink>
        ) : null}
      </div>
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
  t,
}: {
  t: PublicConfirmationCopy;
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
        {t.earlierTitle}
      </h2>
      {/* 44 px: la casilla y el selector se tocan con el dedo. */}
      <Checkbox
        id={checkboxId}
        checked={appointment.wantsEarlier}
        disabled={pending}
        onChange={(e) => onChange(e.target.checked, window)}
        label={t.earlierLabel}
        description={t.earlierHint}
        className="min-h-11"
      />
      {appointment.wantsEarlier ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="t-caption text-muted">
            {t.earlierWindowLabel}
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
                {t.earlierWindows[w]}
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
  // DX-497: el idioma que eligió el paciente en la página (null = el suyo de
  // la ficha, que manda la API). Cambiarlo no toca la ficha: solo esta vista.
  const [chosenLanguage, setChosenLanguage] = useState<PageLanguage | null>(null);
  const language: PageLanguage =
    chosenLanguage ?? resolvePageLanguage(state.kind === 'ready' ? state.data.language : null);
  const t = PUBLIC_CONFIRMATION_COPY[language];
  const languageSelectId = useId();
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    document.title = t.documentTitle;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [language, t]);
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
        setRespondError(apiErrorMessage(err, t.respondError));
        setReloadKey((k) => k + 1);
      } else {
        setRespondError(t.respondError);
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
      setEarlierNotice(wantsEarlier ? t.earlierSaved(window) : t.earlierCleared);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setState({ kind: 'ready', data: { ...state.data, status: 'EXPIRED', appointment: null } });
      } else if (err instanceof ApiError && err.status === 404) {
        setState({ kind: 'invalid' });
      } else if (err instanceof ApiError && err.status === 400) {
        // Ya no se puede (la cita cambió o es hoy): el motivo de la API y se relee.
        setEarlierError(apiErrorMessage(err, t.earlierError));
        setReloadKey((k) => k + 1);
      } else {
        setEarlierError(t.earlierError);
      }
    } finally {
      setEarlierPending(false);
    }
  }

  const clinic = state.kind === 'ready' ? state.data.clinic : null;
  /** DX-437: con la cita a la vista, no cancelada, y si la API lo permite. */
  const calendarSection =
    state.kind === 'ready' && state.data.calendarAvailable ? (
      <CalendarLinks token={confirmationToken} googleUrl={state.data.googleCalendarUrl} t={t} />
    ) : null;
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
        t={t}
      />
    ) : null;

  return (
    <div style={publicBrandStyle(clinic)} lang={language} className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        {/* DX-497: el paciente cambia el idioma de la página (no el de su ficha). */}
        <div className="flex items-center justify-end gap-2">
          <label htmlFor={languageSelectId} className="t-caption text-muted">
            {t.languageLabel}
          </label>
          <NativeSelect
            id={languageSelectId}
            data-testid="public-language"
            value={language}
            onChange={(e) => setChosenLanguage(e.target.value as PageLanguage)}
            selectClassName="h-11"
          >
            {PAGE_LANGUAGES.map((l) => (
              <option key={l} value={l} lang={l}>
                {PUBLIC_CONFIRMATION_COPY[l].languageName}
              </option>
            ))}
          </NativeSelect>
        </div>
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{t.loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            title={t.loadErrorTitle}
            retryLabel={t.retry}
            description={t.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'invalid' && (
          <Notice headingLevel={1} icon={LinkIcon} title={t.invalidTitle} message={t.invalidMessage} />
        )}

        {state.kind === 'ready' && (
          <>
            <ClinicBrand variant="public" name={clinic?.name ?? t.fallbackClinic} logoUrl={clinic?.logoUrl} />

            {state.data.status === 'EXPIRED' && (
              <Notice icon={CalendarX} title={t.expiredTitle} message={t.expiredMessage} />
            )}

            {state.data.status === 'RESPONDED' && (
              <section aria-labelledby="confirmation-done" className="flex flex-col gap-4">
                <div role="status" className="rounded-xl border border-border bg-surface px-4 py-4">
                  <h2 id="confirmation-done" className="t-title text-ink">
                    {t.respondedTitle}
                  </h2>
                  {state.data.response && (
                    <p className="mt-1 text-sm text-ink">{t.responded[state.data.response]}</p>
                  )}
                </div>
                {state.data.appointment && (
                  <AppointmentSummary
                    appointment={state.data.appointment}
                    format={appointmentFormat(state.data.appointment)}
                    t={t}
                  />
                )}
                {calendarSection}
                {earlierSection}
              </section>
            )}

            {state.data.status === 'PENDING' && state.data.appointment && (
              <section aria-labelledby="confirmation-lead" className="flex flex-col gap-5">
                <p id="confirmation-lead" className="text-base text-ink">
                  <span className="font-semibold">
                    {t.greeting(state.data.appointment.patientFirstName)}
                  </span>{' '}
                  {t.pendingLead}
                </p>
                <AppointmentSummary
                  appointment={state.data.appointment}
                  format={appointmentFormat(state.data.appointment)}
                  t={t}
                />
                {calendarSection}
                {earlierSection}
                {state.data.cancellationPolicy ? (
                  <CancellationPolicyNotice
                    policy={state.data.cancellationPolicy}
                    isLate={state.data.isLate}
                    format={appointmentFormat(state.data.appointment)}
                    feeBlocked={cancelNeedsClinic(state.data)}
                    t={t}
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
                    <CalendarCheck aria-hidden /> {t.confirm}
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
                    <Phone aria-hidden /> {t.callMe}
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
                        label={t.acknowledge}
                        error={ackError ? t.acknowledgeRequired(state.data.cancellationPolicy.noticeHours) : null}
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
                      <CalendarX aria-hidden /> {t.cancel}
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
