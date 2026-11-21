'use client';
import Link from 'next/link';
import { PhoneCall } from 'lucide-react';
import { POST_OP_CHECKS_HREF } from '@/lib/post-op-checks/post-op-checks-api';
import { useWorkQueueCount } from '@/components/work-queues/work-queues-context';

const copy = {
  label: 'Controles postoperatorios',
  withCount: (n: number) => `Controles postoperatorios · ${n}`,
};

/**
 * DX-566: acceso a «Controles postoperatorios» desde la cabecera de la Agenda,
 * junto a «Pendiente de cerrar», con su contador (hoy y vencidos de la sede
 * activa). Sale de la MISMA lectura de `GET /work-queues/summary` que «Mi día»
 * (`WorkQueuesProvider`), así que los dos dicen el mismo número. Los cuatro
 * roles lo ven.
 */
export function PostOpChecksLink() {
  const count = useWorkQueueCount('POST_OP_CHECKS');
  return (
    <Link
      href={POST_OP_CHECKS_HREF}
      className="mt-2 inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text sm:pointer-fine:min-h-9"
    >
      <PhoneCall aria-hidden className="size-4" />
      {count > 0 ? copy.withCount(count) : copy.label}
    </Link>
  );
}
