'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  Clock,
  MapPin,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { zoneCityLabel } from '@/lib/format/date';
import { longAppointmentDay } from '@/lib/appointments/confirmation-message';
import { sedeTimeRange } from '@/lib/locations/sede-clock';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import {
  createPublicBooking,
  FORM_MIN_FILL_SECONDS,
  getPublicBookingConfig,
  type AntiBotFields,
  type OnlinePatientKind,
  type PublicBookingConfig,
  type PublicBookingResult,
  type PublicSlot,
} from '@/lib/online-booking/online-booking-api';
import {
  bookingClock,
  classifyBookingError,
  lastBookableDay,
  modeOf,
  providersFor,
  typesAt,
  waitBeforeSubmit,
} from '@/lib/online-booking/booking-flow';
import { useClinicBranding } from '@/components/brand/branding-context';
import { ClinicBrand } from '@/components/brand/clinic-brand';
import { PublicNotice } from '@/components/shared/public-page';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { BookingSlotStep } from './booking-slot-step';
import {
  BookingPatientStep,
  EMPTY_EXISTING_PATIENT,
  EMPTY_NEW_PATIENT,
  type ExistingPatientDraft,
  type NewPatientDraft,
} from './booking-patient-step';

export const publicBookingCopy = {
  loading: 'Cargando la reserva online…',
  loadError: 'No pudimos cargar la reserva online. Revisa tu conexión.',
  unavailableTitle: 'La reserva online no está disponible',
  unavailableMessage:
    'La reserva online no está disponible en esta clínica. Llama a la clínica para pedir tu cita.',
  emptyTitle: 'No hay citas para reservar por internet',
  emptyMessage: 'Ahora mismo la clínica no ofrece citas online. Llámala para pedir tu cita.',
  fallbackClinic: 'Reserva tu cita',
  lead: 'Elige el tratamiento, el día y la hora. Solo te pedimos tus datos al final.',
  stepOf: (n: number, total: number) => `Paso ${n} de ${total}`,
  back: 'Atrás',
  next: 'Continuar',
  steps: {
    service: '¿Qué necesitas?',
    provider: '¿Con quién?',
    slot: 'Elige día y hora',
    details: 'Tus datos',
  },
  location: 'Sede',
  type: 'Tratamiento',
  kind: '¿Es tu primera visita a la clínica?',
  kindNew: 'Sí, es mi primera vez',
  kindNewHint: 'Te pediremos tus datos para abrir tu ficha.',
  kindExisting: 'No, ya soy paciente',
  kindExistingHint: 'Te enviaremos un código a tu email para comprobar que eres tú.',
  minutes: (n: number) => `${n} min`,
  pickLocation: 'Elige la sede.',
  pickType: 'Elige el tratamiento.',
  pickKind: 'Dinos si es tu primera visita.',
  pickProvider: 'Elige un profesional o «Cualquiera disponible».',
  anyProvider: 'Cualquiera disponible',
  anyProviderHint: 'Te mostramos todas las horas libres.',
  summary: 'Tu cita',
  changeTime: 'Cambiar la hora',
  dayLabel: 'Fecha',
  timeLabel: 'Hora',
  providerLabel: 'Profesional',
  locationLabel: 'Sede',
  typeLabel: 'Tratamiento',
  bookedTitle: 'Tu cita está reservada',
  bookedLead: 'Te enviamos un email con los detalles. Desde «Ver mi cita» puedes confirmarla o cancelarla.',
  manage: 'Ver mi cita',
  requestedTitle: 'Recibimos tu solicitud',
  requestedLead: 'La clínica la revisará y te confirmará la cita por email. Esta hora aún no está reservada.',
  requestedTime: 'Hora solicitada',
  reload: 'Recargar la página',
  noClockTitle: 'No podemos mostrar las horas de esta sede',
  noClockMessage: 'La sede aún no tiene configurado su formato de hora. Llama a la clínica para pedir tu cita.',
};
const copy = publicBookingCopy;

