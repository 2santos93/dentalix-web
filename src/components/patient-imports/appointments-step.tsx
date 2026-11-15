"use client";
import * as React from "react";
import { Download, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/errors/inline-error";
import { notifyError } from "@/components/errors/notify";
import { apiErrorMessage } from "@/lib/api/error-message";
import { IMPORT_READ_BY_STATUS } from "./import-read-busy";
import {
  IMPORT_ACCEPT,
  MAX_IMPORT_BYTES,
  downloadAppointmentErrorsCsv,
  downloadAppointmentTemplate,
  errorsFileName,
  removeAppointments,
  uploadAppointments,
  type ImportBatchDetail,
} from "@/lib/patient-imports/patient-imports-api";
import { saveCsv } from "@/lib/files/save-csv";
import { ImportIssuesTable } from "./import-issues-table";
import { UploadStatus } from "./patient-import-wizard";
import type { RegionalFormat } from "@/lib/format/regional-format";
import { sedeNumber } from "@/lib/format/sede-number";

export const appointmentsCopy = {
  title: "Citas futuras (opcional)",
  hint: "Si ya tienes citas dadas en tu programa anterior, sube una hoja con el número de documento del paciente, la fecha, la hora, la duración y el email del profesional; la sede, el tipo de cita y el motivo son opcionales. Cada cita se revisa con las mismas reglas que al agendar a mano: horario de la sede, bloqueos, festivos y que el profesional y el paciente estén libres. Nada se guarda hasta confirmar la importación.",
  timeNote:
    "La fecha y la hora se leen en la zona horaria de la sede de cada cita. Un profesional que no está en tu equipo no se cambia por otro: su cita sale como error.",
  remindersNote:
    "Las citas importadas no reciben recordatorios automáticos hasta que los actives desde el historial de importaciones.",
  fileLabel: "Hoja de citas (CSV o .xlsx)",
  choose: "Subir hoja de citas",
  other: "Subir otra hoja",
  template: "Descargar plantilla de citas",
  templateError: "No se pudo descargar la plantilla de citas.",
  validating:
    "Revisando cada cita contra la agenda… no se guarda ninguna cita todavía.",
  uploadProgress: "Subida de la hoja de citas",
  tooBig: "La hoja pesa más de 5 MB. Divídela en varios archivos más pequeños.",
  error: "No se pudo validar la hoja de citas. Intenta de nuevo.",
  remove: "Quitar la hoja de citas",
  removeError: "No se pudo quitar la hoja de citas.",
  // El número llega ya formateado con el formato de la sede (G1-B); el plural sale del número.
  summary: (name: string, rows: number, shown: string) =>
    `${name} · ${shown} ${rows === 1 ? "fila" : "filas"}`,
  rows: "Filas de la hoja",
  toImport: "Citas a crear",
  errors: "Filas rechazadas",
  issuesLabel: "Errores y avisos de la hoja de citas",
  noIssues: "Todas las citas caben en la agenda.",
  report: "Descargar informe de la hoja",
  reportError: "No se pudo descargar el informe.",
  back: "Atrás",
  continue: "Continuar",
  skip: "Continuar sin citas",
};

interface AppointmentsStepProps {
  token: string;
  headingId: string;
  batch: ImportBatchDetail;
  /** El lote con su hoja de citas nueva (o sin ella). */
  onBatch: (batch: ImportBatchDetail) => void;
  onBack: () => void;
  onContinue: () => void;
  /** Formato de la sede de la pantalla para los recuentos; sin él, «—». */
  fmt: RegionalFormat | null;
}

/**
 * Paso «Citas» del asistente (DX-263): subir y validar la hoja de citas
 * futuras (dry-run, sin escribir) con las reglas de agendar a mano, y ver
 * los errores y avisos por fila. Es opcional: se puede seguir sin ella.
 */
export function AppointmentsStep({
  token,
  headingId,
  batch,
  onBatch,
  onBack,
  onContinue,
  fmt,
}: AppointmentsStepProps) {
  const n = (value: number) => sedeNumber(value, fmt);
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [uploaded, setUploaded] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const sheet = batch.appointments;

  async function onTemplate() {
    try {
      saveCsv(await downloadAppointmentTemplate(token), "plantilla-citas.csv", {
        bom: true,
      });
    } catch (err) {
      notifyError(apiErrorMessage(err, appointmentsCopy.templateError), {
        onRetry: () => void onTemplate(),
      });
    }
  }

  async function onFile(chosen: File | undefined) {
    if (!chosen) return;
    setError(null);
    if (chosen.size > MAX_IMPORT_BYTES) {
      setError(appointmentsCopy.tooBig);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    try {
      setUploaded(0);
      onBatch(await uploadAppointments(token, batch.id, chosen, setUploaded));
    } catch (err) {
      setError(
        apiErrorMessage(err, {
          fallback: appointmentsCopy.error,
          byStatus: IMPORT_READ_BY_STATUS,
        }),
      );
    } finally {
      setBusy(false);
      setUploaded(null);
      // La misma hoja, corregida, se puede volver a elegir.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onRemove() {
    setRemoving(true);
    setError(null);
    try {
      onBatch(await removeAppointments(token, batch.id));
    } catch (err) {
      notifyError(apiErrorMessage(err, appointmentsCopy.removeError), {
        onRetry: () => void onRemove(),
      });
    } finally {
      setRemoving(false);
    }
  }

  async function onReport(fileName: string) {
    try {
      saveCsv(
        await downloadAppointmentErrorsCsv(token, batch.id),
        errorsFileName(fileName),
        { bom: true },
      );
    } catch (err) {
      notifyError(apiErrorMessage(err, appointmentsCopy.reportError), {
        onRetry: () => void onReport(fileName),
      });
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-5"
    >
      <h2
        id={headingId}
        tabIndex={-1}
        className="t-title text-ink focus:outline-none"
      >
        {appointmentsCopy.title}
      </h2>
      <p className="max-w-prose text-sm text-muted">{appointmentsCopy.hint}</p>
      <ul className="flex max-w-prose list-disc flex-col gap-1 pl-5 text-sm text-muted">
        <li>{appointmentsCopy.timeNote}</li>
        <li>{appointmentsCopy.remindersNote}</li>
      </ul>
      <input
        ref={inputRef}
        id={`${id}-file`}
        type="file"
        accept={IMPORT_ACCEPT}
        aria-label={appointmentsCopy.fileLabel}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant={sheet ? "secondary" : "default"}
          loading={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full sm:w-auto"
        >
          <Upload aria-hidden />
          {sheet ? appointmentsCopy.other : appointmentsCopy.choose}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void onTemplate()}
          className="w-full sm:w-auto"
        >
          <Download aria-hidden />
          {appointmentsCopy.template}
        </Button>
      </div>
      {busy ? <UploadStatus uploaded={uploaded} done={appointmentsCopy.validating} /> : null}
      {error ? <InlineError variant="summary">{error}</InlineError> : null}

      {sheet ? (
        <div className="flex min-w-0 flex-col gap-4 border-t border-border pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
              <FileSpreadsheet
                aria-hidden
                className="size-4 shrink-0 text-muted"
              />
              <span className="truncate">
                {appointmentsCopy.summary(
                  sheet.fileName,
                  sheet.totalRows,
                  n(sheet.totalRows),
                )}
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={removing}
              onClick={() => void onRemove()}
            >
              <Trash2 aria-hidden />
              {appointmentsCopy.remove}
            </Button>
          </div>
          <dl className="grid grid-cols-3 gap-x-6 gap-y-3">
            {(
              [
                [appointmentsCopy.rows, sheet.totalRows],
                [appointmentsCopy.toImport, sheet.preparedCount],
                [appointmentsCopy.errors, sheet.errorRows],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col gap-0.5 border-l border-border pl-3"
              >
                <dt className="t-overline">{label}</dt>
                <dd className="t-title tnum text-ink">{n(value)}</dd>
              </div>
            ))}
          </dl>
          {batch.appointmentIssuesTotal > 0 ? (
            <div className="flex flex-col gap-3">
              {batch.reportAvailable ? (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void onReport(sheet.fileName)}
                  >
                    <Download aria-hidden />
                    {appointmentsCopy.report}
                  </Button>
                </div>
              ) : null}
              <ImportIssuesTable
                issues={batch.appointmentIssues}
                total={batch.appointmentIssuesTotal}
                label={appointmentsCopy.issuesLabel}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">{appointmentsCopy.noIssues}</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="w-full sm:w-auto"
        >
          {appointmentsCopy.back}
        </Button>
        <Button
          type="button"
          variant={sheet ? "default" : "secondary"}
          disabled={busy || !batch.canConfirm}
          onClick={onContinue}
          className="w-full sm:w-auto"
        >
          {sheet ? appointmentsCopy.continue : appointmentsCopy.skip}
        </Button>
      </div>
    </section>
  );
}
