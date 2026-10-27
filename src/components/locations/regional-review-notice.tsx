'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { getTokenRole } from '@/lib/auth/token-role';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const regionalReviewNoticeCopy = {
  label: 'Sedes por revisar',
  title: (count: number) =>
    `Revisa la moneda, la zona horaria y el formato de ${count} ${count === 1 ? 'sede' : 'sedes'}.`,
  body: (summary: string) =>
    `Al actualizar Dentalix se asignaron a partir del país de cada sede (${summary}). Confírmalos o cámbialos.`,
  missing: 'Por configurar',
  review: 'Revisar sedes',
};

const copy = regionalReviewNoticeCopy;

/**
 * Sede pendiente del aviso D5: activa y con moneda, zona y formato sin
 * confirmar por un ADMIN (asignados por la migración, el barrido o el `verify`
 * de un registro legado). Una sede retirada no cuenta (R12).
 */
export function needsRegionalReview(location: ClinicLocation): boolean {
  return location.isActive && location.regionalSettingsReviewedAt === null;
}

/** «Sede Norte: COP · America/Bogota · es-CO»; un valor que falta, «Por configurar». */
function summarize(location: ClinicLocation): string {
  const values = [location.currency, location.timeZone, location.locale].map((v) => v ?? copy.missing);
  return `${location.name}: ${values.join(' · ')}`;
}

interface RegionalReviewNoticeProps {
  token: string;
  /** «Revisar sedes» lleva a Ajustes → Sedes; allí mismo sobra (cada fila tiene su «Revisar»). */
  showReviewLink?: boolean;
  className?: string;
}

/**
 * Aviso D5 (G1, spec §7): solo para ADMIN, mientras alguna sede activa tenga
 * moneda, zona y formato sin confirmar. No se descarta: desaparece cuando el
 * ADMIN guarda cada sede en su modal, que invalida la lectura de sedes de la
 * sesión y este aviso vuelve a leerla. Tono informativo, no de error: no hay
 * nada roto, solo un dato que confirmar.
 */
export function RegionalReviewNotice({ token, showReviewLink = true, className }: RegionalReviewNoticeProps) {
  const isAdmin = getTokenRole(token) === 'ADMIN';
  const requestLocations = useSessionLocations(token);
  const [pending, setPending] = useState<ClinicLocation[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    requestLocations()
      .then((data) => {
        if (!cancelled) setPending(data.filter(needsRegionalReview));
      })
      .catch(() => {
        // Sin lista no hay aviso: la pantalla que lo monta ya muestra el fallo
        // de las sedes con su reintento (lista de Sedes, moneda del panel).
        if (!cancelled) setPending([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, requestLocations]);

  if (!isAdmin || pending.length === 0) return null;

  return (
    <section
      aria-label={copy.label}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {/* `mt-0.5` alinea el icono con la primera línea, no con la caja. */}
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <p className="font-medium text-ink">{copy.title(pending.length)}</p>
          <p className="max-w-[68ch] text-muted [overflow-wrap:anywhere]">
            {copy.body(pending.map(summarize).join('; '))}
          </p>
        </div>
      </div>
      {showReviewLink ? (
        <Link
          href="/settings/sedes"
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0 self-start')}
        >
          {copy.review}
        </Link>
      ) : null}
    </section>
  );
}
