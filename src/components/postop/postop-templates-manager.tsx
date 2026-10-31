'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ClipboardList, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listPostOpTemplates,
  loadSamplePostOpTemplates,
  updatePostOpTemplate,
  type PostOpTemplate,
} from '@/lib/postop/postop-api';
import { formatDateTime } from '@/lib/format/date';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { PostOpTemplateFormModal } from './postop-template-form-modal';

const copy = {
  newTemplate: 'Nueva plantilla',
  loadSamples: 'Cargar ejemplos',
  count: (n: number) => (n === 1 ? '1 plantilla' : `${n} plantillas`),
  empty: 'Aún no hay indicaciones',
  emptyHint:
    'Carga las 5 de ejemplo (exodoncia simple, cordal, endodoncia, implante y prótesis inmediata) y adáptalas, o crea la tuya.',
  loadError: 'No pudimos cargar las indicaciones postoperatorias.',
  forbiddenTitle: 'Solo administración gestiona las indicaciones postoperatorias.',
  forbiddenHint: 'El equipo de la clínica las entrega desde el detalle de la cita.',
  tableLabel: 'Indicaciones postoperatorias',
  colCode: 'Código',
  colTitle: 'Título',
  colLinks: 'Vínculos',
  colStatus: 'Estado',
  colVersion: 'Versión',
  colUpdated: 'Actualizada',
  procedures: (n: number) => (n === 1 ? '1 procedimiento' : `${n} procedimientos`),
  types: (n: number) => (n === 1 ? '1 tipo de cita' : `${n} tipos de cita`),
  noLinks: 'Sin vínculos',
  active: 'Activa',
  inactive: 'Inactiva',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  rowLabel: (title: string) => `«${title}»`,
  toggleError: (title: string) => `No pudimos cambiar el estado de «${title}».`,
  created: 'Plantilla creada.',
  saved: (version: number) => `Guardada. Ahora va por la versión ${version}.`,
  samplesLoaded: (n: number) =>
    n === 0
      ? 'Ya tenías todas las plantillas de ejemplo.'
      : n === 1
        ? 'Se cargó 1 plantilla de ejemplo.'
        : `Se cargaron ${n} plantillas de ejemplo.`,
  samplesError: 'No pudimos cargar las plantillas de ejemplo.',
};

function byTitle(a: PostOpTemplate, b: PostOpTemplate): number {
  return a.title.localeCompare(b.title, 'es') || a.code.localeCompare(b.code, 'es');
}

function linksLabel(t: PostOpTemplate): string {
  const parts = [
    t.catalogItems.length > 0 ? copy.procedures(t.catalogItems.length) : null,
    t.appointmentTypes.length > 0 ? copy.types(t.appointmentTypes.length) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : copy.noLinks;
}

/** Nombres de lo vinculado, para el `title` de la celda (lectura rápida al pasar el ratón). */
function linksDetail(t: PostOpTemplate): string | undefined {
  const names = [...t.catalogItems.map((i) => i.labelEs), ...t.appointmentTypes.map((a) => a.name)];
  return names.length > 0 ? names.join(', ') : undefined;
}

interface PostOpTemplatesManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir). */
  allowed: boolean;
}

/**
 * Ajustes → Indicaciones postoperatorias (DX-222): lista, crear, editar,
 * desactivar y «Cargar ejemplos». Sin borrar: las entregas guardan la versión
 * con la que salieron, así que una plantilla se desactiva.
 */
