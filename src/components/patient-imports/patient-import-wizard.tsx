'use client';
import * as React from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Wizard } from '@/components/ui/wizard';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  IMPORT_ACCEPT,
  MAX_IMPORT_BYTES,
  confirmImport,
  downloadErrorsCsv,
  downloadTemplate,
  errorsFileName,
  getImport,
  inspectFile,
  isInProgress,
  listImports,
  saveCsv,
  validateImport,
  type ColumnMapping,
  type DocType,
  type DuplicateMode,
  type ImportBatchDetail,
  type ImportInspect,
} from '@/lib/patient-imports/patient-imports-api';
import { BalancesStep } from './balances-step';
import { ColumnMappingFields } from './column-mapping-fields';
import { formatCurrency } from '@/lib/format/currency';
import { ImportIssuesTable } from './import-issues-table';
import { ImportProgress } from './import-progress';

export const wizardCopy = {
  steps: ['Subir archivo', 'Columnas y validación', 'Saldos', 'Confirmar'],
  uploadTitle: 'Sube el archivo de pacientes',
  mappingTitle: 'Revisa las columnas y valida',
  uploadHint:
    'CSV o Excel (.xlsx) de hasta 5 MB y 10.000 pacientes. Si vienes de otro programa, exporta su lista de pacientes; si empiezas de cero, usa la plantilla (borra sus dos filas de ejemplo).',
  chooseFile: 'Elegir archivo',
  fileLabel: 'Archivo de pacientes (CSV o .xlsx)',
  template: 'Descargar plantilla',
  templateError: 'No se pudo descargar la plantilla.',
  reading: 'Leyendo el archivo…',
  uploading: (fraction: number) => `Subiendo el archivo… ${Math.round(fraction * 100)} %`,
  uploadProgress: 'Subida del archivo',
  tooBig: 'El archivo pesa más de 5 MB. Divídelo en varios archivos más pequeños.',
  readError: 'No se pudo leer el archivo. Intenta de nuevo.',
  fileSummary: (name: string, rows: number) =>
    `${name} · ${rows.toLocaleString('es-CO')} ${rows === 1 ? 'fila' : 'filas'}`,
  otherFile: 'Elegir otro archivo',
  validate: 'Validar archivo',
  revalidate: 'Volver a validar',
  validating: 'Validando… no se guarda ningún paciente todavía.',
  validateError: 'No se pudo validar el archivo. Intenta de nuevo.',
  dryRunTitle: 'Resultado de la validación',
  dryRunHint: 'Nada se ha guardado todavía: revisa el resultado y continúa para importar.',
  total: 'Filas del archivo',
  valid: 'Pacientes nuevos',
  duplicates: 'Duplicados',
  errors: 'Filas con errores',
  noIssues: 'Ninguna fila con errores ni duplicados.',
  report: 'Descargar informe de errores',
  reportError: 'No se pudo descargar el informe.',
  previewTitle: 'Primeras filas que se importarán',
  previewNew: 'Nuevo',
  previewExisting: 'Ya existe',
  nothingToImport: 'No hay filas que importar: corrige el archivo y vuelve a subirlo.',
  // DX-262 (I2): sin pacientes nuevos, aún se pueden importar sus saldos.
  onlyBalances: 'No hay pacientes nuevos: puedes importar solo sus saldos en el paso siguiente.',
  confirmBalances: (n: number) =>
    `Importar ${n.toLocaleString('es-CO')} ${n === 1 ? 'saldo migrado' : 'saldos migrados'}`,
  continue: 'Continuar',
  back: 'Atrás',
  confirmTitle: 'Confirmar la importación',
  duplicatesLegend: 'Pacientes que ya existen en la clínica (mismo tipo y número de documento)',
  skip: 'Saltarlos: no tocar su ficha',
  fill: 'Actualizar solo los campos vacíos (nunca se pisa un dato)',
  consentNote:
    'Los pacientes importados quedan con la autorización de datos (Ley 1581) pendiente: pídela en su próxima visita desde su ficha.',
  backgroundNote:
    'La importación corre en segundo plano: puedes seguir trabajando y volver a esta pantalla para ver el avance.',
  confirm: (n: number) => `Importar ${n.toLocaleString('es-CO')} ${n === 1 ? 'paciente' : 'pacientes'}`,
  confirmExistingOnly: 'Procesar los pacientes que ya existen',
  confirmError: 'No se pudo iniciar la importación. Intenta de nuevo.',
  balancesNote: (count: number, totals: string) =>
    `También se crearán ${count.toLocaleString('es-CO')} ${count === 1 ? 'saldo migrado' : 'saldos migrados'} (${totals}), después de los pacientes.`,
  started: 'Importación en marcha.',
  progressError: 'No se pudo actualizar el avance de la importación.',
  another: 'Importar otro archivo',
};

