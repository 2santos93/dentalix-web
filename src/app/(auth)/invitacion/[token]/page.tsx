import Link from 'next/link';
import { headers } from 'next/headers';
import { AcceptInvitationForm } from '@/components/auth/accept-invitation-form';
import { SplitAuthLayout } from '@/components/templates/split-auth-layout';
import { randomHeroImage } from '@/lib/auth/hero-images';
import { fetchBranding } from '@/lib/branding';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  defaultTitle: 'Dentalix',
  subtitle: 'Acepta tu invitación',
  loginPrompt: '¿Ya tienes cuenta?',
  loginLink: 'Inicia sesión',
  heroCaption: 'Únete al equipo de tu clínica',
};

// `params` is a Promise in this Next version (see AGENTS.md /
// node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md)
// — must `await` it, not destructure it synchronously.
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
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
      <AcceptInvitationForm inviteToken={token} />
    </SplitAuthLayout>
  );
}
