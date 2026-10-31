'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, Upload } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeNumber } from '@/lib/format/sede-number';
import {
  importHolidays,
  previewHolidayImport,
  type HolidayImportResult,
  type HolidayImportRow,
} from '@/lib/locations/location-calendar-api';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { InlineError } from '@/components/errors/inline-error';
import { FormModal } from '@/components/shared/form-modal';
import { Button } from '@/components/ui/button';

type Counts = HolidayImportResult['counts'];
/** Un número con el formato de la sede; sin él, «—» (la nota la pone la vista). */
type Num = (value: number) => string;

export const holidayImportCopy = {
  title: 'Importar festivos',
  helpCsv: 'CSV con las columnas fecha (AAAA-MM-DD), nombre y, si quieres, recurrente (sí/no).',
  helpIcs: 'ICS: eventos de día completo; los que se repiten cada año el mismo día se guardan como recurrentes.',
  helpIdempotent: 'Si importas el mismo archivo otra vez, no se duplica nada.',
  fileLabel: 'Archivo de festivos (.csv o .ics)',
  choose: 'Elegir archivo',
  chooseOther: 'Elegir otro archivo',
  reading: 'Leyendo el archivo…',
  // Textos con número (spec §7.2, M13): singular con n = 1.
  newCount: (n: number, num: Num) => (n === 1 ? `${num(n)} nuevo` : `${num(n)} nuevos`),
  duplicateCount: (n: number, num: Num) => (n === 1 ? `${num(n)} ya existía` : `${num(n)} ya existían`),
  errorCount: (n: number, num: Num) => (n === 1 ? `${num(n)} con error` : `${num(n)} con errores`),
  submit: (n: number, num: Num) => (n === 1 ? `Importar ${num(n)} festivo` : `Importar ${num(n)} festivos`),
  submitIdle: 'Importar',
  imported: (n: number, num: Num) => (n === 1 ? `Importado ${num(n)} festivo` : `Importados ${num(n)} festivos`),
  separator: ' · ',
  issuesHeading: 'Filas que no se importan',
  line: (line: string) => `Línea ${line}`,
  related: (lines: string[]) =>
    lines.length === 1 ? `(línea ${lines[0]})` : `(líneas ${lines.slice(0, -1).join(', ')} y ${lines[lines.length - 1]})`,
  more: (rest: string) => `y ${rest} más`,
  pickFirst: 'Elige un archivo para ver qué se va a importar.',
  nothingNew: 'No hay festivos nuevos que importar.',
  // «Revisar» como en la importación de pacientes: la UI no nombra ninguna «vista previa».
  changed: 'Los festivos de la sede cambiaron mientras revisabas el archivo. Esto es lo que se importó.',
  /** La escritura salió bien; lo que falló es lo de después (recargar la lista). */
  followUpError: 'Los festivos se importaron, pero no pudimos actualizar la lista. Cierra y recarga la página.',
  close: 'Cerrar',
  cancel: 'Cancelar',
  // Solo para 5xx y fallos desconocidos (los 4xx traen su texto): no culpa al archivo.
  previewError: 'No pudimos revisar el archivo. Intenta de nuevo.',
  importError: 'No pudimos importar los festivos. Intenta de nuevo.',
};

const copy = holidayImportCopy;
const ACCEPT = '.csv,.ics';
/** Filas con aviso que se pintan; el resto se resume con «y {r} más» (spec §7.2). */
const MAX_ISSUES = 200;

/** «12 nuevos · 0 ya existían · 0 con errores». */
export function importCountsText(counts: Counts, num: Num): string {
  return [copy.newCount(counts.new, num), copy.duplicateCount(counts.duplicate, num), copy.errorCount(counts.error, num)].join(
    copy.separator,
  );
}

/** La línea de estado tras importar: «Importados 12 festivos», y lo omitido si lo hubo. */
export function importedSummaryText(counts: Counts, num: Num): string {
  return [
    copy.imported(counts.new, num),
    ...(counts.duplicate > 0 ? [copy.duplicateCount(counts.duplicate, num)] : []),
    ...(counts.error > 0 ? [copy.errorCount(counts.error, num)] : []),
  ].join(copy.separator);
}

function sameCounts(a: Counts, b: Counts): boolean {
  return a.new === b.new && a.duplicate === b.duplicate && a.error === b.error;
}

