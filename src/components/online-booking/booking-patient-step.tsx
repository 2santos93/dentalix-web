'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { MailCheck, PhoneCall, ShieldCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  requestBookingCode,
  verifyBookingCode,
  type AntiBotFields,
  type OnlineBookingMode,
  type OnlinePatientKind,
  type PublicBookingConfig,
} from '@/lib/online-booking/online-booking-api';
import { isValidCode, looksLikeEmail, normalizeCode, phoneDigitCount } from '@/lib/online-booking/booking-flow';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { PublicNotice } from '@/components/shared/public-page';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { DateField } from '@/components/ui/date-field';
import { Input } from '@/components/ui/input';

export const patientStepCopy = {
  firstName: 'Nombre',
  lastName: 'Apellido',
  birthDate: 'Fecha de nacimiento',
  email: 'Email',
  phone: 'Teléfono',
  phoneHint: 'Con el prefijo internacional si no es de este país.',
  emailHint: 'Te enviaremos ahí la confirmación.',
  existingEmailHint: 'El mismo que tiene la clínica en tu ficha.',
  consentError: 'Para reservar como paciente nuevo tienes que aceptar el tratamiento de tus datos.',
  readPolicy: 'Leer la política de tratamiento de datos',
  required: (label: string) => `Escribe tu ${label.toLowerCase()}.`,
  birthRequired: 'Escribe tu fecha de nacimiento completa.',
  emailInvalid: 'Revisa el email: le falta algo (por ejemplo, la @).',
  phoneInvalid: 'Escribe el teléfono completo, con al menos 7 cifras.',
  book: 'Reservar la cita',
  request: 'Enviar la solicitud',
  requestHint: 'La clínica revisará tu solicitud y te confirmará la cita por email.',
  directHint: 'La cita queda reservada al enviar.',
  noNewTitle: 'Llama a la clínica para tu primera cita',
  noNewMessage:
    'La clínica todavía no puede recibir pacientes nuevos por internet. Llámala para pedir tu cita, o vuelve atrás si ya eres paciente.',
  identifyLead:
    'Escribe tus datos tal como los tiene la clínica. Te enviaremos un código de 6 cifras a tu email para comprobar que eres tú.',
  sendCode: 'Enviarme el código',
  sendCodeError: 'No pudimos enviar el código. Revisa tu conexión e intenta de nuevo.',
  codeLabel: 'Código de 6 cifras',
  codeInvalid: 'El código tiene 6 cifras.',
  verifyAndBook: 'Verificar y reservar',
  verifyAndRequest: 'Verificar y enviar la solicitud',
  verifyError: 'No pudimos comprobar el código. Revisa tu conexión e intenta de nuevo.',
  resend: 'Pedir otro código',
  resent: 'Te enviamos un código nuevo si los datos coinciden.',
  changeData: 'Cambiar mis datos',
  verifiedTitle: 'Ya comprobamos que eres tú',
  verifiedLead: 'Puedes reservar la nueva hora sin volver a escribir tus datos.',
  retryTitle: 'Tus datos ya están guardados',
  retryLead: 'Solo falta reservar la nueva hora.',
};

export interface NewPatientDraft {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  email: string;
  phone: string;
  consent: boolean;
}

export interface ExistingPatientDraft {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  email: string;
}

export const EMPTY_NEW_PATIENT: NewPatientDraft = {
  firstName: '',
  lastName: '',
  birthDate: null,
  email: '',
  phone: '',
  consent: false,
};
export const EMPTY_EXISTING_PATIENT: ExistingPatientDraft = { firstName: '', lastName: '', birthDate: null, email: '' };

type Errors = Partial<Record<'firstName' | 'lastName' | 'birthDate' | 'email' | 'phone' | 'consent' | 'code', string>>;

/**
 * Campo trampa anti-bots (`website`): fuera de la pantalla, oculto para los
 * lectores de pantalla (`aria-hidden`) y fuera del orden del tabulador. Nunca
 * `display:none` (algunos bots lo detectan y lo saltan): una persona no lo ve
 * ni lo alcanza; un bot que rellena todo, sí.
 */
export function HoneypotField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-auto size-px overflow-hidden">
      <label htmlFor="booking-website">Sitio web</label>
      <input
        id="booking-website"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function required(errors: Errors, key: keyof Errors, value: string, label: string) {
  if (!value.trim()) errors[key] = patientStepCopy.required(label);
}

