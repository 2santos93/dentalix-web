'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  MAX_LEAD_HOURS,
  MAX_REMINDER_LEADS,
  MIN_LEAD_HOURS,
  updateReminderSettings,
  type LocationReminderSettings,
} from '@/lib/reminders/reminders-api';
import { FormModal } from '@/components/shared/form-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

const copy = {
  title: (location: string) => `Recordatorios de ${location}`,
  description:
    'Cada cita agendada o confirmada recibe un email con la fecha, la hora, la sede, el profesional y un enlace para confirmar o cancelar. No lleva datos clínicos.',
  enabled: 'Enviar recordatorios por email',
  enabledHint: 'Solo a pacientes con email en su ficha.',
  leadsLegend: 'Cuándo se envían',
  leadsHint: `Horas antes del inicio de la cita, de ${MIN_LEAD_HOURS} a ${MAX_LEAD_HOURS} (7 días). Hasta ${MAX_REMINDER_LEADS}.`,
  leadLabel: (n: number) => `Recordatorio ${n}: horas antes`,
  hoursSuffix: 'h antes',
  remove: (n: number) => `Quitar el recordatorio ${n}`,
  add: 'Añadir recordatorio',
  save: 'Guardar',
  noLeads: 'Para activar los recordatorios elige al menos una antelación.',
  invalidLead: `Cada recordatorio debe ser de ${MIN_LEAD_HOURS} a ${MAX_LEAD_HOURS} horas antes (7 días).`,
  duplicate: 'No repitas la misma antelación: cada recordatorio sale a una hora distinta.',
  genericError: 'No pudimos guardar los recordatorios. Intenta de nuevo.',
};

/** Lo que se propone al activar una sede que nunca se configuró. */
const SUGGESTED = ['48', '2'];

interface ReminderSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  settings: LocationReminderSettings;
  onSaved: (saved: LocationReminderSettings) => void;
}

/** Valida las antelaciones escritas; devuelve el error en español o las horas. */
function parseLeads(values: string[], enabled: boolean): string | number[] {
  const hours = values.filter((v) => v.trim() !== '').map(Number);
  if (hours.some((h) => !Number.isInteger(h) || h < MIN_LEAD_HOURS || h > MAX_LEAD_HOURS)) {
    return copy.invalidLead;
  }
  if (new Set(hours).size !== hours.length) return copy.duplicate;
  if (enabled && hours.length === 0) return copy.noLeads;
  return [...hours].sort((a, b) => b - a);
}

/**
 * Activar/desactivar y elegir las antelaciones de UNA sede (DX-026, solo
 * ADMIN). La API vuelve a validar; sus mensajes ya llegan en español. El padre
 * lo monta con una `key` por apertura.
 */
export function ReminderSettingsModal({
  open,
  onOpenChange,
  token,
  settings,
  onSaved,
}: ReminderSettingsModalProps) {
  const ids = useId();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [leads, setLeads] = useState<string[]>(
    settings.leadHours.length > 0 ? settings.leadHours.map(String) : SUGGESTED,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const parsed = parseLeads(leads, enabled);
    if (typeof parsed === 'string') return setError(parsed);
    setSubmitting(true);
    try {
      const saved = await updateReminderSettings(token, settings.locationId, {
        enabled,
        leadHours: parsed,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const enabledId = `${ids}-enabled`;
  const hintId = `${ids}-leads-hint`;

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
      <Checkbox
        id={enabledId}
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        label={copy.enabled}
        description={copy.enabledHint}
      />

      <fieldset className="flex flex-col gap-3" aria-describedby={hintId}>
        <legend className="text-sm font-medium text-ink">{copy.leadsLegend}</legend>
        <p id={hintId} className="text-xs text-muted">
          {copy.leadsHint}
        </p>
        <ul className="flex flex-col gap-2">
          {leads.map((value, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                // Sin min/max nativos: el navegador cortaría el envío con su
                // propio mensaje (en su idioma) antes que el nuestro.
                type="number"
                inputMode="numeric"
                value={value}
                aria-label={copy.leadLabel(index + 1)}
                onChange={(e) =>
                  setLeads((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))
                }
                className="w-28 tabular-nums"
              />
              <span className="text-sm text-muted">{copy.hoursSuffix}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={copy.remove(index + 1)}
                onClick={() => setLeads((prev) => prev.filter((_, i) => i !== index))}
                className="ml-auto"
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        {leads.length < MAX_REMINDER_LEADS && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLeads((prev) => [...prev, ''])}
            className="self-start"
          >
            <Plus aria-hidden />
            {copy.add}
          </Button>
        )}
      </fieldset>
    </FormModal>
  );
}
