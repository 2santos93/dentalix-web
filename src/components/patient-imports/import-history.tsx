'use client';
import * as React from 'react';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Pagination } from '@/components/shared/pagination';
import { notifyError } from '@/components/errors/notify';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatDateTime } from '@/lib/format/date';
import { 
  downloadErrorsCsv,
  isInProgress,
  errorsFileName,
  listImports,
  undoBalances,
  undoImport,
  type ImportBatch
} from '@/lib/patient-imports/patient-imports-api';
import { saveCsv } from '@/lib/files/save-csv';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeNumber } from '@/lib/format/sede-number';

const HISTORY_POLL_MS = 3000;

/** Saldos migrados vivos del lote (DX-262). */
function importedBalances(b: ImportBatch): number {
  return (b.balances?.imported ?? []).reduce((n, t) => n + t.count, 0);
}

export const historyCopy = {
  title: 'Historial de importaciones',
  listLabel: 'Importaciones de la clínica',
  loadError: 'No se pudo cargar el historial de importaciones.',
  refreshError: 'No se pudo actualizar el historial de importaciones.',
  // Los recuentos llegan ya formateados con el formato de la sede (G1-B).
  progress: (done: string, total: string) => `${done} de ${total} filas procesadas`,
  empty: 'Aún no has importado pacientes',
  emptyHint: 'Cuando confirmes una importación, aparecerá aquí con su resultado y la opción de deshacerla.',
  meta: (date: string, author: string | null) => `${date}${author ? ` · ${author}` : ''}`,
  counts: (created: string, updated: string, rejected: string) =>
    `${created} creados · ${updated} actualizados · ${rejected} duplicados o con error`,
  undone: (created: string, filled: string, balances: string | null) =>
    `Deshecho: ${created} pacientes retirados, ${filled} fichas revertidas${
      balances ? `, ${balances} saldos migrados retirados` : ''
    }`,
  report: 'Informe',
  reportFor: (name: string) => `Descargar el informe de errores de ${name}`,
  reportError: 'No se pudo descargar el informe.',
  undo: 'Deshacer lote',
  undoFor: (name: string) => `Deshacer el lote ${name}`,
  undoTitle: 'Deshacer este lote',
  undoDescription: (created: string, balances: string | null) =>
    `Se retirarán los ${created} pacientes que creó este lote y se vaciarán los campos que rellenó (si nadie los cambió después)${
      balances ? `; se retirarán también sus ${balances} saldos migrados` : ''
    }. No se puede si alguno ya tiene citas, historia clínica, planes o pagos, o si un saldo migrado tiene abonos.`,
  undoConfirm: 'Deshacer lote',
  undoError: 'No se pudo deshacer el lote.',
  undoDone: 'Lote deshecho.',
  // DX-262: retirar solo los saldos migrados.
  undoBalances: 'Retirar saldos migrados',
  undoBalancesFor: (name: string) => `Retirar los saldos migrados de ${name}`,
  undoBalancesTitle: 'Retirar los saldos migrados',
  undoBalancesDescription: (balances: string) =>
    `Se retirarán sus ${balances} saldos migrados del estado de cuenta y de la cartera; los pacientes no se tocan. No se puede si algún saldo ya tiene abonos: anúlalos antes.`,
  undoBalancesConfirm: 'Retirar saldos',
  undoBalancesError: 'No se pudieron retirar los saldos migrados.',
  undoBalancesDone: 'Saldos migrados retirados.',
  ambiguous: (n: number, shown: string) =>
    `${shown} ${n === 1 ? 'saldo no se creó' : 'saldos no se crearon'}: su documento es de varios pacientes.`,
};

/**
 * Historial de importaciones de la clínica (DX-107) con su resultado, el
 * informe de errores y «Deshacer lote». Estados de carga, vacío y error con
 * «Reintentar» (escalón 1).
 */
