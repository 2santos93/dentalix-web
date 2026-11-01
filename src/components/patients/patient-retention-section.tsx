'use client';
import * as React from 'react';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  archivePatient,
  partiallySuppressPatient,
  RETENTION_REASON_MAX,
  RETENTION_REASON_MIN,
  setRetentionExtension,
  type Patient,
  type RetentionExtension,
} from '@/lib/patients/patients-api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ArchiveLinksNotice } from './archive-links-notice';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { SectionHeader } from '@/components/ui/section-header';
import { DATA_SECTION_CLASS } from './data-section';

/** `YYYY-MM-DD` (o ISO) → `DD/MM/AAAA`, sin pasar por la zona del navegador. */
export function formatCivilDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// El 409 de retención lleva la fecha y la salida (supresión parcial): es más
// largo que el tope por defecto de `apiErrorMessage`.
const RETENTION_MESSAGE_MAX = 400;

const copy = {
  sectionLabel: 'Retención de la historia clínica',
  sectionTitle: 'Retención',
  // Chip corto de la cabecera; la frase completa está en «Datos».
  chip: {
    until: (date: string) => `Retención hasta ${date}`,
    permanent: 'Retención permanente',
    expired: (date: string) => `Retención vencida el ${date}`,
  },
  until: (date: string) => `Historia en retención hasta ${date}`,
  permanent: 'Historia en retención permanente',
  expired: (date: string) => `Retención vencida el ${date}`,
  none: 'Sin atenciones clínicas: sin retención',
  // DX-330: el plazo es de la clínica (`clinicRetentionYears`), nunca un
  // número fijo. Sin él (una API anterior) no se pinta ninguna cifra.
  double: (years: number | undefined) =>
    years === undefined ? 'Plazo doble' : `Plazo doble (${2 * years} años)`,
  // La ayuda sigue al plazo vigente: con DOUBLE o PERMANENT, el plazo simple
  // contradiría la fecha del aviso.
  hint: {
    NONE: (years: number | undefined) =>
      `Se conserva ${years === undefined ? 'el plazo de la clínica' : `${years} años`} desde la última atención. Mientras dure, el paciente no se puede archivar.`,
    DOUBLE: (years: number | undefined) =>
      `Plazo doble: se conserva ${years === undefined ? 'el doble del plazo de la clínica' : `${2 * years} años`} desde la última atención. Mientras dure, el paciente no se puede archivar.`,
    PERMANENT: () => 'Se conserva sin fecha de fin: el paciente no se puede archivar.',
  } satisfies Record<RetentionExtension, (years: number | undefined) => string>,
  // La clínica redujo el plazo y esta historia ya estaba en retención: manda
  // la fecha que tenía.
  previousTermHint: (date: string) =>
    `Se conserva hasta el ${date} por el plazo anterior de la clínica. Mientras dure, el paciente no se puede archivar.`,
  suppressed: (date: string) => `Datos de contacto suprimidos el ${date}`,
  changeRetention: 'Cambiar retención',
  suppress: 'Supresión parcial',
  archive: 'Archivar paciente',
  retentionTitle: 'Retención extendida',
  retentionDescription:
    'Amplía el plazo de conservación de la historia clínica. Queda registrado quién lo cambió, cuándo y por qué.',
  retentionLabel: 'Plazo',
  options: {
    NONE: (years: number | undefined) =>
      years === undefined
        ? 'Plazo de la clínica desde la última atención'
        : `${years} años desde la última atención (plazo de la clínica)`,
    DOUBLE: (years: number | undefined) =>
      years === undefined ? 'Plazo doble' : `${2 * years} años (plazo doble)`,
    PERMANENT: () => 'Permanente (nunca se libera)',
  } satisfies Record<RetentionExtension, (years: number | undefined) => string>,
  reasonLabel: 'Motivo',
  reasonHint: `Mínimo ${RETENTION_REASON_MIN} caracteres. Queda en el registro.`,
  reasonTooShort: `El motivo debe tener al menos ${RETENTION_REASON_MIN} caracteres.`,
  saveRetention: 'Guardar retención',
  retentionError: 'No pudimos cambiar la retención.',
  suppressTitle: 'Supresión parcial de datos',
  suppressDescription:
    'Vacía teléfono, email, dirección, notas administrativas y contacto de emergencia, y retira la autorización de marketing. La historia clínica y los datos de identificación se conservan. No se puede deshacer.',
  confirmSuppress: 'Suprimir datos',
  suppressError: 'No pudimos hacer la supresión parcial.',
  archiveTitle: 'Archivar paciente',
  archiveDescription:
    'El paciente deja de aparecer en los listados. Su historia clínica se conserva. Si tiene citas programadas o confirmadas, cancélalas antes.',
  confirmArchive: 'Archivar',
  archiveError: 'No pudimos archivar al paciente.',
};

