'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { weekdayName } from '@/lib/format/regional-format';
import { setWorkingWeekdays, type LocationCalendar } from '@/lib/locations/location-calendar-api';
import { describeWorkingWeekdays, ISO_WEEK_ORDER } from '@/lib/locations/location-calendar';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';

export const workingWeekdaysCopy = {
  legend: 'Días hábiles',
  help: 'Por defecto, lunes a viernes. Cámbialo si tu sede trabaja otros días. No cambia el horario de atención ni las citas.',
  schedulesLink: 'Horarios',
  save: 'Guardar días hábiles',
  saved: 'Guardado',
  empty: 'Elige al menos un día hábil.',
  saveError: 'No pudimos guardar los días hábiles. Intenta de nuevo.',
  /** Sin días elegidos no hay resumen que pintar. */
  noSummary: '—',
};

const copy = workingWeekdaysCopy;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d));
}

interface WorkingWeekdaysFormProps {
  token: string;
  locationId: string;
  /** Días hábiles guardados, 0 = domingo … 6 = sábado. */
  initial: readonly number[];
  onSaved: (calendar: LocationCalendar) => void;
}

/**
 * DX-316 (spec §7.2): los días de la semana que cuentan como hábiles en una
 * sede, de lunes a domingo (R12). Solo cambia los plazos en días hábiles; el
 * horario de atención vive en Horarios (R4). Los nombres de los días salen del
 * helper de formato en `UI_LANGUAGE` (I6) y no dependen del formato de la sede:
 * una sede sin formato también elige sus días (M3).
 */
export function WorkingWeekdaysForm({ token, locationId, initial, onSaved }: WorkingWeekdaysFormProps) {
  const [days, setDays] = useState<number[]>(() => [...initial]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // A dónde vuelve el foco cuando termina el guardado (mientras dura, las
  // casillas y el botón están deshabilitados y el navegador lo suelta).
  const focusAfterSave = useRef<'first' | 'save' | null>(null);
  const firstDayRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  const isEmpty = days.length === 0;
  const unchanged = sameDays(days, initial);

  // Tras guardar, el botón sigue deshabilitado (no hay cambios): el foco va a la
  // primera casilla. Tras un error, a «Guardar» para reintentar, con el error
  // ya enlazado al grupo.
  useEffect(() => {
    if (saving || !focusAfterSave.current) return;
    if (focusAfterSave.current === 'first') firstDayRef.current?.focus();
    else saveRef.current?.focus();
    focusAfterSave.current = null;
  }, [saving]);

  function toggle(day: number, checked: boolean) {
    setDays((prev) => (checked ? [...prev, day] : prev.filter((d) => d !== day)));
    setSaved(false);
    setError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isEmpty) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const calendar = await setWorkingWeekdays(token, locationId, [...days].sort((a, b) => a - b));
      onSaved(calendar);
      setSaved(true);
      focusAfterSave.current = 'first';
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
      focusAfterSave.current = 'save';
    } finally {
      setSaving(false);
    }
  }

  const message = isEmpty ? copy.empty : error;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <fieldset
        aria-describedby={message ? `${errorId} ${helpId}` : helpId}
        className="flex flex-col gap-3"
      >
        <legend className="sr-only">{copy.legend}</legend>
        {/* 390 px: 4 + 3 casillas; desde `sm`, la semana en una fila. */}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {ISO_WEEK_ORDER.map((day) => {
            const inputId = `${id}-day-${day}`;
            const first = day === ISO_WEEK_ORDER[0];
            return (
              <label
                key={day}
                htmlFor={inputId}
                className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface px-1 py-2 text-center text-sm text-ink has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg"
              >
                <input
                  ref={first ? firstDayRef : undefined}
                  id={inputId}
                  type="checkbox"
                  checked={days.includes(day)}
                  onChange={(e) => toggle(day, e.target.checked)}
                  disabled={saving}
                  className="size-4 shrink-0 accent-[var(--color-primary)] focus-visible:outline-none"
                />
                {/* Casilla encima del nombre: «Miércoles» cabe entero en una cuarta parte de 390 px. */}
                <span className="break-words">{capitalize(weekdayName(day))}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {/* El error, justo debajo de las casillas que lo provocan (DESIGN, escalón 4). */}
      {message ? <InlineError id={errorId}>{message}</InlineError> : null}
      <p data-testid="working-weekdays-summary" className="font-medium text-ink">
        {isEmpty ? copy.noSummary : describeWorkingWeekdays(days, { weekdayName })}
      </p>
      <p id={helpId} className="max-w-[68ch] text-sm text-muted">
        {copy.help}{' '}
        <Link href="/settings/horarios" className="font-medium text-ink underline underline-offset-2 hover:text-primary">
          {copy.schedulesLink}
        </Link>
      </p>
      {/* Región viva siempre montada: el texto entra al guardar y se anuncia. */}
      <p role="status" className={saved && !message ? 'flex items-center gap-1 text-sm text-success' : 'sr-only'}>
        {saved && !message ? (
          <>
            <CheckCircle2 aria-hidden className="size-4" />
            {copy.saved}
          </>
        ) : null}
      </p>
      <div>
        <Button
          ref={saveRef}
          type="submit"
          variant="secondary"
          disabled={saving || isEmpty || unchanged}
          aria-busy={saving || undefined}
          className="max-sm:min-h-11 max-sm:w-full"
        >
          {copy.save}
        </Button>
      </div>
    </form>
  );
}
