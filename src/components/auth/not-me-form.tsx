'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { notMe } from '@/lib/auth/sessions-api';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { InlineError } from '@/components/errors/inline-error';
import { AUTH_FORM_CLASS, AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS } from './auth-layout';

export const notMeCopy = {
  intro:
    'Te avisamos de un inicio de sesión en tu cuenta desde un dispositivo nuevo. Si no fuiste tú, ciérralo todo ahora.',
  consequences:
    'Cerramos tu sesión en todos los dispositivos (también en este) y te enviamos al correo un enlace para elegir una contraseña nueva.',
  submit: 'Cerrar todas mis sesiones',
  submitting: 'Cerrando sesiones…',
  invalidTitle: 'Este enlace ya no es válido',
  invalidBody: 'Caducó (vale 24 horas) o ya se usó. Si no reconoces la actividad de tu cuenta, cambia tu contraseña.',
  forgot: 'Cambiar mi contraseña',
  doneTitle: 'Cerramos todas tus sesiones.',
  doneBody:
    'Te enviamos un enlace a tu correo para elegir una contraseña nueva. Si no llega en unos minutos, revisa el spam o pide uno desde «¿Olvidaste tu contraseña?».',
  error: 'No pudimos cerrar tus sesiones. Intenta de nuevo.',
};

/**
 * DX-137: «No fui yo», desde el enlace del aviso de inicio de sesión nuevo.
 * El enlace NO actúa al abrirse (un antivirus del correo lo abre solo): hace
 * falta pulsar el botón. Tras cerrar todo, lleva a elegir contraseña.
 */
export function NotMeForm({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'invalid' | 'done'>('idle');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // DX-137 (revisión de seguridad): la API no devuelve ningún token; el
      // enlace para cambiar la contraseña va al correo de la cuenta.
      await notMe(token);
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
      <div className="flex flex-col gap-3">
        <Callout tone="success" role="status" title={notMeCopy.doneTitle}>
          {notMeCopy.doneBody}
        </Callout>
        <Link href="/olvide-contrasena" className={AUTH_LINK_CLASS}>
          {notMeCopy.forgot}
        </Link>
      </div>
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
