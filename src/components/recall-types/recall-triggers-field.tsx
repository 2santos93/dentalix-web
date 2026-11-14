'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import type { RecallTypeTrigger } from '@/lib/recall/recall-api';
import { FieldError } from '@/components/errors/field-error';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export const recallTriggersCopy = {
  legend: 'Procedimientos que lo reinician',
  hint: 'Al marcar realizado uno de estos, el plazo vuelve a contar desde ese día.',
  search: 'Buscar procedimiento',
  searchPlaceholder: 'Nombre o código',
  selected: (n: number) => (n === 0 ? 'Ninguno elegido' : n === 1 ? '1 elegido' : `${n} elegidos`),
  noMatches: 'Ningún procedimiento coincide con la búsqueda.',
  emptyCatalog: 'El catálogo no tiene procedimientos activos.',
  retired: 'Ya no está en el catálogo',
  loadError: 'No cargó el catálogo',
};
const copy = recallTriggersCopy;

/** A partir de cuántos procedimientos sale el buscador. */
const SEARCH_FROM = 8;

interface TriggerOption {
  id: string;
  code: string;
  name: string;
  /** Un disparador que el tipo ya tenía y salió del catálogo: la API lo deja conservar. */
  retired: boolean;
}

/** Los procedimientos activos del catálogo y, al final, los disparadores del tipo que ya no están. */
function triggerOptions(catalog: readonly DentalCatalogItem[], current: readonly RecallTypeTrigger[]): TriggerOption[] {
  const options: TriggerOption[] = catalog.map((c) => ({ id: c.id, code: c.code, name: c.labelEs, retired: false }));
  for (const t of current) {
    if (!options.some((o) => o.id === t.catalogItemId)) {
      options.push({ id: t.catalogItemId, code: t.code, name: t.name, retired: true });
    }
  }
  return options;
}

function matches(option: TriggerOption, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('es');
  return q === '' || option.name.toLocaleLowerCase('es').includes(q) || option.code.toLocaleLowerCase('es').includes(q);
}

/**
 * DX-015-bis (D12): selector múltiple de los procedimientos del catálogo de la
 * clínica que reinician un tipo de recall. Carga el catálogo completo de
 * procedimientos activos (`listCatalogItems`, como los selectores del plan);
 * si falla, el campo se sustituye por su error con reintento (escalón 2) y el
 * resto del formulario sigue funcionando.
 */
export function RecallTriggersField({
  token,
  current,
  value,
  onChange,
}: {
  token: string;
  /** Los disparadores que el tipo tiene hoy (con su código y nombre). */
  current: readonly RecallTypeTrigger[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const [catalog, setCatalog] = useState<DentalCatalogItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    listCatalogItems(token, { kind: 'PROCEDURE', activeOnly: true })
      .then((items) => {
        if (cancelled) return;
        setCatalog(items);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const options = useMemo(() => (catalog ? triggerOptions(catalog, current) : []), [catalog, current]);
  const visible = options.filter((o) => matches(o, query));
  const chosen = new Set(value);

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby="rt-triggers-hint">
      <legend className="mb-1.5 text-sm font-medium text-ink">{copy.legend}</legend>
      <p id="rt-triggers-hint" className="text-xs text-muted">
        {copy.hint}
      </p>
      {failed ? (
        <FieldError
          label={copy.loadError}
          onRetry={() => {
            setFailed(false);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : catalog === null ? (
        <Skeleton className="h-40 w-full" />
      ) : options.length === 0 ? (
        <p className="text-sm text-muted">{copy.emptyCatalog}</p>
      ) : (
        <>
          {options.length > SEARCH_FROM ? (
            <Input
              type="search"
              aria-label={copy.search}
              placeholder={copy.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          ) : null}
          <div className="max-h-60 overflow-y-auto rounded-lg border border-border px-3 py-1">
            {visible.length === 0 ? (
              <p className="py-2 text-sm text-muted">{copy.noMatches}</p>
            ) : (
              <ul className="flex flex-col">
                {visible.map((o) => (
                  <li key={o.id} className="py-1">
                    <Checkbox
                      label={o.name}
                      description={o.retired ? `${o.code} · ${copy.retired}` : o.code}
                      checked={chosen.has(o.id)}
                      onChange={(e) => toggle(o.id, e.target.checked)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted tabular-nums" aria-live="polite">
            {copy.selected(value.length)}
          </p>
        </>
      )}
    </fieldset>
  );
}
