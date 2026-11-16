'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, ListChecks, Lock, Pencil, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listPlanTemplates,
  PLAN_TEMPLATE_STALE,
  templateVisitCount,
  updatePlanTemplate,
  type PlanTemplate,
} from '@/lib/treatment-plans/plan-templates-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import type { RowAction } from '@/components/shared/row-actions';
import { Button } from '@/components/ui/button';
import { PlanTemplateFormModal } from './plan-template-form-modal';

export const planTemplatesManagerCopy = {
  newTemplate: 'Nueva plantilla',
  count: (n: number) => (n === 1 ? '1 plantilla' : `${n} plantillas`),
  empty: 'Aún no hay plantillas de plan',
  emptyHint: 'Agrupa por visitas los procedimientos de un caso habitual para presupuestarlo en segundos.',
  loadError: 'No pudimos cargar las plantillas de plan.',
  forbiddenTitle: 'Solo administración gestiona las plantillas de plan.',
  forbiddenHint: 'El equipo clínico las aplica desde el plan de tratamiento del paciente.',
  tableLabel: 'Plantillas de plan',
  colName: 'Plantilla',
  colLines: 'Procedimientos',
  colVisits: 'Visitas',
  colStatus: 'Estado',
  linesCount: (n: number) => (n === 1 ? '1 procedimiento' : `${n} procedimientos`),
  visitsCount: (n: number) => (n === 1 ? '1 visita' : `${n} visitas`),
  inactiveLines: (n: number) => (n === 1 ? '1 desactivado en el catálogo' : `${n} desactivados en el catálogo`),
  active: 'Activa',
  inactive: 'Desactivada',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
};

const copy = planTemplatesManagerCopy;

function byName(a: PlanTemplate, b: PlanTemplate): number {
  return a.name.localeCompare(b.name, 'es');
}

interface PlanTemplatesManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir). */
  allowed: boolean;
}

/**
 * Ajustes › Plantillas de plan (DX-559): lista, crear, editar, desactivar y
 * activar. No hay borrado: una plantilla se desactiva y sale del selector del
 * plan. Nada de esto cambia los planes ya hechos.
 */
export function PlanTemplatesManager({ token, allowed }: PlanTemplatesManagerProps) {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<PlanTemplate | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPlanTemplates(token, { includeInactive: true });
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

  function openModal(template: PlanTemplate | null) {
    setEditing(template);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: PlanTemplate) {
    setTemplates((prev) => [...prev.filter((t) => t.id !== saved.id), saved].sort(byName));
  }

  async function toggleActive(template: PlanTemplate) {
    try {
      upsert(await updatePlanTemplate(token, template.id, { active: !template.active, version: template.version }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === PLAN_TEMPLATE_STALE) {
        // Otra persona la cambió: repetir con la misma versión daría otro 409.
        // Se relee la lista y el aviso lo dice.
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

  function rowActions(t: PlanTemplate): RowAction[] {
    return [
      { label: copy.edit, icon: <Pencil aria-hidden />, onSelect: () => openModal(t) },
      {
        label: t.active ? copy.deactivate : copy.activate,
        icon: t.active ? <EyeOff aria-hidden /> : <Eye aria-hidden />,
        onSelect: () => void toggleActive(t),
      },
    ];
  }

  const inactiveCount = (t: PlanTemplate) => t.lines.filter((l) => !l.catalogItemActive).length;

  const columns: DataListColumn<PlanTemplate>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (t) => (
        <span className="flex flex-col">
          <span className="font-medium">{t.name}</span>
          {inactiveCount(t) > 0 ? (
            <span className="text-xs text-warning-text">{copy.inactiveLines(inactiveCount(t))}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'lines',
      header: copy.colLines,
      numeric: true,
      cell: (t) => t.lines.length,
      mobileCell: (t) => copy.linesCount(t.lines.length),
    },
    {
      id: 'visits',
      header: copy.colVisits,
      numeric: true,
      cell: (t) => templateVisitCount(t),
      mobileCell: (t) => copy.visitsCount(templateVisitCount(t)),
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
        skeleton={<TableSkeleton rows={4} />}
        isEmpty={templates.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<ListChecks aria-hidden />}
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

      <PlanTemplateFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        template={editing}
        onSaved={upsert}
        onReloaded={upsert}
      />
    </div>
  );
}
