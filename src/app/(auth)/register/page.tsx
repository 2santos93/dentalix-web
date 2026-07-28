import Link from 'next/link';
import { headers } from 'next/headers';
import { RegisterForm } from '@/components/auth/register-form';
import { AuthLayout } from '@/components/templates/auth-layout';
import { fetchBranding } from '@/lib/branding';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  defaultTitle: 'Dentalix',
  subtitle: 'Crea tu cuenta',
  loginPrompt: '¿Ya tienes cuenta?',
  loginLink: 'Inicia sesión',
};

export default async function RegisterPage() {
  const h = await headers();
  const tenant = h.get('x-tenant') ?? parseTenantFromHost(h.get('host'));
  const branding = await fetchBranding(tenant);

  return (
    <AuthLayout
      title={branding.name ?? copy.defaultTitle}
      subtitle={copy.subtitle}
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
    </AuthLayout>
  );
}
