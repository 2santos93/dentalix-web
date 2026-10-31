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
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';
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
  edit: 'Editar',
  remove: 'Retirar',
  rowLabel: (name: string) => `«${name}»`,
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

  const columns: DataListColumn<PrescriptionTemplate>[] = [
    { id: 'name', header: copy.colName, mobile: 'primary', cell: (t) => t.name },
    {
      id: 'medications',
      header: copy.colMedications,
      cell: (t) => <span className="text-muted">{medications(t)}</span>,
      mobileCell: (t) => medications(t) || null,
    },
    {
      id: 'updated',
      header: copy.colUpdated,
      mobile: 'hidden',
      cell: (t) => <span className="t-data text-muted">{formatDateTime(t.updatedAt)}</span>,
    },
  ];

  return (
    <section aria-labelledby="rx-templates-heading" className="flex max-w-[720px] flex-col gap-3">
      <SectionHeader
        titleId="rx-templates-heading"
        title={copy.heading}
        description={
          <>
            {copy.support}
            <span className="block" aria-live="polite">
              {loading || error ? '' : copy.count(templates.length)}
            </span>
          </>
        }
        actions={
          <Button type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.newTemplate}
          </Button>
        }
      />

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
        <DataList
          label={copy.tableLabel}
          rows={templates}
          columns={columns}
          getRowKey={(t) => t.id}
          onRowClick={(t) => openModal(t)}
          getRowLabel={(t) => copy.rowLabel(t.name)}
          rowActions={(t) => [
            { label: copy.edit, onSelect: () => openModal(t) },
            { label: copy.remove, onSelect: () => setRemoving(t), destructive: true, separatorBefore: true },
          ]}
        />
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