type Step = 'service' | 'provider' | 'slot' | 'details' | 'done';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable' }
  | { kind: 'ready'; config: PublicBookingConfig; loadedAt: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Filas de resumen (cuándo, dónde, con quién) con su icono, como las demás páginas públicas. */
function SummaryList({ rows }: { rows: { icon: LucideIcon; label: string; value: string; sub?: string | null }[] }) {
  return (
    <dl className="divide-y divide-border-subtle rounded-xl border border-border bg-surface" data-testid="booking-summary">
      {rows.map(({ icon: Icon, label, value, sub }) => (
        <div key={label} className="relative min-w-0 py-3 pl-12 pr-4">
          <dt className="t-caption text-muted">
            <Icon aria-hidden className="absolute left-4 top-3.5 size-5 text-muted" />
            {label}
          </dt>
          <dd className="break-words font-medium tabular-nums text-ink first-letter:uppercase">{value}</dd>
          {sub ? <dd className="break-words text-sm text-muted">{sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * Página pública `/reservar` (DX-016): el paciente reserva (o pide) una cita
 * sin sesión. Móvil primero, una columna: sede y tratamiento (y «¿primera
 * visita?», que decide la duración y la antelación) → profesional → día y hora
 * (en la zona de la sede) → datos → confirmación. La clínica sale del host (el
 * cliente HTTP manda `X-Tenant-Host`) y la marca, del layout raíz (white-label).
 * La sesión del paciente existente (o la de reintento tras un 409) vive solo en
 * el estado de esta página: nunca en `localStorage`.
 */
export function PublicBookingView() {
  const branding = useClinicBranding();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [step, setStep] = useState<Step>('service');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [kind, setKind] = useState<OnlinePatientKind | null>(null);
  /** `''` = cualquiera disponible; `null` = aún sin elegir. */
  const [providerChoice, setProviderChoice] = useState<string | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [slotsReload, setSlotsReload] = useState(0);
  const [serviceErrors, setServiceErrors] = useState<{ location?: string; type?: string; kind?: string; provider?: string }>({});
  const [newDraft, setNewDraft] = useState<NewPatientDraft>(EMPTY_NEW_PATIENT);
  const [existingDraft, setExistingDraft] = useState<ExistingPatientDraft>(EMPTY_EXISTING_PATIENT);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadNotice, setReloadNotice] = useState<string | null>(null);
  const [result, setResult] = useState<PublicBookingResult | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    let cancelled = false;
    getPublicBookingConfig()
      .then((config) => {
        if (cancelled) return;
        setLoad({ kind: 'ready', config, loadedAt: Date.now() });
        if (config.locations.length === 1) setLocationId(config.locations[0].id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad(
          err instanceof ApiError && err.status === 404
            ? { kind: 'unavailable' }
            : { kind: 'error', message: apiErrorMessage(err, copy.loadError) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Foco gestionado: al cambiar de paso, al título del paso (no en la carga).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const config = load.kind === 'ready' ? load.config : null;
  const location = config?.locations.find((l) => l.id === locationId) ?? null;
  const types = useMemo(() => (config ? typesAt(config, locationId) : []), [config, locationId]);
  const type = types.find((t) => t.id === typeId) ?? null;
  const providers = useMemo(() => (config ? providersFor(config, locationId, typeId) : []), [config, locationId, typeId]);
  // Con un solo profesional no se pregunta. Antes de elegir el tratamiento se
  // cuenta con el total, para que «Paso 1 de N» no cambie al elegirlo.
  const skipProvider = type ? providers.length <= 1 : (config?.providers.length ?? 0) <= 1;
  const providerId = skipProvider ? (providers[0]?.id ?? null) : providerChoice || null;
  const clock = location ? bookingClock(location) : null;
  const today = location ? sedeToday(location.timeZone) : null;
  const mode = config && kind ? modeOf(config, kind) : 'REQUEST';
  const steps: Exclude<Step, 'done'>[] = skipProvider ? ['service', 'slot', 'details'] : ['service', 'provider', 'slot', 'details'];
  const stepIndex = step === 'done' ? steps.length : steps.indexOf(step);

  /** Campos anti-bots de cada POST; espera lo que falte de los 4 s mínimos. */
  const antiBot = useCallback(async (): Promise<AntiBotFields> => {
    if (load.kind !== 'ready') throw new Error('Sin configuración');
    const wait = waitBeforeSubmit(load.loadedAt, Date.now(), FORM_MIN_FILL_SECONDS);
    if (wait > 0) await sleep(wait);
    // challengeToken: punto de enganche del captcha (proveedor pendiente del dueño).
    return { formToken: load.config.formToken, website: honeypot, challengeToken: null };
  }, [load, honeypot]);

  function go(next: Step) {
    setStep(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }

  function back() {
    setSubmitError(null);
    const i = steps.indexOf(step as Exclude<Step, 'done'>);
    if (i > 0) go(steps[i - 1]);
  }

  function continueFromService(e: React.FormEvent) {
    e.preventDefault();
    const errors: typeof serviceErrors = {};
    if (!location) errors.location = copy.pickLocation;
    if (!type) errors.type = copy.pickType;
    if (!kind) errors.kind = copy.pickKind;
    setServiceErrors(errors);
    if (Object.keys(errors).length > 0) {
      const first = errors.location ? 'booking-location' : errors.type ? 'booking-type' : 'booking-kind';
      document.getElementById(first)?.focus();
      return;
    }
    setSlotNotice(null);
    go(skipProvider ? 'slot' : 'provider');
  }

  function continueFromProvider(e: React.FormEvent) {
    e.preventDefault();
    if (providerChoice === null) {
      setServiceErrors({ provider: copy.pickProvider });
      document.getElementById('booking-provider')?.focus();
      return;
    }
    setSlotNotice(null);
    go('slot');
  }

  /**
   * Reserva con los datos del nuevo o con la sesión (`token`: la recién
   * abierta al verificar, que este render aún no ve en el estado).
   */
  async function submitBooking(newPatient: NewPatientDraft | null, token: string | null = sessionToken) {
    if (!config || !location || !type || !slot || !kind) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const anti = await antiBot();
      const res = await createPublicBooking(
        {
          locationId: location.id,
          appointmentTypeId: type.id,
          // «Cualquiera disponible»: sin profesional, la API da el primero libre a esa hora.
          providerId,
          start: slot.start,
          newPatient:
            newPatient && config.privacyPolicy
              ? {
                  firstName: newPatient.firstName.trim(),
                  lastName: newPatient.lastName.trim(),
                  birthDate: newPatient.birthDate ?? '',
                  email: newPatient.email.trim(),
                  phone: newPatient.phone.trim(),
                  consentPolicyVersionId: config.privacyPolicy.id,
                  consentAccepted: newPatient.consent,
                }
              : null,
        },
        anti,
        token,
      );
      setResult(res);
      setSessionToken(null);
      go('done');
    } catch (err) {
      const outcome = classifyBookingError(err);
      switch (outcome.kind) {
        case 'slot':
          // La ficha nueva ya se creó: el reintento va con su sesión, sin duplicarla.
          if (outcome.sessionToken) setSessionToken(outcome.sessionToken);
          setSlot(null);
          setSlotNotice(outcome.text);
          setSlotsReload((n) => n + 1);
          go('slot');
          break;
        case 'session':
          setSessionToken(null);
          setSubmitError(outcome.text);
          break;
        case 'reload':
          setReloadNotice(outcome.text);
          break;
        case 'unavailable':
          setLoad({ kind: 'unavailable' });
          break;
        case 'inline':
          setSubmitError(outcome.text);
          break;
      }
    } finally {
      setSubmitting(false);
    }
  }

  const clinicName = branding.name ?? config?.clinicName ?? copy.fallbackClinic;
  const stepTitle = step === 'done' ? null : copy.steps[step];

  const summaryRows = (when: { start: string; end: string }, providerName: string | null) =>
    location && type
      ? [
          { icon: CalendarCheck, label: copy.dayLabel, value: longAppointmentDay(when.start, location.timeZone) },
          { icon: Clock, label: copy.timeLabel, value: sedeTimeRange(when.start, when.end, clock) },
          { icon: Stethoscope, label: copy.typeLabel, value: type.name },
          ...(providerName ? [{ icon: UserRound, label: copy.providerLabel, value: providerName }] : []),
          { icon: MapPin, label: copy.locationLabel, value: location.name, sub: location.address },
        ]
      : [];

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 sm:py-10">
        <ClinicBrand name={clinicName} logoUrl={branding.logoUrl} variant="public" />

        {load.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4" data-testid="booking-loading">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {load.kind === 'error' && (
          <SectionError
            description={load.message}
            onRetry={() => {
              setLoad({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {load.kind === 'unavailable' && (
          <PublicNotice icon={CalendarOff} title={copy.unavailableTitle} message={copy.unavailableMessage} />
        )}

        {config && config.locations.length === 0 && (
          <PublicNotice icon={CalendarOff} title={copy.emptyTitle} message={copy.emptyMessage} />
        )}

        {config && config.locations.length > 0 && (
          <section aria-labelledby="booking-step-title" className="flex flex-col gap-5">
            {reloadNotice ? (
              <Callout
                tone="warning"
                role="alert"
                action={
                  <Button type="button" size="sm" variant="secondary" onClick={() => window.location.reload()}>
                    {copy.reload}
                  </Button>
                }
              >
                {reloadNotice}
              </Callout>
            ) : null}

            {step !== 'done' ? (
              <div className="flex flex-col gap-2">
                {step === 'service' ? <p className="text-sm text-muted">{copy.lead}</p> : null}
                <div className="flex items-center gap-3">
                  {stepIndex > 0 ? (
                    <Button type="button" variant="ghost" size="sm" className="-ml-2 max-sm:min-h-11" onClick={back}>
                      <ArrowLeft aria-hidden /> {copy.back}
                    </Button>
                  ) : null}
                  <p className="t-caption ml-auto text-muted" data-testid="booking-step-count">
                    {copy.stepOf(stepIndex + 1, steps.length)}
                  </p>
                </div>
                <div
                  role="progressbar"
                  aria-label={copy.stepOf(stepIndex + 1, steps.length)}
                  aria-valuemin={1}
                  aria-valuemax={steps.length}
                  aria-valuenow={stepIndex + 1}
                  className="h-1 overflow-hidden rounded-full bg-surface-active"
                >
                  <div className="h-full bg-primary" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
                </div>
                <h2
                  id="booking-step-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="t-display mt-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
                >
                  {stepTitle}
                </h2>
              </div>
            ) : null}

            {step === 'service' && (
              <form onSubmit={continueFromService} noValidate className="flex flex-col gap-6" data-testid="booking-step-service">
                {config.locations.length > 1 ? (
                  <RadioGroup
                    id="booking-location"
                    legend={copy.location}
                    value={locationId ?? ''}
                    error={serviceErrors.location}
                    onValueChange={(v) => {
                      setLocationId(v);
                      setTypeId(null);
                      setProviderChoice(null);
                      setServiceErrors((e) => ({ ...e, location: undefined }));
                    }}
                    optionsClassName="gap-2"
                  >
                    {config.locations.map((l, i) => (
                      <RadioCard key={l.id} id={i === 0 ? 'booking-location' : undefined} value={l.id} title={l.name} description={l.address ?? undefined} />
                    ))}
                  </RadioGroup>
                ) : null}
                {location ? (
                  <RadioGroup
                    id="booking-type"
                    legend={copy.type}
                    value={typeId ?? ''}
                    error={serviceErrors.type}
                    onValueChange={(v) => {
                      setTypeId(v);
                      setProviderChoice(null);
                      setServiceErrors((e) => ({ ...e, type: undefined }));
                    }}
                    optionsClassName="gap-2"
                  >
                    {types.map((t, i) => (
                      <RadioCard
                        key={t.id}
                        id={i === 0 ? 'booking-type' : undefined}
                        value={t.id}
                        title={t.name}
                        description={
                          t.durationNewMinutes === t.durationExistingMinutes ? copy.minutes(t.durationNewMinutes) : undefined
                        }
                      />
                    ))}
                  </RadioGroup>
                ) : null}
                <RadioGroup
                  id="booking-kind"
                  legend={copy.kind}
                  value={kind ?? ''}
                  error={serviceErrors.kind}
                  onValueChange={(v) => {
                    setKind(v as OnlinePatientKind);
                    setSessionToken(null);
                    setServiceErrors((e) => ({ ...e, kind: undefined }));
                  }}
                  optionsClassName="gap-2"
                >
                  <RadioCard
                    id="booking-kind"
                    value="NEW"
                    title={copy.kindNew}
                    description={`${copy.kindNewHint}${type ? ` · ${copy.minutes(type.durationNewMinutes)}` : ''}`}
                  />
                  <RadioCard
                    value="EXISTING"
                    title={copy.kindExisting}
                    description={`${copy.kindExistingHint}${type ? ` · ${copy.minutes(type.durationExistingMinutes)}` : ''}`}
                  />
                </RadioGroup>
                <Button type="submit" size="lg" className="h-12 w-full">
                  {copy.next}
                </Button>
              </form>
            )}

            {step === 'provider' && (
              <form onSubmit={continueFromProvider} noValidate className="flex flex-col gap-6" data-testid="booking-step-provider">
                <RadioGroup
                  id="booking-provider"
                  legend={copy.providerLabel}
                  value={providerChoice ?? undefined}
                  error={serviceErrors.provider}
                  onValueChange={(v) => {
                    setProviderChoice(v);
                    setServiceErrors({});
                  }}
                  optionsClassName="gap-2"
                >
                  <RadioCard id="booking-provider" value="" title={copy.anyProvider} description={copy.anyProviderHint} />
                  {providers.map((p) => (
                    <RadioCard key={p.id} value={p.id} title={p.name} />
                  ))}
                </RadioGroup>
                <Button type="submit" size="lg" className="h-12 w-full">
                  {copy.next}
                </Button>
              </form>
            )}

            {step === 'slot' && location && type && kind && clock && today && (
              <BookingSlotStep
                locationId={location.id}
                appointmentTypeId={type.id}
                providerId={providerId}
                patientKind={kind}
                sessionToken={sessionToken}
                today={today}
                lastDay={lastBookableDay(today, config.maxAdvanceDays)}
                clock={clock}
                zoneLabel={zoneCityLabel(location.timeZone)}
                notice={slotNotice}
                reloadKey={slotsReload}
                onPick={(picked) => {
                  setSlot(picked);
                  setSubmitError(null);
                  go('details');
                }}
                onAnyProvider={
                  !skipProvider && providerChoice
                    ? () => {
                        setProviderChoice('');
                        setSlotNotice(null);
                      }
                    : null
                }
                onUnavailable={(message) => setReloadNotice(message)}
              />
            )}

            {step === 'slot' && location && !clock && (
              <PublicNotice icon={CalendarOff} title={copy.noClockTitle} message={copy.noClockMessage} />
            )}

            {step === 'details' && slot && kind && today && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="t-title text-ink">{copy.summary}</h3>
                    <Button type="button" variant="link" size="sm" className="max-sm:min-h-11" onClick={() => go('slot')}>
                      {copy.changeTime}
                    </Button>
                  </div>
                  <SummaryList
                    rows={summaryRows(slot, providers.find((p) => p.id === slot.providerId)?.name ?? null)}
                  />
                </div>
                <BookingPatientStep
                  config={config}
                  kind={kind}
                  mode={mode}
                  today={today}
                  newDraft={newDraft}
                  onNewDraft={setNewDraft}
                  existingDraft={existingDraft}
                  onExistingDraft={setExistingDraft}
                  sessionToken={sessionToken}
                  honeypot={honeypot}
                  onHoneypot={setHoneypot}
                  antiBot={antiBot}
                  submitting={submitting}
                  submitError={submitError}
                  onSubmit={(draft) => void submitBooking(draft)}
                  onVerified={(token) => {
                    setSessionToken(token);
                    // La sesión ya está en el estado: se reserva con ella.
                    void submitBooking(null, token);
                  }}
                />
              </div>
            )}

            {step === 'done' && result && (
              <div className="flex flex-col gap-5" data-testid={`booking-result-${result.status}`}>
                <div role="status" className="flex flex-col gap-2">
                  <h2
                    id="booking-step-title"
                    ref={headingRef}
                    tabIndex={-1}
                    className="t-display flex items-center gap-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
                  >
                    {result.status === 'BOOKED' ? (
                      <CalendarCheck aria-hidden className="size-6 shrink-0 text-success-text" />
                    ) : (
                      <CalendarClock aria-hidden className="size-6 shrink-0 text-warning-text" />
                    )}
                    {result.status === 'BOOKED' ? copy.bookedTitle : copy.requestedTitle}
                  </h2>
                  <p className="text-sm text-ink">{result.status === 'BOOKED' ? copy.bookedLead : copy.requestedLead}</p>
                </div>
                <ResultSummary result={result} />
                {result.status === 'BOOKED' && result.manageUrl ? (
                  <Button asChild size="lg" className="h-12 w-full">
                    <a href={result.manageUrl} rel="noreferrer">
                      {copy.manage}
                    </a>
                  </Button>
                ) : null}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

/** El resumen del resultado, con el reloj de la sede que manda la respuesta. */
function ResultSummary({ result }: { result: PublicBookingResult }) {
  const clock = bookingClock(result);
  const rows = [
    { icon: CalendarCheck, label: publicBookingCopy.dayLabel, value: longAppointmentDay(result.start, result.timeZone) },
    {
      icon: Clock,
      label: result.status === 'BOOKED' ? publicBookingCopy.timeLabel : publicBookingCopy.requestedTime,
      value: sedeTimeRange(result.start, result.end, clock),
    },
    { icon: Stethoscope, label: publicBookingCopy.typeLabel, value: result.appointmentTypeName },
    { icon: UserRound, label: publicBookingCopy.providerLabel, value: result.providerName },
    { icon: MapPin, label: publicBookingCopy.locationLabel, value: result.locationName },
  ];
  return <SummaryList rows={rows} />;
}
