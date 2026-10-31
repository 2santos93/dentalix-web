'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { FileText, Lock, Pencil, Plus, Power } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listConsentTemplates,
  updateConsentTemplate,
  type ConsentTemplate,
} from '@/lib/consents/consents-api';
import { formatDateTime } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { ConsentTemplateFormModal } from './consent-template-form-modal';

const copy = {
  newTemplate: 'Nueva plantilla',
  count: (n: number) => (n === 1 ? '1 plantilla' : `${n} plantillas`),
  empty: 'Todavía no hay plantillas de consentimiento.',
  emptyHint: 'Crea la primera (por ejemplo, exodoncia o endodoncia) para poder firmarla desde la ficha.',
  loadError: 'No pudimos cargar las plantillas.',
  forbiddenTitle: 'Solo administración gestiona las plantillas.',
  forbiddenHint: 'Los odontólogos y asistentes las usan desde la ficha del paciente.',
  tableLabel: 'Plantillas de consentimiento',
  colTitle: 'Título',
  colStatus: 'Estado',
  colVersion: 'Versión',
  colUpdated: 'Actualizada',
  active: 'Activa',
  inactive: 'Inactiva',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  rowLabel: (title: string) => `«${title}»`,
  versionMeta: (n: number) => `Versión ${n}`,
  toggleError: (title: string) => `No pudimos cambiar el estado de «${title}».`,
};

interface ConsentTemplatesManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir; leer sí pueden los clínicos). */
  allowed: boolean;
}

/**
 * Gestión de plantillas en /settings/consentimientos (DX-006). Crear, editar y
 * desactivar; nunca borrar (los consentimientos firmados las referencian).
 * Editar el texto sube la versión y no toca lo ya firmado.
 */
export function ConsentTemplatesManager({ token, allowed }: ConsentTemplatesManagerProps) {
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<ConsentTemplate | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listConsentTemplates(token);
        if (cancelled) return;
        setTemplates(data);
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

  function openModal(template: ConsentTemplate | null) {
    setEditing(template);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: ConsentTemplate) {
    setTemplates((prev) => {
      const rest = prev.filter((t) => t.id !== saved.id);
      return [...rest, saved].sort((a, b) => a.title.localeCompare(b.title, 'es'));
    });
  }

  async function toggleActive(template: ConsentTemplate) {
    setPendingId(template.id);
    try {
      upsert(await updateConsentTemplate(token, template.id, { active: !template.active }));
    } catch {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(copy.toggleError(template.title), {
        onRetry: () => void toggleActive(template),
      });
    } finally {
      setPendingId(null);
    }
  }

  function status(template: ConsentTemplate) {
    return (
      <Badge variant={template.active ? 'success' : 'neutral'} dot>
        {template.active ? copy.active : copy.inactive}
      </Badge>
    );
  }

  const columns: DataListColumn<ConsentTemplate>[] = [
    { id: 'title', header: copy.colTitle, cell: (t) => t.title, mobile: 'primary' },
    // En el teléfono el estado va en la línea 2: el título (largo, con prefijos
    // comunes) necesita todo el ancho de la línea 1.
    {
      id: 'status',
      header: copy.colStatus,
      cell: status,
      mobileCell: (t) => (t.active ? copy.active : copy.inactive),
    },
    {
      id: 'version',
      header: copy.colVersion,
      cell: (t) => t.version,
      mobileCell: (t) => copy.versionMeta(t.version),
      numeric: true,
    },
    {
      id: 'updated',
      header: copy.colUpdated,
      cell: (t) => <span className="tnum text-muted">{formatDateTime(t.updatedAt)}</span>,
      mobileCell: (t) => formatDateTime(t.updatedAt),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="t-caption tnum" aria-live="polite">
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
        isEmpty={templates.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<FileText aria-hidden />}
      >
        {/* Toda la fila abre la plantilla; activar/desactivar va en «⋯». */}
        <DataList
          label={copy.tableLabel}
          rows={templates}
          columns={columns}
          getRowKey={(t) => t.id}
          onRowClick={(t) => openModal(t)}
          getRowLabel={(t) => copy.rowLabel(t.title)}
          rowActions={(t) => [
            { label: copy.edit, icon: <Pencil aria-hidden />, onSelect: () => openModal(t) },
            {
              label: t.active ? copy.deactivate : copy.activate,
              icon: <Power aria-hidden />,
              disabled: pendingId === t.id,
              onSelect: () => void toggleActive(t),
            },
          ]}
        />
      </AsyncSection>

      <ConsentTemplateFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        template={editing}
        onSaved={upsert}
      />
    </div>
  );
}
