'use client';
import * as React from 'react';
import { Download, FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { apiErrorMessage } from '@/lib/api/error-message';
import { IMPORT_READ_BY_STATUS } from './import-read-busy';
import { formatCurrency } from '@/lib/format/currency';
import {
  IMPORT_ACCEPT,
  MAX_IMPORT_BYTES,
  downloadBalanceErrorsCsv,
  downloadBalanceTemplate,
  errorsFileName,
  removeBalances,
  uploadBalances,
  type BalanceCurrencyTotal,
  type ImportBatchDetail,
} from '@/lib/patient-imports/patient-imports-api';
import { saveCsv } from '@/lib/files/save-csv';
import { ImportIssuesTable } from './import-issues-table';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeNumber } from '@/lib/format/sede-number';
import { Checkbox } from '@/components/ui/checkbox';

export const balancesCopy = {
  title: 'Saldos de los pacientes (opcional)',
  hint: 'Si tus pacientes te deben dinero del programa anterior, sube una hoja con su número de documento, el importe, la moneda y, si la tienes, la fecha desde la que deben. Cada paciente tendrá un «Saldo migrado» en su estado de cuenta y en la cartera. Nada se guarda hasta confirmar la importación.',
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
  // El número llega ya formateado con el formato de la sede (G1-B); el plural sale del número.
  summary: (name: string, rows: number, shown: string) => `${name} · ${shown} ${rows === 1 ? 'fila' : 'filas'}`,
  rows: 'Filas de la hoja',
  toImport: 'Saldos a crear',
  merged: 'Filas sumadas',
  errors: 'Filas con errores',
  totalsLabel: 'Totales por moneda',
  currency: 'Moneda',
  // QA D4: lo que se importa y, aparte, lo de las filas con error.
  importTotal: 'Total de filas válidas',
  errorTotal: 'Total en filas con error',
  totalsNote:
    'Las filas con importe 0, negativo o ilegible no suman en ninguna columna. «Total de filas válidas» es lo que se importará.',
  // QA D1: subir dos veces la misma hoja no duplica la deuda.
  addToExisting: 'Añadir aunque ya tenga saldo migrado',
  addToExistingHint:
    'Sin marcar, un paciente que ya tiene un saldo migrado vivo en esa moneda (de otra importación) no recibe otro: su fila sale como error. Márcalo solo si es otra deuda distinta.',
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
  /** Formato de la sede de la pantalla para los recuentos; sin él, «—». */
  fmt: RegionalFormat | null;
}

/**
 * Paso «Saldos» del asistente (DX-262): subir y validar la hoja de saldos
 * (dry-run, sin escribir) con el total por moneda del archivo y de lo que se
 * importará, y los errores por fila. Es opcional: se puede seguir sin ella.
 */
export function BalancesStep({ token, headingId, batch, onBatch, onBack, onContinue, fmt }: BalancesStepProps) {
  const n = (value: number) => sedeNumber(value, fmt);
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [uploaded, setUploaded] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const sheet = batch.balances;
  const [addToExisting, setAddToExisting] = React.useState(sheet?.addToExisting ?? false);
  // La última hoja elegida: cambiar la casilla la vuelve a validar.
  const lastFile = React.useRef<File | null>(null);

  async function onTemplate() {
    try {
      saveCsv(await downloadBalanceTemplate(token), 'plantilla-saldos.csv', { bom: true });
    } catch (err) {
      notifyError(apiErrorMessage(err, balancesCopy.templateError), {
        onRetry: () => void onTemplate(),
      });
    }
  }

  async function onFile(chosen: File | undefined, add = addToExisting) {
    if (!chosen) return;
    lastFile.current = chosen;
    setError(null);
    if (chosen.size > MAX_IMPORT_BYTES) {
      setError(balancesCopy.tooBig);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setBusy(true);
    try {
      setUploaded(0);
      onBatch(await uploadBalances(token, batch.id, chosen, setUploaded, add));
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: balancesCopy.error, byStatus: IMPORT_READ_BY_STATUS }));
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
      notifyError(apiErrorMessage(err, balancesCopy.removeError), {
        onRetry: () => void onRemove(),
      });
    } finally {
      setRemoving(false);
    }
  }

  async function onReport(fileName: string) {
    try {
      saveCsv(await downloadBalanceErrorsCsv(token, batch.id), errorsFileName(fileName), { bom: true });
    } catch (err) {
      notifyError(apiErrorMessage(err, balancesCopy.reportError), {
        onRetry: () => void onReport(fileName),
      });
    }
  }

  const sending = uploaded !== null && uploaded < 1;
  const percent = Math.round((uploaded ?? 0) * 100);

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-5">
      <h2 id={headingId} tabIndex={-1} className="t-title text-ink focus:outline-none">
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
      <Checkbox
        id={`${id}-add`}
        checked={addToExisting}
        disabled={busy}
        onChange={(e) => {
          const next = e.target.checked;
          setAddToExisting(next);
          if (lastFile.current) void onFile(lastFile.current, next);
        }}
        label={balancesCopy.addToExisting}
        description={<span className="block max-w-prose">{balancesCopy.addToExistingHint}</span>}
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
              className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-sunken"
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
              <span className="truncate">{balancesCopy.summary(sheet.fileName, sheet.totalRows, n(sheet.totalRows))}</span>
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
                <dt className="t-overline">{label}</dt>
                <dd className="t-title tnum text-ink">{n(value)}</dd>
              </div>
            ))}
          </dl>
          <CurrencyTotalsTable fileTotals={sheet.fileTotals} validTotals={sheet.validTotals} />
          <p className="max-w-prose text-sm text-muted">{balancesCopy.totalsNote}</p>
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
          // Sin pacientes ni saldos que importar, no hay nada que confirmar.
          disabled={busy || !batch.canConfirm}
          onClick={onContinue}
          className="w-full sm:w-auto"
        >
          {sheet ? balancesCopy.continue : balancesCopy.skip}
        </Button>
      </div>
    </section>
  );
}

/**
 * Lo que se importa y lo que traen las filas con error, por moneda (nunca se
 * mezclan). Las dos columnas suman el total legible del archivo (QA D4).
 */
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
            <TableHead className="text-right">{balancesCopy.importTotal}</TableHead>
            <TableHead className="text-right">{balancesCopy.errorTotal}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {currencies.map((currency) => (
            <TableRow key={currency}>
              <TableCell data-label={balancesCopy.currency} className="font-medium">
                {currency}
              </TableCell>
              <TableCell data-label={balancesCopy.importTotal} className="tabular-nums sm:text-right">
                {formatCurrency(amountOf(validTotals, currency), currency)}
              </TableCell>
              <TableCell data-label={balancesCopy.errorTotal} className="tabular-nums sm:text-right">
                {formatCurrency(
                  Math.max(0, Math.round((amountOf(fileTotals, currency) - amountOf(validTotals, currency)) * 100) / 100),
                  currency,
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
