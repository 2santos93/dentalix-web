import Link from 'next/link';
import { headers } from 'next/headers';
import { LoginForm } from '@/components/organisms/login-form';
import { AuthLayout } from '@/components/templates/auth-layout';
import { fetchBranding } from '@/lib/branding';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  defaultTitle: 'Dentalix',
  subtitle: 'Inicia sesión en tu cuenta',
  registerPrompt: '¿No tienes cuenta?',
  registerLink: 'Regístrate',
};

export default async function LoginPage() {
  const h = await headers();
  const tenant = h.get('x-tenant') ?? parseTenantFromHost(h.get('host'));
  const branding = await fetchBranding(tenant);

  return (
    <AuthLayout
      title={branding.name ?? copy.defaultTitle}
      subtitle={copy.subtitle}
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
    </AuthLayout>
  );
}
