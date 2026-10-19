'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchIcd10, type Icd10Code } from '@/lib/reference/icd10-api';
import { FieldError } from '@/components/errors/field-error';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const icd10ComboboxCopy = {
  placeholder: 'Código o texto (K02.1, caries…)',
  searching: 'Buscando…',
  noResults: 'Sin coincidencias',
  // Escalón 2 (FieldError): ≤ 4 palabras, el `<label>` da el contexto.
  loadError: 'CIE-10 no disponible',
  change: 'Cambiar',
  changeFor: (code: string) => `Cambiar el diagnóstico ${code}`,
  results: (n: number) => (n === 1 ? '1 resultado' : `${n} resultados`),
};

const copy = icd10ComboboxCopy;
const DEBOUNCE_MS = 250;

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface Icd10ComboboxProps {
  /** id del control: el `<label htmlFor>` del campo lo nombra. */
  id: string;
  token: string;
  value: Icd10Code | null;
  onChange: (code: Icd10Code | null) => void;
  /** Para `aria-describedby` (ayuda o error del campo). */
  describedBy?: string;
}

/**
 * Campo «Diagnóstico (CIE-10)» (DX-212): combobox con búsqueda en la API por
 * código o texto (sin tildes), patrón ARIA 1.2 con `aria-activedescendant`:
 * el foco se queda en el campo y las flechas recorren la lista, Intro elige y
 * Escape cierra. Estados: «Buscando…», «Sin coincidencias» y, si la búsqueda
 * falla, el control se sustituye por un `FieldError` con «Reintentar».
 * Elegido un código, se pliega a «K02.1 · Caries de la dentina» con «Cambiar».
 */
export function Icd10Combobox({ id, token, value, onChange, describedBy }: Icd10ComboboxProps) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Icd10Code[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // La búsqueda pedida (abrir, teclear, reintentar): un objeto nuevo cada vez,
  // así reintentar el mismo texto vuelve a lanzarla.
  const [request, setRequest] = useState<{ q: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tras «Cambiar» o «Reintentar» el control que tenía el foco desaparece: el
  // foco pasa al campo nuevo. Lo marca un handler; lo consume un efecto.
  const focusInputRef = useRef(false);
  const listboxId = `${id}-listbox`;
  const statusId = `${id}-status`;

  useEffect(() => {
    if (focusInputRef.current && value === null && status !== 'error') {
      focusInputRef.current = false;
      inputRef.current?.focus();
    }
  }, [value, status]);

  useEffect(() => {
    if (request === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchIcd10(token, request.q)
        .then((data) => {
          if (cancelled) return;
          setResults(data);
          setActive(-1);
          setStatus('ready');
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setOpen(false);
          setStatus('error');
        });
    }, request.q.trim() ? DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [request, token]);

  function search(next: string) {
    setText(next);
    setOpen(true);
    setStatus('loading');
    setRequest({ q: next });
  }

  function pick(code: Icd10Code) {
    onChange(code);
    setOpen(false);
    setText('');
    setResults([]);
    setStatus('idle');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        search(text);
        return;
      }
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    }
  }

  if (value) {
    return (
      <div className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5">
        <span className="min-w-0 text-sm">
          <span className="font-medium tabular-nums text-ink">{value.code}</span>
          <span className="text-muted"> · </span>
          <span className="text-ink">{value.labelEs}</span>
        </span>
        <Button
          id={id}
          type="button"
          variant="secondary"
          size="sm"
          aria-label={copy.changeFor(value.code)}
          onClick={() => {
            focusInputRef.current = true;
            onChange(null);
          }}
        >
          {copy.change}
        </Button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <FieldError
        label={copy.loadError}
        className="h-10 w-full"
        retryId={id}
        onRetry={() => {
          focusInputRef.current = true;
          search(text);
        }}
      />
    );
  }

  const activeId = active >= 0 && results[active] ? `${id}-opt-${results[active].code}` : undefined;
  const showList = open && status === 'ready' && results.length > 0;

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={showList ? activeId : undefined}
        aria-describedby={cn(statusId, describedBy) || undefined}
        autoComplete="off"
        placeholder={copy.placeholder}
        value={text}
        onFocus={() => {
          if (!open) search(text);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => search(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn(fieldClass, 'h-10 pl-9')}
      />
      {/* Fuera de la lista: un `listbox` solo admite opciones. El recuento es
          solo para el lector de pantalla; «Buscando…» y «Sin coincidencias» se
          ven y se anuncian a la vez. */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {showList ? copy.results(results.length) : ''}
      </p>
      {open && (status === 'loading' || (status === 'ready' && results.length === 0)) ? (
        <p
          role="status"
          className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted shadow-md"
        >
          {status === 'loading' ? copy.searching : copy.noResults}
        </p>
      ) : null}
      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-md"
        >
          {results.map((code, index) => (
            <li
              key={code.code}
              id={`${id}-opt-${code.code}`}
              role="option"
              aria-selected={index === active}
              // El foco no sale del campo: si no, su `onBlur` cerraría la
              // lista antes de que llegue el clic.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(code)}
              className={cn(
                'flex min-h-11 cursor-pointer items-baseline gap-2 px-3 py-2 text-sm',
                index === active ? 'bg-primary/10' : 'hover:bg-surface-2',
              )}
            >
              <span className="w-12 shrink-0 font-medium tabular-nums text-ink">{code.code}</span>{' '}
              <span className="min-w-0 text-ink">{code.labelEs}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
