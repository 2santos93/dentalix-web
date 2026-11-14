'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTokenRole } from '@/lib/auth/token-role';
import { EmptyState } from '@/components/shared/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { ALL_NAV_ITEMS, canSee } from './nav-config';

export const routeRoleGateCopy = {
  title: 'No tienes permiso para ver esta pantalla',
  description: 'Si la necesitas para tu trabajo, pídesela al administrador de la clínica.',
  home: 'Ir al inicio',
};

/**
 * DX-096: una pantalla que el menú no ofrece a este rol, abierta por URL. Sin
 * esto se pintaba entera, con «Añadir» activo, y solo fallaba al leer. Las reglas
 * son las del menú (`nav-config`), así que los dos dicen lo mismo. Con un rol que
 * no se pudo leer del token decide la API: nunca se bloquea por no saber.
 */
export function RouteRoleGate({ href, token, children }: { href: string; token: string; children: ReactNode }) {
  const role = getTokenRole(token);
  const item = ALL_NAV_ITEMS.find((i) => i.href === href);
  if (role !== null && item && !canSee(item, role)) {
    return (
      <EmptyState
        role="status"
        title={routeRoleGateCopy.title}
        description={routeRoleGateCopy.description}
        action={
          <Link href="/dashboard" className={buttonVariants({ variant: 'secondary' })}>
            {routeRoleGateCopy.home}
          </Link>
        }
      />
    );
  }
  return <>{children}</>;
}
