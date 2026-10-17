'use client';
import * as React from 'react';
import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { NoteTemplate } from '@/lib/clinical-notes/note-templates-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const templatePickerCopy = {
  label: 'Plantilla',
  search: 'Buscar plantilla',
  searchPlaceholder: 'Buscar por nombre o carpeta…',
  none: 'Sin plantilla (texto libre)',
  noFolder: 'Sin carpeta',
  noResults: (q: string) => `Ninguna plantilla coincide con «${q}».`,
  change: 'Cambiar',
  changeFor: (name: string) => `Cambiar la plantilla «${name}»`,
  questions: (n: number) => (n === 1 ? '1 pregunta' : `${n} preguntas`),
};

const copy = templatePickerCopy;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es');
}

interface TemplatePickerProps {
  templates: NoteTemplate[];
  value: string | null;
  onChange: (templateId: string | null) => void;
}

/**
 * Selector de plantilla con búsqueda (DX-170). Lista las plantillas activas
 * agrupadas por carpeta, filtradas por nombre o carpeta (sin tildes ni
 * mayúsculas). Es un grupo de radios: navegable con flechas, sin lógica de
 * combobox a medida, y a 390 px se lee como una lista. Con una plantilla
 * elegida se pliega a su nombre y un «Cambiar».
 */
export function TemplatePicker({ templates, value, onChange }: TemplatePickerProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(value === null);
  const searchId = useId();
  const groupName = useId();
  const selected = templates.find((t) => t.id === value) ?? null;

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    const matching = templates.filter(
      (t) => q === '' || normalize(`${t.name} ${t.category ?? ''}`).includes(q),
    );
    const byFolder = new Map<string, NoteTemplate[]>();
    for (const t of matching) {
      const folder = t.category ?? copy.noFolder;
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), t]);
    }
    return [...byFolder.entries()];
  }, [templates, query]);

  function pick(id: string | null) {
    onChange(id);
    if (id !== null) setExpanded(false);
  }

  if (selected && !expanded) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{copy.label}</span>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <span className="min-w-0 text-sm text-ink">
            <span className="block truncate font-medium">{selected.name}</span>
            <span className="block text-xs text-muted">
              {selected.category ?? copy.noFolder} · {copy.questions(selected.prompts.length)}
            </span>
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={copy.changeFor(selected.name)}
            onClick={() => setExpanded(true)}
          >
            {copy.change}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-ink">{copy.label}</legend>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <label htmlFor={searchId} className="sr-only">
          {copy.search}
        </label>
        <Input
          id={searchId}
          type="search"
          value={query}
          placeholder={copy.searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-surface">
        <TemplateOption
          name={groupName}
          checked={value === null}
          onSelect={() => pick(null)}
          title={copy.none}
        />
        {groups.length === 0 ? (
          <p role="status" className="px-3 py-3 text-sm text-muted">
            {copy.noResults(query.trim())}
          </p>
        ) : (
          groups.map(([folder, items]) => (
            <div key={folder} role="group" aria-label={folder}>
              <p className="border-t border-hairline bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted">
                {folder}
              </p>
              {items.map((t) => (
                <TemplateOption
                  key={t.id}
                  name={groupName}
                  checked={value === t.id}
                  onSelect={() => pick(t.id)}
                  title={t.name}
                  meta={copy.questions(t.prompts.length)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </fieldset>
  );
}

function TemplateOption({
  name,
  checked,
  onSelect,
  title,
  meta,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  meta?: string;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 border-t border-hairline px-3 py-2 text-sm first:border-t-0 hover:bg-surface-2',
        checked && 'bg-primary/5',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="size-4 shrink-0 accent-[var(--color-primary)]"
      />
      <span className="min-w-0 flex-1 truncate text-ink">{title}</span>
      {meta ? <span className="shrink-0 text-xs tabular-nums text-muted">{meta}</span> : null}
    </label>
  );
}