export function PostOpTemplatesManager({ token, allowed }: PostOpTemplatesManagerProps) {
  const [templates, setTemplates] = useState<PostOpTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<PostOpTemplate | null>(null);
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
        const data = await listPostOpTemplates(token);
        if (cancelled) return;
        setTemplates([...data].sort(byTitle));
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

  function openModal(template: PostOpTemplate | null) {
    setEditing(template);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: PostOpTemplate) {
    setTemplates((prev) => [...prev.filter((t) => t.id !== saved.id), saved].sort(byTitle));
  }

  function handleSaved(saved: PostOpTemplate) {
    upsert(saved);
    toast.success(editing ? copy.saved(saved.version) : copy.created);
  }

  async function toggleActive(template: PostOpTemplate) {
    setPendingId(template.id);
    try {
      upsert(await updatePostOpTemplate(token, template.id, { active: !template.active }));
    } catch {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(copy.toggleError(template.title), {
        onRetry: () => void toggleActive(template),
      });
    } finally {
      setPendingId(null);
    }
  }

  async function loadSamples() {
    setLoadingSamples(true);
    try {
      const created = await loadSamplePostOpTemplates(token);
      setTemplates((prev) => [...prev, ...created].sort(byTitle));
      toast.success(copy.samplesLoaded(created.length));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.samplesError), { onRetry: () => void loadSamples() });
    } finally {
      setLoadingSamples(false);
    }
  }

  function status(t: PostOpTemplate) {
    // Activa/Inactiva aún no están en `lib/status/tones.ts`: mismos tonos que
    // «Activo»/«Inactivo» del personal (success / neutral), con punto.
    return (
      <Badge variant={t.active ? 'success' : 'neutral'} dot>
        {t.active ? copy.active : copy.inactive}
      </Badge>
    );
  }

  const columns: DataListColumn<PostOpTemplate>[] = [
    {
      id: 'code',
      header: copy.colCode,
      cell: (t) => <span className="t-id whitespace-nowrap text-xs">{t.code}</span>,
      mobileCell: (t) => <span className="t-id">{t.code}</span>,
    },
    { id: 'title', header: copy.colTitle, mobile: 'primary', cell: (t) => t.title },
    {
      id: 'links',
      header: copy.colLinks,
      cell: (t) => (
        <span className="text-muted" title={linksDetail(t)}>
          {linksLabel(t)}
        </span>
      ),
      mobileCell: (t) => linksLabel(t),
    },
    { id: 'status', header: copy.colStatus, mobile: 'trailing', cell: status },
    {
      id: 'version',
      header: copy.colVersion,
      numeric: true,
      cell: (t) => t.version,
      mobileCell: (t) => `${copy.colVersion} ${t.version}`,
    },
    {
      id: 'updated',
      header: copy.colUpdated,
      showFrom: 'lg',
      cell: (t) => <span className="t-data whitespace-nowrap text-muted">{formatDateTime(t.updatedAt)}</span>,
      mobileCell: (t) => formatDateTime(t.updatedAt),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="t-data text-sm text-muted" aria-live="polite">
          {loading || error ? '' : copy.count(templates.length)}
        </p>
        <Button type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
          <Plus aria-hidden />
          {copy.newTemplate}
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<TableSkeleton rows={4} />}
        isEmpty={templates.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<ClipboardList aria-hidden />}
        emptyAction={
          <Button
            type="button"
            variant="secondary"
            loading={loadingSamples}
            onClick={() => void loadSamples()}
          >
            {copy.loadSamples}
          </Button>
        }
      >
        {/* Sin «Borrar»: las entregas guardan la versión con la que salieron,
            así que una plantilla se desactiva. */}
        <DataList
          label={copy.tableLabel}
          rows={templates}
          columns={columns}
          getRowKey={(t) => t.id}
          onRowClick={(t) => openModal(t)}
          getRowLabel={(t) => copy.rowLabel(t.title)}
          rowActions={(t) => [
            { label: copy.edit, onSelect: () => openModal(t) },
            {
              label: t.active ? copy.deactivate : copy.activate,
              onSelect: () => void toggleActive(t),
              disabled: pendingId === t.id,
              separatorBefore: true,
            },
          ]}
        />
      </AsyncSection>

      <PostOpTemplateFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        template={editing}
        onSaved={handleSaved}
      />
    </div>
  );
}
