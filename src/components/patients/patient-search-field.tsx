'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { listPatients, type Patient } from '@/lib/patients/patients-api';
import { documentText, dtoDocTypeName } from '@/lib/patients/doc-type';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { fieldErrorId, fieldHintId } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const patientSearchCopy = {
  placeholder: 'Nombre o documento',
  hint: 'Escribe al menos 2 letras o el documento.',
  searching: 'Buscando…',
  noMatch: 'Ningún paciente coincide.',
  searchError: 'Búsqueda no disponible',
  change: 'Cambiar',
  changeLabel: (name: string) => `Cambiar el paciente elegido (${name})`,
  results: (label: string) => `Resultados de la búsqueda: ${label.replace(/ \(opcional\)$/, '')}`,
};

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 8;

export interface PickedPatient {
  id: string;
  fullName: string;
}

const fullName = (p: Pick<Patient, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`.trim();

/** «{nombre visible} {número}» del DTO; sin número, solo el nombre. */
function docLabel(p: Pick<Patient, 'docType' | 'docTypeLabel' | 'docTypeName' | 'docNumber'>): string {
  const name = dtoDocTypeName(p);
  return documentText(name, p.docNumber) ?? name;
}

interface PatientSearchFieldProps {
  id: string;
  label: string;
  token: string;
  value: PickedPatient | null;
  onChange: (patient: PickedPatient | null) => void;
  /** Un paciente que no se ofrece (el propio, al editar). */
  excludeId?: string;
  error?: string | null;
  className?: string;
}

/**
 * Elegir un paciente de la clínica por nombre o documento (DX-172: quién lo
 * recomendó). Mismo patrón que el de «Responsable y familia»: un campo de
 * búsqueda con resultados debajo (botones de 44 px), y una vez elegido una
 * tarjeta con «Cambiar». La búsqueda caída es un escalón 2 (`FieldError` con
 * reintento) y el resto del formulario sigue.
 */
export function PatientSearchField({
  id,
  label,
  token,
  value,
  onChange,
  excludeId,
  error,
  className,
}: PatientSearchFieldProps) {
  const c = patientSearchCopy;
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [searchKey, setSearchKey] = useState(0);
  const searchable = debouncedQuery.length >= 2;
  const active = value === null && searchable;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function search() {
      setSearching(true);
      try {
        const res = await listPatients(token, { query: debouncedQuery, pageSize: SEARCH_PAGE_SIZE });
        if (cancelled) return;
        setResults(res.items.filter((p) => p.id !== excludeId));
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }
    void search();
    return () => {
      cancelled = true;
    };
  }, [token, excludeId, debouncedQuery, active, searchKey]);

  if (value) {
    return (
      <div className={className}>
        <p id={`${id}-label`} className="t-label mb-1.5 text-ink">
          {label}
        </p>
        <div
          aria-labelledby={`${id}-label`}
          role="group"
          className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Check aria-hidden className="size-4 shrink-0 text-primary-text" />
            <p data-testid="picked-patient" className="min-w-0 truncate text-sm font-medium text-ink">
              {value.fullName}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 max-sm:min-h-11"
            aria-label={c.changeLabel(value.fullName)}
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
          >
            <X aria-hidden className="size-3.5" /> {c.change}
          </Button>
        </div>
        {error ? (
          <InlineError id={fieldErrorId(id)} className="mt-1.5 text-xs">
            {error}
          </InlineError>
        ) : null}
      </div>
    );
  }

  const describedBy = error ? fieldErrorId(id) : !searchable ? fieldHintId(id) : undefined;
  return (
    <div className={className}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            id={id}
            type="search"
            autoComplete="off"
            placeholder={c.placeholder}
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="pl-9"
          />
          {searching ? (
            <Loader2 aria-hidden className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
          ) : null}
        </div>
        {error ? (
          <InlineError id={fieldErrorId(id)} className="text-xs">
            {error}
          </InlineError>
        ) : null}
        {failed && searchable ? (
          <FieldError label={c.searchError} onRetry={() => setSearchKey((k) => k + 1)} className="h-10 w-full" />
        ) : !searchable ? (
          <p id={fieldHintId(id)} className="text-xs text-muted">
            {c.hint}
          </p>
        ) : searching && results.length === 0 ? (
          <p role="status" className="text-xs text-muted">
            {c.searching}
          </p>
        ) : results.length === 0 ? (
          <p role="status" className="text-xs text-muted">
            {c.noMatch}
          </p>
        ) : (
          <ul
            aria-label={c.results(label)}
            className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border bg-surface p-1"
          >
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onChange({ id: p.id, fullName: fullName(p) })}
                  className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
                >
                  <span className="truncate text-sm text-ink">{fullName(p)}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{docLabel(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
