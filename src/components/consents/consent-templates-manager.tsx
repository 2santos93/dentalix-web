'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { FileText, Lock, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
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
  colActions: 'Acciones',
  active: 'Activa',
  inactive: 'Inactiva',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  actionFor: (action: string, title: string) => `${action} «${title}»`,
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
        setError(err instanceof ApiError ? err.message : copy.loadError);
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

  function actions(template: ConsentTemplate) {
    const toggleLabel = template.active ? copy.deactivate : copy.activate;
    return (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => openModal(template)}
          aria-label={copy.actionFor(copy.edit, template.title)}
        >
          {copy.edit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={pendingId === template.id}
          onClick={() => void toggleActive(template)}
          aria-label={copy.actionFor(toggleLabel, template.title)}
        >
          {toggleLabel}
        </Button>
      </div>
    );
  }

  function status(template: ConsentTemplate) {
    return (
      <Badge variant={template.active ? 'success' : 'muted'}>
        {template.active ? copy.active : copy.inactive}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
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
        <table
          aria-label={copy.tableLabel}
          className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
        >
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colTitle}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colStatus}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                {copy.colVersion}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colUpdated}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                <span className="sr-only">{copy.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3 font-medium">{t.title}</td>
                <td className="px-4 py-3">{status(t)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{t.version}</td>
                <td className="px-4 py-3 tabular-nums text-muted">{formatDateTime(t.updatedAt)}</td>
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
                <p className="font-medium">{t.title}</p>
                {status(t)}
              </div>
              <p className="text-xs text-muted tabular-nums">
                {copy.colVersion} {t.version} · {formatDateTime(t.updatedAt)}
              </p>
              {actions(t)}
            </li>
          ))}
        </ul>
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