export function ImportHistory({
  token,
  reloadKey,
  fmt,
}: {
  token: string;
  reloadKey: number;
  /** Formato de la sede de la pantalla para los recuentos; sin él, «—» (el aviso lo pone la pantalla). */
  fmt: RegionalFormat | null;
}) {
  const n = (value: number) => sedeNumber(value, fmt);
  const [items, setItems] = React.useState<ImportBatch[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);
  // Refresco en segundo plano mientras un lote importa (sin esqueleto).
  const [pollTick, setPollTick] = React.useState(0);
  const pollFailed = React.useRef(false);
  const pollToast = React.useRef<string | null>(null);
  const [undoing, setUndoing] = React.useState<ImportBatch | null>(null);
  // DX-262: deshacer el lote entero o retirar solo sus saldos migrados.
  const [undoMode, setUndoMode] = React.useState<'batch' | 'balances'>('batch');
  const [undoBusy, setUndoBusy] = React.useState(false);
  const [undoError, setUndoError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await listImports(token, page);
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setPageSize(result.pageSize);
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
  }, [token, reloadKey, retryKey, page]);

  // Mientras haya un lote en cola o importando, la lista se refresca sola.
  // Un fallo del refresco no tapa lo que se ve: un aviso (solo el primero).
  const active = items.some((b) => isInProgress(b.status));
  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await listImports(token, page);
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        pollFailed.current = false;
        // El aviso de la racha de fallos no se queda si el sondeo se recupera solo.
        if (pollToast.current) {
          toast.dismiss(pollToast.current);
          pollToast.current = null;
        }
      } catch (err) {
        if (cancelled) return;
        if (!pollFailed.current) {
          // Way-Out Rule (DESIGN.md): el aviso trae «Reintentar» (vuelve a consultar).
          pollToast.current = notifyError(apiErrorMessage(err, historyCopy.refreshError), {
            onRetry: () => setPollTick((t) => t + 1),
          });
        }
        pollFailed.current = true;
      } finally {
        if (!cancelled) setPollTick((t) => t + 1);
      }
    }, HISTORY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, page, active, pollTick]);

  async function report(batch: ImportBatch) {
    try {
      saveCsv(await downloadErrorsCsv(token, batch.id), errorsFileName(batch.fileName), { bom: true });
    } catch (err) {
      notifyError(apiErrorMessage(err, historyCopy.reportError), {
        onRetry: () => void report(batch),
      });
    }
  }

  async function confirmUndo() {
    if (!undoing) return;
    setUndoBusy(true);
    setUndoError(null);
    const balancesOnly = undoMode === 'balances';
    try {
      const updated = balancesOnly ? await undoBalances(token, undoing.id) : await undoImport(token, undoing.id);
      setItems((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setUndoing(null);
      toast.success(balancesOnly ? historyCopy.undoBalancesDone : historyCopy.undoDone);
    } catch (err) {
      setUndoError(apiErrorMessage(err, balancesOnly ? historyCopy.undoBalancesError : historyCopy.undoError));
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
            <li key={b.id} className="flex flex-col gap-2 border-b border-border-subtle p-4 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 break-all font-medium text-ink">{b.fileName}</span>
                <StatusBadge kind="patientImport" status={b.status} />
              </div>
              <p className="tabular-nums text-muted">
                {historyCopy.meta(formatDateTime(b.confirmedAt ?? b.createdAt), b.createdBy.fullName)}
              </p>
              {b.balances && b.balances.progress.ambiguous > 0 ? (
                <p className="text-warning-text">{historyCopy.ambiguous(b.balances.progress.ambiguous, n(b.balances.progress.ambiguous))}</p>
              ) : null}
              <p className="tabular-nums text-ink">
                {b.status === 'UNDONE'
                  ? historyCopy.undone(
                      n(b.undoneCreated ?? 0),
                      n(b.undoneFilled ?? 0),
                      b.balances?.undoneCount ? n(b.balances.undoneCount) : null,
                    )
                  : isInProgress(b.status)
                    ? historyCopy.progress(n(b.progress.processedRows), n(b.progress.preparedRows))
                    : historyCopy.counts(
                        n(b.progress.createdCount),
                        n(b.progress.updatedCount),
                        n(b.totals.duplicateRows + b.totals.errorRows),
                      )}
              </p>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {b.reportAvailable && b.totals.errorRows + b.totals.duplicateRows > 0 ? (
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
                {b.balances?.canUndo ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label={historyCopy.undoBalancesFor(b.fileName)}
                    onClick={() => {
                      setUndoError(null);
                      setUndoMode('balances');
                      setUndoing(b);
                    }}
                  >
                    {historyCopy.undoBalances}
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
                      setUndoMode('batch');
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
        <div className="mt-3">
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} disabled={loading} />
        </div>
      </AsyncSection>
      <ConfirmDialog
        open={undoing !== null}
        onOpenChange={(open) => {
          if (!open) setUndoing(null);
        }}
        title={undoMode === 'balances' ? historyCopy.undoBalancesTitle : historyCopy.undoTitle}
        description={
          undoing
            ? undoMode === 'balances'
              ? historyCopy.undoBalancesDescription(n(importedBalances(undoing)))
              : historyCopy.undoDescription(
                  n(undoing.progress.createdCount),
                  importedBalances(undoing) > 0 ? n(importedBalances(undoing)) : null,
                )
            : undefined
        }
        confirmLabel={undoMode === 'balances' ? historyCopy.undoBalancesConfirm : historyCopy.undoConfirm}
        onConfirm={() => void confirmUndo()}
        confirming={undoBusy}
        error={undoError}
      />
    </section>
  );
}
