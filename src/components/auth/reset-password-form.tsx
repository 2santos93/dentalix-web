'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  FORGOT_PASSWORD_PATH,
  PASSWORD_RESET_DONE_PARAM,
  checkPasswordResetToken,
  resetPassword,
  type PasswordResetTokenStatus,
} from '@/lib/auth/password-reset-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { AUTH_FORM_CLASS, AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS } from './auth-layout';
import { PasswordInput } from './password-input';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Verificando el enlace…',
  loadError: 'No pudimos verificar el enlace.',
  intro: 'Crea una contraseña nueva. Al guardarla se cerrará tu sesión en todos los dispositivos.',
  passwordLabel: 'Contraseña nueva',
  confirmLabel: 'Repite la contraseña',
  passwordHint: 'Mínimo 8 caracteres.',
  showPassword: 'Mostrar contraseñas',
  hidePassword: 'Ocultar contraseñas',
  tooShort: 'La contraseña debe tener al menos 8 caracteres.',
  tooLong: 'La contraseña no puede tener más de 200 caracteres.',
  mismatch: 'Las contraseñas no coinciden.',
  submit: 'Guardar contraseña',
  submitting: 'Guardando…',
  genericError: 'No pudimos guardar la contraseña.',
  requestNew: 'Pedir un enlace nuevo',
  backToLogin: 'Volver a iniciar sesión',
};

const INVALID_COPY: Record<
  Exclude<PasswordResetTokenStatus, 'VALID'>,
  { title: string; message: string }
> = {
  EXPIRED: {
    title: 'El enlace caducó',
    message:
      'Por seguridad, el enlace para restablecer la contraseña vale 30 minutos. Pide uno nuevo.',
  },
  USED: {
    title: 'Este enlace ya se usó',
    message:
      'Cada enlace sirve una sola vez. Si necesitas cambiar la contraseña otra vez, pide uno nuevo.',
  },
  INVALID: {
    title: 'Enlace no válido',
    message:
      'El enlace no existe, está incompleto o lo reemplazó uno más reciente. Usa el último correo que recibiste o pide un enlace nuevo.',
  },
};

const ERROR_ID = 'reset-password-error';
const HINT_ID = 'reset-password-hint';
const MIN = 8;
const MAX = 200;

/** Estado del enlace que traen los 404/410 de la API al guardar. */
function statusFromError(err: unknown): Exclude<PasswordResetTokenStatus, 'VALID'> | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 404) return 'INVALID';
  if (err.status === 410) {
    return /caduc/i.test(apiErrorMessage(err, { fallback: '' })) ? 'EXPIRED' : 'USED';
  }
  return null;
}

/**
 * Formulario de `/restablecer/[token]` (DX-010). Comprueba el enlace al
 * montar; si no sirve (caducado, usado, inexistente o reemplazado) explica por
 * qué y ofrece pedir otro. Al guardar lleva al login con el aviso de éxito.
 */
export function ResetPasswordForm({ resetToken }: { resetToken: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<PasswordResetTokenStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus(null);
      setLoadError(null);
      try {
        const result = await checkPasswordResetToken(resetToken);
        if (!cancelled) setStatus(result);
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMessage(err, { fallback: copy.loadError }));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [resetToken, reloadKey]);

  function validate(): string | null {
    if (password.length < MIN) return copy.tooShort;
    if (password.length > MAX) return copy.tooLong;
    if (password !== confirm) return copy.mismatch;
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(resetToken, password);
      router.push(`/login?${PASSWORD_RESET_DONE_PARAM}=1`);
    } catch (err) {
      const tokenStatus = statusFromError(err);
      if (tokenStatus) {
        setStatus(tokenStatus);
      } else {
        setError(apiErrorMessage(err, { fallback: copy.genericError }));
      }
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  if (!status) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {copy.loading}
      </p>
    );
  }

  if (status !== 'VALID') {
    const { title, message } = INVALID_COPY[status];
    return (
      <div className="flex flex-col gap-3">
        <h2 className="t-title text-ink">{title}</h2>
        <p className="text-sm text-muted">{message}</p>
        <Button asChild size="lg" className={AUTH_SUBMIT_CLASS}>
          <Link href={FORGOT_PASSWORD_PATH}>{copy.requestNew}</Link>
        </Button>
        <Link href="/login" className={`self-center ${AUTH_LINK_CLASS}`}>
          {copy.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={AUTH_FORM_CLASS}>
      <p className="text-sm text-muted">{copy.intro}</p>
      <FormField
        htmlFor="reset-password-new"
        label={copy.passwordLabel}
        hint={copy.passwordHint}
        hintId={HINT_ID}
      >
        <PasswordInput
          id="reset-password-new"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN}
          maxLength={MAX}
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : HINT_ID}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          visible={showPassword}
          onVisibleChange={setShowPassword}
          showLabel={copy.showPassword}
          hideLabel={copy.hidePassword}
        />
      </FormField>

      <FormField htmlFor="reset-password-confirm" label={copy.confirmLabel}>
        <Input
          id="reset-password-confirm"
          name="confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          maxLength={MAX}
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </FormField>

      {error ? (
        <InlineError id={ERROR_ID} variant="summary">
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
