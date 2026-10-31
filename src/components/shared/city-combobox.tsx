'use client';
import { useEffect, useRef, useState } from 'react';
import { searchCities, type City } from '@/lib/reference/cities-api';
import { FieldError } from '@/components/errors/field-error';
import { cn } from '@/lib/utils';
import { controlHeight, fieldClass } from '@/lib/ui/field-class';

const copy = {
  // Escalón 2 (FieldError): ≤4 palabras, el `<label>` del campo da el contexto.
  loadError: 'Ciudades no disponibles',
};

const cityFieldClass = `${fieldClass} ${controlHeight}`;

export interface CitySelection {
  id: number;
  name: string;
}

interface CityComboboxProps {
  id: string;
  token: string;
  countryCode: string | null;
  value: CitySelection | null;
  onChange: (city: CitySelection | null) => void;
  disabled?: boolean;
}

export function CityCombobox({ id, token, countryCode, value, onChange, disabled }: CityComboboxProps) {
  const [text, setText] = useState(value?.name ?? '');
  const [results, setResults] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  // La búsqueda falló: el control se sustituye por un FieldError (escalón 2,
  // DX-063) en vez de quedar como «sin resultados». `attempt` relanza la
  // búsqueda con el texto actual al reintentar.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Si el campo tenía el foco al fallar, el foco pasa al Reintentar y, al
  // reintentar, vuelve al campo: sustituir el control no puede perderlo.
  const [focusAfterSwap, setFocusAfterSwap] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Lo marca el Reintentar (un handler) y lo consume el efecto al volver a
  // montar el campo.
  const refocusInputRef = useRef(false);

  useEffect(() => {
    if (!failed && refocusInputRef.current) {
      refocusInputRef.current = false;
      inputRef.current?.focus();
    }
  }, [failed]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the country changes, clear this component's OWN state (text +
  // results + open) synchronously — the sanctioned "adjust state during
  // render" pattern, same `prevX` convention used elsewhere in the app.
  const [prevCountry, setPrevCountry] = useState(countryCode);
  if (countryCode !== prevCountry) {
    setPrevCountry(countryCode);
    setText('');
    setResults([]);
    setOpen(false);
    setFailed(false);
  }

  // Notifying the PARENT (`onChange(null)`) must NOT happen during render —
  // that's a different component's state and triggers React's "Cannot
  // update a component while rendering a different component" warning once
  // the parent's onChange actually calls setState (Task 13's patient-form).
  // So this is deferred to an effect keyed on `countryCode`. `notifiedCountryRef`
  // is only ever read/written from inside the effect (never during render —
  // that's a separate lint error, "Cannot access refs during render"), so it
  // safely tracks "did we already notify for this country" across renders,
  // same "ref, not state" idiom as `loadedPlanIdRef` in treatment-plans-tab.tsx.
  const notifiedCountryRef = useRef(countryCode);

  useEffect(() => {
    if (notifiedCountryRef.current === countryCode) return; // no-op on mount, and on renders where the country didn't change
    notifiedCountryRef.current = countryCode;
    if (value !== null) onChange(null);
  }, [countryCode, value, onChange]);

  // `pick()` sets `text` to the selected city's name, which is also a `text`
  // change and would otherwise re-trigger the debounced search effect below
  // and reopen the dropdown right after the user just closed it by picking.
  // This ref marks "the next `text`-triggered effect run is the one caused by
  // pick(), not by the user typing" — the effect consumes it once (skipping
  // that one search) and clears it, so it doesn't suppress a later, genuine
  // search for a newly typed query.
  const justPickedRef = useRef(false);

  useEffect(() => {
    // No country selected → nothing to search; the country-change block above
    // already cleared results, so just bail.
    if (!countryCode) return;
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    const q = text.trim();
    let cancelled = false;
    // Empty `q` is intentional: on country select — and on focus with an empty
    // field — we load that country's first page of cities so the dropdown
    // opens already populated instead of blank. Typing then narrows it. Open
    // state is driven by focus/typing (below), NOT by this fetch, so results
    // are prefetched quietly and only shown once the field is focused.
    debounce.current = setTimeout(() => {
      searchCities(token, { countryCode, ...(q ? { q } : {}), limit: 50 })
        .then((data) => {
          if (!cancelled) setResults(data);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setOpen(false);
          setFocusAfterSwap(
            typeof document !== 'undefined' && document.activeElement === inputRef.current,
          );
          setFailed(true);
        });
    }, q ? 250 : 0); // instant initial load, debounced while typing
    return () => {
      cancelled = true;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [token, countryCode, text, attempt]);

  function pick(city: City) {
    justPickedRef.current = true;
    onChange({ id: city.id, name: city.name });
    setText(city.name);
    setOpen(false);
  }

  if (failed) {
    return (
      <FieldError
        label={copy.loadError}
        onRetry={() => {
          refocusInputRef.current = focusAfterSwap;
          setFocusAfterSwap(false);
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
        className="h-10 w-full"
        retryId={id}
        focusRetry={focusAfterSwap}
      />
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        autoComplete="off"
        disabled={disabled || !countryCode}
        value={text}
        onFocus={() => {
          // Reveal the prefetched list (or trigger the initial load if the
          // effect hasn't run yet) as soon as the field is focused.
          if (countryCode) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          // Escape cierra la lista; con ella abierta, el diálogo que contiene el
          // campo no se cierra (`ui/dialog.tsx`), así que lo hace aquí.
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          setOpen(true);
          // Clearing the field falls back to the country's first page (the
          // effect reloads with empty q); don't blank the results here.
          if (value !== null) onChange(null);
        }}
        className={cityFieldClass}
      />
      {open && results.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-md"
        >
          {results.map((city) => (
            <li key={city.id} role="option" aria-selected={value?.id === city.id}>
              <button
                type="button"
                // Keep focus on the input so its onBlur doesn't close the list
                // before this click lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(city)}
                className={cn('block w-full px-3 py-2 text-left text-sm text-ink hover:bg-muted/10')}
              >
                {city.name}
                {city.region ? <span className="text-muted"> — {city.region}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
