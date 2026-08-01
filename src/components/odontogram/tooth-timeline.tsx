'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { getToothTimeline, type ToothRecord, type ToothSurface } from '@/lib/odontogram/odontogram-api';
import { formatDate } from '@/lib/format/date';
import { SectionError } from '@/components/errors/section-error';
import { Badge } from '@/components/ui/badge';

// Copy as constants (i18n-ready, es-first) — matches medical-history-panel.tsx convention.
const copy = {
  loading: 'Cargando historial del diente…',
  empty: 'No hay registros para este diente todavía.',
  genericLoadError: 'No pudimos cargar el historial del diente.',
  statusPlanned: 'Planificado',
  statusCompleted: 'Completado',
  wholeTooth: 'Diente completo',
  heading: (fdi: string) => `Historial del diente ${fdi}`,
};

const SURFACE_LABELS: Record<ToothSurface, string> = {
  VESTIBULAR: 'vestibular',
  LINGUAL: 'lingual',
  MESIAL: 'mesial',
  DISTAL: 'distal',
  OCCLUSAL: 'oclusal',
};

const STATUS_LABELS: Record<ToothRecord['status'], string> = {
  PLANNED: copy.statusPlanned,
  COMPLETED: copy.statusCompleted,
};

/** The subset of `DentalCatalogItem` this component needs to render a record. */
export interface TimelineCatalogEntry {
  labelEs: string;
  color: string;
}

interface ToothTimelineProps {
  token: string;
  patientId: string;
  toothNumber: string;
  catalogById?: Map<string, TimelineCatalogEntry>;
  /** Bump this to force a refetch (e.g. after a new record is added). */
  refreshKey?: number;
}

function surfacesLabel(record: ToothRecord): string {
  if (record.surfaces.length === 0) return copy.wholeTooth;
  return record.surfaces.map((s) => SURFACE_LABELS[s]).join(', ');
}

/**
 * Renders a single tooth's records in whatever order `getToothTimeline`
 * returns them — DESC by `recordedAt` per the backend contract (see
 * `odontogram-api.ts`) — so this component does NOT re-sort.
 */
export function ToothTimeline({ token, patientId, toothNumber, catalogById, refreshKey }: ToothTimelineProps) {
  const [records, setRecords] = useState<ToothRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getToothTimeline(token, patientId, toothNumber);
        if (cancelled) return;
        setRecords(data);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, toothNumber, refreshKey, reloadKey]);

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loading}
      </p>
    );
  }

  if (loadError) {
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  if (records.length === 0) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.empty}
      </p>
    );
  }

  /**
   * A dated clinical list, per DESIGN.md's "Odontogram (signature)": one
   * hairline-separated row per record, dates in a tabular column so they align
   * down the page — not a stack of bordered cards.
   */
  return (
    <ol
      aria-label={copy.heading(toothNumber)}
      className="divide-y divide-hairline border-t border-hairline"
    >
      {records.map((record) => {
        const catalogEntry = record.catalogItemId ? catalogById?.get(record.catalogItemId) : undefined;
        return (
          <li key={record.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 py-2.5 text-sm">
            <time dateTime={record.recordedAt} className="tabular-nums text-xs text-muted">
              {formatDate(record.recordedAt)}
            </time>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {catalogEntry && (
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-[3px] border border-border"
                    style={{ backgroundColor: catalogEntry.color }}
                  />
                )}
                <span className="font-medium text-ink">{catalogEntry?.labelEs ?? record.kind}</span>
                <Badge
                  variant={record.status === 'COMPLETED' ? 'success' : 'warning'}
                  className="ml-auto shrink-0"
                >
                  {STATUS_LABELS[record.status]}
                </Badge>
              </div>
              <p className="text-xs text-muted">{surfacesLabel(record)}</p>
              {record.notes ? <p className="text-ink">{record.notes}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
