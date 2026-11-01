import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { AuthLayout } from '@/components/auth/auth-layout';
import { authContext } from '@/components/auth/auth-clinic';
import { PASSWORD_RESET_DONE_PARAM } from '@/lib/auth/password-reset-api';

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
  const passwordReset = (await searchParams)[PASSWORD_RESET_DONE_PARAM] === '1';
  const { clinic } = await authContext();

  return (
    <AuthLayout
      clinic={clinic}
      fromHost
      task={clinic ? copy.clinicTask : copy.task}
      caption={copy.caption}
      footer={
        <>
          {copy.registerPrompt}{' '}
          <Link href="/register" className="font-medium text-primary-text hover:underline">
            {copy.registerLink}
          </Link>
        </>
      }
    >
      <LoginForm passwordReset={passwordReset} />
    </AuthLayout>
  );
}
