import Link from 'next/link';
import { SplitAuthLayout } from '@/components/layouts/split-auth-layout';
import { VerifyRegistration } from '@/components/auth/verify-registration';
import { randomHeroImage } from '@/lib/auth/hero-images';

// Copy as constants (i18n-ready) — es first.
const copy = {
  title: 'Dentalix',
  subtitle: 'Confirma tu registro',
  heroCaption: 'Gestiona tu clínica con confianza',
  loginPrompt: '¿Ya tienes cuenta?',
  loginLink: 'Inicia sesión',
};

// DX-029: destino del enlace del email de verificación del registro. `params`
// es una Promise en esta versión de Next (ver AGENTS.md).
export default async function VerifyRegistrationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <SplitAuthLayout
      title={copy.title}
      subtitle={copy.subtitle}
      heroImage={randomHeroImage()}
      heroCaption={copy.heroCaption}
      footer={
        <>
          {copy.loginPrompt}{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {copy.loginLink}
          </Link>
        </>
      }
    >
      <VerifyRegistration verifyToken={token} />
    </SplitAuthLayout>
  );
}
