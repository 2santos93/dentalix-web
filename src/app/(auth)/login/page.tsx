import Link from 'next/link';
import { headers } from 'next/headers';
import { LoginForm } from '@/components/auth/login-form';
import { ThemeToggle } from '@/components/theme/theme-toggle';
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
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 bg-bg px-4 py-12">
      <div className="flex w-full max-w-sm justify-end">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-ink">
          {branding.name ?? copy.defaultTitle}
        </h1>
        <p className="mb-6 text-sm text-muted">{copy.subtitle}</p>
        <LoginForm />
        <p className="mt-6 text-center text-sm text-muted">
          {copy.registerPrompt}{' '}
          <Link href="/register" className="font-medium text-primary">
            {copy.registerLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
