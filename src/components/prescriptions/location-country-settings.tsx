'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import {
  COUNTRY_LABELS,
  updateLocationCountry,
  type ClinicCountry,
} from '@/lib/prescriptions/prescriptions-api';
import { AsyncSection } from '@/components/shared/async-section';
import { notifyError } from '@/components/errors/notify';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  heading: 'País de cada sede',
  support:
    'Decide los campos legales obligatorios de la receta: Colombia (Dec. 780/2016) o España (RD 1718/2010). Las recetas ya emitidas no cambian.',
  loadError: 'No pudimos cargar las sedes.',
  saveError: (name: string) => `No pudimos cambiar el país de «${name}».`,
  saved: 'Guardado',
  countryOf: (name: string) => `País de ${name}`,
  inactive: 'inactiva',
};

const COUNTRIES = Object.keys(COUNTRY_LABELS) as ClinicCountry[];

interface LocationCountrySettingsProps {
  token: string;
}

/** País de cada sede para las recetas (DX-013, solo ADMIN). */
export function LocationCountrySettings({ token }: LocationCountrySettingsProps) {
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);

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
        setError(err instanceof ApiError ? err.message : copy.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  async function change(location: ClinicLocation, country: ClinicCountry) {
    const previous = location.country;
    setSavingId(location.id);
    setLocations((prev) => prev.map((l) => (l.id === location.id ? { ...l, country } : l)));
    try {
      await updateLocationCountry(token, location.id, country);
    } catch {
      // Escalón 3: se deshace el cambio optimista; la lista vuelve a ser cierta.
      setLocations((prev) =>
        prev.map((l) => (l.id === location.id ? { ...l, country: previous } : l)),
      );
      notifyError(copy.saveError(location.name), {
        onRetry: () => void change(location, country),
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section aria-labelledby="rx-countries-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="rx-countries-heading" className="text-lg font-semibold text-ink">
          {copy.heading}
        </h2>
        <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
      </div>
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
      >
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border bg-surface">
          {locations.map((location) => (
            <li
              key={location.id}
              className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <label htmlFor={`country-${location.id}`} className="font-medium text-ink">
                {location.name}
                {location.isActive ? '' : ` (${copy.inactive})`}
              </label>
              <select
                id={`country-${location.id}`}
                aria-label={copy.countryOf(location.name)}
                value={location.country}
                disabled={savingId === location.id}
                aria-busy={savingId === location.id || undefined}
                onChange={(e) => void change(location, e.target.value as ClinicCountry)}
                className={cn(fieldClass, 'h-10 sm:w-56')}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {COUNTRY_LABELS[c]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </AsyncSection>
    </section>
  );
}
