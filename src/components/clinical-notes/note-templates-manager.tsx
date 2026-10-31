'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, FileText, Lock, Pencil, Plus } from 'lucide-react';
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
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
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
  colFolder: 'Carpeta',
  promptsCount: (n: number) => (n === 1 ? '1 pregunta' : `${n} preguntas`),
  moreActions: 'Más acciones de plantillas',
  noFolder: 'Sin carpeta',
  active: 'Activa',
  inactive: 'Desactivada',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
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
    try {
      upsert(await updateNoteTemplate(token, template.id, { active: !template.active }));
    } catch {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(copy.toggleError(template.name), {
        onRetry: () => void toggleActive(template),
      });
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

  function rowActions(t: NoteTemplate): RowAction[] {
    return [
      { label: copy.edit, icon: <Pencil aria-hidden />, onSelect: () => openModal(t) },
      {
        label: t.active ? copy.deactivate : copy.activate,
        icon: t.active ? <EyeOff aria-hidden /> : <Eye aria-hidden />,
        onSelect: () => void toggleActive(t),
      },
    ];
  }

  const columns: DataListColumn<NoteTemplate>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (t) => <span className="font-medium">{t.name}</span>,
    },
    {
      id: 'folder',
      header: copy.colFolder,
      cell: (t) => t.category ?? <span className="text-muted">{copy.noFolder}</span>,
      mobileCell: (t) => t.category ?? copy.noFolder,
    },
    {
      id: 'prompts',
      header: copy.colPrompts,
      numeric: true,
      cell: (t) => t.prompts.length,
      mobileCell: (t) => copy.promptsCount(t.prompts.length),
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (t) => (
        <Badge variant={t.active ? 'success' : 'neutral'}>{t.active ? copy.active : copy.inactive}</Badge>
      ),
    },
  ];

  // Con plantillas, cargar las de ejemplo es una acción rara (de arranque): va
  // al «⋯» de la barra y no compite con «Nueva plantilla». Sin ninguna, vive en
  // el vacío.
  const barMenu: RowAction[] = [
    { label: copy.loadSamples, icon: <FileText aria-hidden />, onSelect: () => void loadSamples() },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {loading || error || templates.length === 0 ? '' : copy.count(templates.length)}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => openModal(null)} className="flex-1 sm:flex-none">
            <Plus aria-hidden />
            {copy.newTemplate}
          </Button>
          {!loading && !error && templates.length > 0 ? (
            <RowActions label={copy.moreActions} actions={barMenu} busy={loadingSamples} className="size-10 border border-border" />
          ) : null}
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
        <DataList
          label={copy.tableLabel}
          rows={templates}
          columns={columns}
          getRowKey={(t) => t.id}
          onRowClick={(t) => openModal(t)}
          rowActions={rowActions}
          getRowLabel={(t) => t.name}
        />
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
