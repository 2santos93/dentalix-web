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
};

/**
 * Alta forzada en el login (DX-021): quien tiene el MFA obligatorio y aún no
 * lo activó no recibe sesión hasta terminar aquí. El access token se guarda
 * al pulsar «Entrar», tras ver los códigos de recuperación.
 */
export function MfaEnrollStep({
  mfaToken,
  onDone,
  onExpired,
}: {
  mfaToken: string;
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
  }, [mfaToken, attempt, onExpired]);

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
