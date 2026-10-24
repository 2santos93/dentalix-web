'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  HEALTH_REGISTRATION_NUMBER_MAX_LENGTH,
  listLocations,
  updateLocationHealthRegistration,
  type ClinicLocation,
} from '@/lib/locations/locations-api';
import { AsyncSection } from '@/components/shared/async-section';
import { InlineError } from '@/components/errors/inline-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const locationHealthRegistrationCopy = {
  heading: 'Nº de registro sanitario',
  support:
    'El número con el que la sede está inscrita ante la autoridad sanitaria. Es opcional y solo aparece en los documentos si lo activas.',
  label: 'Nº de registro sanitario',
  hint: 'Texto libre, tal como te lo asignó la autoridad sanitaria. Hasta 64 caracteres.',
  show: 'Mostrar en los documentos',
  showHint: 'Si lo activas, aparecerá en los documentos de esta sede que lo incluyan.',
  save: 'Guardar',
  saveFor: (name: string) => `Guardar el nº de registro sanitario de ${name}`,
  saved: 'Guardado',
  saveError: 'No pudimos guardar el nº de registro sanitario. Intenta de nuevo.',
  readOnly: 'Solo un administrador puede cambiarlo.',
  empty: 'Sin nº',
  shown: 'Aparece en los documentos',
  hidden: 'No aparece en los documentos',
  loadError: 'No pudimos cargar las sedes.',
  inactive: 'inactiva',
};

const copy = locationHealthRegistrationCopy;

interface LocationHealthRegistrationSettingsProps {
  token: string;
  /** Solo ADMIN edita (la API responde 403 al resto). */
  canEdit: boolean;
}

/**
 * DX-319: nº de registro sanitario de cada sede (texto libre, sin formato por
 * país) y si sale en los documentos. ADMIN lo edita; el resto lo ve.
 */
export function LocationHealthRegistrationSettings({ token, canEdit }: LocationHealthRegistrationSettingsProps) {
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listLocations(token);
        if (cancelled) return;
        setLocations(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  return (
    <section aria-labelledby="health-registration-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="health-registration-heading" className="text-lg font-semibold text-ink">
          {copy.heading}
        </h2>
        <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
      </div>
      <AsyncSection loading={loading} error={error} onRetry={() => setReloadKey((k) => k + 1)}>
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border bg-surface">
          {locations.map((location) => (
            <li key={location.id} className="px-4 py-3">
              <LocationHealthRegistrationRow
                token={token}
                location={location}
                canEdit={canEdit}
                onSaved={(saved) =>
                  setLocations((prev) => prev.map((l) => (l.id === saved.id ? { ...l, ...saved } : l)))
                }
              />
            </li>
          ))}
        </ul>
      </AsyncSection>
    </section>
  );
}

function LocationHealthRegistrationRow({
  token,
  location,
  canEdit,
  onSaved,
}: {
  token: string;
  location: ClinicLocation;
  canEdit: boolean;
  onSaved: (location: ClinicLocation) => void;
}) {
  const current = location.healthRegistrationNumber ?? '';
  const currentShow = location.showHealthRegistrationNumber ?? false;
  const [value, setValue] = useState(current);
  const [show, setShow] = useState(currentShow);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; field: boolean } | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const inputId = `health-registration-${location.id}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const showId = `${inputId}-show`;
  const showHintId = `${showId}-hint`;
  const name = `${location.name}${location.isActive ? '' : ` (${copy.inactive})`}`;
  const dirty = value.trim() !== current || show !== currentShow;

  // Tras un error, el foco va a donde se actúa, ya con el error enlazado (se
  // lee al recibir el foco): al campo si la API lo rechazó (400); si no
  // (permiso, servidor, red), a «Guardar» para reintentar.
  useEffect(() => {
    if (!error) return;
    if (error.field) inputRef.current?.focus();
    else saveRef.current?.focus();
  }, [error]);
  const fieldError = error?.field ? error : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateLocationHealthRegistration(token, location.id, {
        healthRegistrationNumber: value.trim() || null,
        showHealthRegistrationNumber: show,
      });
      onSaved(updated);
      setValue(updated.healthRegistrationNumber ?? '');
      setShow(updated.showHealthRegistrationNumber ?? false);
      setSaved(true);
    } catch (err) {
      setError({
        text: apiErrorMessage(err, copy.saveError),
        field: err instanceof ApiError && err.status === 400,
      });
    } finally {
      setSaving(false);
    }
  }

  const header = <span className="font-medium text-ink">{name}</span>;

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
        {header}
        <div className="flex flex-col sm:items-end">
          <span className="text-xs text-muted">{copy.label}</span>
          <span className="break-all text-ink">{current || copy.empty}</span>
          <span className="text-xs text-muted">{currentShow ? copy.shown : copy.hidden}</span>
          <span className="text-xs text-muted">{copy.readOnly}</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 text-sm sm:flex-row sm:items-start sm:justify-between">
      {header}
      <div className="flex flex-col gap-1.5 sm:w-80">
        <Label htmlFor={inputId}>
          {copy.label}
          <span className="sr-only"> · {name}</span>
        </Label>
        <Input
          ref={inputRef}
          id={inputId}
          autoComplete="off"
          maxLength={HEALTH_REGISTRATION_NUMBER_MAX_LENGTH}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
          className={cn(fieldError && 'border-danger')}
        />
        <p id={hintId} className="text-xs text-muted">
          {copy.hint}
        </p>
        <label htmlFor={showId} className="flex min-h-11 items-center gap-2 text-ink md:min-h-0">
          <input
            id={showId}
            type="checkbox"
            checked={show}
            onChange={(e) => {
              setShow(e.target.checked);
              setSaved(false);
            }}
            aria-describedby={showHintId}
            className="size-4 accent-primary"
          />
          {copy.show}
          <span className="sr-only"> · {name}</span>
        </label>
        <p id={showHintId} className="text-xs text-muted">
          {copy.showHint}
        </p>
        <Button
          ref={saveRef}
          type="submit"
          variant="secondary"
          className="self-start sm:self-end"
          disabled={saving || !dirty}
          aria-busy={saving || undefined}
          aria-label={copy.saveFor(location.name)}
          aria-describedby={error && !error.field ? errorId : undefined}
        >
          {copy.save}
        </Button>
        {error ? (
          <InlineError id={errorId} className="text-xs">
            {error.text}
          </InlineError>
        ) : null}
        {/* Siempre montada: un lector de pantalla anuncia el cambio de texto. */}
        <p role="status" className="flex items-center gap-1 text-xs text-success">
          {saved ? (
            <>
              <CheckCircle2 aria-hidden className="size-3.5" />
              {copy.saved}
            </>
          ) : null}
        </p>
      </div>
    </form>
  );
}
