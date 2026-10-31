'use client';
import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { requestPasswordReset } from '@/lib/auth/password-reset-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { AUTH_FORM_CLASS, AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS } from './auth-layout';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  intro:
    'Escribe el correo con el que entras a la clínica y te enviaremos un enlace para crear una contraseña nueva.',
  emailLabel: 'Correo electrónico',
  invalidEmail: 'Escribe un correo electrónico válido (por ejemplo, nombre@clinica.com).',
  submit: 'Enviar enlace',
  submitting: 'Enviando…',
  genericError: 'No pudimos enviar la solicitud.',
  sentTitle: 'Revisa tu correo',
  // Mismo texto exista o no la cuenta: la pantalla no puede revelar más que la API.
  sentFallback:
    'Si el correo pertenece a una cuenta de esta clínica, te enviamos un enlace para restablecer la contraseña.',
  sentHint: 'El enlace vale 30 minutos. Si no llega en unos minutos, revisa la carpeta de spam.',
  sendAgain: 'Enviar otro enlace',
  backToLogin: 'Volver a iniciar sesión',
};

const ERROR_ID = 'forgot-password-error';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Formulario de `/olvide-contrasena` (DX-010). */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError(copy.invalidEmail);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await requestPasswordReset(trimmed);
      setSentMessage(res.message || copy.sentFallback);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: copy.genericError }));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentMessage) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MailCheck className="size-5 shrink-0 text-success-text" aria-hidden />
          <h2 className="t-title text-ink">{copy.sentTitle}</h2>
        </div>
        <p className="text-sm text-muted">{sentMessage}</p>
        <p className="text-sm text-muted">{copy.sentHint}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/login" className={AUTH_LINK_CLASS}>
            {copy.backToLogin}
          </Link>
          <Button type="button" variant="secondary" onClick={() => setSentMessage(null)}>
            {copy.sendAgain}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={AUTH_FORM_CLASS}>
      <p className="text-sm text-muted">{copy.intro}</p>
      <FormField htmlFor="forgot-password-email" label={copy.emailLabel}>
        <Input
          id="forgot-password-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
      <Link href="/login" className={`self-center ${AUTH_LINK_CLASS}`}>
        {copy.backToLogin}
      </Link>
    </form>
  );
}
