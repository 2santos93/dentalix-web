'use client';
import * as React from 'react';
import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { MAX_IMPORT_BYTES } from '@/lib/patient-imports/import-upload-routes';
import {
  BANK_STATEMENT_CHANGED,
  STATEMENT_ACCEPT,
  confirmStatement,
  inspectStatement,
  mappingComplete,
  previewStatement,
  type BankAccount,
  type BankStatementConfirm,
  type BankStatementInspect,
  type BankStatementIssue,
  type BankStatementMapping,
  type BankStatementPreview,
} from '@/lib/bank-reconciliation/bank-reconciliation-api';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import { FormModal } from '@/components/shared/form-modal';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { Wizard } from '@/components/ui/wizard';
import { UploadStatus } from '@/components/patient-imports/patient-import-wizard';
import { IMPORT_READ_BY_STATUS } from '@/components/patient-imports/import-read-busy';
import { StatementMappingFields } from './statement-mapping-fields';

export const statementImportCopy = {
  title: 'Subir extracto del banco',
  description: (account: string) =>
    `Movimientos de «${account}». El archivo no se guarda: solo las entradas (fecha, referencia, importe y descripción).`,
  steps: ['Archivo', 'Columnas', 'Vista previa'],
  fileTitle: 'Elige el extracto',
  fileHint:
    'Expórtalo desde la banca en línea en CSV o Excel (.xlsx), de hasta 5 MB. Solo se importan las entradas; las salidas se ignoran.',
  fileLabel: 'Extracto del banco (CSV o .xlsx)',
  chooseFile: 'Elegir archivo',
  reading: 'Leyendo el extracto…',
  tooBig: 'El archivo pesa más de 5 MB. Exporta un período más corto.',
  readError: 'No se pudo leer el extracto. Intenta de nuevo.',
  fileSummary: (name: string, rows: number) => `${name} · ${rows} ${rows === 1 ? 'fila' : 'filas'}`,
  otherFile: 'Elegir otro archivo',
  savedMapping:
    'Usamos las columnas que elegiste la última vez para esta cuenta. Revísalas si el banco cambió su formato.',
  suggestedMapping: 'Propusimos las columnas por sus nombres. Revísalas antes de seguir.',
  mappingIncomplete: 'Elige la fecha, la referencia y el importe (o la columna de créditos).',
  toPreview: 'Ver vista previa',
  previewing: 'Preparando la vista previa… no se guarda nada todavía.',
  previewError: 'No se pudo preparar la vista previa. Intenta de nuevo.',
  previewTitle: 'Vista previa',
  previewHint: 'Nada se ha guardado todavía.',
  period: (from: string, to: string) => `Del ${from} al ${to}`,
  newRows: 'Entradas nuevas',
  duplicateRows: 'Ya importadas',
  ignoredRows: 'Salidas ignoradas',
  errorRows: 'Filas con error',
  issuesTitle: 'Filas con error (no se importan)',
  issuesLabel: 'Filas del extracto con error',
  issuesMore: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
  row: 'Fila',
  reason: 'Motivo',
  rowsTitle: 'Primeras entradas',
  rowsLabel: 'Primeras entradas del extracto',
  colDate: 'Fecha',
  colReference: 'Referencia',
  colAmount: 'Importe',
  colDescription: 'Descripción',
  colState: 'Estado',
  isNew: 'Nueva',
  isDuplicate: 'Ya importada',
  noReference: 'Sin referencia',
  nothingNew: 'No hay entradas nuevas que importar: este extracto ya está en la cuenta.',
  back: 'Cambiar columnas',
  confirm: (n: number) => `Importar ${n} ${n === 1 ? 'movimiento' : 'movimientos'}`,
  importing: 'Importando y emparejando…',
  confirmError: 'No se pudo importar el extracto. Intenta de nuevo.',
  changed: 'El archivo cambió desde la vista previa. Vuelve a elegirlo.',
};
const copy = statementImportCopy;

interface StatementImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  account: BankAccount;
  stamp: SedeStamp;
  onImported: (result: BankStatementConfirm) => void;
}

type Step = 0 | 1 | 2;

/**
 * DX-571: subir el extracto del banco de una cuenta en tres pasos (archivo →
 * columnas → vista previa) y confirmarlo. El archivo vive solo en el
 * navegador: la vista previa no escribe y «Importar» lo vuelve a subir con el
 * SHA-256 de la vista previa (si cambió, la API responde 409). Los tres pasos
 * van por la ruta de subida de la web (hasta 5 MB), no por el proxy `/api/v1`.
 */
