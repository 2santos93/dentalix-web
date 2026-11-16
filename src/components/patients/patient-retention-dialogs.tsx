'use client';
import * as React from 'react';
import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { ArchiveLinksNotice } from './archive-links-notice';
import { retentionCopy as copy, type RetentionDialog } from './patient-retention-section';

/*
 * DX-202-ter: los modales de ADMIN de la retención viven aparte de la sección
 * para llegar en su propio trozo de JS (`patient-lazy-tabs`): solo los abre el
 * menú «⋯» de la cabecera y no pesan en la primera carga de la ficha.
 */

// El 409 de retención lleva la fecha y la salida (supresión parcial): es más
// largo que el tope por defecto de `apiErrorMessage`.
const RETENTION_MESSAGE_MAX = 400;

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
