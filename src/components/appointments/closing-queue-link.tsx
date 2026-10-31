'use client';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { getTokenRole } from '@/lib/auth/token-role';
import { CLOSING_QUEUE_HREF, canSeeClosingQueue } from '@/lib/appointments/closing-queue-api';
import { useClosingQueueCount } from '@/components/appointments/use-closing-queue-count';

const copy = {
  label: 'Pendiente de cerrar',
  withCount: (n: number) => `Pendiente de cerrar · ${n}`,
};

/**
 * DX-439: acceso a «Pendiente de cerrar» desde la cabecera de la Agenda, con
 * el contador del usuario. Solo para los roles que la ven; se monta cuando la
 * sesión ya está resuelta (el token existe), así que leer el rol aquí no
 * descuadra la hidratación.
 */
export function ClosingQueueLink({ token }: { token: string }) {
  const role = getTokenRole(token);
  const visible = canSeeClosingQueue(role);
  const count = useClosingQueueCount(token, visible, '/agenda');
  if (!visible) return null;
  return (
    <Link
      href={CLOSING_QUEUE_HREF}
      className="mt-2 inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-9"
    >
      <ListChecks aria-hidden className="size-4" />
      {count > 0 ? copy.withCount(count) : copy.label}
    </Link>
  );
}
