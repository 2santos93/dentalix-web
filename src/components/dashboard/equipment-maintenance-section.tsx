'use client';
import Link from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import {
  equipmentHref,
  getMaintenanceDue,
  type MaintenanceDueItem,
} from '@/lib/equipment/equipment-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { sectionLinkClass } from './today-section';
import { useLoad } from './use-load';

export const equipmentMaintenanceCopy = {
  heading: 'Mantenimientos de equipos',
  description: 'Preventivos vencidos o que vencen en los próximos 30 días.',
  count: (n: number) => (n === 1 ? '1 equipo' : `${n} equipos`),
  listLabel: 'Equipos con mantenimiento vencido o por vencer',
  allLink: 'Ver equipos',
  lifeSheet: '(hoja de vida)',
  loading: 'Cargando los mantenimientos de los equipos…',
  error: 'No se pudieron cargar los mantenimientos de los equipos.',
  emptyTitle: 'Equipos al día',
  emptyDescription: 'Ningún mantenimiento preventivo vence en los próximos 30 días.',
  showing: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
};
const copy = equipmentMaintenanceCopy;

/** Cuántos avisos caben en la columna de «Mi día»; el resto, en Ajustes › Equipos biomédicos. */
export const MAINTENANCE_DUE_LIMIT = 5;
const EQUIPMENT_LIST_HREF = '/settings/equipos';

/** Cuándo toca, en palabras, con los días de la sede que da la API (0 = hoy). */
export function dueWhen(status: MaintenanceDueItem['maintenanceStatus'], daysUntilDue: number): string {
  if (status === 'OVERDUE') {
    const late = Math.abs(daysUntilDue);
    return late === 1 ? 'Venció ayer' : `Venció hace ${late} días`;
  }
  if (daysUntilDue === 0) return 'Vence hoy';
  if (daysUntilDue === 1) return 'Vence mañana';
  return `Vence en ${daysUntilDue} días`;
}

/**
 * «Mantenimientos de equipos» de «Mi día» (DX-543): los equipos con el
 * preventivo vencido o que vence en ≤30 días (`GET /equipment/maintenance-due`,
 * solo ADMIN, como Ajustes › Equipos biomédicos), de lo más urgente a lo
 * menos, en la sede del selector global (`scopeKey`; sin sede, las
 * permitidas). Tiene su propio ciclo de carga: si falla, su escalón 1 con
 * Reintentar y el resto de Inicio sigue. Sin avisos, una línea discreta.
 */
export function EquipmentMaintenanceSection({ token, scopeKey }: { token: string; scopeKey: string }) {
  const load = useLoad(
    () => getMaintenanceDue(token, { limit: MAINTENANCE_DUE_LIMIT }),
    `equipment-due|${scopeKey}`,
    true,
    copy.error,
  );
  const items = load.status === 'ready' ? load.data.items : [];
  const stamp = useSedeStamp(
    token,
    items.map((i) => i.locationId),
  );
  const total = load.status === 'ready' ? load.data.total : null;

  return (
    <section aria-labelledby="inicio-equipment-title" className="flex flex-col gap-3" data-testid="inicio-equipment">
      <SectionHeader
        titleId="inicio-equipment-title"
        title={copy.heading}
        description={
          total !== null && total > 0 ? (
            <>
              <span className="t-data font-medium text-ink">{copy.count(total)}</span>
              {' · '}
              {copy.description}
            </>
          ) : (
            copy.description
          )
        }
        className="flex-row items-start justify-between"
        actions={
          <Link href={EQUIPMENT_LIST_HREF} className={sectionLinkClass}>
            {copy.allLink}
          </Link>
        }
      />
      {load.status === 'error' ? (
        <SectionError description={load.message} onRetry={load.reload} />
      ) : load.status !== 'ready' ? (
        <ul role="status" aria-label={copy.loading} aria-busy="true" className={listClass}>
          {[0, 1].map((n) => (
            <li key={n} className="flex min-h-16 flex-col gap-1.5 px-4 py-3 sm:px-5">
              <Skeleton className="h-4 w-44 max-w-full" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState
          role="status"
          size="inline"
          icon={<CheckCircle2 aria-hidden />}
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <ul aria-label={copy.listLabel} className="divide-y divide-border-subtle">
            {items.map((item) => (
              <li
                key={item.id}
                className="relative flex items-center gap-3 px-4 py-3 hover:bg-canvas sm:px-5"
                data-testid="inicio-equipment-row"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={equipmentHref(item.id)}
                      className="min-w-0 break-words text-sm font-medium text-ink after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary-text"
                    >
                      {item.name}
                      <span className="sr-only"> {copy.lifeSheet}</span>
                    </Link>
                    <StatusBadge kind="equipmentMaintenance" status={item.maintenanceStatus} className="shrink-0" />
                  </div>
                  <p className="break-words text-xs text-muted">
                    {[item.locationName, item.chairName].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs text-muted">
                    <time dateTime={item.nextMaintenanceOn} className="t-data text-ink">
                      {stamp.civilDate(item.nextMaintenanceOn, item.locationId)}
                    </time>
                    {' · '}
                    <span className={item.maintenanceStatus === 'OVERDUE' ? 'text-danger-text' : undefined}>
                      {dueWhen(item.maintenanceStatus, item.daysUntilDue)}
                    </span>
                  </p>
                </div>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
              </li>
            ))}
          </ul>
          {total !== null && total > items.length ? (
            <p className="border-t border-border-subtle px-4 py-2.5 text-sm text-muted sm:px-5">
              {copy.showing(items.length, total)}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

const listClass = 'divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface';
