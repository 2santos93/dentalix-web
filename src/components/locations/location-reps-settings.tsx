'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listLocations,
  REPS_PATTERN,
  updateLocationReps,
  type ClinicLocation,
} from '@/lib/locations/locations-api';
import { COUNTRY_LABELS } from '@/lib/prescriptions/prescriptions-api';
import { AsyncSection } from '@/components/shared/async-section';
import { InlineError } from '@/components/errors/inline-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const locationRepsCopy = {
  heading: 'Código de habilitación (REPS)',
  support:
    'El código con el que la sede está inscrita en el REPS (12 dígitos).',
  label: 'Código de habilitación (REPS)',
  labelFor: (name: string) => `Código de habilitación (REPS) de ${name}`,
  placeholder: '12 dígitos',
  save: 'Guardar',
  saveFor: (name: string) => `Guardar el código REPS de ${name}`,
  saved: 'Guardado',
  invalid: 'El código de habilitación REPS debe tener 12 dígitos (ej. 110010123401).',
  saveError: 'No pudimos guardar el código. Intenta de nuevo.',
  notApplicable: 'No aplica: el REPS es de Colombia.',
  readOnly: 'Solo un administrador puede cambiarlo.',
  empty: 'Sin código',
  loadError: 'No pudimos cargar las sedes.',
  inactive: 'inactiva',
};

const copy = locationRepsCopy;

interface LocationRepsSettingsProps {
  token: string;
  /** Solo ADMIN edita (la API responde 403 al resto). */
  canEdit: boolean;
}

/** DX-212: código REPS de cada sede. ADMIN lo edita; el resto lo ve. */
export function LocationRepsSettings({ token, canEdit }: LocationRepsSettingsProps) {
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
    <section aria-labelledby="reps-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="reps-heading" className="text-lg font-semibold text-ink">
          {copy.heading}
        </h2>
        <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
      </div>
      <AsyncSection loading={loading} error={error} onRetry={() => setReloadKey((k) => k + 1)}>
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border bg-surface">
          {locations.map((location) => (
            <li key={location.id} className="px-4 py-3">
              <LocationRepsRow
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

function LocationRepsRow({
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
  const current = location.repsHabilitationCode ?? '';
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputId = `reps-${location.id}`;
  const errorId = `${inputId}-error`;
  const name = `${location.name}${location.isActive ? '' : ` (${copy.inactive})`}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const next = value.trim();
    if (next && !REPS_PATTERN.test(next)) {
      setError(copy.invalid);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateLocationReps(token, location.id, next || null);
      onSaved(updated);
      setValue(updated.repsHabilitationCode ?? '');
      setSaved(true);
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <div className="flex flex-col">
      <span className="font-medium text-ink">{name}</span>
      <span className="text-xs text-muted">{COUNTRY_LABELS[location.country]}</span>
    </div>
  );

  if (location.country !== 'CO') {
    return (
      <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
        {header}
        <span className="text-muted">{copy.notApplicable}</span>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
        {header}
        <div className="flex flex-col sm:items-end">
          <span className="text-xs text-muted">{copy.label}</span>
          <span className="tabular-nums text-ink">{current || copy.empty}</span>
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
        <div className="flex gap-2">
          <Input
            id={inputId}
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            placeholder={copy.placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(/\s/g, ''));
              setSaved(false);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn('tabular-nums', error && 'border-danger')}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={saving || value.trim() === current}
            aria-busy={saving || undefined}
            aria-label={copy.saveFor(location.name)}
          >
            {copy.save}
          </Button>
        </div>
        {error ? (
          <InlineError id={errorId} className="text-xs">
            {error}
          </InlineError>
        ) : saved ? (
          <p role="status" className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 aria-hidden className="size-3.5" />
            {copy.saved}
          </p>
        ) : null}
      </div>
    </form>
  );
}
