'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RegionalFormat } from '@/lib/format/regional-format';
import {
  defaultFollowUpDraft,
  followUpErrorField,
  MAX_FOLLOW_UP_DAY,
  MAX_FOLLOW_UP_STEPS,
  MIN_FOLLOW_UP_DAY,
  parseFollowUpDraft,
  updateQuoteFollowUpSettings,
  type FollowUpFieldErrors,
  type LocationQuoteFollowUpSettings,
} from '@/lib/treatment-plans/quote-follow-up-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

/** La hora de la franja con el reloj de la sede; 24 es la medianoche del final del día. */
export function followUpHourLabel(hour: number, fmt: RegionalFormat | null): string {
  if (hour === 24) return 'medianoche';
  return fmt ? fmt.clock(hour, 0) : `${hour} h`;
}

/** 409 de la API al activar el seguimiento en una sede sin zona horaria. */
const LOCATION_TIMEZONE_REQUIRED = 'LOCATION_TIMEZONE_REQUIRED';

const FROM_HOURS = Array.from({ length: 24 }, (_, h) => h);
const UNTIL_HOURS = Array.from({ length: 24 }, (_, h) => h + 1);

export const quoteFollowUpModalCopy = {
  title: (location: string) => `Seguimiento automático en ${location}`,
  description:
    'Cada presupuesto presentado y sin respuesta recibe hasta 3 emails con el nombre de la clínica y un enlace para ver y aceptar el presupuesto. El email no lleva importes ni tratamientos, y el enlace caduca a las 72 horas.',
  enabled: 'Enviar avisos de seguimiento por email',
  enabledHint:
    'Se detienen solos cuando el paciente acepta, se rechaza el presupuesto, se agenda una cita, vence el presupuesto o el paciente se da de baja.',
  offsetsLegend: 'Cuándo sale cada aviso',
  offsetsHint: `Días después de presentar el presupuesto, de ${MIN_FOLLOW_UP_DAY} a ${MAX_FOLLOW_UP_DAY}, de menor a mayor. Hasta ${MAX_FOLLOW_UP_STEPS} avisos.`,
  offsetLabel: (n: number) => `Aviso ${n}: días después`,
  daysSuffix: 'días después',
  remove: (n: number) => `Quitar el aviso ${n}`,
  add: 'Añadir aviso',
  windowLegend: 'Franja horaria',
  windowHint: 'Los avisos solo salen entre estas horas, con el reloj de la sede.',
  from: 'De',
  until: 'Hasta',
  save: 'Guardar',
  genericError: 'No pudimos guardar el seguimiento automático. Intenta de nuevo.',
};

const copy = quoteFollowUpModalCopy;

interface QuoteFollowUpSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  settings: LocationQuoteFollowUpSettings;
  /** El formato de ESTA sede (las horas, con su reloj); `null` sin formato. */
  fmt: RegionalFormat | null;
  onSaved: (saved: LocationQuoteFollowUpSettings) => void;
}

/**
 * Activar el seguimiento de UNA sede y elegir los días de cada aviso y la
 * franja (DX-561, solo ADMIN). Se valida como la API, con sus mismos textos,
 * y los 400 de la API van junto a su campo. El padre lo monta con una `key`
 * por apertura.
 */
