'use client';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getToothTimeline,
  type ToothRecord,
  type ToothSurface,
  type ToothTimelineEntry,
} from '@/lib/odontogram/odontogram-api';
import { formatDate } from '@/lib/format/date';
import { ORIGIN_LABELS, recordOrigin } from '@/lib/odontogram/origin';
import { SectionError } from '@/components/errors/section-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VoidRecordDialog } from './void-record-dialog';

// Copy as constants (i18n-ready, es-first) — matches medical-history-panel.tsx convention.
const copy = {
  loading: 'Cargando historial del diente…',
  empty: 'No hay registros para este diente todavía.',
  genericLoadError: 'No pudimos cargar el historial del diente.',
  statusPlanned: 'Planificado',
  statusCompleted: 'Completado',
  wholeTooth: 'Diente completo',
  heading: (fdi: string) => `Historial del diente ${fdi}`,
  emptyAsOf: (date: string) => `Este diente no tenía registros al ${date}.`,
  by: (name: string) => `por ${name}`,
  voided: 'Anulado',
  voidedBy: (name: string | null, date: string) =>
    name ? `Anulado por ${name} el ${date}` : `Anulado el ${date}`,
  voidAction: 'Anular',
  voidActionFor: (what: string, date: string) => `Anular ${what} del ${date}`,
  recordLabel: (what: string, date: string) => `${what} del ${date}`,
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
  /**
   * DX-120: si el usuario puede anular ESE registro (su autor o un ADMIN; la
   * API lo vuelve a comprobar). Sin ella no se ofrece «Anular».
   */
  canVoid?: (record: ToothTimelineEntry) => boolean;
  /** DX-120: carta a una fecha — sin acciones. */
  readOnly?: boolean;
  /**
   * DX-120: carta a una fecha (YYYY-MM-DD): el historial de entonces, sin lo
   * registrado después ni las anulaciones posteriores.
   */
  asOf?: string | null;
  /** DX-120: tras anular, para que la carta deje de pintar el registro. */
  onVoided?: () => void;
}

/** Día civil local (YYYY-MM-DD) de un instante, para compararlo con `asOf`. */
function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** El historial tal como estaba al final del día `asOf`. */
function asOfView(records: ToothTimelineEntry[], asOf: string): ToothTimelineEntry[] {
  return records
    .filter((r) => localDay(r.recordedAt) <= asOf)
    .map((r) => (r.void && localDay(r.void.recordedAt) > asOf ? { ...r, void: null } : r));
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
export function ToothTimeline({
  token,
  patientId,
  toothNumber,
  catalogById,
  refreshKey,
  canVoid,
  readOnly = false,
  asOf = null,
  onVoided,
}: ToothTimelineProps) {
  const [records, setRecords] = useState<ToothTimelineEntry[]>([]);
  const [voiding, setVoiding] = useState<{ id: string; label: string } | null>(null);
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
        setLoadError(apiErrorMessage(err, copy.genericLoadError));
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

  const visible = asOf ? asOfView(records, asOf) : records;

  if (visible.length === 0) {
    return (
      <p role="status" className="text-sm text-muted">
        {asOf ? copy.emptyAsOf(formatDate(`${asOf}T12:00:00`)) : copy.empty}
      </p>
    );
  }

  function handleVoided() {
    setReloadKey((k) => k + 1);
    onVoided?.();
  }

  /**
   * A dated clinical list, per DESIGN.md's "Odontogram (signature)": one
   * hairline-separated row per record, dates in a tabular column so they align
   * down the page — not a stack of bordered cards.
   */
  return (
    <>
      <ol
        aria-label={copy.heading(toothNumber)}
        className="divide-y divide-hairline border-t border-hairline"
      >
        {visible.map((record) => {
          const catalogEntry = record.catalogItemId ? catalogById?.get(record.catalogItemId) : undefined;
          const label = catalogEntry?.labelEs ?? record.kind;
          const date = formatDate(record.recordedAt);
          const origin = recordOrigin(record);
          const isVoided = Boolean(record.void);
          const showVoid = !readOnly && !isVoided && (canVoid?.(record) ?? false);
          // DX-120: lo anulado se queda, tachado, con quién lo anuló, cuándo y
          // por qué — la historia clínica no se borra.
          return (
            <li
              key={record.id}
              data-voided={isVoided ? 'true' : undefined}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 py-2.5 text-sm"
            >
              <time dateTime={record.recordedAt} className="tabular-nums text-xs text-muted">
                {date}
              </time>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  {catalogEntry && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-2.5 shrink-0 rounded-[3px] border border-border',
                        isVoided && 'opacity-40',
                      )}
                      style={{ backgroundColor: catalogEntry.color }}
                    />
                  )}
                  <span className={cn('font-medium', isVoided ? 'text-muted line-through' : 'text-ink')}>
                    {label}
                  </span>
                  {origin !== 'THIS_CLINIC' ? <Badge variant="outline">{ORIGIN_LABELS[origin]}</Badge> : null}
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    {isVoided ? (
                      <Badge variant="danger">{copy.voided}</Badge>
                    ) : (
                      <Badge variant={record.status === 'COMPLETED' ? 'success' : 'warning'}>
                        {STATUS_LABELS[record.status]}
                      </Badge>
                    )}
                  </span>
                </div>
                <p className={cn('text-xs text-muted', isVoided && 'line-through')}>
                  {surfacesLabel(record)}
                  {record.performedByName ? ` · ${copy.by(record.performedByName)}` : null}
                </p>
                {record.notes ? (
                  <p className={cn(isVoided ? 'text-muted line-through' : 'text-ink')}>{record.notes}</p>
                ) : null}
                {record.void ? (
                  <p className="text-xs text-ink">
                    <span className="font-medium">
                      {copy.voidedBy(record.void.performedByName, formatDate(record.void.recordedAt))}:
                    </span>{' '}
                    «{record.void.reason}»
                  </p>
                ) : null}
                {showVoid ? (
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 text-muted hover:text-danger"
                      aria-label={copy.voidActionFor(label, date)}
                      onClick={() => setVoiding({ id: record.id, label: copy.recordLabel(label, date) })}
                    >
                      {copy.voidAction}
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {voiding ? (
        <VoidRecordDialog
          open
          onOpenChange={(open) => {
            if (!open) setVoiding(null);
          }}
          token={token}
          patientId={patientId}
          recordId={voiding.id}
          recordLabel={voiding.label}
          onVoided={handleVoided}
        />
      ) : null}
    </>
  );
}