export function StatementImportModal({
  open,
  onOpenChange,
  token,
  account,
  stamp,
  onImported,
}: StatementImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(0);
  const [file, setFile] = useState<File | null>(null);
  const [inspect, setInspect] = useState<BankStatementInspect | null>(null);
  const [mapping, setMapping] = useState<BankStatementMapping | null>(null);
  const [preview, setPreview] = useState<BankStatementPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep(0);
    setFile(null);
    setInspect(null);
    setMapping(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function onFile(chosen: File | undefined) {
    if (!chosen) return;
    setError(null);
    if (chosen.size > MAX_IMPORT_BYTES) {
      setError(copy.tooBig);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setBusy(true);
    setUploaded(0);
    try {
      const result = await inspectStatement(token, account.id, chosen, setUploaded);
      setFile(chosen);
      setInspect(result);
      setMapping(result.suggestedMapping);
      setPreview(null);
      setStep(1);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: copy.readError, byStatus: IMPORT_READ_BY_STATUS }));
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setBusy(false);
      setUploaded(null);
    }
  }

  async function onPreview() {
    if (!file || !mapping) return;
    if (!mappingComplete(mapping)) {
      setError(copy.mappingIncomplete);
      return;
    }
    setBusy(true);
    setUploaded(0);
    setError(null);
    try {
      setPreview(await previewStatement(token, account.id, file, mapping, setUploaded));
      setStep(2);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: copy.previewError, byStatus: IMPORT_READ_BY_STATUS }));
    } finally {
      setBusy(false);
      setUploaded(null);
    }
  }

  async function onConfirm() {
    if (!file || !mapping || !preview) return;
    setBusy(true);
    setUploaded(0);
    setError(null);
    try {
      onImported(await confirmStatement(token, account.id, file, mapping, preview.fileSha256, setUploaded));
    } catch (err) {
      if (err instanceof ApiError && err.code === BANK_STATEMENT_CHANGED) {
        reset();
        setError(copy.changed);
      } else {
        setError(apiErrorMessage(err, { fallback: copy.confirmError, byStatus: IMPORT_READ_BY_STATUS }));
      }
    } finally {
      setBusy(false);
      setUploaded(null);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 1) void onPreview();
    else if (step === 2) void onConfirm();
  }

  const money = (amount: number) => stamp.money(amount, account.currency);
  const day = (iso: string) => stamp.civilDate(iso);

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description(account.name)}
      onSubmit={handleSubmit}
      hideSubmit={step === 0}
      submitLabel={step === 1 ? copy.toPreview : copy.confirm(preview?.newRows ?? 0)}
      submitting={busy && step !== 0}
      submitDisabled={step === 2 && (preview?.newRows ?? 0) === 0}
      error={step === 0 ? null : error}
      size="lg"
      touchTargets
    >
      <Wizard
        steps={copy.steps.map((label, i) => ({ key: String(i), label }))}
        current={step}
        disabled={busy}
        onStepChange={(i) => {
          if (i === 0) reset();
          else if (i === 1 && inspect) setStep(1);
          else if (i === 2 && preview) setStep(2);
        }}
      >
        {step === 0 ? (
          <section aria-label={copy.fileTitle} className="flex flex-col gap-4">
            <p className="max-w-prose text-sm text-muted">{copy.fileHint}</p>
            <input
              ref={inputRef}
              type="file"
              accept={STATEMENT_ACCEPT}
              aria-label={copy.fileLabel}
              tabIndex={-1}
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <div>
              <Button
                type="button"
                loading={busy}
                onClick={() => inputRef.current?.click()}
                className="w-full sm:w-auto"
              >
                <Upload aria-hidden />
                {copy.chooseFile}
              </Button>
            </div>
            {busy ? <UploadStatus uploaded={uploaded} done={copy.reading} /> : null}
            {error ? <InlineError variant="summary">{error}</InlineError> : null}
          </section>
        ) : null}

        {step >= 1 && inspect && mapping ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
              <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="truncate">{copy.fileSummary(file?.name ?? '', inspect.totalRows)}</span>
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}>
              {copy.otherFile}
            </Button>
          </div>
        ) : null}

        {step === 1 && inspect && mapping ? (
          <section aria-label={copy.steps[1]} className="flex min-w-0 flex-col gap-4">
            <Callout tone="info">{inspect.usesSavedMapping ? copy.savedMapping : copy.suggestedMapping}</Callout>
            <StatementMappingFields
              inspect={inspect}
              mapping={mapping}
              onMappingChange={(next) => {
                setMapping(next);
                setPreview(null);
                setError(null);
              }}
              disabled={busy}
            />
            {busy ? <UploadStatus uploaded={uploaded} done={copy.previewing} /> : null}
          </section>
        ) : null}

        {step === 2 && preview ? (
          <PreviewResult
            preview={preview}
            money={money}
            day={day}
            onBack={() => setStep(1)}
            busy={busy}
            uploaded={uploaded}
          />
        ) : null}
      </Wizard>
    </FormModal>
  );
}