export function QuoteFollowUpSettingsModal({
  open,
  onOpenChange,
  token,
  settings,
  fmt,
  onSaved,
}: QuoteFollowUpSettingsModalProps) {
  const ids = useId();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [offsets, setOffsets] = useState<string[]>(
    settings.offsetsDays.length > 0 ? settings.offsetsDays.map(String) : defaultFollowUpDraft(),
  );
  const [fromHour, setFromHour] = useState(settings.sendFromHour);
  const [untilHour, setUntilHour] = useState(settings.sendUntilHour);
  const [fieldErrors, setFieldErrors] = useState<FollowUpFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La sede no tiene zona horaria: sin ella no se sabe la franja (el arreglo está en Ajustes › Sedes).
  const [zoneError, setZoneError] = useState<{ message: string; locationId: string | null } | null>(null);

  const offsetsHintId = `${ids}-offsets-hint`;
  const offsetsErrorId = `${ids}-offsets-error`;
  const fromId = `${ids}-from`;
  const untilId = `${ids}-until`;

  function focusFirst(errors: FollowUpFieldErrors) {
    const target = errors.offsets ? document.getElementById(`${ids}-offset-0`) : document.getElementById(untilId);
    target?.focus();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await save();
  }

  async function save() {
    setError(null);
    setZoneError(null);
    setFieldErrors({});
    const parsed = parseFollowUpDraft(offsets, fromHour, untilHour);
    if ('errors' in parsed) {
      setFieldErrors(parsed.errors);
      focusFirst(parsed.errors);
      return;
    }
    setSubmitting(true);
    try {
      const saved = await updateQuoteFollowUpSettings(token, settings.locationId, {
        enabled,
        offsetsDays: parsed.offsetsDays,
        sendFromHour: fromHour,
        sendUntilHour: untilHour,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err, copy.genericError);
      if (err instanceof ApiError && err.code === LOCATION_TIMEZONE_REQUIRED) {
        setZoneError({ message, locationId: err.locationId ?? settings.locationId });
        return;
      }
      const field = err instanceof ApiError && err.status === 400 ? followUpErrorField(message) : null;
      if (field) {
        const errors = { [field]: message };
        setFieldErrors(errors);
        focusFirst(errors);
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
      {zoneError ? (
        <SedeConfigError
          kind="timeZone"
          variant="note"
          description={zoneError.message}
          locationId={zoneError.locationId}
          onRetry={() => void save()}
        />
      ) : null}

      <Checkbox
        id={`${ids}-enabled`}
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        label={copy.enabled}
        description={copy.enabledHint}
      />

      <fieldset className="flex flex-col gap-3" aria-describedby={offsetsHintId}>
        <legend className="text-sm font-medium text-ink">{copy.offsetsLegend}</legend>
        <p id={offsetsHintId} className="text-xs text-muted">
          {copy.offsetsHint}
        </p>
        <ul className="flex flex-col gap-2">
          {offsets.map((value, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                id={`${ids}-offset-${index}`}
                // Sin min/max nativos: el navegador cortaría el envío con su
                // propio mensaje antes que el nuestro.
                type="number"
                inputMode="numeric"
                value={value}
                aria-label={copy.offsetLabel(index + 1)}
                aria-invalid={fieldErrors.offsets ? true : undefined}
                aria-describedby={fieldErrors.offsets ? offsetsErrorId : undefined}
                onChange={(e) => {
                  setOffsets((prev) => prev.map((v, i) => (i === index ? e.target.value : v)));
                  setFieldErrors((prev) => ({ ...prev, offsets: undefined }));
                }}
                className="w-24 tabular-nums"
              />
              <span className="text-sm text-muted">{copy.daysSuffix}</span>
              {offsets.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={copy.remove(index + 1)}
                  onClick={() => {
                    setOffsets((prev) => prev.filter((_, i) => i !== index));
                    setFieldErrors((prev) => ({ ...prev, offsets: undefined }));
                  }}
                  className="ml-auto"
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {fieldErrors.offsets ? <InlineError id={offsetsErrorId}>{fieldErrors.offsets}</InlineError> : null}
        {offsets.length < MAX_FOLLOW_UP_STEPS ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOffsets((prev) => [...prev, ''])}
            className="self-start"
          >
            <Plus aria-hidden />
            {copy.add}
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-ink">{copy.windowLegend}</legend>
        <p className="text-xs text-muted">{copy.windowHint}</p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <FormField htmlFor={fromId} label={copy.from}>
            <NativeSelect
              id={fromId}
              value={String(fromHour)}
              onChange={(e) => {
                setFromHour(Number(e.target.value));
                setFieldErrors((prev) => ({ ...prev, window: undefined }));
              }}
            >
              {FROM_HOURS.map((h) => (
                <option key={h} value={h}>
                  {followUpHourLabel(h, fmt)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor={untilId} label={copy.until} error={fieldErrors.window}>
            <NativeSelect
              id={untilId}
              value={String(untilHour)}
              aria-invalid={fieldErrors.window ? true : undefined}
              onChange={(e) => {
                setUntilHour(Number(e.target.value));
                setFieldErrors((prev) => ({ ...prev, window: undefined }));
              }}
            >
              {UNTIL_HOURS.map((h) => (
                <option key={h} value={h}>
                  {followUpHourLabel(h, fmt)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      </fieldset>
    </FormModal>
  );
}
