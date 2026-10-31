'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { FileText, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listNoteTemplates,
  loadSampleNoteTemplates,
  updateNoteTemplate,
  type NoteTemplate,
} from '@/lib/clinical-notes/note-templates-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoteTemplateFormModal } from './note-template-form-modal';

export const noteTemplatesManagerCopy = {
  newTemplate: 'Nueva plantilla',
  loadSamples: 'Cargar plantillas de ejemplo',
  loadSamplesShort: 'Cargar ejemplos',
  count: (n: number) => (n === 1 ? '1 plantilla' : `${n} plantillas`),
  empty: 'Aún no hay plantillas',
  emptyHint:
    'Carga las 6 de ejemplo (exploración, profilaxis, resina, exodoncia, endodoncia y postoperatorio) y adáptalas, o crea la tuya.',
  loadError: 'No pudimos cargar las plantillas de evolución.',
  forbiddenTitle: 'Solo administración gestiona las plantillas de evolución.',
  forbiddenHint: 'El equipo clínico las usa al registrar una evolución.',
  tableLabel: 'Plantillas de evolución',
  colName: 'Plantilla',
  colPrompts: 'Preguntas',
  colStatus: 'Estado',
  colActions: 'Acciones',
  noFolder: 'Sin carpeta',
  active: 'Activa',
  inactive: 'Desactivada',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  actionFor: (action: string, name: string) => `${action} «${name}»`,
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
  samplesLoaded: (n: number) =>
    n === 0
      ? 'Ya tenías todas las plantillas de ejemplo.'
      : n === 1
        ? 'Se cargó 1 plantilla de ejemplo.'
        : `Se cargaron ${n} plantillas de ejemplo.`,
  samplesError: 'No pudimos cargar las plantillas de ejemplo.',
};

const copy = noteTemplatesManagerCopy;

function byFolderAndName(a: NoteTemplate, b: NoteTemplate): number {
  const fa = a.category ?? '￿';
  const fb = b.category ?? '￿';
  return fa.localeCompare(fb, 'es') || a.name.localeCompare(b.name, 'es');
}

interface NoteTemplatesManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir). */
  allowed: boolean;
}

/**
 * Ajustes → Plantillas de evolución (DX-170): lista, crear, editar,
 * desactivar y «Cargar plantillas de ejemplo». Nada de esto cambia las
 * evoluciones ya guardadas (llevan su texto).
 */
export function NoteTemplatesManager({ token, allowed }: NoteTemplatesManagerProps) {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<NoteTemplate | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listNoteTemplates(token, { includeInactive: true });
        if (cancelled) return;
        setTemplates([...data].sort(byFolderAndName));
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
  }, [token, allowed, reloadKey]);

  const categories = useMemo(
    () => [...new Set(templates.flatMap((t) => (t.category ? [t.category] : [])))],
    [templates],
  );

  if (!allowed) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }

  function openModal(template: NoteTemplate | null) {
    setEditing(template);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: NoteTemplate) {
    setTemplates((prev) => [...prev.filter((t) => t.id !== saved.id), saved].sort(byFolderAndName));
  }

  async function toggleActive(template: NoteTemplate) {
    setPendingId(template.id);
    try {
      upsert(await updateNoteTemplate(token, template.id, { active: !template.active }));
    } catch {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(copy.toggleError(template.name), {
        onRetry: () => void toggleActive(template),
      });
    } finally {
      setPendingId(null);
    }
  }

  async function loadSamples() {
    setLoadingSamples(true);
    try {
      const created = await loadSampleNoteTemplates(token);
      setTemplates((prev) => [...prev, ...created].sort(byFolderAndName));
      toast.success(copy.samplesLoaded(created.length));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.samplesError), { onRetry: () => void loadSamples() });
    } finally {
      setLoadingSamples(false);
    }
  }

  function actions(t: NoteTemplate) {
    const toggleLabel = t.active ? copy.deactivate : copy.activate;
    return (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => openModal(t)}
          aria-label={copy.actionFor(copy.edit, t.name)}
        >
          {copy.edit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={pendingId === t.id}
          onClick={() => void toggleActive(t)}
          aria-label={copy.actionFor(toggleLabel, t.name)}
        >
          {toggleLabel}
        </Button>
      </div>
    );
  }

  function status(t: NoteTemplate) {
    return (
      <Badge variant={t.active ? 'success' : 'muted'}>{t.active ? copy.active : copy.inactive}</Badge>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {loading || error ? '' : copy.count(templates.length)}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            loading={loadingSamples}
            onClick={() => void loadSamples()}
            className="w-full sm:w-auto"
          >
            {copy.loadSamples}
          </Button>
          <Button type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.newTemplate}
          </Button>
        </div>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<TableSkeleton rows={4} />}
        isEmpty={templates.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<FileText aria-hidden />}
        emptyAction={
          <Button
            type="button"
            variant="secondary"
            loading={loadingSamples}
            onClick={() => void loadSamples()}
          >
            {copy.loadSamplesShort}
          </Button>
        }
      >
        <table
          aria-label={copy.tableLabel}
          className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
        >
          <thead>
            <tr className="border-b border-border bg-surface-sunken text-left">
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colName}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                {copy.colPrompts}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colStatus}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                <span className="sr-only">{copy.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted">{t.category ?? copy.noFolder}</p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{t.prompts.length}</td>
                <td className="px-4 py-3">{status(t)}</td>
                <td className="px-4 py-3">{actions(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-medium">{t.name}</p>
                  <p className="text-xs text-muted">
                    {t.category ?? copy.noFolder} · {t.prompts.length} {copy.colPrompts.toLowerCase()}
                  </p>
                </div>
                {status(t)}
              </div>
              {actions(t)}
            </li>
          ))}
        </ul>
      </AsyncSection>

      <NoteTemplateFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        template={editing}
        categories={categories}
        onSaved={upsert}
      />
    </div>
  );
}
