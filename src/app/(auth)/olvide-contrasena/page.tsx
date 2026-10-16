import { headers } from 'next/headers';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { SplitAuthLayout } from '@/components/layouts/split-auth-layout';
import { randomHeroImage } from '@/lib/auth/hero-images';
import { fetchBranding } from '@/lib/branding';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  defaultTitle: 'Dentalix',
  subtitle: '¿Olvidaste tu contraseña?',
  heroCaption: 'Vuelve a tu clínica en un momento',
};

/** «¿Olvidaste tu contraseña?» (DX-010), pública y con la marca de la clínica. */
export default async function ForgotPasswordPage() {
  const h = await headers();
  const tenant = h.get('x-tenant') ?? parseTenantFromHost(h.get('host'));
  const branding = await fetchBranding(tenant);

  return (
    <SplitAuthLayout
      title={branding.name ?? copy.defaultTitle}
      subtitle={copy.subtitle}
      heroImage={randomHeroImage()}
      heroCaption={copy.heroCaption}
    >
      <ForgotPasswordForm />
    </SplitAuthLayout>
  );
}
