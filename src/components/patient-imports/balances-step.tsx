'use client';
import * as React from 'react';
import { Download, FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatCurrency } from '@/lib/format/currency';
import {
  IMPORT_ACCEPT,
  MAX_IMPORT_BYTES,
  downloadBalanceErrorsCsv,
  downloadBalanceTemplate,
  errorsFileName,
  removeBalances,
  saveCsv,
  uploadBalances,
  type BalanceCurrencyTotal,
  type ImportBatchDetail,
} from '@/lib/patient-imports/patient-imports-api';
import { ImportIssuesTable } from './import-issues-table';

export const balancesCopy = {
  title: 'Saldos de los pacientes (opcional)',
  hint:
    'Si tus pacientes te deben dinero del programa anterior, sube una hoja con su número de documento, el importe, la moneda y, si la tienes, la fecha desde la que deben. Cada paciente tendrá un «Saldo migrado» en su estado de cuenta y en la cartera. Nada se guarda hasta confirmar la importación.',
  fileLabel: 'Hoja de saldos (CSV o .xlsx)',
  choose: 'Subir hoja de saldos',
  other: 'Subir otra hoja',
  template: 'Descargar plantilla de saldos',
  templateError: 'No se pudo descargar la plantilla de saldos.',
  uploading: (fraction: number) => `Subiendo la hoja… ${Math.round(fraction * 100)} %`,
  validating: 'Validando la hoja de saldos… no se guarda ningún saldo todavía.',
  uploadProgress: 'Subida de la hoja de saldos',
  tooBig: 'La hoja pesa más de 5 MB. Divídela en varios archivos más pequeños.',
  error: 'No se pudo validar la hoja de saldos. Intenta de nuevo.',
  remove: 'Quitar la hoja de saldos',
  removeError: 'No se pudo quitar la hoja de saldos.',
  summary: (name: string, rows: number) =>
    `${name} · ${rows.toLocaleString('es-CO')} ${rows === 1 ? 'fila' : 'filas'}`,
  rows: 'Filas de la hoja',
  toImport: 'Saldos a crear',
  merged: 'Filas sumadas',
  errors: 'Filas con errores',
  totalsLabel: 'Totales por moneda',
  currency: 'Moneda',
  fileTotal: 'Total del archivo',
  importTotal: 'Se importará',
  approxNote:
    'Las filas sin fecha toman la de hoy como fecha de corte y se marcan «aprox.»; las del mismo paciente y moneda se suman en un solo saldo.',
  issuesLabel: 'Errores y avisos de la hoja de saldos',
  noIssues: 'Ninguna fila con errores.',
  report: 'Descargar informe de la hoja',
  reportError: 'No se pudo descargar el informe.',
  back: 'Atrás',
  continue: 'Continuar',
  skip: 'Continuar sin saldos',
};

