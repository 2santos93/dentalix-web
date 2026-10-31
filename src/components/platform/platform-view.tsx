'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { logout } from '@/lib/auth/auth-api';
import { useAuthStore } from '@/lib/auth/auth-store';
import { useSessionBootstrap } from '@/lib/auth/use-session-bootstrap';
import {
  clinicUrl,
  listPlatformTenants,
  loginPlatform,
  type PlatformTenant,
} from '@/lib/platform/platform-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';
import { FormField } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { ArrowUpRight, LogOut } from 'lucide-react';
import { PlatformMfaCard } from './platform-mfa-card';

const copy = {
  title: 'Plataforma',
  subtitle: 'Todas las clínicas de Dentalix.',
  enterHint:
    'Entrar a una clínica es un acceso de soporte: pide el código de tu app y un motivo, dura poco y la clínica lo ve.',
  signInTitle: 'Acceso de plataforma',
  signInSubtitle: 'Solo para administradores de Dentalix.',
  email: 'Email',
  password: 'Contraseña',
  signIn: 'Entrar',
  signingIn: 'Entrando…',
  signOut: 'Salir',
  enter: 'Entrar',
  clinicsTitle: 'Clínicas',
  colClinic: 'Clínica',
  colSubdomain: 'Subdominio',
  loading: 'Cargando clínicas…',
  invalid: 'Credenciales inválidas.',
  loadError: 'No pudimos cargar las clínicas.',
  emptyTitle: 'Sin clínicas',
  emptyDescription: 'Todavía no hay ninguna clínica registrada.',
  count: (n: number) => (n === 1 ? '1 clínica' : `${n} clínicas`),
};

/**
 * Cada clínica es una fila que entra a ella (toda la fila es el enlace): se
 * entra por su propio host con un enlace normal, no con un fetch; allí se
 * inicia sesión y el backend reconoce al superadmin sin membresía y le pide
 * código TOTP y motivo (acceso de soporte de SEC-008, sin refresh).
 */
const TENANT_COLUMNS: DataListColumn<PlatformTenant>[] = [
  { id: 'name', header: copy.colClinic, mobile: 'primary', cell: (t) => t.name },
  { id: 'subdomain', header: copy.colSubdomain, cell: (t) => <span className="t-id text-muted">{t.subdomain}</span> },
  {
    id: 'enter',
    header: <span className="sr-only">{copy.enter}</span>,
    mobile: 'hidden',
    align: 'end',
    // Pista visual de que la fila sale a otra clínica; el enlace ya es la fila.
    cell: () => (
      <span aria-hidden className="inline-flex items-center gap-1 text-sm font-medium text-primary-text">
        {copy.enter} <ArrowUpRight className="size-4" />
      </span>
    ),
  },
];

/**
 * La sesión de plataforma usa el mismo mecanismo que la de clínica (DX-062):
 * access token en memoria y refresh en la cookie HttpOnly, que es del host del
 * apex y por eso nunca se mezcla con la de una clínica (otro host).
 */
export function PlatformView() {
  useSessionBootstrap();
  const token = useAuthStore((s) => s.accessToken);
  const ready = useAuthStore((s) => s._hasHydrated);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load(activeToken: string) {
      setLoading(true);
      try {
        const data = await listPlatformTenants(activeToken);
        if (!cancelled) {
          setTenants(data);
          setLoadError(null);
        }
      } catch (err) {
        if (cancelled) return;
        // 401/403 = la sesión de plataforma ya no vale (expiró, o le
        // revocaron el flag): volver al formulario en vez de dejar un error
        // muerto en pantalla.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          useAuthStore.getState().clear();
          return;
        }
        setLoadError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load(token);
    return () => {
      cancelled = true;
    };
  }, [token, retryTick]);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSignInError(null);
    setSigningIn(true);
    try {
      const { accessToken } = await loginPlatform(email.trim(), password);
      useAuthStore.getState().setAccessToken(accessToken);
      setPassword('');
    } catch (err) {
      setSignInError(apiErrorMessage(err, { fallback: copy.invalid, byStatus: { 401: copy.invalid, 403: copy.invalid } }));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await logout();
    useAuthStore.getState().clear();
    setTenants([]);
  }

  if (!ready) return null;

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="t-title text-ink">{copy.signInTitle}</h1>
        <p className="mt-1 text-sm text-muted">{copy.signInSubtitle}</p>
        <Card className="mt-6">
          <CardContent className="p-6">
            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              {signInError && <InlineError variant="summary">{signInError}</InlineError>}
              <FormField htmlFor="platform-email" label={copy.email}>
                <Input
                  id="platform-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FormField>
              <FormField htmlFor="platform-password" label={copy.password}>
                <Input
                  id="platform-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </FormField>
              <Button type="submit" loading={signingIn}>
                {signingIn ? copy.signingIn : copy.signIn}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title={copy.title}
        description={
          !loading && tenants.length > 0 ? `${copy.subtitle} · ${copy.count(tenants.length)}` : copy.subtitle
        }
        actions={
          <Button type="button" variant="secondary" onClick={handleSignOut}>
            <LogOut /> {copy.signOut}
          </Button>
        }
      />

      <div className="flex flex-col gap-8">
        {/* SEC-008: sin MFA no hay acceso de soporte a las clínicas. */}
        <PlatformMfaCard token={token} />

        <section aria-labelledby="platform-clinics-title" className="flex flex-col gap-3">
          <SectionHeader titleId="platform-clinics-title" title={copy.clinicsTitle} description={copy.enterHint} />
          {loadError ? (
            <SectionError
              description={loadError}
              onRetry={() => {
                setLoadError(null);
                setRetryTick((t) => t + 1);
              }}
            />
          ) : (
            <DataList
              label={copy.clinicsTitle}
              rows={tenants}
              columns={TENANT_COLUMNS}
              getRowKey={(t) => t.id}
              getRowHref={(t) => clinicUrl(t.subdomain)}
              loading={loading}
              loadingLabel={copy.loading}
              empty={<EmptyState role="status" title={copy.emptyTitle} description={copy.emptyDescription} />}
            />
          )}
        </section>
      </div>
    </main>
  );
}
