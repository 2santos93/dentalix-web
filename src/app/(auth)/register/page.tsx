import Link from 'next/link';
import { RegisterForm } from '@/components/auth/register-form';
import { AuthLayout } from '@/components/auth/auth-layout';
import { authContext } from '@/components/auth/auth-clinic';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  task: 'Crea tu clínica',
  loginPrompt: '¿Ya tienes cuenta?',
  loginLink: 'Inicia sesión',
  caption: 'Gestiona tu clínica con confianza',
};

/**
 * Registro: crea una clínica NUEVA, así que nunca se titula con la del host
 * (`clinic={null}`); el host solo propone el subdominio.
 */
export default async function RegisterPage() {
  const { tenant } = await authContext();

  return (
    <AuthLayout
      clinic={null}
      task={copy.task}
      caption={copy.caption}
      footer={
        <>
          {copy.loginPrompt}{' '}
          <Link href="/login" className="font-medium text-primary-text hover:underline">
            {copy.loginLink}
          </Link>
        </>
      }
    >
      <RegisterForm tenant={tenant} />
    </AuthLayout>
  );
}
