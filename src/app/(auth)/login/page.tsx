import Link from 'next/link';
import { headers } from 'next/headers';
import { LoginForm } from '@/components/organisms/login-form';
import { SplitAuthLayout } from '@/components/templates/split-auth-layout';
import { randomHeroImage } from '@/lib/auth/hero-images';
import { fetchBranding } from '@/lib/branding';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  defaultTitle: 'Dentalix',
  subtitle: 'Inicia sesión en tu cuenta',
  registerPrompt: '¿No tienes cuenta?',
  registerLink: 'Regístrate',
  heroCaption: 'Tu clínica, siempre al día',
};

export default async function LoginPage() {
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
          {copy.registerPrompt}{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {copy.registerLink}
          </Link>
        </>
      }
    >
      <LoginForm />
    </SplitAuthLayout>
  );
}