type State =
  | { phase: 'idle' }
  | { phase: 'reading'; file: File }
  | { phase: 'failed'; file: File; message: string }
  | { phase: 'preview'; file: File; result: HolidayImportResult }
  /**
   * Ya importado y el modal sigue abierto: el resultado no coincide con lo
   * revisado (`changed`), o falló lo de después (`followUp`).
   */
  | { phase: 'done'; file: File; result: HolidayImportResult; changed: boolean; followUp: boolean };

interface HolidayImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** La sede ELEGIDA: de ella sale el formato de las cifras. */
  location: ClinicLocation;
  /**
   * Tras importar: quien llama recarga la lista. El modal espera a que termine
   * antes de cerrarse. Si lanza, la importación sigue contando como hecha.
   */
  onImported: (result: HolidayImportResult) => Promise<void> | void;
  /** Ver `FormModal`: a dónde vuelve el foco al cerrar. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * DX-316 (spec §7.2): importar festivos desde un .csv o un .ics. Al elegir el
 * archivo se pide la vista previa (no escribe nada) y se enseñan los recuentos
 * y las filas que no se importarán; confirmar sube EL MISMO archivo. Una
 * respuesta de una vista previa vieja (otro archivo, o el modal ya cerrado) se
 * descarta. Mientras se importa no se puede cerrar: la escritura sigue en el
 * servidor y su resultado tiene que llegar a la lista. Si el resultado real no
 * coincide con la vista previa (algo cambió entretanto), el modal se queda
 * abierto con lo que pasó de verdad. El padre lo monta con una `key` por apertura.
 */
