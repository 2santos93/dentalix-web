'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronDown, CircleAlert } from 'lucide-react';
import type { RdaMissingItem } from '@/lib/patients/clinical-api';
import type { RdaState } from '@/lib/rda/use-rda-readiness';
import { FieldError } from '@/components/errors/field-error';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const rdaChipCopy = {
  checking: 'Comprobando datos del RDA',
  ready: 'RDA: listo',
  readyHint: 'Esta atención tiene los datos del Resumen Digital de Atención.',
  missing: (n: number) => (n === 1 ? 'RDA: falta 1 dato' : `RDA: faltan ${n} datos`),
  listLabel: 'Datos que faltan para el RDA',
  // Escalón 2 (FieldError): ≤ 4 palabras.
  loadError: 'RDA no disponible',
  complete: 'Completar',
  completeFor: (label: string) => `Completar: ${label}`,
  diagnosisHint:
    'La evolución no se puede cambiar: registra una evolución nueva con el diagnóstico (y una adenda en esta si la corrige).',
  pending: (label: string, reason: string) => `${label}: ${reason}.`,
};

const copy = rdaChipCopy;

/** Dónde se completa cada dato (ruta de la web), o `null` si no hay pantalla. */
export function rdaMissingHref(item: RdaMissingItem, patientId: string): string | null {
  switch (item.code) {
    case 'PATIENT_DOCUMENT':
      return `/patients/${encodeURIComponent(patientId)}?tab=data`;
    case 'PROCEDURE_CUPS':
      return item.resourceId ? `/catalog?item=${encodeURIComponent(item.resourceId)}` : '/catalog';
    case 'LOCATION_REPS':
      return '/settings/sedes';
    case 'AUTHOR_LICENSE':
      return item.resourceId ? `/staff/${encodeURIComponent(item.resourceId)}` : null;
    case 'PRINCIPAL_DIAGNOSIS':
      return null;
  }
}

interface RdaReadinessChipProps {
  patientId: string;
  /** Lo trae `useRdaReadiness` en la lista (una petición por lote). */
  state: RdaState;
  onRetry: () => void;
}

/**
 * Chip «RDA: listo» / «RDA: faltan N datos» de una evolución (DX-212). Solo en
 * sedes de Colombia (`notApplicable` → nada). Con faltantes, el chip abre la
 * lista con un enlace a donde se completa cada dato. Nada sale de Dentalix:
 * solo se comprueba.
 */
export function RdaReadinessChip({ patientId, state, onRetry }: RdaReadinessChipProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (state.status === 'forbidden') return null;
  if (state.status === 'error') {
    return <FieldError label={copy.loadError} className="h-8 w-auto" onRetry={onRetry} />;
  }
  if (state.status === 'loading') {
    return (
      <span role="status" aria-label={copy.checking} className="inline-flex">
        <Skeleton className="h-6 w-24 rounded-full" />
      </span>
    );
  }
  const { data } = state;
  if (data.notApplicable) return null;

  if (data.ready) {
    return (
      <span
        title={copy.readyHint}
        className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success"
      >
        <CheckCircle2 aria-hidden className="size-3.5" />
        {copy.ready}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-8 items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <CircleAlert aria-hidden className="size-3.5" />
        {copy.missing(data.missing.length)}
        <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      <div id={listId} hidden={!open} className="w-full">
        {open ? (
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
            <ul aria-label={copy.listLabel} className="flex flex-col divide-y divide-hairline">
              {data.missing.map((item) => {
                const href = rdaMissingHref(item, patientId);
                return (
                  <li
                    key={`${item.code}-${item.resourceId ?? ''}`}
                    className="flex flex-col gap-0.5 py-1.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                  >
                    <span className="text-ink">{item.label}</span>
                    {href ? (
                      <Link
                        href={href}
                        aria-label={copy.completeFor(item.label)}
                        className="shrink-0 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {copy.complete}
                      </Link>
                    ) : item.code === 'PRINCIPAL_DIAGNOSIS' ? (
                      <span className="text-muted">{copy.diagnosisHint}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {data.pending.map((p) => (
              <p key={p.code} className="mt-2 border-t border-hairline pt-1.5 text-muted">
                {copy.pending(p.label, p.reason)}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