type Status =
  | { kind: 'until'; date: string }
  | { kind: 'permanent' }
  | { kind: 'expired'; date: string }
  | { kind: 'none' };

function statusOf(patient: Patient): Status {
  if (patient.retentionExtended === 'PERMANENT') return { kind: 'permanent' };
  if (!patient.retentionUntil) return { kind: 'none' };
  const date = formatCivilDate(patient.retentionUntil);
  return patient.underRetention ? { kind: 'until', date } : { kind: 'expired', date };
}

/**
 * La ayuda de la retención, una sola para la sección y el chip de la cabecera
 * (DX-330): el plazo de la clínica, o el anterior si manda un suelo.
 */
export function retentionHint(patient: Patient): string {
  const extension = patient.retentionExtended ?? 'NONE';
  if (
    extension !== 'PERMANENT' &&
    patient.retentionFromPreviousTerm &&
    patient.retentionUntil
  ) {
    return copy.previousTermHint(formatCivilDate(patient.retentionUntil));
  }
  return copy.hint[extension](patient.clinicRetentionYears);
}

function statusText(status: Status): string {
  switch (status.kind) {
    case 'until':
      return copy.until(status.date);
    case 'permanent':
      return copy.permanent;
    case 'expired':
      return copy.expired(status.date);
    case 'none':
      return copy.none;
  }
}

interface ReasonFieldProps {
  id: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}

