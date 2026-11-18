import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { AuthLayout } from '@/components/auth/auth-layout';
import { randomHeroImage } from '@/lib/auth/hero-images';
import { authContext } from '@/components/auth/auth-clinic';
import { IDLE_LOGOUT_REASON, LOGOUT_REASON_PARAM } from '@/lib/auth/idle-logout';
import { INVITATION_ACCEPTED_PARAM, PASSWORD_RESET_DONE_PARAM } from '@/lib/auth/password-reset-api';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  // Con clínica en el host, el H1 es su nombre y esto queda como apoyo.
  task: 'Inicia sesión',
  clinicTask: 'Inicia sesión en tu cuenta',
  registerPrompt: '¿No tienes cuenta?',
  registerLink: 'Regístrate',
  caption: 'Tu clínica, siempre al día',
};

// `searchParams` is a Promise in this Next version (see AGENTS.md).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const passwordReset = params[PASSWORD_RESET_DONE_PARAM] === '1';
  const invitationAccepted = params[INVITATION_ACCEPTED_PARAM] === '1';
  // DX-137: «Sesión cerrada por inactividad».
  const idleLogout = params[LOGOUT_REASON_PARAM] === IDLE_LOGOUT_REASON;
  const { clinic } = await authContext();

  return (
    <AuthLayout
      clinic={clinic}
      fromHost
      task={clinic ? copy.clinicTask : copy.task}
      caption={copy.caption}
      heroImage={randomHeroImage()}
      footer={
        <>
          {copy.registerPrompt}{' '}
          <Link href="/register" className="font-medium text-primary-text hover:underline">
            {copy.registerLink}
          </Link>
        </>
      }
    >
      <LoginForm
        passwordReset={passwordReset}
        invitationAccepted={invitationAccepted}
        idleLogout={idleLogout}
      />
    </AuthLayout>
  );
}