interface BalancesStepProps {
  token: string;
  headingId: string;
  batch: ImportBatchDetail;
  /** El lote con su hoja de saldos nueva (o sin ella). */
  onBatch: (batch: ImportBatchDetail) => void;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Paso «Saldos» del asistente (DX-262): subir y validar la hoja de saldos
 * (dry-run, sin escribir) con el total por moneda del archivo y de lo que se
 * importará, y los errores por fila. Es opcional: se puede seguir sin ella.
 */
export function BalancesStep({ token, headingId, batch, onBatch, onBack, onContinue }: BalancesStepProps) {
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [uploaded, setUploaded] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const sheet = batch.balances;

  async function onTemplate() {
    try {
      saveCsv(await downloadBalanceTemplate(token), 'plantilla-saldos.csv');
    } catch (err) {
      notifyError(apiErrorMessage(err, balancesCopy.templateError), { onRetry: () => void onTemplate() });
    }
  }

  async function onFile(chosen: File | undefined) {
    if (!chosen) return;
    setError(null);
    if (chosen.size > MAX_IMPORT_BYTES) {
      setError(balancesCopy.tooBig);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setBusy(true);
    try {
      setUploaded(0);
      onBatch(await uploadBalances(token, batch.id, chosen, setUploaded));
    } catch (err) {
      setError(apiErrorMessage(err, balancesCopy.error));
    } finally {
      setBusy(false);
      setUploaded(null);
      // La misma hoja, corregida, se puede volver a elegir.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onRemove() {
    setRemoving(true);
    setError(null);
    try {
      onBatch(await removeBalances(token, batch.id));
    } catch (err) {
      notifyError(apiErrorMessage(err, balancesCopy.removeError), { onRetry: () => void onRemove() });
    } finally {
      setRemoving(false);
    }
  }

  async function onReport(fileName: string) {
    try {
      saveCsv(await downloadBalanceErrorsCsv(token, batch.id), errorsFileName(fileName));
    } catch (err) {
      notifyError(apiErrorMessage(err, balancesCopy.reportError), { onRetry: () => void onReport(fileName) });
    }
  }

  const sending = uploaded !== null && uploaded < 1;
  const percent = Math.round((uploaded ?? 0) * 100);

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-5">
      <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
        {balancesCopy.title}
      </h2>
      <p className="max-w-prose text-sm text-muted">{balancesCopy.hint}</p>
      <input
        ref={inputRef}
        id={`${id}-file`}
        type="file"
        accept={IMPORT_ACCEPT}
        aria-label={balancesCopy.fileLabel}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant={sheet ? 'secondary' : 'default'}
          loading={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full sm:w-auto"
        >
          <Upload aria-hidden />
          {sheet ? balancesCopy.other : balancesCopy.choose}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void onTemplate()} className="w-full sm:w-auto">
          <Download aria-hidden />
          {balancesCopy.template}
        </Button>
      </div>
      {busy ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-muted">
            {sending ? balancesCopy.uploading(uploaded) : balancesCopy.validating}
          </p>
          {sending ? (
            <div
              role="progressbar"
              aria-label={balancesCopy.uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <InlineError variant="summary">{error}</InlineError> : null}

      {sheet ? (
        <div className="flex min-w-0 flex-col gap-4 border-t border-border pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
              <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="truncate">{balancesCopy.summary(sheet.fileName, sheet.totalRows)}</span>
            </p>
            <Button type="button" variant="ghost" size="sm" loading={removing} onClick={() => void onRemove()}>
              <Trash2 aria-hidden />
              {balancesCopy.remove}
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {(
              [
                [balancesCopy.rows, sheet.totalRows],
                [balancesCopy.toImport, sheet.preparedCount],
                [balancesCopy.merged, sheet.mergedRows],
                [balancesCopy.errors, sheet.errorRows],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5 border-l border-border pl-3">
                <dt className="text-xs font-medium text-muted">{label}</dt>
                <dd className="text-base font-semibold tabular-nums text-ink">{value.toLocaleString('es-CO')}</dd>
              </div>
            ))}
          </dl>
          <CurrencyTotalsTable fileTotals={sheet.fileTotals} validTotals={sheet.validTotals} />
          <p className="max-w-prose text-sm text-muted">{balancesCopy.approxNote}</p>
          {batch.balanceIssuesTotal > 0 ? (
            <div className="flex flex-col gap-3">
              {batch.reportAvailable ? (
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void onReport(sheet.fileName)}>
                    <Download aria-hidden />
                    {balancesCopy.report}
                  </Button>
                </div>
              ) : null}
              <ImportIssuesTable
                issues={batch.balanceIssues}
                total={batch.balanceIssuesTotal}
                label={balancesCopy.issuesLabel}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">{balancesCopy.noIssues}</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="w-full sm:w-auto">
          {balancesCopy.back}
        </Button>
        <Button
          type="button"
          variant={sheet ? 'default' : 'secondary'}
          disabled={busy}
          onClick={onContinue}
          className="w-full sm:w-auto"
        >
          {sheet ? balancesCopy.continue : balancesCopy.skip}
        </Button>
      </div>
    </section>
  );
}

/** Total del archivo y lo que se importa, por moneda (nunca se mezclan). */
export function CurrencyTotalsTable({
  fileTotals,
  validTotals,
}: {
  fileTotals: BalanceCurrencyTotal[];
  validTotals: BalanceCurrencyTotal[];
}) {
  const currencies = [...new Set([...fileTotals, ...validTotals].map((t) => t.currency))].sort();
  const amountOf = (list: BalanceCurrencyTotal[], currency: string) =>
    list.find((t) => t.currency === currency)?.amount ?? 0;
  if (currencies.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <Table aria-label={balancesCopy.totalsLabel}>
        <TableHeader>
          <TableRow>
            <TableHead>{balancesCopy.currency}</TableHead>
            <TableHead className="text-right">{balancesCopy.fileTotal}</TableHead>
            <TableHead className="text-right">{balancesCopy.importTotal}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {currencies.map((currency) => (
            <TableRow key={currency}>
              <TableCell data-label={balancesCopy.currency} className="font-medium">
                {currency}
              </TableCell>
              <TableCell data-label={balancesCopy.fileTotal} className="tabular-nums sm:text-right">
                {formatCurrency(amountOf(fileTotals, currency), currency)}
              </TableCell>
              <TableCell data-label={balancesCopy.importTotal} className="tabular-nums sm:text-right">
                {formatCurrency(amountOf(validTotals, currency), currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
