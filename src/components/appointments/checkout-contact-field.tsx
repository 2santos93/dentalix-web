'use client';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type CheckoutContactKind = 'phone' | 'email';

export const checkoutContactCopy = {
  add: { phone: 'Añadir teléfono', email: 'Añadir correo' },
  label: { phone: 'Teléfono del paciente', email: 'Correo del paciente' },
  save: 'Guardar',
  saving: 'Guardando…',
  cancel: 'Cancelar',
  missing: { phone: 'Escribe el teléfono.', email: 'Escribe el correo.' },
  // La regla de `@IsEmail()` de la API, la misma frase que la ficha.
  emailInvalid: 'Revisa el correo electrónico: le falta algo (p. ej. nombre@dominio.com).',
  saveError: {
    phone: 'No pudimos guardar el teléfono. Intenta de nuevo.',
    email: 'No pudimos guardar el correo. Intenta de nuevo.',
  },
};
const copy = checkoutContactCopy;

/**
 * DX-202-bis: completar el teléfono o el correo dentro de la salida, sin ir a
 * la ficha. Es la misma edición del paciente (`PATCH /patients/:id`, solo el
 * campo que falta) con las reglas de la ficha: el correo con la regla de la API
 * y el teléfono con la que dé la API (con WhatsApp como canal, que se lea como
 * móvil); el error va junto al campo (rung 4).
 *
 * No es un `<form>`: vive dentro del de la salida. Enter guarda este campo y
 * nunca completa la cita.
 *
 * La API de pacientes y la regla del correo se piden al guardar (`import()`):
 * la ficha también las usa y, compartidas con la salida, Turbopack las sacaba a
 * otro chunk de su primera carga (presupuesto de bundle de /patients/[id]).
 */
export function CheckoutContactField({
  token,
  patientId,
  kind,
  onSaved,
}: {
  token: string;
  patientId: string;
  kind: CheckoutContactKind;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const errorId = `${id}-error`;

  function fail(message: string) {
    setError(message);
    // Tras el render que lo vuelve a habilitar (guardando está desactivado).
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function save() {
    if (saving) return;
    const text = value.trim();
    if (!text) return fail(copy.missing[kind]);
    if (kind === 'email') {
      const { isEmailAddress } = await import('@/lib/format/email');
      if (!isEmailAddress(text)) return fail(copy.emailInvalid);
    }
    setSaving(true);
    setError(null);
    try {
      const { updatePatient } = await import('@/lib/patients/patients-api');
      await updatePatient(token, patientId, kind === 'phone' ? { phone: text } : { email: text });
      setEditing(false);
      setValue('');
      onSaved();
    } catch (err) {
      fail(apiErrorMessage(err, copy.saveError[kind]));
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void save();
  }

  if (!editing) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0"
        data-testid={`checkout-add-${kind}`}
        onClick={() => setEditing(true)}
      >
        {copy.add[kind]}
      </Button>
    );
  }

  return (
    <div className="flex w-full basis-full flex-col gap-2" data-testid={`checkout-edit-${kind}`}>
      <label htmlFor={id} className="sr-only">
        {copy.label[kind]}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          ref={inputRef}
          id={id}
          autoFocus
          type={kind === 'phone' ? 'tel' : 'email'}
          autoComplete={kind === 'phone' ? 'tel' : 'email'}
          inputMode={kind === 'phone' ? 'tel' : 'email'}
          maxLength={kind === 'phone' ? 100 : 254}
          value={value}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          className="sm:flex-1"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="max-sm:min-h-11 max-sm:flex-1"
            aria-busy={saving || undefined}
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? copy.saving : copy.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-sm:min-h-11 max-sm:flex-1"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setValue('');
              setError(null);
            }}
          >
            {copy.cancel}
          </Button>
        </div>
      </div>
      {error ? <InlineError id={errorId}>{error}</InlineError> : null}
    </div>
  );
}
