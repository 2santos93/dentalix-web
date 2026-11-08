'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicBranding } from '@/components/brand/branding-context';
import { ClinicBrand } from '@/components/brand/clinic-brand';
import { bootstrapSession } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth-store';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  checkingSession: 'Verificando sesión…',
};

/**
 * DX-554: «/» en el host de una clínica (subdominio o dominio propio). El
 * servidor no ve la sesión (el access token vive en memoria y la cookie del
 * refresh solo viaja a `/api/v1/auth`), así que aquí se recupera como en el
 * shell de la app y se decide: con sesión, al inicio; sin ella, al login de la
 * clínica. Hasta entonces solo la marca que ya puso el layout y el estado: ni
 * menú ni datos.
 */
export function ClinicEntry() {
  const router = useRouter();
  const branding = useClinicBranding();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  useEffect(() => {
    // Sin decidir hasta que el arranque de sesión resuelva: antes el token es
    // null también para quien sí tiene sesión.
    if (!hasHydrated) return;
    router.replace(accessToken ? '/dashboard' : '/login');
  }, [accessToken, hasHydrated, router]);

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-canvas px-4 pt-28 pb-12 sm:px-6 lg:pt-40">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
        {branding.name ? <ClinicBrand name={branding.name} logoUrl={branding.logoUrl} variant="public" /> : null}
        <p role="status" className="text-sm text-muted">
          {copy.checkingSession}
        </p>
      </div>
    </main>
  );
}
