'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { notMe } from '@/lib/auth/sessions-api';
import { SESSIONS_CLOSED_PARAM } from '@/lib/auth/password-reset-api';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { InlineError } from '@/components/errors/inline-error';
import { AUTH_FORM_CLASS, AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS } from './auth-layout';

export const notMeCopy = {
  intro:
    'Te avisamos de un inicio de sesión en tu cuenta desde un dispositivo nuevo. Si no fuiste tú, ciérralo todo ahora.',
  consequences:
    'Cerramos tu sesión en todos los dispositivos (también en este) y te llevamos a elegir una contraseña nueva.',
  submit: 'Cerrar todas mis sesiones',
  submitting: 'Cerrando sesiones…',
  invalidTitle: 'Este enlace ya no es válido',
  invalidBody: 'Caducó (vale 24 horas) o ya se usó. Si no reconoces la actividad de tu cuenta, cambia tu contraseña.',
  forgot: 'Cambiar mi contraseña',
  doneTitle: 'Cerramos todas tus sesiones.',
  doneBody: 'Pide a la administración de tu clínica que revise tu acceso, y cambia tu contraseña.',
  error: 'No pudimos cerrar tus sesiones. Intenta de nuevo.',
};

/**
 * DX-137: «No fui yo», desde el enlace del aviso de inicio de sesión nuevo.
 * El enlace NO actúa al abrirse (un antivirus del correo lo abre solo): hace
 * falta pulsar el botón. Tras cerrar todo, lleva a elegir contraseña.
 */
export function NotMeForm({ token }: { token: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'invalid' | 'done'>('idle');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { passwordResetToken } = await notMe(token);
      if (passwordResetToken) {
        router.replace(`/restablecer/${passwordResetToken}?${SESSIONS_CLOSED_PARAM}=1`);
        return;
      }
      setState('done');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState('invalid');
      else setError(apiErrorMessage(err, notMeCopy.error));
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'invalid') {
    return (
      <div className="flex flex-col gap-3">
        <Callout tone="warning" role="alert" title={notMeCopy.invalidTitle}>
          {notMeCopy.invalidBody}
        </Callout>
        <Link href="/olvide-contrasena" className={AUTH_LINK_CLASS}>
          {notMeCopy.forgot}
        </Link>
      </div>
    );
  }
  if (state === 'done') {
    return (
      <Callout tone="success" role="status" title={notMeCopy.doneTitle}>
        {notMeCopy.doneBody}
      </Callout>
    );
  }
  return (
    <form onSubmit={handleSubmit} className={AUTH_FORM_CLASS}>
      <p className="text-sm text-ink">{notMeCopy.intro}</p>
      <Callout tone="warning" icon={ShieldAlert}>
        {notMeCopy.consequences}
      </Callout>
      {error ? <InlineError>{error}</InlineError> : null}
      <Button type="submit" variant="destructive" loading={submitting} className={AUTH_SUBMIT_CLASS}>
        {submitting ? notMeCopy.submitting : notMeCopy.submit}
      </Button>
    </form>
  );
}
