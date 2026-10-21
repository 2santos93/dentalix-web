'use client';
import * as React from 'react';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { notifyError } from '@/components/errors/notify';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatDateTime } from '@/lib/format/date';
import {
  STATUS_LABELS,
  downloadErrorsCsv,
  errorsFileName,
  listImports,
  saveCsv,
  undoImport,
  type ImportBatch,
} from '@/lib/patient-imports/patient-imports-api';
import { STATUS_VARIANT } from './import-progress';

export const historyCopy = {
  title: 'Historial de importaciones',
  listLabel: 'Importaciones de la clínica',
  loadError: 'No se pudo cargar el historial de importaciones.',
  empty: 'Aún no has importado pacientes',
  emptyHint: 'Cuando confirmes una importación, aparecerá aquí con su resultado y la opción de deshacerla.',
  meta: (date: string, author: string | null) => `${date}${author ? ` · ${author}` : ''}`,
  counts: (b: ImportBatch) =>
    `${b.progress.createdCount.toLocaleString('es-CO')} creados · ${b.progress.updatedCount.toLocaleString('es-CO')} actualizados · ${(b.totals.duplicateRows + b.totals.errorRows).toLocaleString('es-CO')} duplicados o con error`,
  undone: (b: ImportBatch) =>
    `Deshecho: ${(b.undoneCreated ?? 0).toLocaleString('es-CO')} pacientes retirados, ${(b.undoneFilled ?? 0).toLocaleString('es-CO')} fichas revertidas`,
  report: 'Informe',
  reportFor: (name: string) => `Descargar el informe de errores de ${name}`,
  reportError: 'No se pudo descargar el informe.',
  undo: 'Deshacer lote',
  undoFor: (name: string) => `Deshacer el lote ${name}`,
  undoTitle: 'Deshacer este lote',
  undoDescription: (b: ImportBatch) =>
    `Se retirarán los ${b.progress.createdCount.toLocaleString('es-CO')} pacientes que creó este lote y se vaciarán los campos que rellenó (si nadie los cambió después). No se puede si alguno ya tiene citas, historia clínica, planes o pagos.`,
  undoConfirm: 'Deshacer lote',
  undoError: 'No se pudo deshacer el lote.',
  undoDone: 'Lote deshecho.',
};

/**
 * Historial de importaciones de la clínica (DX-107) con su resultado, el
 * informe de errores y «Deshacer lote». Estados de carga, vacío y error con
 * «Reintentar» (escalón 1).
 */
export function ImportHistory({ token, reloadKey }: { token: string; reloadKey: number }) {
  const [items, setItems] = React.useState<ImportBatch[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);
  const [undoing, setUndoing] = React.useState<ImportBatch | null>(null);
  const [undoBusy, setUndoBusy] = React.useState(false);
  const [undoError, setUndoError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const page = await listImports(token);
        if (cancelled) return;
        setItems(page.items);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, historyCopy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey, retryKey]);

  async function report(batch: ImportBatch) {
    try {
      saveCsv(await downloadErrorsCsv(token, batch.id), errorsFileName(batch.fileName));
    } catch (err) {
      notifyError(apiErrorMessage(err, historyCopy.reportError), { onRetry: () => void report(batch) });
    }
  }

  async function confirmUndo() {
    if (!undoing) return;
    setUndoBusy(true);
    setUndoError(null);
    try {
      const updated = await undoImport(token, undoing.id);
      setItems((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setUndoing(null);
      toast.success(historyCopy.undoDone);
    } catch (err) {
      setUndoError(apiErrorMessage(err, historyCopy.undoError));
    } finally {
      setUndoBusy(false);
    }
  }

  return (
    <section aria-labelledby="import-history-title" className="flex flex-col gap-3">
      <h2 id="import-history-title" className="text-lg font-semibold text-ink">
        {historyCopy.title}
      </h2>
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setRetryKey((k) => k + 1)}
        isEmpty={items.length === 0}
        emptyTitle={historyCopy.empty}
        emptyDescription={historyCopy.emptyHint}
        emptyIcon={<History aria-hidden />}
        skeleton={<TableSkeleton rows={3} />}
      >
        <ul aria-label={historyCopy.listLabel} className="flex flex-col rounded-xl border border-border bg-surface text-sm">
          {items.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 border-b border-hairline p-4 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 break-all font-medium text-ink">{b.fileName}</span>
                <Badge variant={STATUS_VARIANT[b.status]}>{STATUS_LABELS[b.status]}</Badge>
              </div>
              <p className="tabular-nums text-muted">
                {historyCopy.meta(formatDateTime(b.confirmedAt ?? b.createdAt), b.createdBy.fullName)}
              </p>
              <p className="tabular-nums text-ink">
                {b.status === 'UNDONE' ? historyCopy.undone(b) : historyCopy.counts(b)}
              </p>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {b.totals.errorRows + b.totals.duplicateRows > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label={historyCopy.reportFor(b.fileName)}
                    onClick={() => void report(b)}
                  >
                    {historyCopy.report}
                  </Button>
                ) : null}
                {b.canUndo ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label={historyCopy.undoFor(b.fileName)}
                    onClick={() => {
                      setUndoError(null);
                      setUndoing(b);
                    }}
                  >
                    {historyCopy.undo}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </AsyncSection>
      <ConfirmDialog
        open={undoing !== null}
        onOpenChange={(open) => {
          if (!open) setUndoing(null);
        }}
        title={historyCopy.undoTitle}
        description={undoing ? historyCopy.undoDescription(undoing) : undefined}
        confirmLabel={historyCopy.undoConfirm}
        onConfirm={() => void confirmUndo()}
        confirming={undoBusy}
        error={undoError}
      />
    </section>
  );
}