export function HolidayImportModal({
  open,
  onOpenChange,
  token,
  location,
  onImported,
  onCloseAutoFocus,
}: HolidayImportModalProps) {
  const fmt: RegionalFormat | null = locationRegionalFormat(location);
  const num: Num = (value) => sedeNumber(value, fmt);
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  /** Sube con cada archivo y al cerrar: una respuesta con otro número llega tarde. */
  const seq = useRef(0);
  /** El `importing` del estado tarda un render: dos envíos seguidos verían `false`. */
  const importingRef = useRef(false);

  // El botón de importar desaparece: el foco va al aviso que explica por qué
  // el modal sigue abierto, no al contenedor del diálogo. El aviso no está en
  // una región viva: se lee una vez, al recibir el foco.
  const done = state.phase === 'done';
  useEffect(() => {
    if (done) noteRef.current?.focus();
  }, [done]);

  function changeOpen(next: boolean) {
    if (!next && importingRef.current) return;
    if (!next) seq.current += 1;
    onOpenChange(next);
  }

  async function preview(file: File) {
    const mine = ++seq.current;
    setState({ phase: 'reading', file });
    setImportError(null);
    try {
      const result = await previewHolidayImport(token, location.id, file);
      if (seq.current === mine) setState({ phase: 'preview', file, result });
    } catch (err) {
      if (seq.current === mine) setState({ phase: 'failed', file, message: apiErrorMessage(err, copy.previewError) });
    }
  }

  async function confirm() {
    if (importingRef.current || state.phase !== 'preview' || state.result.counts.new === 0) return;
    const { file, result: previewed } = state;
    importingRef.current = true;
    setImporting(true);
    setImportError(null);
    try {
      let result: HolidayImportResult;
      try {
        result = await importHolidays(token, location.id, file);
      } catch (err) {
        setImportError(apiErrorMessage(err, copy.importError));
        return;
      }
      // Desde aquí la escritura ya está hecha: un fallo después no es «no se importó».
      let followUp = false;
      try {
        await onImported(result);
      } catch {
        followUp = true;
      }
      const changed = !sameCounts(result.counts, previewed.counts);
      if (!changed && !followUp) {
        importingRef.current = false;
        onOpenChange(false);
        return;
      }
      setState({ phase: 'done', file, result, changed, followUp });
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.phase === 'done') {
      changeOpen(false);
      return;
    }
    void confirm();
  }

  const result = state.phase === 'preview' || state.phase === 'done' ? state.result : null;
  const file = state.phase === 'idle' ? null : state.file;
  const newCount = state.phase === 'preview' ? state.result.counts.new : 0;
  const issues = result ? result.rows.filter((r) => r.status !== 'NEW') : [];
  // Leyendo: hueco vacío (el estado ya dice «Leyendo el archivo…»).
  let hint: string | null | undefined = copy.pickFirst;
  if (state.phase === 'preview') hint = newCount === 0 ? copy.nothingNew : null;
  else if (state.phase === 'reading') hint = null;
  else if (done) hint = undefined;
  const errorId = 'holiday-import-file-error';

  return (
    <FormModal
      open={open}
      onOpenChange={changeOpen}
      title={copy.title}
      size="lg"
      onSubmit={handleSubmit}
      submitLabel={state.phase === 'preview' ? copy.submit(newCount, num) : copy.submitIdle}
      cancelLabel={done ? copy.close : copy.cancel}
      submitting={importing}
      submitDisabled={state.phase !== 'preview' || newCount === 0}
      submitHint={hint}
      hideSubmit={done}
      error={importError}
      onCloseAutoFocus={onCloseAutoFocus}
      lockCloseWhileSubmitting
    >
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
        <li>{copy.helpCsv}</li>
        <li>{copy.helpIcs}</li>
        <li>{copy.helpIdempotent}</li>
      </ul>

      <div className="flex min-w-0 flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          aria-label={copy.fileLabel}
          // Invisible: no es una parada de Tab; se abre con «Elegir archivo».
          tabIndex={-1}
          className="sr-only"
          disabled={importing || done}
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            // Así elegir otra vez el mismo archivo vuelve a leerlo.
            e.target.value = '';
            if (chosen) void preview(chosen);
          }}
        />
        {done ? null : (
          <Button
            type="button"
            variant="secondary"
            loading={state.phase === 'reading'}
            disabled={importing}
            onClick={() => inputRef.current?.click()}
            aria-describedby={state.phase === 'failed' ? errorId : undefined}
            className="max-sm:min-h-11 max-sm:w-full sm:self-start"
          >
            <Upload aria-hidden />
            {file ? copy.chooseOther : copy.choose}
          </Button>
        )}
        {file ? (
          <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
            <FileText aria-hidden className="size-4 shrink-0 text-muted" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{file.name}</span>
          </p>
        ) : null}
        {state.phase === 'failed' ? (
          <InlineError id={errorId} variant="summary">
            {state.message}
          </InlineError>
        ) : null}
      </div>

      {state.phase === 'done' ? (
        <div ref={noteRef} tabIndex={-1} className="flex flex-col gap-1 rounded-lg focus:outline-none">
          {state.changed ? <p className="text-sm font-medium text-ink">{copy.changed}</p> : null}
          {state.followUp ? (
            <p className="flex items-start gap-1.5 text-sm text-danger-text">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{copy.followUpError}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Siempre montado: el lector de pantalla anuncia la lectura y el resumen. */}
      <div role="status" className="flex flex-col gap-2">
        {state.phase === 'reading' ? <p className="text-sm text-muted">{copy.reading}</p> : null}
        {result ? (
          <p data-testid="holiday-import-summary" className="text-sm font-medium text-ink tabular-nums">
            {importCountsText(result.counts, num)}
          </p>
        ) : null}
      </div>

      {issues.length > 0 ? <IssueList rows={issues} num={num} /> : null}
    </FormModal>
  );
}

function IssueList({ rows, num }: { rows: HolidayImportRow[]; num: Num }) {
  const headingId = React.useId();
  const shown = rows.slice(0, MAX_ISSUES);
  const rest = rows.length - shown.length;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 id={headingId} className="text-sm font-semibold text-ink">
        {copy.issuesHeading}
      </h3>
      {/* Desplazable y enfocable: con 200 filas se recorre con el teclado. */}
      <div tabIndex={0} aria-labelledby={headingId} role="region" className="max-h-64 overflow-y-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text">
        {/* El nombre lo lleva la región; repetirlo en la lista lo leería dos veces. */}
        <ul className="divide-y divide-border">
          {shown.map((r, i) => (
            // Un evento de varios días del ICS da varias filas con la misma línea.
            <li key={`${r.line}-${i}`} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:gap-3">
              <span className="shrink-0 font-medium text-ink tabular-nums sm:w-24">{copy.line(num(r.line))}</span>
              <span className="min-w-0 text-muted [overflow-wrap:anywhere]">
                {r.message}
                {r.relatedLines.length > 0 ? ` ${copy.related(r.relatedLines.map(num))}` : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {rest > 0 ? <p className="text-sm text-muted">{copy.more(num(rest))}</p> : null}
    </div>
  );
}
