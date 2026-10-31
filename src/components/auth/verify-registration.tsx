'use client';
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { apiErrorMessage } from '@/lib/api/error-message';
import { clinicLoginHref } from '@/lib/tenant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { AUTH_FORM_CLASS, AUTH_SUBMIT_CLASS } from './auth-layout';

type RegisterVerified = components['schemas']['RegisterVerifiedDto'];

// Copy as constants (i18n-ready) — es first.
const copy = {
  intro:
    'Confirma que este correo es tuyo para crear tu clínica en Dentalix. Por seguridad, escribe la contraseña que elegiste al registrarte.',
  notYou: 'Si no has pedido crear una clínica en Dentalix, cierra esta página: no se creará nada.',
  passwordLabel: 'Contraseña que elegiste al registrarte',
  passwordRequired: 'Escribe la contraseña que elegiste al registrarte.',
  submit: 'Confirmar y crear mi clínica',
  submitting: 'Creando tu clínica…',
  doneTitle: '¡Tu clínica está lista!',
  doneBody: 'Ya puedes iniciar sesión con el correo y la contraseña que elegiste.',
  login: 'Iniciar sesión',
  genericError: 'No pudimos confirmar el registro. Intenta de nuevo.',
};

const ERROR_ID = 'verify-registration-error';

/**
 * DX-029: confirmar el registro desde el enlace del email. Se confirma al
 * enviar el formulario (no al cargar) para que un escáner de enlaces del
 * correo no lo consuma, y con la contraseña del registro: así quien no pidió
 * el alta no puede confirmarla por error en nombre de otro. Los errores
 * (genérico de enlace/contraseña, caducado, subdominio tomado) llegan en
 * español desde la API.
 */
export function VerifyRegistration({ verifyToken }: { verifyToken: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginHref, setLoginHref] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  async function handleConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password) {
      setError(copy.passwordRequired);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<RegisterVerified>('/auth/register/verify', {
        method: 'POST',
        body: { token: verifyToken, password },
      });
      setLoginHref(clinicLoginHref(res.subdomain, window.location));
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loginHref) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <CheckCircle2 className="size-8 text-success-text" aria-hidden="true" />
        <h2 className="t-title text-ink">{copy.doneTitle}</h2>
        <p className="text-sm text-muted">{copy.doneBody}</p>
        <Button asChild size="lg" className={AUTH_SUBMIT_CLASS}>
          <a href={loginHref}>{copy.login}</a>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleConfirm} className={AUTH_FORM_CLASS} noValidate>
      <p className="text-sm text-muted">{copy.intro}</p>
      <FormField htmlFor="verify-registration-password" label={copy.passwordLabel}>
        <Input
          id="verify-registration-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      {error ? (
        <InlineError id={ERROR_ID} variant="summary">
          {error}
        </InlineError>
      ) : null}
      <Button type="submit" size="lg" className={AUTH_SUBMIT_CLASS} disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="animate-spin" /> {copy.submitting}
          </>
        ) : (
          copy.submit
        )}
      </Button>
      <p className="t-caption">{copy.notYou}</p>
    </form>
  );
}