const POLL_MS = 1500;
/** Lo que vale un dry-run sin confirmar (VALIDATION_TTL_HOURS de la API). */
const VALIDATION_TTL_MS = 24 * 3_600_000;

/**
 * Lote validado y vigente (DX-262, I2): aunque no traiga pacientes que
 * importar, se le puede añadir la hoja de saldos.
 */
export function isEditableDryRun(batch: ImportBatchDetail, now = Date.now()): boolean {
  return batch.status === 'VALIDATED' && now < new Date(batch.createdAt).getTime() + VALIDATION_TTL_MS;
}

interface PatientImportWizardProps {
  token: string;
  /** El historial se recarga cuando un lote cambia de estado. */
  onBatchChange: () => void;
}

/**
 * Asistente «Importar pacientes» (DX-107) en cuatro pasos: subir → columnas
 * y validación (dry-run, sin escribir) → saldos (hoja de saldos opcional,
 * DX-262) → confirmar (en segundo plano, con avance). El archivo vive solo en el navegador entre pasos: volver a validar
 * lo sube de nuevo con el mapeo cambiado.
 */
/**
 * Mientras sube el archivo (DX-107 × DX-259: hasta 5 MB), el porcentaje y su
 * barra; subido, `done` («Leyendo…», «Validando…») mientras la API trabaja.
 */
