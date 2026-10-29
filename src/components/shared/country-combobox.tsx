'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { countryName, searchCountries, type CountryOption } from '@/lib/locations/countries';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const countryComboboxCopy = {
  placeholder: 'Escribe el nombre o el código del país',
  // Sin coincidencias no es un error: es una opción deshabilitada de la lista.
  noMatch: 'Ningún país coincide.',
  /** Nombre de la lista para el lector de pantalla. */
  list: 'Países',
  /** Recuento para el lector de pantalla mientras se escribe. */
  results: (n: number) => (n === 1 ? '1 país' : `${n} países`),
};

const copy = countryComboboxCopy;

interface CountryComboboxProps {
  /** id del control: el `<label htmlFor>` del campo lo nombra. */
  id: string;
  /** Código ISO 3166-1 alfa-2 elegido; `''` = sin elegir. */
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  required?: boolean;
  /** Ayuda o error del campo (el `FormField` que lo envuelve). */
  ariaDescribedBy?: string;
  placeholder?: string;
}

/**
 * País de una sede (DX-312, spec §6.3): combobox ARIA 1.2 con
 * `aria-activedescendant` sobre todos los países de la copia, sin banderas ni
 * países destacados. Busca en memoria por nombre (sin tildes ni mayúsculas) o
 * por código exacto. El campo muestra el nombre del país elegido; escribir
 * abre la lista filtrada con la primera opción resaltada, las flechas,
 * Inicio/Fin la recorren, Intro elige y Escape cierra. Salir del campo sin
 * elegir vuelve al último país elegido (o lo deja vacío si no había ninguno):
 * un texto suelto nunca es un país.
 */
export function CountryCombobox({
  id,
  value,
  onChange,
  invalid,
  required,
  ariaDescribedBy,
  placeholder = copy.placeholder,
}: CountryComboboxProps) {
  // `null` = no se está escribiendo: el campo muestra el nombre de `value`, así
  // sigue al valor del padre (p. ej. la sugerencia que llega tras montar).
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listboxId = `${id}-listbox`;
  const statusId = `${id}-status`;
  const optionId = (code: string) => `${id}-option-${code}`;

  const results: CountryOption[] = open ? searchCountries(query ?? '') : [];
  const activeOption = active >= 0 ? results[active] : undefined;
  const activeId = activeOption ? optionId(activeOption.code) : undefined;

  // La opción resaltada se ve siempre dentro de la lista (`scrollIntoView` no existe en jsdom).
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  /** Abre la lista con el país elegido resaltado (o la primera opción), o la última con `last`. */
  function openList(highlight: 'selected' | 'last') {
    const list = searchCountries(query ?? '');
    setOpen(true);
    if (highlight === 'last') setActive(list.length - 1);
    else setActive(Math.max(list.findIndex((c) => c.code === value), list.length > 0 ? 0 : -1));
  }

  function close() {
    setOpen(false);
    setActive(-1);
    setQuery(null);
  }

  function pick(country: CountryOption) {
    close();
    if (country.code !== value) onChange(country.code);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList('selected');
        else setActive((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList('last');
        else setActive((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (open && results.length > 0) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open && results.length > 0) {
          e.preventDefault();
          setActive(results.length - 1);
        }
        break;
      case 'Enter':
        // Con la lista abierta, Intro actúa sobre la lista: nunca envía el formulario.
        if (open) {
          e.preventDefault();
          if (activeOption) pick(activeOption);
        }
        break;
      case 'Escape':
        // Cierra solo la lista; el diálogo que contiene el campo no se cierra
        // mientras la lista está abierta (`ui/dialog.tsx`).
        if (open || query !== null) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        break;
    }
  }

  const shown = query ?? (value ? (countryName(value) ?? value) : '');
  // Solo mientras se escribe: abrir la lista completa no anuncia «250 países».
  const status =
    open && query !== null && query.trim() !== ''
      ? results.length === 0
        ? copy.noMatch
        : copy.results(results.length)
      : '';

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeId}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        // El recuento solo describe el campo cuando dice algo: vacío dejaría un
        // espacio de más tras la pista o el error.
        aria-describedby={cn(ariaDescribedBy, status && statusId) || undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={shown}
        onClick={() => {
          if (!open) openList('selected');
        }}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          // Escribiendo, la primera coincidencia queda resaltada; con el campo vacío, ninguna.
          setActive(next.trim() !== '' && searchCountries(next).length > 0 ? 0 : -1);
        }}
        onBlur={close}
        onKeyDown={onKeyDown}
        className={cn(fieldClass, 'h-11 pr-9 sm:h-10')}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
      {/* Fuera de la lista: un `listbox` solo admite opciones. Solo para el
          lector de pantalla (la opción «sin coincidencias» no se anuncia sola). */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {/* El listbox existe siempre (`aria-controls` apunta a un id real); vacío y oculto cuando está cerrado. */}
      <ul
        id={listboxId}
        role="listbox"
        aria-label={copy.list}
        hidden={!open}
        className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface py-1 shadow-md"
      >
        {open && results.length === 0 ? (
          <li
            role="option"
            aria-disabled="true"
            aria-selected={false}
            onMouseDown={(e) => e.preventDefault()}
            className="flex min-h-11 items-center px-3 py-2 text-sm text-muted sm:min-h-9">
            {copy.noMatch}
          </li>
        ) : null}
        {results.map((country, index) => (
          <li
            key={country.code}
            id={optionId(country.code)}
            role="option"
            aria-selected={index === active}
            // El foco no sale del campo: si no, su `onBlur` cerraría la lista
            // antes de que llegue el clic.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(country)}
            className={cn(
              'flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-ink sm:min-h-9',
              index === active ? 'bg-primary/10' : 'hover:bg-surface-2',
            )}
          >
            <span className="min-w-0 break-words">{country.name}</span>
            {country.code === value ? <Check aria-hidden className="size-4 shrink-0 text-primary" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
