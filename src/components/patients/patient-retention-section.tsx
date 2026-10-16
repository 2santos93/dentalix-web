'use client';
import * as React from 'react';
import { useState } from 'react';
import { Archive, ShieldCheck } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { fieldClass } from '@/lib/ui/field-class';

/** `YYYY-MM-DD` (o ISO) → `DD/MM/AAAA`, sin pasar por la zona del navegador. */
export function formatCivilDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// El 409 de retención lleva la fecha y la salida (supresión parcial): es más
// largo que el tope por defecto de `apiErrorMessage`.
const RETENTION_MESSAGE_MAX = 400;

const copy = {
  sectionLabel: 'Retención legal de la historia clínica',
  until: (date: string) => `Historia en retención legal hasta ${date}`,
  permanent: 'Historia en retención legal permanente',
  expired: (date: string) => `Retención legal vencida el ${date}`,
  none: 'Sin atenciones clínicas: sin retención legal',
  double: 'Plazo doble (30 años)',
  // La base legal sigue al plazo vigente: con DOUBLE o PERMANENT, «15 años»
  // contradiría la fecha del aviso.
  hint: {
    NONE: 'Res. 839/2017: se conserva 15 años desde la última atención. Mientras dure, el paciente no se puede archivar.',
    DOUBLE:
      'Plazo doble: se conserva 30 años desde la última atención. Mientras dure, el paciente no se puede archivar.',
    PERMANENT: 'Se conserva sin fecha de fin: el paciente no se puede archivar.',
  } satisfies Record<RetentionExtension, string>,
  suppressed: (date: string) => `Datos de contacto suprimidos el ${date}`,
  changeRetention: 'Cambiar retención',
  suppress: 'Supresión parcial',
  archive: 'Archivar paciente',
  retentionTitle: 'Retención legal extendida',
  retentionDescription:
    'Amplía el plazo de conservación de la historia clínica. Queda registrado quién lo cambió, cuándo y por qué.',
  retentionLabel: 'Plazo',
  options: {
    NONE: '15 años desde la última atención (general)',
    DOUBLE: '30 años (plazo doble)',
    PERMANENT: 'Permanente (p. ej. víctimas de violaciones de DD. HH./DIH)',
  } satisfies Record<RetentionExtension, string>,
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

interface PatientRetentionSectionProps {
  patient: Patient;
  token: string;
  /** Solo ADMIN ve los controles; el servidor vuelve a exigirlo (403). */
  isAdmin: boolean;
  onUpdated: (patient: Patient) => void;
  onArchived: () => void;
}

/**
 * Retención legal de la HC en la ficha (DX-039): el aviso con la fecha hasta
 * la que se conserva y, para ADMIN, los modales para cambiar la retención
 * extendida, la supresión parcial y archivar. Si la API rechaza el archivo con
 * 409 (`CLINICAL_RECORD_RETENTION`), el modal muestra su mensaje en español.
 */
export function PatientRetentionSection({
  patient,
  token,
  isAdmin,
  onUpdated,
  onArchived,
}: PatientRetentionSectionProps) {
  const status = statusOf(patient);
  const [dialog, setDialog] = useState<'retention' | 'suppress' | 'archive' | null>(null);
  const [extension, setExtension] = useState<RetentionExtension>(
    patient.retentionExtended ?? 'NONE',
  );
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(next: 'retention' | 'suppress' | 'archive') {
    setExtension(patient.retentionExtended ?? 'NONE');
    setReason('');
    setFieldError(null);
    setError(null);
    setDialog(next);
  }

  function close(isOpen: boolean) {
    if (!isOpen && !busy) setDialog(null);
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDialog(null);
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
    <section
      aria-label={copy.sectionLabel}
      className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={status.kind === 'until' || status.kind === 'permanent' ? 'warning' : 'muted'}
            className="gap-1.5"
          >
            <ShieldCheck aria-hidden className="size-3.5 shrink-0" />
            <span className="tnum">{statusText(status)}</span>
          </Badge>
          {patient.retentionExtended === 'DOUBLE' ? (
            <Badge variant="outline">{copy.double}</Badge>
          ) : null}
        </div>
        {patient.underRetention ? (
          <p className="text-sm text-muted">{copy.hint[patient.retentionExtended ?? 'NONE']}</p>
        ) : null}
        {patient.partiallySuppressedAt ? (
          <p className="text-sm text-muted tnum">
            {copy.suppressed(formatCivilDate(patient.partiallySuppressedAt))}
          </p>
        ) : null}
      </div>

      {isAdmin ? (
        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={() => open('retention')}>
            {copy.changeRetention}
          </Button>
          {patient.underRetention ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => open('suppress')}>
              {copy.suppress}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={() => open('archive')}>
            <Archive aria-hidden className="size-4" /> {copy.archive}
          </Button>
        </div>
      ) : null}

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
            <select
              id="retention-extension"
              name="retentionExtended"
              value={extension}
              onChange={(e) => setExtension(e.target.value as RetentionExtension)}
              className={fieldClass}
            >
              {(Object.keys(copy.options) as RetentionExtension[]).map((value) => (
                <option key={value} value={value}>
                  {copy.options[value]}
                </option>
              ))}
            </select>
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
      />
    </section>
  );
}
