'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ClipboardList, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  EXTERNAL_ORDER_KIND_LABELS,
  EXTERNAL_ORDER_TEMPLATE_STALE,
  listExternalOrderTemplates,
  updateExternalOrderTemplate,
  type ExternalOrderTemplate,
} from '@/lib/external-orders/external-orders-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { notifyError } from '@/components/errors/notify';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { ExternalOrderTemplateFormModal } from './external-order-template-form-modal';

export const externalOrderTemplatesManagerCopy = {
  newTemplate: 'Nueva plantilla',
  count: (n: number) => (n === 1 ? '1 plantilla' : `${n} plantillas`),
  empty: 'Aún no hay plantillas de orden',
  emptyHint: 'Guarda los estudios que pides a menudo, con su centro habitual, para emitir la orden en segundos.',
  loadError: 'No pudimos cargar las plantillas de orden.',
  tableLabel: 'Plantillas de orden',
  colName: 'Plantilla',
  colKind: 'Tipo',
  colRecipient: 'Destinatario habitual',
  colStatus: 'Estado',
  noRecipient: 'Sin destinatario habitual',
  itemsCount: (n: number) => (n === 1 ? '1 estudio' : `${n} estudios`),
  active: 'Activa',
  inactive: 'Desactivada',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
};

const copy = externalOrderTemplatesManagerCopy;

function byName(a: ExternalOrderTemplate, b: ExternalOrderTemplate): number {
  return a.name.localeCompare(b.name, 'es');
}

/**
 * Ajustes › Órdenes externas › Plantillas (DX-572, solo ADMIN; la página no lo
 * monta sin el rol): lista, crear, editar, desactivar y activar. No hay
 * borrado: una plantilla se desactiva y sale del selector de «Nueva orden».
 * Nada de esto cambia las órdenes ya emitidas.
 */
export function ExternalOrderTemplatesManager({ token }: { token: string }) {
  const [templates, setTemplates] = useState<ExternalOrderTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<{ template: ExternalOrderTemplate | null; key: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listExternalOrderTemplates(token, { includeInactive: true });
        if (cancelled) return;
        setTemplates([...data].sort(byName));
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
  }, [token, reloadKey]);

  function openModal(template: ExternalOrderTemplate | null) {
    setEditing((prev) => ({ template, key: (prev?.key ?? 0) + 1 }));
  }

  function upsert(saved: ExternalOrderTemplate) {
    setTemplates((prev) => [...prev.filter((t) => t.id !== saved.id), saved].sort(byName));
  }

  /** «Recargar» del modal tras un 409 de versión: relee la lista y devuelve la guardada. */
  async function reloadOne(id: string): Promise<ExternalOrderTemplate | null> {
    const data = await listExternalOrderTemplates(token, { includeInactive: true });
    setTemplates([...data].sort(byName));
    return data.find((t) => t.id === id) ?? null;
  }

  async function toggleActive(template: ExternalOrderTemplate) {
    try {
      upsert(
        await updateExternalOrderTemplate(token, template.id, { active: !template.active, version: template.version }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === EXTERNAL_ORDER_TEMPLATE_STALE) {
        // Otra persona la cambió: repetir con la misma versión daría otro 409.
        notifyError(apiErrorMessage(err, copy.toggleError(template.name)));
        setReloadKey((k) => k + 1);
        return;
      }
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(apiErrorMessage(err, copy.toggleError(template.name)), {
        onRetry: () => void toggleActive(template),
      });
    }
  }

  function rowActions(t: ExternalOrderTemplate): RowAction[] {
    return [
      { label: copy.edit, icon: <Pencil aria-hidden />, onSelect: () => openModal(t) },
      {
        label: t.active ? copy.deactivate : copy.activate,
        icon: t.active ? <EyeOff aria-hidden /> : <Eye aria-hidden />,
        onSelect: () => void toggleActive(t),
      },
    ];
  }

  const columns: DataListColumn<ExternalOrderTemplate>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (t) => (
        <span className="flex flex-col">
          <span className="font-medium">{t.name}</span>
          <span className="t-caption text-muted">{copy.itemsCount(t.items.length)}</span>
        </span>
      ),
    },
    { id: 'kind', header: copy.colKind, cell: (t) => EXTERNAL_ORDER_KIND_LABELS[t.kind] },
    {
      id: 'recipient',
      header: copy.colRecipient,
      cell: (t) => t.recipient ?? <span className="text-muted">{copy.noRecipient}</span>,
      mobileCell: (t) => t.recipient,
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (t) => <Badge variant={t.active ? 'success' : 'neutral'}>{t.active ? copy.active : copy.inactive}</Badge>,
    },
  ];

  // La barra (contador + «Nueva plantilla») solo con lista: vacía, la primaria
  // vive en el vacío; cargando o con error, no hay nada que contar.
  const showBar = !loading && !error && templates.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {showBar ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted" aria-live="polite">
            {copy.count(templates.length)}
          </p>
          <Button type="button" onClick={() => openModal(null)} className="sm:flex-none">
            <Plus aria-hidden />
            {copy.newTemplate}
          </Button>
        </div>
      ) : null}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<TableSkeleton rows={3} />}
        isEmpty={templates.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<ClipboardList aria-hidden />}
        emptyAction={
          <Button type="button" onClick={() => openModal(null)}>
            <Plus aria-hidden />
            {copy.newTemplate}
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

      {editing ? (
        <ExternalOrderTemplateFormModal
          key={editing.key}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          token={token}
          template={editing.template}
          onSaved={upsert}
          onReload={() => (editing.template ? reloadOne(editing.template.id) : Promise.resolve(null))}
        />
      ) : null}
    </div>
  );
}
