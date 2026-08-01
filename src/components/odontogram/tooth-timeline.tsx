'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { getToothTimeline, type ToothRecord, type ToothSurface } from '@/lib/odontogram/odontogram-api';
import { formatDate } from '@/lib/format/date';
import { SectionError } from '@/components/errors/section-error';

// Copy as constants (i18n-ready, es-first) — matches medical-history-panel.tsx convention.
const copy = {
  loading: 'Cargando historial del diente…',
  empty: 'No hay registros para este diente todavía.',
  genericLoadError: 'No pudimos cargar el historial del diente.',
  statusPlanned: 'Planificado',
  statusCompleted: 'Completado',
  wholeTooth: 'Diente completo',
  notesFallback: '—',
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

  return (
    <ul aria-label={copy.heading(toothNumber)} className="flex flex-col gap-3">
      {records.map((record) => {
        const catalogEntry = record.catalogItemId ? catalogById?.get(record.catalogItemId) : undefined;
        return (
          <li
            key={record.id}
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {catalogEntry && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: catalogEntry.color }}
                  />
                )}
                <span className="font-medium text-ink">{catalogEntry?.labelEs ?? record.kind}</span>
              </div>
              <span className="text-xs font-medium text-muted">{formatDate(record.recordedAt)}</span>
            </div>
            <p className="text-ink">{surfacesLabel(record)}</p>
            <p className="text-muted">{STATUS_LABELS[record.status]}</p>
            <p className="text-ink">{record.notes ?? copy.notesFallback}</p>
          </li>
        );
      })}
    </ul>
  );
}