function UploadStatus({ uploaded, done }: { uploaded: number | null; done: string }) {
  const sending = uploaded !== null && uploaded < 1;
  const percent = Math.round((uploaded ?? 0) * 100);
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-sm text-muted">
        {sending ? wizardCopy.uploading(uploaded) : done}
      </p>
      {sending ? (
        <div
          role="progressbar"
          aria-label={wizardCopy.uploadProgress}
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
  );
}

export function PatientImportWizard({ token, onBatchChange }: PatientImportWizardProps) {
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState<File | null>(null);
  const [inspect, setInspect] = React.useState<ImportInspect | null>(null);
  const [reading, setReading] = React.useState(false);
  const [readError, setReadError] = React.useState<string | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [defaultDocType, setDefaultDocType] = React.useState<DocType | null>('CC');
  const [validating, setValidating] = React.useState(false);
  // Fracción subida del archivo (0..1) mientras se lee o se valida; null sin subida.
  const [uploaded, setUploaded] = React.useState<number | null>(null);
  const [validateError, setValidateError] = React.useState<string | null>(null);
  const [dryRun, setDryRun] = React.useState<ImportBatchDetail | null>(null);
  const [mode, setMode] = React.useState<DuplicateMode>('SKIP');
  const [confirming, setConfirming] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState<ImportBatchDetail | null>(null);
  // Cada consulta del avance (bien o mal) programa la siguiente.
  const [pollTick, setPollTick] = React.useState(0);
  const pollFailed = React.useRef(false);
  const pollToast = React.useRef<string | null>(null);
  // Al avanzar, el foco va al título del paso o resultado nuevo: el botón
  // pulsado desaparece y el lector de pantalla anuncia dónde está (QA O1).
  const focusTarget = React.useRef<string | null>(null);
  const setFocusTarget = (target: string) => {
    focusTarget.current = target;
  };
  // Tras cada render: si hay un título pendiente de foco y ya está pintado.
  React.useEffect(() => {
    if (!focusTarget.current) return;
    const el = document.getElementById(`${id}-${focusTarget.current}`);
    if (!el) return;
    focusTarget.current = null;
    el.focus();
  });
  const retryPoll = React.useCallback(() => setPollTick((t) => t + 1), []);

  // Al volver a la pantalla con una importación en marcha, se ve su avance
  // (lo que promete el aviso «puedes seguir trabajando»).
  React.useEffect(() => {
    let cancelled = false;
    async function resume() {
      try {
        const page = await listImports(token);
        const active = page.items.find((b) => isInProgress(b.status));
        if (!active || cancelled) return;
        const detail = await getImport(token, active.id);
        if (!cancelled) setRunning((current) => current ?? detail);
      } catch {
        // El historial de abajo ya enseña el error con «Reintentar».
      }
    }
    void resume();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Avance: consulta el lote mientras la cola trabaja. Un fallo no borra lo
  // que se ve (escalón 3): aviso con reintento y se sigue consultando.
  const runningId = running?.id;
  const runningActive = running ? isInProgress(running.status) : false;
  React.useEffect(() => {
    if (!runningId || !runningActive) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const next = await getImport(token, runningId);
        if (cancelled) return;
        setRunning(next);
        pollFailed.current = false;
        // El aviso de la racha de fallos no se queda si el sondeo se recupera solo.
        if (pollToast.current) {
          toast.dismiss(pollToast.current);
          pollToast.current = null;
        }
        if (!isInProgress(next.status)) onBatchChange();
      } catch (err) {
        if (cancelled) return;
        // Un aviso por racha de fallos, no uno cada 1,5 s.
        if (!pollFailed.current) {
          pollToast.current = notifyError(apiErrorMessage(err, wizardCopy.progressError), {
            onRetry: retryPoll,
          });
        }
        pollFailed.current = true;
      } finally {
        if (!cancelled) setPollTick((t) => t + 1);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, runningId, runningActive, pollTick, onBatchChange, retryPoll]);

  function reset() {
    setStep(0);
    setFile(null);
    setInspect(null);
    setReadError(null);
    setMapping({});
    setDryRun(null);
    setValidateError(null);
    setConfirmError(null);
    setRunning(null);
    setMode('SKIP');
    setFocusTarget('upload');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function onTemplate() {
    try {
      saveCsv(await downloadTemplate(token), 'plantilla-pacientes.csv');
    } catch (err) {
      notifyError(apiErrorMessage(err, wizardCopy.templateError), {
        onRetry: () => void onTemplate(),
      });
    }
  }

  async function onFile(chosen: File | undefined) {
    if (!chosen) return;
    setReadError(null);
    setDryRun(null);
    if (chosen.size > MAX_IMPORT_BYTES) {
      setReadError(wizardCopy.tooBig);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setReading(true);
    try {
      setUploaded(0);
      const result = await inspectFile(token, chosen, setUploaded);
      setFile(chosen);
      setInspect(result);
      setMapping(result.suggestedMapping);
      setStep(1);
      setFocusTarget('mapping');
    } catch (err) {
      setReadError(apiErrorMessage(err, wizardCopy.readError));
      // El mismo archivo, corregido, se puede volver a elegir.
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setReading(false);
      setUploaded(null);
    }
  }

  async function onValidate() {
    if (!file) return;
    setValidating(true);
    setValidateError(null);
    try {
      setUploaded(0);
      setDryRun(await validateImport(token, file, mapping, defaultDocType, setUploaded));
      setFocusTarget('dry-run');
    } catch (err) {
      setDryRun(null);
      setValidateError(apiErrorMessage(err, wizardCopy.validateError));
    } finally {
      setValidating(false);
      setUploaded(null);
    }
  }

  async function onReport(batchId: string, fileName: string) {
    try {
      saveCsv(await downloadErrorsCsv(token, batchId), errorsFileName(fileName));
    } catch (err) {
      notifyError(apiErrorMessage(err, wizardCopy.reportError), {
        onRetry: () => void onReport(batchId, fileName),
      });
    }
  }

  async function onConfirm() {
    if (!dryRun) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const batch = await confirmImport(token, dryRun.id, mode);
      setRunning(batch);
      setFocusTarget('progress');
      toast.success(wizardCopy.started);
      onBatchChange();
    } catch (err) {
      setConfirmError(apiErrorMessage(err, wizardCopy.confirmError));
    } finally {
      setConfirming(false);
    }
  }

  // Duplicados contra la clínica: las filas preparadas que no son nuevas.
  const existing = dryRun ? dryRun.progress.preparedRows > dryRun.totals.validRows : false;

  if (running) {
    return (
      <section aria-labelledby={`${id}-progress`} className="flex flex-col gap-4">
        <ImportProgress
          headingId={`${id}-progress`}
          batch={running}
          onReport={() => void onReport(running.id, running.fileName)}
        />
        {!isInProgress(running.status) ? (
          <div>
            <Button type="button" variant="secondary" onClick={reset}>
              {wizardCopy.another}
            </Button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <Wizard
      steps={wizardCopy.steps.map((label, i) => ({ key: String(i), label }))}
      current={step}
      onStepChange={(i) => {
        if (
          i === 0 ||
          (i === 1 && inspect) ||
          (i === 2 && dryRun && isEditableDryRun(dryRun)) ||
          (i === 3 && dryRun?.canConfirm)
        )
          setStep(i);
      }}
    >
      {step === 0 ? (
        <section aria-labelledby={`${id}-upload`} className="flex flex-col gap-4">
          <h2 id={`${id}-upload`} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
            {wizardCopy.uploadTitle}
          </h2>
          <p className="max-w-prose text-sm text-muted">{wizardCopy.uploadHint}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              id={`${id}-file`}
              type="file"
              accept={IMPORT_ACCEPT}
              aria-label={wizardCopy.fileLabel}
              // Invisible: no es una parada de Tab; se abre con «Elegir archivo» (QA D3).
              tabIndex={-1}
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              loading={reading}
              onClick={() => inputRef.current?.click()}
              className="w-full sm:w-auto"
            >
              <Upload aria-hidden />
              {wizardCopy.chooseFile}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onTemplate()} className="w-full sm:w-auto">
              <Download aria-hidden />
              {wizardCopy.template}
            </Button>
          </div>
          {reading ? <UploadStatus uploaded={uploaded} done={wizardCopy.reading} /> : null}
          {readError ? <InlineError variant="summary">{readError}</InlineError> : null}
        </section>
      ) : null}

      {step === 1 && inspect ? (
        <section aria-labelledby={`${id}-mapping`} className="flex min-w-0 flex-col gap-6">
          <h2 id={`${id}-mapping`} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
            {wizardCopy.mappingTitle}
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
              <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="truncate">{wizardCopy.fileSummary(inspect.fileName, inspect.totalRows)}</span>
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              {wizardCopy.otherFile}
            </Button>
          </div>
          <ColumnMappingFields
            inspect={inspect}
            mapping={mapping}
            onMappingChange={(m) => {
              setMapping(m);
              setDryRun(null);
            }}
            defaultDocType={defaultDocType}
            onDefaultDocTypeChange={(v) => {
              setDefaultDocType(v);
              setDryRun(null);
            }}
            disabled={validating}
          />
          <div className="flex flex-col gap-2">
            <div>
              <Button type="button" loading={validating} onClick={() => void onValidate()} className="w-full sm:w-auto">
                {dryRun ? wizardCopy.revalidate : wizardCopy.validate}
              </Button>
            </div>
            {validating ? <UploadStatus uploaded={uploaded} done={wizardCopy.validating} /> : null}
            {validateError ? <InlineError variant="summary">{validateError}</InlineError> : null}
          </div>
          {dryRun ? (
            <DryRunResult
              headingId={`${id}-dry-run`}
              batch={dryRun}
              onReport={() => void onReport(dryRun.id, dryRun.fileName)}
              onContinue={() => {
                setStep(2);
                setFocusTarget('balances');
              }}
            />
          ) : null}
        </section>
      ) : null}

      {step === 2 && dryRun ? (
        <BalancesStep
          token={token}
          headingId={`${id}-balances`}
          batch={dryRun}
          onBatch={setDryRun}
          onBack={() => setStep(1)}
          onContinue={() => {
            setStep(3);
            setFocusTarget('confirm');
          }}
        />
      ) : null}

      {step === 3 && dryRun ? (
        <section aria-labelledby={`${id}-confirm`} className="flex flex-col gap-5">
          <h2 id={`${id}-confirm`} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
            {wizardCopy.confirmTitle}
          </h2>
          <Totals batch={dryRun} />
          {existing ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-ink">{wizardCopy.duplicatesLegend}</legend>
              {(['SKIP', 'FILL_EMPTY'] as const).map((value) => (
                <label key={value} className="flex min-h-11 items-center gap-3 text-sm text-ink">
                  <input
                    type="radio"
                    name={`${id}-mode`}
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  {value === 'SKIP' ? wizardCopy.skip : wizardCopy.fill}
                </label>
              ))}
            </fieldset>
          ) : null}
          <ul className="flex max-w-prose list-disc flex-col gap-1 pl-5 text-sm text-muted">
            <li>{wizardCopy.consentNote}</li>
            <li>{wizardCopy.backgroundNote}</li>
            {dryRun.balances && dryRun.balances.preparedCount > 0 ? (
              <li>
                {wizardCopy.balancesNote(
                  dryRun.balances.preparedCount,
                  dryRun.balances.validTotals.map((t) => formatCurrency(t.amount, t.currency)).join(' · '),
                )}
              </li>
            ) : null}
          </ul>
          {confirmError ? <InlineError variant="summary">{confirmError}</InlineError> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(2)} className="w-full sm:w-auto">
              {wizardCopy.back}
            </Button>
            <Button type="button" loading={confirming} onClick={() => void onConfirm()} className="w-full sm:w-auto">
              {dryRun.totals.validRows > 0
                ? wizardCopy.confirm(dryRun.totals.validRows)
                : // Sin pacientes nuevos y saltando los existentes, solo se importan saldos.
                  (dryRun.progress.preparedRows === 0 || mode === 'SKIP') &&
                    (dryRun.balances?.preparedCount ?? 0) > 0
                  ? wizardCopy.confirmBalances(dryRun.balances?.preparedCount ?? 0)
                  : wizardCopy.confirmExistingOnly}
            </Button>
          </div>
        </section>
      ) : null}
    </Wizard>
  );
}

function Totals({ batch }: { batch: ImportBatchDetail }) {
  const items: [string, number][] = [
    [wizardCopy.total, batch.totals.totalRows],
    [wizardCopy.valid, batch.totals.validRows],
    [wizardCopy.duplicates, batch.totals.duplicateRows],
    [wizardCopy.errors, batch.totals.errorRows],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5 border-l border-border pl-3">
          <dt className="text-xs font-medium text-muted">{label}</dt>
          <dd className="text-base font-semibold tabular-nums text-ink">{value.toLocaleString('es-CO')}</dd>
        </div>
      ))}
    </dl>
  );
}

function DryRunResult({
  headingId,
  batch,
  onReport,
  onContinue,
}: {
  headingId: string;
  batch: ImportBatchDetail;
  onReport: () => void;
  onContinue: () => void;
}) {
  return (
    <section aria-label={wizardCopy.dryRunTitle} className="flex flex-col gap-4 border-t border-border pt-5">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
          {wizardCopy.dryRunTitle}
        </h2>
        <p className="text-sm text-muted">{wizardCopy.dryRunHint}</p>
      </div>
      <Totals batch={batch} />
      {batch.issuesTotal > 0 ? (
        <div className="flex flex-col gap-3">
          {batch.reportAvailable ? (
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={onReport}>
                <Download aria-hidden />
                {wizardCopy.report}
              </Button>
            </div>
          ) : null}
          <ImportIssuesTable issues={batch.issues} total={batch.issuesTotal} />
        </div>
      ) : (
        <p className="text-sm text-muted">{wizardCopy.noIssues}</p>
      )}
      {batch.preview.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">{wizardCopy.previewTitle}</h3>
          <ul className="flex flex-col rounded-xl border border-border bg-surface text-sm">
            {batch.preview.map((row) => (
              <li
                key={row.rowNumber}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2 last:border-0"
              >
                <span className="min-w-0 break-words text-ink">
                  <span className="tabular-nums text-muted">{row.rowNumber} · </span>
                  {row.data.firstName} {row.data.lastName}
                  <span className="text-muted">
                    {' '}
                    · {row.data.docType} {row.data.docNumber}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {row.status === 'NEW' ? wizardCopy.previewNew : wizardCopy.previewExisting}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {batch.canConfirm || isEditableDryRun(batch) ? (
        <div className="flex flex-col gap-2">
          {!batch.canConfirm ? <p className="text-sm text-muted">{wizardCopy.onlyBalances}</p> : null}
          <div>
            <Button type="button" onClick={onContinue} className="w-full sm:w-auto">
              {wizardCopy.continue}
            </Button>
          </div>
        </div>
      ) : (
        <InlineError variant="summary">{wizardCopy.nothingToImport}</InlineError>
      )}
    </section>
  );
}