function ReasonField({ id, value, error, onChange }: ReasonFieldProps) {
  return (
    <FormField htmlFor={id} label={copy.reasonLabel} hint={copy.reasonHint} error={error}>
      <Input
        id={id}
        name="reason"
        type="text"
        aria-required="true"
        maxLength={RETENTION_REASON_MAX}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldErrorId(id) : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

function reasonError(reason: string): string | null {
  return reason.trim().length < RETENTION_REASON_MIN ? copy.reasonTooShort : null;
}

/** Las tres acciones de ADMIN, que viven en el menú «⋯» de la cabecera. */
export type RetentionDialog = 'retention' | 'suppress' | 'archive';

export const retentionActionLabels = {
  retention: copy.changeRetention,
  suppress: copy.suppress,
  archive: copy.archive,
} satisfies Record<RetentionDialog, string>;

/**
 * Chip de la cabecera: la retención es un estado normal y esperado, no un
 * riesgo — tono neutro, nunca ámbar junto a «Sin anamnesis» (critique-core §7).
 * `null` sin atenciones clínicas: no hay nada que decir en la cabecera.
 */
export function retentionChip(patient: Patient): { text: string; hint: string | null } | null {
  const status = statusOf(patient);
  const hint = patient.underRetention ? retentionHint(patient) : null;
  switch (status.kind) {
    case 'until':
      return { text: copy.chip.until(status.date), hint };
    case 'permanent':
      return { text: copy.chip.permanent, hint };
    case 'expired':
      return { text: copy.chip.expired(status.date), hint };
    case 'none':
      return null;
  }
}

/**
 * Retención de la HC en la pestaña «Datos» (DX-039): el aviso con la
 * fecha hasta la que se conserva, el plazo y la supresión parcial si la hubo.
 * Lo ven todos. Los controles (ADMIN) están en el menú «⋯» de la cabecera:
 * son acciones raras y delicadas, no van a la vista en cada pestaña.
 */
export function PatientRetentionSection({ patient }: { patient: Patient }) {
  const status = statusOf(patient);
  return (
    <section aria-label={copy.sectionLabel} className={DATA_SECTION_CLASS}>
      <SectionHeader as="h2" title={copy.sectionTitle} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <ShieldCheck aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="tnum">{statusText(status)}</span>
          {patient.retentionExtended === 'DOUBLE' ? (
            <Badge variant="neutral">{copy.double(patient.clinicRetentionYears)}</Badge>
          ) : null}
        </p>
        {patient.underRetention ? (
          <p className="text-sm text-muted">{retentionHint(patient)}</p>
        ) : null}
        {patient.partiallySuppressedAt ? (
          <p className="text-sm text-muted tnum">
            {copy.suppressed(formatCivilDate(patient.partiallySuppressedAt))}
          </p>
        ) : null}
      </div>
    </section>
  );
}

interface PatientRetentionDialogsProps {
  patient: Patient;
  token: string;
  /** Qué modal está abierto (lo abre el menú «⋯» de la cabecera). */
  dialog: RetentionDialog | null;
  onDialogChange: (dialog: RetentionDialog | null) => void;
  onUpdated: (patient: Patient) => void;
  onArchived: () => void;
}

/**
 * Los modales de retención (DX-039) — cambiar la retención extendida,
 * supresión parcial y archivar —, controlados desde fuera. Si la API rechaza
 * el archivo con 409 (`CLINICAL_RECORD_RETENTION`), el modal muestra su
 * mensaje en español. El servidor vuelve a exigir ADMIN (403).
 */
export function PatientRetentionDialogs({
  patient,
  token,
  dialog,
  onDialogChange,
  onUpdated,
  onArchived,
}: PatientRetentionDialogsProps) {
  const [extension, setExtension] = useState<RetentionExtension>(
    patient.retentionExtended ?? 'NONE',
  );
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cada apertura empieza limpia (antes lo hacía `open()` en la propia sección).
  const [openedFor, setOpenedFor] = useState<RetentionDialog | null>(null);
  if (dialog !== openedFor) {
    setOpenedFor(dialog);
    if (dialog) {
      setExtension(patient.retentionExtended ?? 'NONE');
      setReason('');
      setFieldError(null);
      setError(null);
    }
  }

  function close(isOpen: boolean) {
    if (!isOpen && !busy) onDialogChange(null);
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDialogChange(null);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback, maxLength: RETENTION_MESSAGE_MAX }));
    } finally {
      setBusy(false);
    }
  }

  function submitRetention(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = reasonError(reason);
    setFieldError(nextError);
    if (nextError) return;
    void run(async () => {
      onUpdated(
        await setRetentionExtension(token, patient.id, {
          retentionExtended: extension,
          reason: reason.trim(),
        }),
      );
    }, copy.retentionError);
  }

  function submitSuppression(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = reasonError(reason);
    setFieldError(nextError);
    if (nextError) return;
    void run(async () => {
      onUpdated(await partiallySuppressPatient(token, patient.id, { reason: reason.trim() }));
    }, copy.suppressError);
  }

  return (
    <>
      {dialog === 'retention' ? (
        <FormModal
          open
          onOpenChange={close}
          title={copy.retentionTitle}
          description={copy.retentionDescription}
          onSubmit={submitRetention}
          submitLabel={copy.saveRetention}
          submitting={busy}
          error={error}
        >
          <FormField htmlFor="retention-extension" label={copy.retentionLabel}>
            <NativeSelect
              id="retention-extension"
              name="retentionExtended"
              value={extension}
              onChange={(e) => setExtension(e.target.value as RetentionExtension)}
            >
              {(Object.keys(copy.options) as RetentionExtension[]).map((value) => (
                <option key={value} value={value}>
                  {copy.options[value](patient.clinicRetentionYears)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <ReasonField
            id="retention-reason"
            value={reason}
            error={fieldError}
            onChange={setReason}
          />
        </FormModal>
      ) : null}

      {dialog === 'suppress' ? (
        <FormModal
          open
          onOpenChange={close}
          title={copy.suppressTitle}
          description={copy.suppressDescription}
          onSubmit={submitSuppression}
          submitLabel={copy.confirmSuppress}
          submitting={busy}
          error={error}
          destructive
        >
          <ReasonField
            id="suppression-reason"
            value={reason}
            error={fieldError}
            onChange={setReason}
          />
        </FormModal>
      ) : null}

      <ConfirmDialog
        open={dialog === 'archive'}
        onOpenChange={close}
        title={copy.archiveTitle}
        description={copy.archiveDescription}
        confirmLabel={copy.confirmArchive}
        confirming={busy}
        error={error}
        onConfirm={() =>
          void run(async () => {
            await archivePatient(token, patient.id);
            onArchived();
          }, copy.archiveError)
        }
      >
        {/* DX-461: solo se cuentan con el diálogo abierto (y cada vez que se abre). */}
        {dialog === 'archive' ? <ArchiveLinksNotice token={token} patientId={patient.id} /> : null}
      </ConfirmDialog>
    </>
  );
}
