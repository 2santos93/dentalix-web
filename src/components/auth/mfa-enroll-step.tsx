'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ApiError } from '@/lib/api/client';
import { normalizeTotpCode } from '@/lib/auth/break-glass';
import { loginLockedMessage } from '@/lib/auth/login-lockout';
import {
  MFA_CHALLENGE_EXPIRED,
  confirmLoginMfaEnrollment,
  startLoginMfaEnrollment,
  type MfaEnrollment,
} from '@/lib/auth/mfa-api';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { AUTH_FORM_CLASS, AUTH_SUBMIT_CLASS } from './auth-layout';
import { MfaSecretPanel } from './mfa-secret-panel';
import { RecoveryCodesPanel } from './recovery-codes-panel';

const copy = {
  required:
    'Para entrar necesitas activar la verificación en dos pasos: tu cuenta la tiene obligatoria.',
  loadError: 'No pudimos preparar la activación.',
  retry: 'Reintentar',
  codeLabel: 'Código de la app',
  codeInvalid: 'El código tiene 6 dígitos.',
  submit: 'Activar y entrar',
  submitting: 'Activando…',
  confirmError: 'No pudimos activar la verificación. Intenta de nuevo.',
  continue: 'Entrar a Dentalix',
  // DX-021-bis: alta de un superadmin.
  emailIntro:
    'Te enviamos un código a tu correo. Compruébalo para ver la clave: la contraseña sola no basta para activar la verificación.',
  emailLabel: 'Código del correo',
  emailInvalid: 'El código tiene 8 dígitos.',
  emailSubmit: 'Continuar',
  emailSubmitting: 'Comprobando…',
};

/**
 * Alta forzada en el login (DX-021): quien tiene el MFA obligatorio y aún no
 * lo activó no recibe sesión hasta terminar aquí. El access token se guarda
 * al pulsar «Entrar», tras ver los códigos de recuperación.
 */
export function MfaEnrollStep({
  mfaToken,
  emailCodeRequired = false,
  onDone,
  onExpired,
}: {
  mfaToken: string;
  /** La API le envió un código al correo que exige para enseñar la clave. */
  emailCodeRequired?: boolean;
  onDone: (accessToken: string) => void;
  onExpired: () => void;
}) {
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ accessToken: string; codes: string[] } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (emailCodeRequired) return;
    let cancelled = false;
    startLoginMfaEnrollment(mfaToken)
      .then((res) => {
        if (!cancelled) setEnrollment(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === MFA_CHALLENGE_EXPIRED) onExpired();
        else setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [mfaToken, emailCodeRequired, attempt, onExpired]);

  const normalized = normalizeTotpCode(code);
  const codeError = touched && !normalized ? copy.codeInvalid : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!normalized || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await confirmLoginMfaEnrollment(mfaToken, normalized);
      setSession({ accessToken: res.accessToken, codes: res.recoveryCodes });
    } catch (err) {
      if (err instanceof ApiError && err.code === MFA_CHALLENGE_EXPIRED) {
        onExpired();
      } else if (err instanceof ApiError && err.status === 429 && err.retryAfterSeconds) {
        setError(loginLockedMessage(err.retryAfterSeconds));
      } else {
        setError(apiErrorMessage(err, copy.confirmError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (session) {
    return (
      <div className={AUTH_FORM_CLASS}>
        <RecoveryCodesPanel codes={session.codes} saved={saved} onSavedChange={setSaved} />
        <Button
          type="button"
          size="lg"
          disabled={!saved}
          className={AUTH_SUBMIT_CLASS}
          onClick={() => onDone(session.accessToken)}
        >
          {copy.continue}
        </Button>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className={AUTH_FORM_CLASS}>
        <InlineError id="login-mfa-enroll-error" variant="summary">
          {loadError}
        </InlineError>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setLoadError(null);
            setAttempt((n) => n + 1);
          }}
        >
          {copy.retry}
        </Button>
      </div>
    );
  }
  if (!enrollment && emailCodeRequired) {
    return (
      <MfaEmailCodeStep mfaToken={mfaToken} onVerified={setEnrollment} onExpired={onExpired} />
    );
  }
  if (!enrollment) return <Skeleton className="h-80 w-full" aria-label={copy.submitting} />;

  const id = 'login-mfa-enroll-code';
  return (
    <form onSubmit={handleSubmit} className={AUTH_FORM_CLASS} noValidate>
      <Callout tone="info" role="note">
        {copy.required}
      </Callout>
      <MfaSecretPanel secret={enrollment.secret} otpauthUri={enrollment.otpauthUri} />
      <FormField htmlFor={id} label={copy.codeLabel} error={codeError}>
        <Input
          id={id}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          disabled={submitting}
          value={code}
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? fieldErrorId(id) : undefined}
          onChange={(e) => setCode(e.target.value)}
          className="tabular-nums tracking-widest"
        />
      </FormField>
      {error ? (
        <InlineError id="login-mfa-enroll-error" variant="summary">
          {error}
        </InlineError>
      ) : null}
      <Button type="submit" size="lg" disabled={submitting} className={AUTH_SUBMIT_CLASS}>
        {submitting ? (
          <>
            <Loader2 className="animate-spin" /> {copy.submitting}
          </>
        ) : (
          copy.submit
        )}
      </Button>
    </form>
  );
}

/** Primer paso del alta de un superadmin: el código de su correo abre la clave. */
function MfaEmailCodeStep({
  mfaToken,
  onVerified,
  onExpired,
}: {
  mfaToken: string;
  onVerified: (enrollment: MfaEnrollment) => void;
  onExpired: () => void;
}) {
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.replace(/\s/g, '');
  const valid = /^\d{8}$/.test(clean);
  const fieldError = touched && !valid ? copy.emailInvalid : null;
  const id = 'login-mfa-email-code';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      onVerified(await startLoginMfaEnrollment(mfaToken, clean));
    } catch (err) {
      if (err instanceof ApiError && err.code === MFA_CHALLENGE_EXPIRED) {
        onExpired();
      } else if (err instanceof ApiError && err.status === 429 && err.retryAfterSeconds) {
        setError(loginLockedMessage(err.retryAfterSeconds));
      } else {
        setError(apiErrorMessage(err, copy.loadError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={AUTH_FORM_CLASS} noValidate>
      <Callout tone="info" role="note">
        {copy.emailIntro}
      </Callout>
      <FormField htmlFor={id} label={copy.emailLabel} error={fieldError}>
        <Input
          id={id}
          name="emailCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={9}
          required
          disabled={submitting}
          value={code}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? fieldErrorId(id) : undefined}
          onChange={(e) => setCode(e.target.value)}
          className="tabular-nums tracking-widest"
        />
      </FormField>
      {error ? (
        <InlineError id="login-mfa-email-error" variant="summary">
          {error}
        </InlineError>
      ) : null}
      <Button type="submit" size="lg" disabled={submitting} className={AUTH_SUBMIT_CLASS}>
        {submitting ? (
          <>
            <Loader2 className="animate-spin" /> {copy.emailSubmitting}
          </>
        ) : (
          copy.emailSubmit
        )}
      </Button>
    </form>
  );
}
