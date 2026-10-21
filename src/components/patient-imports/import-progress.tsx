'use client';
import * as React from 'react';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  STATUS_LABELS,
  isInProgress,
  type ImportBatch,
  type ImportStatus,
} from '@/lib/patient-imports/patient-imports-api';

const copy = {
  title: (name: string) => `Importación de ${name}`,
  progressLabel: 'Avance de la importación',
  progress: (done: number, total: number) =>
    `${done.toLocaleString('es-CO')} de ${total.toLocaleString('es-CO')} filas procesadas`,
  working: 'Puedes seguir trabajando: la importación continúa aunque salgas de esta pantalla.',
  created: 'Creados',
  updated: 'Actualizados',
  skipped: 'Saltados',
  failed: 'Fallidos',
  failedNote:
    'La importación se detuvo con errores. Lo importado hasta ahora se conserva; puedes deshacer el lote desde el historial.',
  report: 'Descargar informe de errores',
  consent: 'Recuerda pedir la autorización de datos (Ley 1581) a los pacientes importados: su ficha la marca pendiente.',
};

export const STATUS_VARIANT: Record<ImportStatus, 'success' | 'warning' | 'danger' | 'muted' | 'secondary'> = {
  VALIDATED: 'muted',
  QUEUED: 'secondary',
  RUNNING: 'secondary',
  COMPLETED: 'success',
  FAILED: 'danger',
  UNDONE: 'muted',
  EXPIRED: 'muted',
};

/** Avance y resultado de un lote confirmado (DX-107). */
export function ImportProgress({
  batch,
  headingId,
  onReport,
}: {
  batch: ImportBatch;
  headingId: string;
  onReport: () => void;
}) {
  const active = isInProgress(batch.status);
  const { progress } = batch;
  const counts: [string, number][] = [
    [copy.created, progress.createdCount],
    [copy.updated, progress.updatedCount],
    [copy.skipped, progress.skippedCount],
    [copy.failed, progress.failedCount],
  ];
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={headingId} className="min-w-0 break-words text-lg font-semibold text-ink">
          {copy.title(batch.fileName)}
        </h2>
        <Badge variant={STATUS_VARIANT[batch.status]}>{STATUS_LABELS[batch.status]}</Badge>
      </div>
      <div className="flex flex-col gap-1.5">
        <progress
          aria-label={copy.progressLabel}
          max={100}
          value={progress.percent}
          className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-2 [&::-webkit-progress-value]:bg-primary"
        />
        <p className="text-sm tabular-nums text-muted" aria-live="polite">
          {copy.progress(progress.processedRows, progress.preparedRows)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {counts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 border-l border-border pl-3">
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">{value.toLocaleString('es-CO')}</dd>
          </div>
        ))}
      </dl>
      {active ? <p className="text-sm text-muted">{copy.working}</p> : null}
      {batch.status === 'FAILED' ? <p className="text-sm text-danger">{copy.failedNote}</p> : null}
      {batch.status === 'COMPLETED' && progress.createdCount > 0 ? (
        <p className="text-sm text-muted">{copy.consent}</p>
      ) : null}
      {!active && (batch.totals.errorRows > 0 || batch.totals.duplicateRows > 0) ? (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={onReport}>
            <Download aria-hidden />
            {copy.report}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