function PreviewResult({
  preview,
  money,
  day,
  onBack,
  busy,
  uploaded,
}: {
  preview: BankStatementPreview;
  money: (amount: number) => string;
  day: (iso: string) => string;
  onBack: () => void;
  busy: boolean;
  uploaded: number | null;
}) {
  const totals: [string, number][] = [
    [copy.newRows, preview.newRows],
    [copy.duplicateRows, preview.duplicateRows],
    [copy.ignoredRows, preview.ignoredRows],
    [copy.errorRows, preview.errorRows],
  ];
  const issueColumns: DataListColumn<BankStatementIssue>[] = [
    { id: 'row', header: copy.row, numeric: true, mobile: 'trailing', cell: (i) => i.rowNumber },
    { id: 'reason', header: copy.reason, mobile: 'primary', cell: (i) => i.message },
  ];
  type Row = BankStatementPreview['rows'][number];
  const rowColumns: DataListColumn<Row>[] = [
    { id: 'date', header: copy.colDate, cellClassName: 'tabular-nums', cell: (r) => day(r.bookedOn) },
    {
      id: 'reference',
      header: copy.colReference,
      mobile: 'primary',
      cell: (r) =>
        r.reference ? (
          <span className="font-mono">{r.reference}</span>
        ) : (
          <span className="text-muted">{copy.noReference}</span>
        ),
      mobileCell: (r) => r.reference ?? copy.noReference,
    },
    { id: 'amount', header: copy.colAmount, numeric: true, mobile: 'trailing', cell: (r) => money(r.amount) },
    {
      id: 'description',
      header: copy.colDescription,
      showFrom: 'md',
      cell: (r) => <span className="break-words text-muted">{r.description ?? ''}</span>,
      mobileCell: (r) => r.description,
    },
    { id: 'state', header: copy.colState, cell: (r) => (r.duplicate ? copy.isDuplicate : copy.isNew) },
  ];
  return (
    <section aria-label={copy.previewTitle} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="t-title text-ink">{copy.previewTitle}</h3>
        <p className="text-sm text-muted">
          {copy.previewHint}
          {preview.periodFrom && preview.periodTo
            ? ` ${copy.period(day(preview.periodFrom), day(preview.periodTo))}.`
            : null}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {totals.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 border-l border-border pl-3">
            <dt className="t-overline">{label}</dt>
            <dd className="t-title tnum text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {preview.newRows === 0 ? <Callout tone="warning">{copy.nothingNew}</Callout> : null}
      {preview.issues.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-ink">{copy.issuesTitle}</h4>
          <DataList
            label={copy.issuesLabel}
            rows={preview.issues}
            columns={issueColumns}
            getRowKey={(i) => `${i.rowNumber}-${i.code}`}
          />
          {preview.errorRows > preview.issues.length ? (
            <p className="text-sm text-muted">{copy.issuesMore(preview.issues.length, preview.errorRows)}</p>
          ) : null}
        </div>
      ) : null}
      {preview.rows.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-ink">{copy.rowsTitle}</h4>
          <DataList
            label={copy.rowsLabel}
            rows={preview.rows}
            columns={rowColumns}
            getRowKey={(r) => String(r.rowNumber)}
          />
        </div>
      ) : null}
      <div>
        <Button type="button" variant="secondary" onClick={onBack} disabled={busy} className="w-full sm:w-auto">
          {copy.back}
        </Button>
      </div>
      {busy ? <UploadStatus uploaded={uploaded} done={copy.importing} /> : null}
    </section>
  );
}
