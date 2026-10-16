import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { SplitAuthLayout } from '@/components/layouts/split-auth-layout';
import { randomHeroImage } from '@/lib/auth/hero-images';
import { fetchBranding } from '@/lib/branding';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  defaultTitle: 'Dentalix',
  subtitle: 'Restablecer contraseña',
  heroCaption: 'Una contraseña nueva y listo',
};

// El token va en la URL: que no salga en el Referer hacia ningún otro sitio.
export const metadata: Metadata = {
  referrer: 'no-referrer',
};

// `params` is a Promise in this Next version (see AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md)
// — must `await` it, not destructure it synchronously.
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
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
      <ResetPasswordForm resetToken={token} />
    </SplitAuthLayout>
  );
}
