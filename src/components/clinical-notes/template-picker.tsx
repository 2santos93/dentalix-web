'use client';
import * as React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { NoteTemplate } from '@/lib/clinical-notes/note-templates-api';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';

export const templatePickerCopy = {
  label: 'Plantilla',
  search: 'Buscar plantilla',
  searchPlaceholder: 'Buscar por nombre o carpeta…',
  none: 'Sin plantilla (texto libre)',
  noFolder: 'Sin carpeta',
  noResults: (q: string) => `Ninguna plantilla coincide con «${q}».`,
  noTemplates: 'La clínica aún no tiene plantillas activas: escribe la evolución a mano.',
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
 * combobox a medida, y a 390 px se lee como una lista. Elegida con el ratón o
 * el dedo, se pliega a su nombre y un «Cambiar» (que recibe el foco). Con el
 * teclado NO se pliega: las flechas de un grupo de radios eligen a cada paso,
 * y plegarlo dejaría al usuario sin poder seguir bajando ni con el foco.
 */
export function TemplatePicker({ templates, value, onChange }: TemplatePickerProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(value === null);
  const searchId = useId();
  const groupName = useId();
  const selected = templates.find((t) => t.id === value) ?? null;
  // La elección viene de un puntero (ratón/dedo), no de las flechas.
  const [byPointer, setByPointer] = useState(false);
  // Plegar/desplegar a mano mueve el foco a lo que queda en pantalla (el
  // control que lo tenía desaparece). `null` en el primer render: no se roba
  // el foco al abrir el modal.
  const [moved, setMoved] = useState<{ expanded: boolean } | null>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (moved === null) return;
    if (moved.expanded) {
      // Solo hay radios en la lista: el marcado es la plantilla elegida.
      listRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    } else {
      changeRef.current?.focus();
    }
  }, [moved]);

  function setExpandedAndFocus(next: boolean) {
    setExpanded(next);
    setMoved({ expanded: next });
  }

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
    setByPointer(false);
    if (id !== null && byPointer) setExpandedAndFocus(false);
  }

  if (selected && !expanded) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{copy.label}</span>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-sunken px-3 py-2">
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
            ref={changeRef}
            aria-label={copy.changeFor(selected.name)}
            onClick={() => setExpandedAndFocus(true)}
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
      <div ref={listRef} onPointerDown={() => setByPointer(true)} onKeyDown={() => setByPointer(false)}>
        <RadioGroup
          id={groupName}
          name={groupName}
          legend={<span className="sr-only">{copy.label}</span>}
          value={value ?? NONE}
          onValueChange={(v) => pick(v === NONE ? null : v)}
          className="gap-0"
          optionsClassName="max-h-60 overflow-y-auto rounded-lg border border-border bg-surface"
        >
        <TemplateOption value={NONE} title={copy.none} />
        {groups.length === 0 ? (
          <p role="status" className="px-3 py-3 text-sm text-muted">
            {templates.length === 0 ? copy.noTemplates : copy.noResults(query.trim())}
          </p>
        ) : (
          groups.map(([folder, items]) => (
            <div key={folder} role="group" aria-label={folder}>
              <p className="border-t border-border-subtle bg-surface-sunken px-3 py-1.5 text-xs font-medium text-muted">
                {folder}
              </p>
              {items.map((t) => (
                <TemplateOption
                  key={t.id}
                  value={t.id}
                  title={t.name}
                  meta={copy.questions(t.prompts.length)}
                />
              ))}
            </div>
          ))
        )}
        </RadioGroup>
      </div>
    </fieldset>
  );
}

/** Valor del radio «Sin plantilla» (el grupo no admite `null`). */
const NONE = '__none__';

function TemplateOption({ value, title, meta }: { value: string; title: string; meta?: string }) {
  return (
    <RadioOption
      value={value}
      className="min-h-11 items-center border-t border-border-subtle px-3 first:border-t-0 hover:bg-surface-sunken has-checked:bg-primary-subtle [&>span:last-child]:flex-1"
      label={
        <span className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-ink">{title}</span>
          {meta ? <span className="shrink-0 text-xs tabular-nums text-muted">{meta}</span> : null}
        </span>
      }
    />
  );
}
