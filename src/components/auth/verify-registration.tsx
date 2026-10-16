'use client';
import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { apiErrorMessage } from '@/lib/api/error-message';
import { clinicLoginHref } from '@/lib/tenant';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';

type RegisterVerified = components['schemas']['RegisterVerifiedDto'];

// Copy as constants (i18n-ready) — es first.
const copy = {
  intro:
    'Confirma que este correo es tuyo para crear tu clínica en Dentalix. Solo tienes que hacerlo una vez.',
  submit: 'Confirmar y crear mi clínica',
  submitting: 'Creando tu clínica…',
  doneTitle: '¡Tu clínica está lista!',
  doneBody: 'Ya puedes iniciar sesión con el correo y la contraseña que elegiste.',
  login: 'Iniciar sesión',
  genericError: 'No pudimos confirmar el registro. Intenta de nuevo.',
};

const ERROR_ID = 'verify-registration-error';

/**
 * DX-029: confirmar el registro desde el enlace del email. Se confirma con un
 * clic (no al cargar) para que un escáner de enlaces del correo no lo
 * consuma. Los errores (enlace usado/caducado, subdominio tomado) llegan en
 * español desde la API.
 */
export function VerifyRegistration({ verifyToken }: { verifyToken: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginHref, setLoginHref] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<RegisterVerified>('/auth/register/verify', {
        method: 'POST',
        body: { token: verifyToken },
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
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink">{copy.doneTitle}</h2>
        <p className="text-sm text-muted">{copy.doneBody}</p>
        <Button asChild size="lg" className="mt-1 w-full">
          <a href={loginHref}>{copy.login}</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{copy.intro}</p>
      {error ? (
        <InlineError id={ERROR_ID} variant="summary">
          {error}
        </InlineError>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={submitting}
        aria-describedby={error ? ERROR_ID : undefined}
        onClick={handleConfirm}
      >
        {submitting ? (
          <>
            <Loader2 className="animate-spin" /> {copy.submitting}
          </>
        ) : (
          copy.submit
        )}
      </Button>
    </div>
  );
}
