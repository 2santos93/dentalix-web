'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/lib/auth/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { FORGOT_PASSWORD_PATH } from '@/lib/auth/password-reset-api';
import { loginLockedMessage, waitClock } from '@/lib/auth/login-lockout';

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
};

const ERROR_ID = 'login-error';
const LOCK_ID = 'login-lock';

// El refresh llega en la cookie HttpOnly (DX-062): el body solo trae el access.
interface LoginResponse {
  accessToken: string;
}

/**
 * `passwordReset`: se llega desde «Restablecer contraseña» (DX-010) y se
 * muestra el aviso de éxito.
 */
export function LoginForm({ passwordReset = false }: { passwordReset?: boolean } = {}) {
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
    if (locked) return;
    setError(null);
    setLockEnded(false);
    setSubmitting(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setAccessToken(res.accessToken);
      router.push('/patients');
    } catch (err) {
      // Demasiados intentos (DX-048): mismo aviso exista o no la cuenta, con la
      // espera de `Retry-After`. Sin la cabecera cae en el texto genérico.
      if (err instanceof ApiError && err.status === 429 && err.retryAfterSeconds) {
        const t = Date.now();
        setNow(t);
        setLockedUntil(t + err.retryAfterSeconds * 1000);
        return;
      }
      setError(
        apiErrorMessage(err, {
          fallback: copy.genericError,
          // 403 («Origin not allowed»): no hay administrador a quien pedir acceso.
          byStatus: { 401: copy.invalidCredentials, 403: copy.genericError },
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const describedBy = error ? ERROR_ID : locked ? LOCK_ID : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {passwordReset ? (
        <p
          role="status"
          className="flex items-start gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{copy.passwordResetDone}</span>
        </p>
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
        <div className="relative">
          <Input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={submitting}
            aria-pressed={showPassword}
            aria-label={showPassword ? copy.hidePassword : copy.showPassword}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </FormField>
      <Link
        href={FORGOT_PASSWORD_PATH}
        className="-mt-2 self-end text-sm font-medium text-primary hover:underline"
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
          <p className="flex flex-wrap items-start gap-x-1.5 gap-y-1 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{loginLockedMessage(remaining)}</span>
            <span
              aria-hidden
              title={copy.lockClockLabel}
              className="ml-auto tabular-nums"
            >
              {waitClock(remaining)}
            </span>
          </p>
        ) : lockEnded ? (
          <p className="text-sm text-muted">{copy.lockEnded}</p>
        ) : null}
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={submitting || locked}
        className="mt-1 w-full"
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