/** El paso «Tus datos» de /reservar: paciente nuevo o existente (con código por email). */
export function BookingPatientStep({
  config,
  kind,
  mode,
  today,
  newDraft,
  onNewDraft,
  existingDraft,
  onExistingDraft,
  sessionToken,
  honeypot,
  onHoneypot,
  antiBot,
  submitting,
  submitError,
  onSubmit,
  onVerified,
}: {
  config: PublicBookingConfig;
  kind: OnlinePatientKind;
  mode: OnlineBookingMode;
  today: string;
  newDraft: NewPatientDraft;
  onNewDraft: (next: NewPatientDraft) => void;
  existingDraft: ExistingPatientDraft;
  onExistingDraft: (next: ExistingPatientDraft) => void;
  /** Sesión ya abierta (existente verificado, o reintento de un nuevo tras un 409). */
  sessionToken: string | null;
  honeypot: string;
  onHoneypot: (value: string) => void;
  /** Los campos anti-bots, esperando lo que falte del tiempo mínimo de rellenado. */
  antiBot: () => Promise<AntiBotFields>;
  submitting: boolean;
  submitError: string | null;
  /** Reserva: con los datos del nuevo, o `null` cuando va con la sesión. */
  onSubmit: (newPatient: NewPatientDraft | null) => void;
  /** El existente verificó el código: la vista guarda la sesión (en memoria) y reserva. */
  onVerified: (sessionToken: string) => void;
}) {
  const id = useId();
  const fid = (name: string) => `${id}-${name}`;
  const [errors, setErrors] = useState<Errors>({});
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | 'resend' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const [focusField, setFocusField] = useState<{ key: string } | null>(null);
  const actionLabel = mode === 'DIRECT' ? patientStepCopy.book : patientStepCopy.request;
  const modeHint = mode === 'DIRECT' ? patientStepCopy.directHint : patientStepCopy.requestHint;

  useEffect(() => {
    if (!focusField) return;
    document.getElementById(fid(focusField.key))?.focus();
    // `fid` deriva de `useId`, estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusField]);

  useEffect(() => {
    if (verificationId) codeRef.current?.focus();
  }, [verificationId]);

  function showErrors(found: Errors): boolean {
    setErrors(found);
    const order: (keyof Errors)[] = ['firstName', 'lastName', 'birthDate', 'email', 'phone', 'consent', 'code'];
    const first = order.find((k) => found[k]);
    if (first) setFocusField({ key: first });
    return Boolean(first);
  }

  // ── Con sesión (verificado, o reintento tras un hueco ocupado) ────────────
  if (sessionToken) {
    const isRetry = kind === 'NEW';
    return (
      <div className="flex flex-col gap-4">
        <Callout tone="success" icon={ShieldCheck} title={isRetry ? patientStepCopy.retryTitle : patientStepCopy.verifiedTitle}>
          {isRetry ? patientStepCopy.retryLead : patientStepCopy.verifiedLead}
        </Callout>
        <p className="text-sm text-muted">{modeHint}</p>
        <Button type="button" size="lg" className="h-12 w-full" loading={submitting} onClick={() => onSubmit(null)}>
          {actionLabel}
        </Button>
        {submitError ? <InlineError>{submitError}</InlineError> : null}
      </div>
    );
  }

  // ── Paciente nuevo ─────────────────────────────────────────────────────────
  if (kind === 'NEW') {
    if (!config.newPatientsAllowed || !config.privacyPolicy) {
      return <PublicNotice icon={PhoneCall} title={patientStepCopy.noNewTitle} message={patientStepCopy.noNewMessage} />;
    }
    const policy = config.privacyPolicy;
    const d = newDraft;
    const set = (patch: Partial<NewPatientDraft>) => {
      onNewDraft({ ...d, ...patch });
      const keys = Object.keys(patch) as (keyof Errors)[];
      if (keys.some((k) => errors[k])) setErrors((prev) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, undefined])) }));
    };
    const submitNew = (e: React.FormEvent) => {
      e.preventDefault();
      const found: Errors = {};
      required(found, 'firstName', d.firstName, patientStepCopy.firstName);
      required(found, 'lastName', d.lastName, patientStepCopy.lastName);
      if (!d.birthDate) found.birthDate = patientStepCopy.birthRequired;
      if (!d.email.trim()) found.email = patientStepCopy.required(patientStepCopy.email);
      else if (!looksLikeEmail(d.email)) found.email = patientStepCopy.emailInvalid;
      if (!d.phone.trim()) found.phone = patientStepCopy.required(patientStepCopy.phone);
      else if (phoneDigitCount(d.phone) < 7) found.phone = patientStepCopy.phoneInvalid;
      if (!d.consent) found.consent = patientStepCopy.consentError;
      if (showErrors(found)) return;
      onSubmit(d);
    };
    return (
      <form onSubmit={submitNew} noValidate className="relative flex flex-col gap-4" data-testid="booking-new-form">
        <HoneypotField value={honeypot} onChange={onHoneypot} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id={fid('firstName')} label={patientStepCopy.firstName} value={d.firstName} error={errors.firstName} autoComplete="given-name" onChange={(v) => set({ firstName: v })} />
          <TextField id={fid('lastName')} label={patientStepCopy.lastName} value={d.lastName} error={errors.lastName} autoComplete="family-name" onChange={(v) => set({ lastName: v })} />
        </div>
        <FormField htmlFor={fid('birthDate')} label={patientStepCopy.birthDate} error={errors.birthDate}>
          <DateField
            id={fid('birthDate')}
            value={d.birthDate}
            onChange={(v) => set({ birthDate: v })}
            max={today}
            showAge
            isInvalid={Boolean(errors.birthDate)}
            aria-describedby={errors.birthDate ? fieldErrorId(fid('birthDate')) : undefined}
          />
        </FormField>
        <TextField id={fid('email')} label={patientStepCopy.email} hint={patientStepCopy.emailHint} type="email" inputMode="email" autoComplete="email" value={d.email} error={errors.email} onChange={(v) => set({ email: v })} />
        <TextField id={fid('phone')} label={patientStepCopy.phone} hint={patientStepCopy.phoneHint} type="tel" inputMode="tel" autoComplete="tel" value={d.phone} error={errors.phone} onChange={(v) => set({ phone: v })} />
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-3">
          <Checkbox
            id={fid('consent')}
            label={<span className="whitespace-pre-line">{policy.generalText}</span>}
            checked={d.consent}
            error={errors.consent}
            onChange={(e) => set({ consent: e.target.checked })}
          />
          <details className="group text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center rounded-sm font-medium text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text sm:min-h-8">
              {patientStepCopy.readPolicy}
            </summary>
            <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-line rounded-md bg-surface-sunken p-3 text-ink" tabIndex={0}>
              {policy.policyText}
            </div>
          </details>
        </div>
        <p className="text-sm text-muted">{modeHint}</p>
        <Button type="submit" size="lg" className="h-12 w-full" loading={submitting}>
          {actionLabel}
        </Button>
        {submitError ? <InlineError>{submitError}</InlineError> : null}
      </form>
    );
  }

  // ── Paciente existente: datos → código → sesión ───────────────────────────
  const x = existingDraft;
  const setX = (patch: Partial<ExistingPatientDraft>) => {
    onExistingDraft({ ...x, ...patch });
    setErrors({});
    setLocalError(null);
  };

  async function sendCode(again: boolean) {
    setLocalError(null);
    setResent(false);
    setBusy(again ? 'resend' : 'send');
    try {
      const anti = await antiBot();
      const res = await requestBookingCode(
        { firstName: x.firstName.trim(), lastName: x.lastName.trim(), birthDate: x.birthDate ?? '', email: x.email.trim() },
        anti,
      );
      setVerificationId(res.verificationId);
      setCodeMessage(res.message);
      setCode('');
      if (again) setResent(true);
    } catch (err) {
      setLocalError(apiErrorMessage(err, patientStepCopy.sendCodeError));
    } finally {
      setBusy(null);
    }
  }

  const submitIdentify = (e: React.FormEvent) => {
    e.preventDefault();
    const found: Errors = {};
    required(found, 'firstName', x.firstName, patientStepCopy.firstName);
    required(found, 'lastName', x.lastName, patientStepCopy.lastName);
    if (!x.birthDate) found.birthDate = patientStepCopy.birthRequired;
    if (!x.email.trim()) found.email = patientStepCopy.required(patientStepCopy.email);
    else if (!looksLikeEmail(x.email)) found.email = patientStepCopy.emailInvalid;
    if (showErrors(found)) return;
    void sendCode(false);
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeCode(code);
    if (!isValidCode(clean)) {
      showErrors({ code: patientStepCopy.codeInvalid });
      return;
    }
    if (!verificationId) return;
    setLocalError(null);
    setBusy('verify');
    try {
      const session = await verifyBookingCode(verificationId, clean);
      onVerified(session.sessionToken);
    } catch (err) {
      // 400 uniforme: incorrecto, caducado, usado o bloqueado (la API no dice cuál).
      setErrors({ code: apiErrorMessage(err, patientStepCopy.verifyError) });
      setFocusField({ key: 'code' });
    } finally {
      setBusy(null);
    }
  };

  if (verificationId) {
    return (
      <form onSubmit={submitCode} noValidate className="flex flex-col gap-4" data-testid="booking-code-form">
        <Callout tone="info" icon={MailCheck} role="status">
          {codeMessage}
        </Callout>
        <FormField htmlFor={fid('code')} label={patientStepCopy.codeLabel} error={errors.code}>
          <Input
            ref={codeRef}
            id={fid('code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={9}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErrors({});
            }}
            aria-invalid={errors.code ? true : undefined}
            className="h-12 text-center text-lg tracking-[0.4em] tabular-nums"
          />
        </FormField>
        <p className="text-sm text-muted">{modeHint}</p>
        <Button type="submit" size="lg" className="h-12 w-full" loading={busy === 'verify' || submitting}>
          {mode === 'DIRECT' ? patientStepCopy.verifyAndBook : patientStepCopy.verifyAndRequest}
        </Button>
        {submitError ? <InlineError>{submitError}</InlineError> : null}
        {localError ? <InlineError>{localError}</InlineError> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="ghost" className="max-sm:min-h-11" loading={busy === 'resend'} disabled={busy !== null} onClick={() => void sendCode(true)}>
            {patientStepCopy.resend}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="max-sm:min-h-11"
            disabled={busy !== null}
            onClick={() => {
              setVerificationId(null);
              setCode('');
              setErrors({});
              setFocusField({ key: 'firstName' });
            }}
          >
            {patientStepCopy.changeData}
          </Button>
        </div>
        <p role="status" className={resent ? 'text-sm text-success-text' : 'sr-only'}>
          {resent ? patientStepCopy.resent : ''}
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submitIdentify} noValidate className="relative flex flex-col gap-4" data-testid="booking-identify-form">
      <HoneypotField value={honeypot} onChange={onHoneypot} />
      <p className="text-sm text-ink">{patientStepCopy.identifyLead}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={fid('firstName')} label={patientStepCopy.firstName} value={x.firstName} error={errors.firstName} autoComplete="given-name" onChange={(v) => setX({ firstName: v })} />
        <TextField id={fid('lastName')} label={patientStepCopy.lastName} value={x.lastName} error={errors.lastName} autoComplete="family-name" onChange={(v) => setX({ lastName: v })} />
      </div>
      <FormField htmlFor={fid('birthDate')} label={patientStepCopy.birthDate} error={errors.birthDate}>
        <DateField
          id={fid('birthDate')}
          value={x.birthDate}
          onChange={(v) => setX({ birthDate: v })}
          max={today}
          isInvalid={Boolean(errors.birthDate)}
          aria-describedby={errors.birthDate ? fieldErrorId(fid('birthDate')) : undefined}
        />
      </FormField>
      <TextField id={fid('email')} label={patientStepCopy.email} hint={patientStepCopy.existingEmailHint} type="email" inputMode="email" autoComplete="email" value={x.email} error={errors.email} onChange={(v) => setX({ email: v })} />
      <Button type="submit" size="lg" className="h-12 w-full" loading={busy === 'send'}>
        {patientStepCopy.sendCode}
      </Button>
      {localError ? <InlineError>{localError}</InlineError> : null}
    </form>
  );
}

function TextField({
  id,
  label,
  hint,
  value,
  error,
  onChange,
  type = 'text',
  inputMode,
  autoComplete,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel';
  inputMode?: 'text' | 'email' | 'tel';
  autoComplete?: string;
}) {
  return (
    <FormField htmlFor={id} label={label} hint={hint} error={error}>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        maxLength={type === 'email' ? 254 : type === 'tel' ? 40 : 80}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      />
    </FormField>
  );
}
