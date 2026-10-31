import Link from 'next/link';
import { AuthLayout } from '@/components/auth/auth-layout';
import { VerifyRegistration } from '@/components/auth/verify-registration';

// Copy as constants (i18n-ready) — es first.
const copy = {
  task: 'Confirma tu registro',
  caption: 'Gestiona tu clínica con confianza',
  loginPrompt: '¿Ya tienes cuenta?',
  loginLink: 'Inicia sesión',
};

// DX-029: destino del enlace del email de verificación del registro. La
// clínica aún no existe: se titula con la tarea, nunca con la del host.
// `params` es una Promise en esta versión de Next (ver AGENTS.md).
export default async function VerifyRegistrationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
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
      <VerifyRegistration verifyToken={token} />
    </AuthLayout>
  );
}
