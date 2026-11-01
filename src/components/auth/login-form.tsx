'use client';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Loader2 } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/lib/auth/auth-store';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { FORGOT_PASSWORD_PATH } from '@/lib/auth/password-reset-api';
import { loginLockedMessage, waitClock } from '@/lib/auth/login-lockout';
import { BREAK_GLASS_REQUIRED, MFA_COOLDOWN, MFA_NOT_ENROLLED } from '@/lib/auth/break-glass';
import {
  MFA_CHALLENGE_EXPIRED,
  MFA_ENROLLMENT_REQUIRED,
  verifyLoginMfa,
  type MfaChallenge,
  type SecondFactor,
} from '@/lib/auth/mfa-api';
import { BreakGlassStep } from './break-glass-step';
import { MfaEnrollStep } from './mfa-enroll-step';
import { MfaLoginStep } from './mfa-login-step';
import { AUTH_FORM_CLASS, AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS } from './auth-layout';
import { PasswordInput } from './password-input';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  emailLabel: 'Correo electrónico',
  passwordLabel: 'Contraseña',
  showPassword: 'Mostrar clave',
  hidePassword: 'Ocultar clave',
  submit: 'Iniciar sesión',
  submitting: 'Iniciando…',
  genericError: 'No pudimos iniciar sesión. Intenta de nuevo.',
  // 401 del login: credenciales, no sesión caducada (la API dice «Invalid credentials»).
  invalidCredentials: 'Correo o contraseña incorrectos.',
  forgotPassword: '¿Olvidaste tu contraseña?',
  passwordResetDone:
    'Listo: tu contraseña se cambió y cerramos la sesión en todos los dispositivos. Inicia sesión con la nueva.',
  // DX-048: fin de la espera tras demasiados intentos.
  lockEnded: 'Ya puedes volver a intentarlo.',
  lockClockLabel: 'Tiempo restante',
  // SEC-008: acceso de soporte de un superadmin sin membresía.
  mfaNotEnrolled:
    'Para entrar a una clínica como soporte, primero activa la verificación en dos pasos en el área de plataforma de Dentalix. Intenta de nuevo cuando esté activa.',
  mfaCooldown:
    'Activaste la verificación en dos pasos hace poco: por seguridad, el acceso de soporte a las clínicas aún no está disponible (lo verás en el área de plataforma). Si no la activaste tú, avisa al equipo de seguridad de Dentalix.',
  badCode:
    'El código no es correcto o ya se usó. Espera al siguiente código de la app e intenta de nuevo.',
  // DX-021: aceptar no abre sesión si la cuenta necesita segundo factor.
  invitationAccepted:
    'Invitación aceptada. Inicia sesión para entrar con tu verificación en dos pasos.',
  // DX-021: el token del segundo paso caducó (5 min) o ya se usó.
  mfaExpired: 'El paso de verificación caducó. Inicia sesión de nuevo.',
};

const ERROR_ID = 'login-error';
const LOCK_ID = 'login-lock';

// El refresh llega en la cookie HttpOnly (DX-062): el body solo trae el access.
// En un acceso de soporte (SEC-008) no hay refresh: `breakGlass` y `expiresAt`.
// DX-021: con segundo factor, ningún token de sesión: solo `MfaChallenge`.
type LoginResponse =
  | { accessToken: string; breakGlass?: boolean; expiresAt?: string }
  | MfaChallenge;

interface BreakGlassInput {
  mfaCode: string;
  reason: string;
}

/**
 * `passwordReset`: se llega desde «Restablecer contraseña» (DX-010) y se
 * muestra el aviso de éxito.
 */
