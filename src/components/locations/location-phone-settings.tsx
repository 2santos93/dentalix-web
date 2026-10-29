'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  LOCATION_PHONE_MAX_LENGTH,
  updateLocationPhone,
  type ClinicLocation,
} from '@/lib/locations/locations-api';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { AsyncSection } from '@/components/shared/async-section';
import { InlineError } from '@/components/errors/inline-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const locationPhoneCopy = {
  heading: 'Teléfono de la sede',
  support:
    'Aparece en las indicaciones postoperatorias que recibe el paciente, para que sepa a dónde llamar.',
  label: 'Teléfono',
  hint: 'Con indicativo internacional (+…).',
  save: 'Guardar',
  saveFor: (name: string) => `Guardar el teléfono de ${name}`,
  saved: 'Guardado',
  saveError: 'No pudimos guardar el teléfono. Intenta de nuevo.',
  readOnly: 'Solo un administrador puede cambiarlo.',
  empty: 'Sin teléfono',
  loadError: 'No pudimos cargar las sedes.',
  inactive: 'inactiva',
};

const copy = locationPhoneCopy;

interface LocationPhoneSettingsProps {
  token: string;
  /** Solo ADMIN edita (la API responde 403 al resto). */
  canEdit: boolean;
}

/** DX-222: teléfono de cada sede. ADMIN lo edita; el resto lo ve. */
export function LocationPhoneSettings({ token, canEdit }: LocationPhoneSettingsProps) {
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // G1: la lectura de la sesión; el modal de sede la invalida y esta tarjeta
  // relee sin vaciarse (la sede nueva o editada aparece sin recargar).
  const requestLocations = useSessionLocations(token);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await requestLocations();
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
  }, [requestLocations, reloadKey]);

  return (
    <section aria-labelledby="phone-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="phone-heading" className="text-lg font-semibold text-ink">
          {copy.heading}
        </h2>
        <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
      </div>
      <AsyncSection loading={loading} error={error} onRetry={() => {
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
      >
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border bg-surface">
          {locations.map((location) => (
            <li key={location.id} className="px-4 py-3">
              <LocationPhoneRow
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

function LocationPhoneRow({
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
  const current = location.phone ?? '';
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputId = `phone-${location.id}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const name = `${location.name}${location.isActive ? '' : ` (${copy.inactive})`}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateLocationPhone(token, location.id, value.trim() || null);
      onSaved(updated);
      setValue(updated.phone ?? '');
      setSaved(true);
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
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
            type="tel"
            autoComplete="off"
            maxLength={LOCATION_PHONE_MAX_LENGTH}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
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
        <p id={hintId} className="text-xs text-muted">
          {copy.hint}
        </p>
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
