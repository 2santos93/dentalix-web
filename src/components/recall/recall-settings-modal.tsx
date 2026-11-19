'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  RECALL_HIDE_DAYS_MAX,
  RECALL_HIDE_DAYS_MIN,
  RECALL_MAX_ATTEMPTS_MAX,
  RECALL_MAX_ATTEMPTS_MIN,
  updateRecallSettings,
  type LocationRecallSettings,
} from '@/lib/recall/recall-api';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Input } from '@/components/ui/input';

export const recallSettingsModalCopy = {
  title: (location: string) => `Intentos de llamada en ${location}`,
  description:
    'Se aplican al momento a la lista de recall de los pacientes de esta sede, también a los intentos ya registrados.',
  hideDays: 'Ocultar tras un intento (días)',
  hideDaysHint: `De ${RECALL_HIDE_DAYS_MIN} a ${RECALL_HIDE_DAYS_MAX}. Tras «No contesta», «Dejó mensaje», «Va a agendar» o «Número erróneo», el paciente sale de la lista esos días. «Llamar luego» usa el día elegido.`,
  maxAttempts: 'Tope de intentos',
  maxAttemptsHint: `De ${RECALL_MAX_ATTEMPTS_MIN} a ${RECALL_MAX_ATTEMPTS_MAX}. Con ese número de intentos sin agendar pasa a «Intentos agotados». «Agendó» y «Rechaza» vuelven a contar desde cero.`,
  // Los mismos textos que la API.
  hideDaysError: `Los días de ocultación van de ${RECALL_HIDE_DAYS_MIN} a ${RECALL_HIDE_DAYS_MAX}.`,
  maxAttemptsError: `El tope de intentos va de ${RECALL_MAX_ATTEMPTS_MIN} a ${RECALL_MAX_ATTEMPTS_MAX}.`,
  save: 'Guardar',
  genericError: 'No pudimos guardar los intentos de llamada. Intenta de nuevo.',
};
const copy = recallSettingsModalCopy;

type FieldErrors = { hideDays?: string; maxAttempts?: string };

/** Un entero en [min, max] escrito en el campo; `null` si no lo es. */
export function parseBoundedInt(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n >= min && n <= max ? n : null;
}

/** A qué campo va un 400 de la API (por su texto); `null` si no es de ninguno. */
function errorField(message: string): keyof FieldErrors | null {
  if (/ocultaci[oó]n/i.test(message)) return 'hideDays';
  if (/tope de intentos/i.test(message)) return 'maxAttempts';
  return null;
}

/**
 * Los intentos de llamada de UNA sede (DX-465, solo ADMIN): días de ocultación
 * (1–90) y tope (1–10). Se valida como la API, con sus textos, y sus 400 van
 * junto al campo. El padre lo monta con una `key` por apertura.
 */
export function RecallSettingsModal({
  open,
  onOpenChange,
  token,
  settings,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  settings: LocationRecallSettings;
  onSaved: (saved: LocationRecallSettings) => void;
}) {
  const ids = useId();
  const hideId = `${ids}-hide`;
  const maxId = `${ids}-max`;
  const [hideDays, setHideDays] = useState(String(settings.hideDays));
  const [maxAttempts, setMaxAttempts] = useState(String(settings.maxAttempts));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function focusFirst(errors: FieldErrors) {
    document.getElementById(errors.hideDays ? hideId : maxId)?.focus();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const hide = parseBoundedInt(hideDays, RECALL_HIDE_DAYS_MIN, RECALL_HIDE_DAYS_MAX);
    const max = parseBoundedInt(maxAttempts, RECALL_MAX_ATTEMPTS_MIN, RECALL_MAX_ATTEMPTS_MAX);
    const errors: FieldErrors = {
      ...(hide === null ? { hideDays: copy.hideDaysError } : {}),
      ...(max === null ? { maxAttempts: copy.maxAttemptsError } : {}),
    };
    setFieldErrors(errors);
    if (hide === null || max === null) {
      focusFirst(errors);
      return;
    }
    setSubmitting(true);
    try {
      const saved = await updateRecallSettings(token, settings.locationId, { hideDays: hide, maxAttempts: max });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err, copy.genericError);
      const field = err instanceof ApiError && err.status === 400 ? errorField(message) : null;
      if (field) {
        const next = { [field]: message };
        setFieldErrors(next);
        focusFirst(next);
      } else setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title(settings.locationName)}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.save}
      submitting={submitting}
      error={error}
    >
      <FormField htmlFor={hideId} label={copy.hideDays} hint={copy.hideDaysHint} error={fieldErrors.hideDays}>
        <Input
          id={hideId}
          // Sin min/max nativos: el navegador cortaría el envío con su propio mensaje.
          type="number"
          inputMode="numeric"
          value={hideDays}
          aria-invalid={fieldErrors.hideDays ? true : undefined}
          onChange={(e) => {
            setHideDays(e.target.value);
            setFieldErrors((prev) => ({ ...prev, hideDays: undefined }));
          }}
          className="w-24 tabular-nums"
        />
      </FormField>
      <FormField
        htmlFor={maxId}
        label={copy.maxAttempts}
        hint={copy.maxAttemptsHint}
        error={fieldErrors.maxAttempts}
      >
        <Input
          id={maxId}
          type="number"
          inputMode="numeric"
          value={maxAttempts}
          aria-invalid={fieldErrors.maxAttempts ? true : undefined}
          onChange={(e) => {
            setMaxAttempts(e.target.value);
            setFieldErrors((prev) => ({ ...prev, maxAttempts: undefined }));
          }}
          className="w-24 tabular-nums"
        />
      </FormField>
    </FormModal>
  );
}
