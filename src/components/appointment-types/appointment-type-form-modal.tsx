'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createAppointmentType,
  updateAppointmentType,
  type AppointmentType,
} from '@/lib/appointments/appointment-types-api';
import { appointmentTypeTextColor, isAppointmentTypeColor } from '@/lib/color/contrast';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';

const copy = {
  createTitle: 'Nuevo tipo de cita',
  editTitle: 'Editar tipo de cita',
  description:
    'La duración rellena la hora de fin al agendar y el color pinta la cita en la agenda. Cambiarlo no altera las citas ya agendadas.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Endodoncia',
  duration: 'Duración (minutos)',
  durationHint: 'Múltiplo de 5, entre 5 y 480.',
  color: 'Color',
  colorHex: 'Código del color',
  colorHint: 'Formato #RRGGBB. El texto de la cita se vuelve claro u oscuro solo.',
  preview: 'Vista previa',
  create: 'Crear tipo',
  save: 'Guardar cambios',
  invalidName: 'Escribe un nombre (hasta 60 caracteres).',
  invalidDuration: 'La duración debe ser un múltiplo de 5 entre 5 y 480 minutos.',
  invalidColor: 'El color debe tener el formato #RRGGBB (por ejemplo, #7C3AED).',
  genericError: 'No pudimos guardar el tipo de cita. Intenta de nuevo.',
};

const DEFAULT_COLOR = '#0E7490';

interface AppointmentTypeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin tipo: alta. Con tipo: edición. */
  type?: AppointmentType | null;
  onSaved: (type: AppointmentType) => void;
}

/**
 * Alta y edición de un tipo de cita (DX-121, solo ADMIN). El color se elige
 * con el selector nativo o escribiendo `#RRGGBB`; nada más llega a la API (que
 * también lo valida). El padre lo monta con una `key` por apertura.
 */
export function AppointmentTypeFormModal({
  open,
  onOpenChange,
  token,
  type,
  onSaved,
}: AppointmentTypeFormModalProps) {
  const editing = !!type;
  const [name, setName] = useState(type?.name ?? '');
  const [duration, setDuration] = useState(String(type?.durationMinutes ?? 30));
  const [color, setColor] = useState(type?.color ?? DEFAULT_COLOR);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutes = Number(duration);
  const validColor = isAppointmentTypeColor(color);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 60) return setError(copy.invalidName);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480 || minutes % 5 !== 0) {
      return setError(copy.invalidDuration);
    }
    if (!validColor) return setError(copy.invalidColor);
    setSubmitting(true);
    try {
      const input = { name: trimmed, durationMinutes: minutes, color: color.toUpperCase() };
      const saved = editing
        ? await updateAppointmentType(token, type.id, input)
        : await createAppointmentType(token, input);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
    >
      <FormField htmlFor="type-name" label={copy.name}>
        <Input
          id="type-name"
          value={name}
          maxLength={60}
          placeholder={copy.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </FormField>
      <FormField htmlFor="type-duration" label={copy.duration} hint={copy.durationHint}>
        <Input
          id="type-duration"
          type="number"
          inputMode="numeric"
          min={5}
          max={480}
          step={5}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField htmlFor="type-color-hex" label={copy.colorHex} hint={copy.colorHint}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={copy.color}
            value={validColor ? color.toLowerCase() : DEFAULT_COLOR.toLowerCase()}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
          />
          <Input
            id="type-color-hex"
            value={color}
            maxLength={7}
            onChange={(e) => setColor(e.target.value.trim())}
            aria-invalid={!validColor || undefined}
            className="font-mono uppercase"
            required
          />
        </div>
      </FormField>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">{copy.preview}</span>
        <span
          data-testid="type-preview"
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-semibold"
          style={
            validColor
              ? { backgroundColor: color, color: appointmentTypeTextColor(color), borderColor: color }
              : undefined
          }
        >
          {name.trim() || copy.namePlaceholder} · {Number.isFinite(minutes) ? minutes : 0} min
        </span>
      </div>
    </FormModal>
  );
}
