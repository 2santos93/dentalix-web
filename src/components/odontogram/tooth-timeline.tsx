'use client';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getToothTimeline,
  type ToothRecord,
  type ToothSurface,
  type ToothTimelineEntry,
} from '@/lib/odontogram/odontogram-api';
import { asOfErrorMessage } from '@/lib/odontogram/odontogram-errors';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { ORIGIN_LABELS, recordOrigin } from '@/lib/odontogram/origin';
import { SectionError } from '@/components/errors/section-error';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VoidRecordDialog } from './void-record-dialog';

// Copy as constants (i18n-ready, es-first) — matches medical-history-panel.tsx convention.
const copy = {
  loading: 'Cargando historial del diente…',
  empty: 'No hay registros para este diente todavía.',
  genericLoadError: 'No pudimos cargar el historial del diente.',
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
  const [loadError, setLoadError] = useState<{ message: string; retry: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // DX-354b: las fechas son las de la sede de la pantalla (su aviso único lo da el odontograma).
  const stamp = useSedeStamp(token);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // DX-132: el corte de la fecha lo hace el servidor, en el día de la sede
        // (el mismo que la carta), no el navegador.
        const data = await getToothTimeline(token, patientId, toothNumber, asOf ?? undefined);
        if (cancelled) return;
        setRecords(data);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        // Una fecha no válida no se arregla reintentando: sin «Reintentar».
        const dateMessage = asOfErrorMessage(err);
        setLoadError(
          dateMessage !== null
            ? { message: dateMessage, retry: false }
            : { message: apiErrorMessage(err, copy.genericLoadError), retry: true },
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, toothNumber, refreshKey, reloadKey, asOf]);

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loading}
      </p>
    );
  }

  if (loadError) {
    return (
      <SectionError
        description={loadError.message}
        onRetry={loadError.retry ? () => setReloadKey((k) => k + 1) : undefined}
      />
    );
  }

  if (records.length === 0) {
    return (
      <p role="status" className="text-sm text-muted">
        {asOf ? copy.emptyAsOf(stamp.civilDate(asOf)) : copy.empty}
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
        className="divide-y divide-border-subtle border-t border-border-subtle"
      >
        {records.map((record) => {
          const catalogEntry = record.catalogItemId ? catalogById?.get(record.catalogItemId) : undefined;
          const label = catalogEntry?.labelEs ?? record.kind;
          const date = stamp.date(record.recordedAt);
          const maybeDate = stamp.maybe.date(record.recordedAt);
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
                    <StatusBadge kind="toothRecord" status={isVoided ? 'VOIDED' : record.status} />
                  </span>
                </div>
                <p className="text-xs text-muted">
                  <span className={cn(isVoided && 'line-through')}>{surfacesLabel(record)}</span>
                  {record.performedByName ? ` · ${copy.by(record.performedByName)}` : null}
                </p>
                {record.notes ? (
                  <p className={cn(isVoided ? 'text-muted line-through' : 'text-ink')}>{record.notes}</p>
                ) : null}
                {record.void ? (
                  <p className="text-xs text-ink">
                    <span className="font-medium">
                      {copy.voidedBy(record.void.performedByName, stamp.date(record.void.recordedAt))}:
                    </span>{' '}
                    «{record.void.reason}»
                  </p>
                ) : null}
                {showVoid ? (
                  <div>
                    <Button
                      type="button"
                      variant="destructive-ghost"
                      size="sm"
                      className="-ml-2"
                      aria-label={maybeDate ? copy.voidActionFor(label, maybeDate) : copy.voidAction + ' ' + label}
                      onClick={() => setVoiding({ id: record.id, label: maybeDate ? copy.recordLabel(label, maybeDate) : label })}
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
