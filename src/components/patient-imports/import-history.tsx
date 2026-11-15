'use client';
import * as React from 'react';
import { BellRing, Download, History, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/status-badge';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Pagination } from '@/components/shared/pagination';
import { notifyError } from '@/components/errors/notify';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { 
  downloadErrorsCsv,
  enableAppointmentReminders,
  isInProgress,
  errorsFileName,
  listImports,
  undoAppointments,
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
  undone: (created: string, filled: string, balances: string | null, appointments: string | null = null) =>
    `Deshecho: ${created} pacientes retirados, ${filled} fichas revertidas${
      balances ? `, ${balances} saldos migrados retirados` : ''
    }${appointments ? `, ${appointments} citas retiradas` : ''}`,
  report: 'Descargar informe de errores',
  actionsFor: (name: string) => `Acciones de ${name}`,
  reportFor: (name: string) => `Descargar el informe de errores de ${name}`,
  reportError: 'No se pudo descargar el informe.',
  undo: 'Deshacer lote',
  undoFor: (name: string) => `Deshacer el lote ${name}`,
  undoTitle: 'Deshacer este lote',
  undoDescription: (created: string, balances: string | null, appointments: string | null = null) =>
    `Se retirarán los ${created} pacientes que creó este lote y se vaciarán los campos que rellenó (si nadie los cambió después)${
      balances ? `; se retirarán también sus ${balances} saldos migrados` : ''
    }${
      appointments ? `; y sus ${appointments} citas importadas que siguen programadas (las confirmadas o atendidas se quedan)` : ''
    }. No se puede si alguno ya tiene otras citas, historia clínica, planes o pagos, o si un saldo migrado tiene abonos.`,
  undoConfirm: 'Deshacer lote',
  // DX-294: mientras responde la API (unos segundos con lotes grandes).
  undoConfirming: 'Deshaciendo…',
  undoWorking: (created: string) =>
    `Deshaciendo el lote: retirando ${created} pacientes. Puede tardar unos segundos; no cierres esta ventana.`,
  undoError: 'No se pudo deshacer el lote.',
  undoDone: 'Lote deshecho.',
  // DX-262: retirar solo los saldos migrados.
  undoBalances: 'Retirar saldos migrados',
  undoBalancesFor: (name: string) => `Retirar los saldos migrados de ${name}`,
  undoBalancesTitle: 'Retirar los saldos migrados',
  undoBalancesDescription: (balances: string) =>
    `Se retirarán sus ${balances} saldos migrados del estado de cuenta y de la cartera; los pacientes no se tocan. No se puede si algún saldo ya tiene abonos: anúlalos antes.`,
  undoBalancesConfirm: 'Retirar saldos',
  undoBalancesConfirming: 'Retirando…',
  undoBalancesWorking: (balances: string) =>
    `Retirando ${balances} saldos migrados. Puede tardar unos segundos; no cierres esta ventana.`,
  undoBalancesError: 'No se pudieron retirar los saldos migrados.',
  undoBalancesDone: 'Saldos migrados retirados.',
  // DX-263: citas importadas.
  appointments: (n: number, shown: string, reminders: boolean) =>
    `${shown} ${n === 1 ? 'cita importada programada' : 'citas importadas programadas'} · ${
      reminders ? 'recordatorios activados' : 'sin recordatorios automáticos'
    }`,
  appointmentsFailed: (n: number, shown: string) =>
    `${shown} ${n === 1 ? 'cita no se creó' : 'citas no se crearon'} al importar: algo cambió en la agenda. Revisa el informe de la hoja de citas.`,
  undoAppointments: 'Retirar citas importadas',
  undoAppointmentsTitle: 'Retirar las citas importadas',
  undoAppointmentsDescription: (live: string) =>
    `Se retirarán de la agenda sus ${live} citas importadas que siguen programadas; las confirmadas, atendidas o canceladas se quedan y los pacientes no se tocan.`,
  undoAppointmentsConfirm: 'Retirar citas',
  undoAppointmentsConfirming: 'Retirando…',
  undoAppointmentsWorking: (live: string) => `Retirando ${live} citas. Puede tardar unos segundos; no cierres esta ventana.`,
  undoAppointmentsError: 'No se pudieron retirar las citas importadas.',
  undoAppointmentsDone: 'Citas importadas retiradas.',
  enableReminders: 'Activar recordatorios de sus citas',
  enableRemindersDone: 'Recordatorios activados: sus citas importadas los recibirán como las demás.',
  enableRemindersError: 'No se pudieron activar los recordatorios.',
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
  // La fecha de confirmación con zona, formato y reloj de la sede del lote (`b.locationId`, DX-354b); el aviso lo pone la pantalla.
  const stamp = useSedeStamp(token, items.map((b) => b.locationId));
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
  // DX-263: o retirar solo sus citas importadas.
  const [undoMode, setUndoMode] = React.useState<'batch' | 'balances' | 'appointments'>('batch');
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
    const run = {
      batch: { call: undoImport, done: historyCopy.undoDone, error: historyCopy.undoError },
      balances: { call: undoBalances, done: historyCopy.undoBalancesDone, error: historyCopy.undoBalancesError },
      appointments: {
        call: undoAppointments,
        done: historyCopy.undoAppointmentsDone,
        error: historyCopy.undoAppointmentsError,
      },
    }[undoMode];
    try {
      const updated = await run.call(token, undoing.id);
      setItems((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setUndoing(null);
      toast.success(run.done);
    } catch (err) {
      setUndoError(apiErrorMessage(err, run.error));
    } finally {
      setUndoBusy(false);
    }
  }

  async function enableReminders(batch: ImportBatch) {
    try {
      const updated = await enableAppointmentReminders(token, batch.id);
      setItems((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      toast.success(historyCopy.enableRemindersDone);
    } catch (err) {
      notifyError(apiErrorMessage(err, historyCopy.enableRemindersError), {
        onRetry: () => void enableReminders(batch),
      });
    }
  }

  function batchActions(b: ImportBatch): RowAction[] {
    return [
      ...(b.reportAvailable && b.totals.errorRows + b.totals.duplicateRows > 0
        ? [{ label: historyCopy.report, icon: <Download aria-hidden />, onSelect: () => void report(b) }]
        : []),
      ...(b.appointments && b.appointments.live > 0 && !b.appointments.remindersEnabledAt && !isInProgress(b.status) && b.status !== 'UNDONE'
        ? [
            {
              label: historyCopy.enableReminders,
              icon: <BellRing aria-hidden />,
              onSelect: () => void enableReminders(b),
            },
          ]
        : []),
      ...(b.appointments?.canUndo
        ? [
            {
              label: historyCopy.undoAppointments,
              icon: <Undo2 aria-hidden />,
              separatorBefore: true,
              onSelect: () => {
                setUndoError(null);
                setUndoMode('appointments');
                setUndoing(b);
              },
            },
          ]
        : []),
      ...(b.balances?.canUndo
        ? [
            {
              label: historyCopy.undoBalances,
              icon: <Undo2 aria-hidden />,
              separatorBefore: !b.appointments?.canUndo,
              onSelect: () => {
                setUndoError(null);
                setUndoMode('balances');
                setUndoing(b);
              },
            },
          ]
        : []),
      ...(b.canUndo
        ? [
            {
              label: historyCopy.undo,
              icon: <Undo2 aria-hidden />,
              destructive: true,
              separatorBefore: !b.balances?.canUndo && !b.appointments?.canUndo,
              onSelect: () => {
                setUndoError(null);
                setUndoMode('batch');
                setUndoing(b);
              },
            },
          ]
        : []),
    ];
  }

  return (
    <section aria-labelledby="import-history-title" className="flex flex-col gap-3">
      <h2 id="import-history-title" className="t-title text-ink">
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
        <ul aria-label={historyCopy.listLabel} className="flex flex-col rounded-lg border border-border bg-surface text-sm">
          {items.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 border-b border-border-subtle p-4 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-all font-medium text-ink">{b.fileName}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <StatusBadge kind="patientImport" status={b.status} />
                  {/* Informe y deshacer, en el «⋯» del lote (sin un hilo de botones por fila). */}
                  {batchActions(b).length > 0 ? (
                    <RowActions
                      label={historyCopy.actionsFor(b.fileName)}
                      actions={batchActions(b)}
                      className="-my-1.5"
                    />
                  ) : null}
                </span>
              </div>
              <p className="tabular-nums text-muted">
                {historyCopy.meta(stamp.dateTime(b.confirmedAt ?? b.createdAt, b.locationId), b.createdBy.fullName)}
              </p>
              {b.balances && b.balances.progress.ambiguous > 0 ? (
                <p className="text-warning-text">{historyCopy.ambiguous(b.balances.progress.ambiguous, n(b.balances.progress.ambiguous))}</p>
              ) : null}
              {b.appointments && b.status !== 'UNDONE' && !isInProgress(b.status) && b.appointments.live > 0 ? (
                <p className="tabular-nums text-muted">
                  {historyCopy.appointments(b.appointments.live, n(b.appointments.live), b.appointments.remindersEnabledAt !== null)}
                </p>
              ) : null}
              {b.appointments && b.appointments.progress.failed > 0 ? (
                <p className="text-warning-text">
                  {historyCopy.appointmentsFailed(b.appointments.progress.failed, n(b.appointments.progress.failed))}
                </p>
              ) : null}
              <p className="tabular-nums text-ink">
                {b.status === 'UNDONE'
                  ? historyCopy.undone(
                      n(b.undoneCreated ?? 0),
                      n(b.undoneFilled ?? 0),
                      b.balances?.undoneCount ? n(b.balances.undoneCount) : null,
                      b.appointments?.undoneCount ? n(b.appointments.undoneCount) : null,
                    )
                  : isInProgress(b.status)
                    ? historyCopy.progress(n(b.progress.processedRows), n(b.progress.preparedRows))
                    : historyCopy.counts(
                        n(b.progress.createdCount),
                        n(b.progress.updatedCount),
                        n(b.totals.duplicateRows + b.totals.errorRows),
                      )}
              </p>
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
          // DX-294: mientras deshace no se cierra (ni con Escape): no se
          // pierde el resultado ni se lanza otro deshacer del mismo lote.
          if (!open && !undoBusy) setUndoing(null);
        }}
        title={
          undoMode === 'balances'
            ? historyCopy.undoBalancesTitle
            : undoMode === 'appointments'
              ? historyCopy.undoAppointmentsTitle
              : historyCopy.undoTitle
        }
        description={
          undoing
            ? undoMode === 'balances'
              ? historyCopy.undoBalancesDescription(n(importedBalances(undoing)))
              : undoMode === 'appointments'
                ? historyCopy.undoAppointmentsDescription(n(undoing.appointments?.live ?? 0))
                : historyCopy.undoDescription(
                    n(undoing.progress.createdCount),
                    importedBalances(undoing) > 0 ? n(importedBalances(undoing)) : null,
                    (undoing.appointments?.live ?? 0) > 0 ? n(undoing.appointments?.live ?? 0) : null,
                  )
            : undefined
        }
        confirmLabel={
          undoMode === 'balances'
            ? historyCopy.undoBalancesConfirm
            : undoMode === 'appointments'
              ? historyCopy.undoAppointmentsConfirm
              : historyCopy.undoConfirm
        }
        confirmingLabel={
          undoMode === 'balances'
            ? historyCopy.undoBalancesConfirming
            : undoMode === 'appointments'
              ? historyCopy.undoAppointmentsConfirming
              : historyCopy.undoConfirming
        }
        onConfirm={() => void confirmUndo()}
        confirming={undoBusy}
        error={undoError}
      >
        {/* Vivo desde que se abre: el lector anuncia el avance al empezar. */}
        <p role="status" className="text-sm text-muted empty:hidden">
          {undoBusy && undoing
            ? undoMode === 'balances'
              ? historyCopy.undoBalancesWorking(n(importedBalances(undoing)))
              : undoMode === 'appointments'
                ? historyCopy.undoAppointmentsWorking(n(undoing.appointments?.live ?? 0))
                : historyCopy.undoWorking(n(undoing.progress.createdCount))
            : null}
        </p>
      </ConfirmDialog>
    </section>
  );
}
