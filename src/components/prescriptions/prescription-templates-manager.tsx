'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { FileText, Lock, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  deletePrescriptionTemplate,
  listPrescriptionTemplates,
  type PrescriptionTemplate,
} from '@/lib/prescriptions/prescriptions-api';
import { formatDateTime } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { PrescriptionTemplateFormModal } from './prescription-template-form-modal';

const copy = {
  heading: 'Plantillas de receta',
  support: 'El equipo clínico parte de ellas al emitir una receta desde la ficha.',
  newTemplate: 'Nueva plantilla',
  count: (n: number) => (n === 1 ? '1 plantilla' : `${n} plantillas`),
  empty: 'Todavía no hay plantillas de receta.',
  emptyHint: 'Crea la primera (por ejemplo, «Post-exodoncia») para emitir más rápido.',
  loadError: 'No pudimos cargar las plantillas.',
  forbiddenTitle: 'Solo administración gestiona las plantillas de receta.',
  forbiddenHint: 'Los odontólogos las usan desde la ficha del paciente, al emitir.',
  tableLabel: 'Plantillas de receta',
  colName: 'Nombre',
  colMedications: 'Medicamentos',
  colUpdated: 'Actualizada',
  colActions: 'Acciones',
  edit: 'Editar',
  remove: 'Retirar',
  actionFor: (action: string, name: string) => `${action} «${name}»`,
  removeTitle: '¿Retirar la plantilla?',
  removeBody: (name: string) =>
    `«${name}» dejará de ofrecerse al emitir. Las recetas ya emitidas no cambian.`,
  removeConfirm: 'Retirar',
  removeError: 'No pudimos retirar la plantilla.',
};

interface PrescriptionTemplatesManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir; leer sí pueden los clínicos). */
  allowed: boolean;
}

/**
 * Gestión de plantillas de receta (DX-013) en /settings/recetas, en el mismo
 * patrón que las de consentimiento: crear y editar en modal, y retirar (borrado
 * blando) con confirmación.
 */
export function PrescriptionTemplatesManager({ token, allowed }: PrescriptionTemplatesManagerProps) {
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<PrescriptionTemplate | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [removing, setRemoving] = useState<PrescriptionTemplate | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPrescriptionTemplates(token);
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

  function openModal(template: PrescriptionTemplate | null) {
    setEditing(template);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: PrescriptionTemplate) {
    setTemplates((prev) =>
      [...prev.filter((t) => t.id !== saved.id), saved].sort((a, b) =>
        a.name.localeCompare(b.name, 'es'),
      ),
    );
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemovingBusy(true);
    try {
      await deletePrescriptionTemplate(token, removing.id);
      setTemplates((prev) => prev.filter((t) => t.id !== removing.id));
      setRemoving(null);
    } catch (err) {
      // El diálogo deja inerte lo de fuera: se cierra y se recarga la lista,
      // que sigue siendo la verdad (escalón 1 si la recarga también falla).
      setRemoving(null);
      setError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemovingBusy(false);
    }
  }

  function medications(t: PrescriptionTemplate) {
    return t.items.map((i) => [i.activeIngredient, i.concentration].filter(Boolean).join(' ')).join(' · ');
  }

  function actions(t: PrescriptionTemplate) {
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
          onClick={() => setRemoving(t)}
          aria-label={copy.actionFor(copy.remove, t.name)}
        >
          {copy.remove}
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby="rx-templates-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="rx-templates-heading" className="text-lg font-semibold text-ink">
            {copy.heading}
          </h2>
          <p className="text-sm text-muted">{copy.support}</p>
          <p className="text-sm text-muted" aria-live="polite">
            {loading || error ? '' : copy.count(templates.length)}
          </p>
        </div>
        <Button type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
          <Plus aria-hidden />
          {copy.newTemplate}
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => {
          setError(null);
          setReloadKey((k) => k + 1);
        }}
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
                {copy.colName}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colMedications}
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
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 text-muted">{medications(t)}</td>
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
              <p className="font-medium">{t.name}</p>
              <p className="text-muted">{medications(t)}</p>
              {actions(t)}
            </li>
          ))}
        </ul>
      </AsyncSection>

      <PrescriptionTemplateFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        template={editing}
        onSaved={upsert}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={copy.removeTitle}
        description={removing ? copy.removeBody(removing.name) : undefined}
        confirmLabel={copy.removeConfirm}
        confirming={removingBusy}
        onConfirm={() => void confirmRemove()}
      />
    </section>
  );
}
