'use client';
import Link from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { RADIOLOGY_HREF, getRadiologyDue } from '@/lib/radiology/radiology-api';
import { expiryWhen, radiologyKindText } from '@/lib/radiology/radiology-format';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { sectionLinkClass } from './today-section';
import { useLoad } from './use-load';

export const radiologyDueCopy = {
  heading: 'Licencias y controles de rayos X',
  description: 'Vencidos o que vencen en los próximos 90 días.',
  count: (n: number) => (n === 1 ? '1 documento' : `${n} documentos`),
  listLabel: 'Licencias y controles de calidad de rayos X vencidos o por vencer',
  allLink: 'Ver expediente',
  open: '(abrir el expediente de rayos X)',
  loading: 'Cargando las licencias y los controles de rayos X…',
  error: 'No se pudieron cargar las licencias y los controles de rayos X.',
  emptyTitle: 'Rayos X al día',
  emptyDescription: 'Ninguna licencia ni control de calidad vence en los próximos 90 días.',
  showing: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
};
const copy = radiologyDueCopy;

/** Cuántos avisos caben en la columna de «Mi día»; el resto, en Ajustes › Rayos X. */
export const RADIOLOGY_DUE_LIMIT = 5;

/**
 * «Licencias y controles de rayos X» de «Mi día» (DX-544), hermano de
 * «Mantenimientos de equipos»: los documentos vencidos o que vencen en ≤90
 * días (`GET /radiology-records/due`), de lo más urgente a lo menos, en la
 * sede del selector global (`scopeKey`; sin sede, las permitidas). Tiene su
 * propio ciclo de carga: si falla, su escalón 1 con Reintentar y el resto de
 * Inicio sigue. Sin avisos, una línea discreta.
 */
export function RadiologyDueSection({ token, scopeKey }: { token: string; scopeKey: string }) {
  const load = useLoad(
    () => getRadiologyDue(token, { limit: RADIOLOGY_DUE_LIMIT }),
    `radiology-due|${scopeKey}`,
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
    <section aria-labelledby="inicio-radiology-title" className="flex flex-col gap-3" data-testid="inicio-radiology">
      <SectionHeader
        titleId="inicio-radiology-title"
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
          <Link href={RADIOLOGY_HREF} className={sectionLinkClass}>
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
                data-testid="inicio-radiology-row"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={RADIOLOGY_HREF}
                      className="min-w-0 break-words text-sm font-medium text-ink after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary-text"
                    >
                      {[radiologyKindText(item), item.reference].filter(Boolean).join(' ')}
                      <span className="sr-only"> {copy.open}</span>
                    </Link>
                    <StatusBadge kind="radiologyRecord" status={item.status} className="shrink-0" />
                  </div>
                  <p className="break-words text-xs text-muted">
                    {[item.locationName, item.equipmentName].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs text-muted">
                    <time dateTime={item.expiresOn} className="t-data text-ink">
                      {stamp.civilDate(item.expiresOn, item.locationId)}
                    </time>
                    {' · '}
                    <span className={item.status === 'OVERDUE' ? 'text-danger-text' : undefined}>
                      {expiryWhen(item.daysUntilExpiry)}
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