export function LoginForm({
  passwordReset = false,
  invitationAccepted = false,
}: { passwordReset?: boolean; invitationAccepted?: boolean } = {}) {
  const router = useRouter();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // DX-048: 429 con Retry-After → cuenta atrás hasta `lockedUntil` (ms).
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lockEnded, setLockEnded] = useState(false);
  // SEC-008: la API pidió código TOTP y motivo (superadmin sin membresía).
  const [breakGlassStep, setBreakGlassStep] = useState(false);
  // DX-021: la contraseña valió y falta el segundo factor (o su alta forzada).
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);

  const remaining =
    lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = lockedUntil !== null && remaining > 0;

  useEffect(() => {
    if (lockedUntil === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) {
        setLockedUntil(null);
        setLockEnded(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await login();
  }

  const enter = (accessToken: string) => {
    setAccessToken(accessToken);
    router.push('/patients');
  };

  /** Vuelta a la contraseña con el aviso de que el paso caducó. */
  const mfaExpired = useCallback(() => {
    setMfaChallenge(null);
    setError(copy.mfaExpired);
  }, []);

  /** Espera por demasiados intentos (429 con `Retry-After`). `true` si lo era. */
  function startLock(err: unknown): boolean {
    if (!(err instanceof ApiError && err.status === 429 && err.retryAfterSeconds)) return false;
    const t = Date.now();
    setNow(t);
    setLockedUntil(t + err.retryAfterSeconds * 1000);
    return true;
  }

  /** DX-021: `POST /auth/login/mfa` con el código o uno de recuperación. */
  async function verifyMfa(factor: SecondFactor) {
    if (locked || !mfaChallenge) return;
    setError(null);
    setLockEnded(false);
    setSubmitting(true);
    try {
      const res = await verifyLoginMfa(mfaChallenge.mfaToken, factor);
      enter(res.accessToken);
    } catch (err) {
      if (startLock(err)) return;
      if (err instanceof ApiError && err.code === MFA_CHALLENGE_EXPIRED) {
        mfaExpired();
        return;
      }
      setError(apiErrorMessage(err, { fallback: copy.genericError, byStatus: { 401: copy.badCode } }));
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * `POST /auth/login`. Con `breakGlass` añade el código y el motivo del paso
   * de soporte (SEC-008); el email y la contraseña son los del primer paso.
   */
  async function login(breakGlass?: BreakGlassInput) {
    if (locked) return;
    setError(null);
    setLockEnded(false);
    setSubmitting(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: breakGlass
          ? {
              email,
              password,
              mfaCode: breakGlass.mfaCode,
              breakGlassReason: breakGlass.reason,
            }
          : { email, password },
      });
      if ('mfa' in res) {
        setPassword('');
        setMfaChallenge(res);
        return;
      }
      enter(res.accessToken);
    } catch (err) {
      // Demasiados intentos (DX-048): mismo aviso exista o no la cuenta, con la
      // espera de `Retry-After`. Sin la cabecera cae en el texto genérico.
      if (startLock(err)) return;
      // SEC-008: solo llegan tras una contraseña correcta de superadmin.
      if (err instanceof ApiError && err.code === BREAK_GLASS_REQUIRED) {
        setBreakGlassStep(true);
        return;
      }
      if (err instanceof ApiError && err.code === MFA_NOT_ENROLLED) {
        setBreakGlassStep(false);
        setError(copy.mfaNotEnrolled);
        return;
      }
      if (err instanceof ApiError && err.code === MFA_COOLDOWN) {
        setBreakGlassStep(false);
        setError(copy.mfaCooldown);
        return;
      }
      setError(
        apiErrorMessage(err, {
          fallback: copy.genericError,
          // 403 («Origin not allowed»): no hay administrador a quien pedir acceso.
          // En el paso de soporte, un 401 es el código (la contraseña ya valió).
          byStatus: {
            401: breakGlass ? copy.badCode : copy.invalidCredentials,
            403: copy.genericError,
          },
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (mfaChallenge?.mfa === MFA_ENROLLMENT_REQUIRED) {
    return (
      <MfaEnrollStep
        mfaToken={mfaChallenge.mfaToken}
        onDone={enter}
        onExpired={mfaExpired}
      />
    );
  }

  if (mfaChallenge) {
    return (
      <div className={AUTH_FORM_CLASS}>
        <MfaLoginStep
          submitting={submitting}
          locked={locked}
          error={error}
          onSubmit={(factor) => void verifyMfa(factor)}
          onBack={() => {
            setMfaChallenge(null);
            setError(null);
          }}
        />
        <div aria-live="polite" aria-atomic="true">
          {locked ? (
            <p className="text-sm font-medium text-warning-text">{loginLockedMessage(remaining)}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (breakGlassStep) {
    return (
      <div className={AUTH_FORM_CLASS}>
        <BreakGlassStep
          submitting={submitting}
          locked={locked}
          error={error}
          onSubmit={(input) => void login(input)}
          onBack={() => {
            setBreakGlassStep(false);
            setError(null);
          }}
        />
        <div aria-live="polite" aria-atomic="true">
          {locked ? (
            <p className="text-sm font-medium text-warning-text">{loginLockedMessage(remaining)}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const describedBy = error ? ERROR_ID : locked ? LOCK_ID : undefined;

  return (
    <form onSubmit={handleSubmit} className={AUTH_FORM_CLASS}>
      {passwordReset ? (
        <Callout tone="success" role="status">
          {copy.passwordResetDone}
        </Callout>
      ) : null}
      {invitationAccepted ? (
        <Callout tone="success" role="status">
          {copy.invitationAccepted}
        </Callout>
      ) : null}
      <FormField htmlFor="login-email" label={copy.emailLabel}>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>

      <FormField htmlFor="login-password" label={copy.passwordLabel}>
        <PasswordInput
          id="login-password"
          name="password"
          autoComplete="current-password"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          visible={showPassword}
          onVisibleChange={setShowPassword}
          showLabel={copy.showPassword}
          hideLabel={copy.hidePassword}
        />
      </FormField>
      <Link
        href={FORGOT_PASSWORD_PATH}
        className={`-mt-2 self-end ${AUTH_LINK_CLASS}`}
      >
        {copy.forgotPassword}
      </Link>

      {error ? (
        <InlineError id={ERROR_ID} variant="summary">
          {error}
        </InlineError>
      ) : null}

      {/* Región viva siempre montada: el lector de pantalla anuncia el aviso al
          aparecer y cada vez que cambian los minutos, no cada segundo (el reloj
          m:ss es solo visual). */}
      <div id={LOCK_ID} aria-live="polite" aria-atomic="true">
        {locked ? (
          // `role="none"`: la región viva es este contenedor; un `status`
          // dentro anunciaría el aviso dos veces.
          <Callout tone="warning" role="none" icon={Clock}>
            {/* El primer `span` es el aviso (e2e/login-lockout lo lee así); el reloj, aparte. */}
            <div className="flex flex-wrap items-start gap-x-1.5 gap-y-1">
              <span className="min-w-0 flex-1">{loginLockedMessage(remaining)}</span>
              <span aria-hidden title={copy.lockClockLabel} className="ml-auto tabular-nums">
                {waitClock(remaining)}
              </span>
            </div>
          </Callout>
        ) : lockEnded ? (
          <p className="text-sm text-muted">{copy.lockEnded}</p>
        ) : null}
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={submitting || locked}
        className={AUTH_SUBMIT_CLASS}
      >
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
