'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { COUNTRIES, countrySearchKey, searchCountries, type CountryOption } from '@/lib/locations/countries';
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

export type CountryComboboxCopy = typeof countryComboboxCopy;

/** Textos para elegir el prefijo telefónico por defecto de una sede (DX-329, spec §6.3). */
export const phoneRegionComboboxCopy: CountryComboboxCopy = {
  placeholder: 'Busca por nombre, código o prefijo (+…)',
  noMatch: 'Ningún prefijo coincide.',
  list: 'Prefijos telefónicos',
  results: (n: number) => (n === 1 ? '1 prefijo' : `${n} prefijos`),
};

/** Valor de `noneOption`: una elección propia, distinta de `''` (sin elegir). */
export const COMBOBOX_NONE = 'NONE';

interface ComboboxOption {
  code: string;
  name: string;
}

interface CountryComboboxProps<T extends ComboboxOption> {
  /** id del control: el `<label htmlFor>` del campo lo nombra. */
  id: string;
  /** Código elegido (ISO 3166-1 alfa-2 por defecto); `''` = sin elegir; `COMBOBOX_NONE` = `noneOption`. */
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  required?: boolean;
  /** Ayuda o error del campo (el `FormField` que lo envuelve). */
  ariaDescribedBy?: string;
  placeholder?: string;
  /** Todas las opciones, para pintar la elegida. Por defecto, los países. */
  options?: readonly T[];
  /** Opciones que casan con lo escrito (todas si no hay nada). Por defecto, `searchCountries`. */
  search?: (query: string) => T[];
  /** Texto de una opción, en la lista y en el campo. Por defecto, su nombre. */
  formatOption?: (option: T) => string;
  /** Textos de la lista. Por defecto, los de país. */
  copy?: CountryComboboxCopy;
  /** Opción fija al principio, con valor `COMBOBOX_NONE` y su texto en el campo cuando se elige. */
  noneOption?: { label: string };
}

/** Una fila de la lista: su valor y el texto que se ve. */
interface Item {
  code: string;
  label: string;
}

/**
 * País de una sede (DX-312, spec §6.3); con `options`, `search`,
 * `formatOption`, `copy` y `noneOption`, también su prefijo telefónico por
 * defecto (DX-329, spec §6.3): combobox ARIA 1.2 con
 * `aria-activedescendant` sobre todos los países de la copia, sin banderas ni
 * países destacados. Busca en memoria por nombre (sin tildes ni mayúsculas) o
 * por código exacto. El campo muestra el nombre del país elegido; escribir
 * abre la lista filtrada con la primera opción resaltada, las flechas,
 * Inicio/Fin la recorren, Intro elige y Escape cierra. La opción del país
 * elegido lleva `aria-selected="true"`; la resaltada, solo
 * `aria-activedescendant`. Salir del campo sin
 * elegir vuelve al último país elegido (o lo deja vacío si no había ninguno):
 * un texto suelto nunca es un país.
 */
export function CountryCombobox<T extends ComboboxOption = CountryOption>({
  id,
  value,
  onChange,
  invalid,
  required,
  ariaDescribedBy,
  options = COUNTRIES as unknown as readonly T[],
  search = searchCountries as unknown as (query: string) => T[],
  formatOption = (option) => option.name,
  copy = countryComboboxCopy,
  noneOption,
  placeholder = copy.placeholder,
}: CountryComboboxProps<T>) {
  // `null` = no se está escribiendo: el campo muestra el nombre de `value`, así
  // sigue al valor del padre (p. ej. la sugerencia que llega tras montar).
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listboxId = `${id}-listbox`;
  const statusId = `${id}-status`;
  const optionId = (code: string) => `${id}-option-${code}`;

  /** La opción «ninguno» va primero con la lista entera, o si lo escrito está en su texto. */
  function itemsFor(text: string): Item[] {
    const key = countrySearchKey(text);
    const none =
      noneOption && (key === '' || countrySearchKey(noneOption.label).includes(key))
        ? [{ code: COMBOBOX_NONE, label: noneOption.label }]
        : [];
    return [...none, ...search(text).map((option) => ({ code: option.code, label: formatOption(option) }))];
  }

  const results: Item[] = open ? itemsFor(query ?? '') : [];
  const activeOption = active >= 0 ? results[active] : undefined;
  const activeId = activeOption ? optionId(activeOption.code) : undefined;

  // La opción resaltada se ve siempre dentro de la lista (`scrollIntoView` no existe en jsdom).
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  /** Abre la lista con el país elegido resaltado (o la primera opción), o la última con `last`. */
  function openList(highlight: 'selected' | 'last') {
    const list = itemsFor(query ?? '');
    setOpen(true);
    if (highlight === 'last') setActive(list.length - 1);
    else setActive(Math.max(list.findIndex((c) => c.code === value), list.length > 0 ? 0 : -1));
  }

  function close() {
    setOpen(false);
    setActive(-1);
    setQuery(null);
  }

  function pick(item: Item) {
    close();
    if (item.code !== value) onChange(item.code);
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
        // mientras la lista está abierta (`ui/combobox-escape.ts`).
        if (open || query !== null) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        break;
    }
  }

  function labelOf(code: string): string {
    if (code === '') return '';
    if (code === COMBOBOX_NONE && noneOption) return noneOption.label;
    const option = options.find((o) => o.code === code);
    return option ? formatOption(option) : code;
  }

  const shown = query ?? labelOf(value);
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
          setActive(next.trim() !== '' && itemsFor(next).length > 0 ? 0 : -1);
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
        {results.map((item, index) => (
          <li
            key={item.code}
            id={optionId(item.code)}
            role="option"
            // `aria-selected` marca el país elegido, no el resaltado (que va por
            // `aria-activedescendant`): el lector anuncia «seleccionado» en la
            // opción actual aunque las flechas se muevan por otras.
            aria-selected={item.code === value}
            // El foco no sale del campo: si no, su `onBlur` cerraría la lista
            // antes de que llegue el clic.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(item)}
            className={cn(
              'flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-ink sm:min-h-9',
              index === active ? 'bg-primary/10' : 'hover:bg-surface-2',
            )}
          >
            <span className="min-w-0 break-words">{item.label}</span>
            {item.code === value ? <Check aria-hidden className="size-4 shrink-0 text-primary" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
