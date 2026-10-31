'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { createHoliday, updateHoliday, type LocationHoliday } from '@/lib/locations/location-calendar-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { isCivilDay } from '@/lib/time/civil-day';

export const holidayFormCopy = {
  createTitle: 'Añadir festivo',
  editTitle: 'Editar festivo',
  date: 'Fecha',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Fiesta local',
  recurring: 'Se repite cada año',
  recurringHint: 'Cuenta el mismo día y mes todos los años.',
  create: 'Añadir festivo',
  save: 'Guardar festivo',
  dateMissing: 'Elige la fecha del festivo.',
  nameMissing: 'Escribe el nombre del festivo.',
  genericError: 'No pudimos guardar el festivo. Intenta de nuevo.',
};

const copy = holidayFormCopy;
const ID = 'holiday-form';
/** Igual que la API y la BD (spec §3: nombre de 1 a 120). */
const NAME_MAX = 120;
/** El rango que acepta la API (R8). */
const DATE_MIN = '2000-01-01';
const DATE_MAX = '2100-12-31';

type Field = 'date' | 'name' | 'recurring';
type FieldErrors = Partial<Record<Field, string>>;
const FIELDS: readonly Field[] = ['date', 'name', 'recurring'];

const inputId = (field: Field) => `${ID}-${field}`;

interface HolidayFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  locationId: string;
  /** Sin festivo: alta. Con festivo: edición. */
  holiday?: LocationHoliday;
  onSaved: (saved: LocationHoliday) => void;
  /** Ver `FormModal`: quien llama decide a dónde vuelve el foco al cerrar. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Alta y edición de un festivo de la sede (DX-316, spec §7.2). La fecha es el
 * valor ISO del `DatePicker` (día civil), sin pasar por ninguna zona. El alta
 * manda `{ date, name, recurring }`; la edición, solo lo que cambió. Un 400 de
 * la API con `field` va junto a su campo; el resto (los 409 de día ocupado o
 * de tope de festivos) arriba del modal. El padre lo monta con una `key` por
 * apertura.
 */
export function HolidayFormModal({
  open,
  onOpenChange,
  token,
  locationId,
  holiday,
  onSaved,
  onCloseAutoFocus,
}: HolidayFormModalProps) {
  const editing = holiday !== undefined;
  const [date, setDate] = useState(holiday?.date ?? '');
  const [name, setName] = useState(holiday?.name ?? '');
  const [recurring, setRecurring] = useState(holiday?.recurring ?? false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // El foco va al campo con error DESPUÉS de pintar el error: la casilla se
  // vuelve a montar al ganar su mensaje y perdería un foco puesto antes.
  const [focusRequest, setFocusRequest] = useState<{ field: Field } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const el = document.getElementById(inputId(focusRequest.field));
    // La fecha es un grupo de segmentos: el foco va al primero (el día).
    (el?.getAttribute('role') === 'group' ? el.querySelector<HTMLElement>('[role="spinbutton"]') : el)?.focus();
  }, [focusRequest]);

  function focusField(field: Field) {
    setFocusRequest({ field });
  }

  function clearError(field: Field) {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!isCivilDay(date)) found.date = copy.dateMissing;
    if (name.trim() === '') found.name = copy.nameMissing;
    return found;
  }

  /** Solo lo que cambió respecto al festivo guardado. */
  function changes(saved: LocationHoliday): { date?: string; name?: string; recurring?: boolean } {
    const trimmed = name.trim();
    return {
      ...(date !== saved.date ? { date } : {}),
      ...(trimmed !== saved.name ? { name: trimmed } : {}),
      ...(recurring !== saved.recurring ? { recurring } : {}),
    };
  }

  async function save() {
    const patch = holiday ? changes(holiday) : {};
    if (holiday && Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const saved = holiday
        ? await updateHoliday(token, locationId, holiday.id, patch)
        : await createHoliday(token, locationId, { date, name: name.trim(), recurring });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const text = apiErrorMessage(err, copy.genericError);
      if (err instanceof ApiError && err.status === 400 && err.field && (FIELDS as readonly string[]).includes(err.field)) {
        const field = err.field as Field;
        setErrors((prev) => ({ ...prev, [field]: text }));
        focusField(field);
        return;
      }
      setFormError(text);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    const first = FIELDS.find((f) => found[f]);
    if (first) {
      focusField(first);
      return;
    }
    void save();
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={formError}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <FormField htmlFor={inputId('date')} label={copy.date} error={errors.date}>
        <DatePicker
          id={inputId('date')}
          value={date || null}
          min={DATE_MIN}
          max={DATE_MAX}
          onChange={(next) => {
            setDate(next ?? '');
            clearError('date');
          }}
          required
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? fieldErrorId(inputId('date')) : undefined}
        />
      </FormField>
      <FormField htmlFor={inputId('name')} label={copy.name} error={errors.name}>
        <Input
          id={inputId('name')}
          value={name}
          maxLength={NAME_MAX}
          placeholder={copy.namePlaceholder}
          onChange={(e) => {
            setName(e.target.value);
            clearError('name');
          }}
          aria-required
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? fieldErrorId(inputId('name')) : undefined}
          className="max-sm:min-h-11"
        />
      </FormField>
      <Checkbox
        id={inputId('recurring')}
        checked={recurring}
        onChange={(e) => {
          setRecurring(e.target.checked);
          clearError('recurring');
        }}
        label={copy.recurring}
        description={copy.recurringHint}
        error={errors.recurring}
      />
    </FormModal>
  );
}
