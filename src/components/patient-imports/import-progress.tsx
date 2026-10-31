'use client';
import * as React from 'react';
import { Download } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format/currency';
import { 
  isInProgress,
  type ImportBatch} from '@/lib/patient-imports/patient-imports-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeNumber } from '@/lib/format/sede-number';

const copy = {
  title: (name: string) => `Importación de ${name}`,
  progressLabel: 'Avance de la importación',
  // Los recuentos llegan ya formateados con el formato de la sede (G1-B); el plural sale del número.
  progress: (done: string, total: string) => `${done} de ${total} filas procesadas`,
  working: 'Puedes seguir trabajando: la importación continúa aunque salgas de esta pantalla.',
  created: 'Creados',
  updated: 'Actualizados',
  skipped: 'Saltados',
  failed: 'Fallidos',
  failedNote:
    'La importación se detuvo con errores. Lo importado hasta ahora se conserva; puedes deshacer el lote desde el historial.',
  report: 'Descargar informe de errores',
  balances: (done: string, total: string) => `Saldos migrados: ${done} de ${total}`,
  balancesImported: 'Importado por moneda:',
  balancesSkipped: (n: number, shown: string) =>
    `${shown} ${n === 1 ? 'saldo no se creó' : 'saldos no se crearon'}: su paciente no existía al importar.`,
  balancesExisting: (n: number, shown: string) =>
    `${shown} ${n === 1 ? 'saldo no se creó' : 'saldos no se crearon'}: su paciente ya tenía un saldo migrado en esa moneda de otra importación.`,
  balancesAmbiguous: (n: number, shown: string) =>
    `${shown} ${n === 1 ? 'saldo no se creó' : 'saldos no se crearon'}: su documento es de varios pacientes. Corrige las fichas repetidas.`,
  consent: 'Recuerda pedir la autorización de datos a los pacientes importados: su ficha la marca pendiente.',
};

/** Avance y resultado de un lote confirmado (DX-107). */
export function ImportProgress({
  batch,
  headingId,
  onReport,
  fmt,
}: {
  batch: ImportBatch;
  headingId: string;
  onReport: () => void;
  /** Formato de la sede de la pantalla para los recuentos; sin él, «—». */
  fmt: RegionalFormat | null;
}) {
  const n = (value: number) => sedeNumber(value, fmt);
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
        <h2 id={headingId} tabIndex={-1} className="min-w-0 break-words text-lg font-semibold text-ink focus:outline-none">
          {copy.title(batch.fileName)}
        </h2>
        <StatusBadge kind="patientImport" status={batch.status} />
      </div>
      <div className="flex flex-col gap-1.5">
        <progress
          aria-label={copy.progressLabel}
          max={100}
          value={progress.percent}
          className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-sunken [&::-webkit-progress-value]:bg-primary"
        />
        <p className="text-sm tabular-nums text-muted" aria-live="polite">
          {copy.progress(n(progress.processedRows), n(progress.preparedRows))}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {counts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 border-l border-border pl-3">
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">{n(value)}</dd>
          </div>
        ))}
      </dl>
      {batch.balances && batch.balances.preparedCount > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="tabular-nums text-ink">
            {copy.balances(n(batch.balances.progress.processed), n(batch.balances.preparedCount))}
          </p>
          {batch.balances.imported.length > 0 ? (
            <p className="break-words tabular-nums text-muted">
              {copy.balancesImported}{' '}
              {batch.balances.imported.map((t) => formatCurrency(t.amount, t.currency)).join(' · ')}
            </p>
          ) : null}
          {batch.balances.progress.skipped > 0 ? (
            <p className="text-warning-text">{copy.balancesSkipped(batch.balances.progress.skipped, n(batch.balances.progress.skipped))}</p>
          ) : null}
          {batch.balances.progress.existing > 0 ? (
            <p className="text-warning-text">{copy.balancesExisting(batch.balances.progress.existing, n(batch.balances.progress.existing))}</p>
          ) : null}
          {batch.balances.progress.ambiguous > 0 ? (
            <p className="text-warning-text">{copy.balancesAmbiguous(batch.balances.progress.ambiguous, n(batch.balances.progress.ambiguous))}</p>
          ) : null}
        </div>
      ) : null}
      {active ? <p className="text-sm text-muted">{copy.working}</p> : null}
      {batch.status === 'FAILED' ? <p className="text-sm text-danger-text">{copy.failedNote}</p> : null}
      {batch.status === 'COMPLETED' && progress.createdCount > 0 ? (
        <p className="text-sm text-muted">{copy.consent}</p>
      ) : null}
      {!active && batch.reportAvailable && (batch.totals.errorRows > 0 || batch.totals.duplicateRows > 0) ? (
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
