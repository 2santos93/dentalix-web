import Link from 'next/link';
import { headers } from 'next/headers';
import { RegisterForm } from '@/components/auth/register-form';
import { SplitAuthLayout } from '@/components/templates/split-auth-layout';
import { randomHeroImage } from '@/lib/auth/hero-images';
import { fetchBranding } from '@/lib/branding';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  defaultTitle: 'Dentalix',
  subtitle: 'Crea tu cuenta',
  loginPrompt: '¿Ya tienes cuenta?',
  loginLink: 'Inicia sesión',
  heroCaption: 'Gestiona tu clínica con confianza',
};

export default async function RegisterPage() {
  const h = await headers();
  const tenant = h.get('x-tenant') ?? parseTenantFromHost(h.get('host'));
  const branding = await fetchBranding(tenant);
  const heroImage = randomHeroImage();

  return (
    <SplitAuthLayout
      title={branding.name ?? copy.defaultTitle}
      subtitle={copy.subtitle}
      heroImage={heroImage}
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
      <RegisterForm tenant={tenant} />
    </SplitAuthLayout>
  );
}
