'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { BellRing, Eye, EyeOff, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listRecallTypes, retireRecallType, updateRecallType, type RecallType } from '@/lib/recall/recall-api';
import { exclusivePartners } from '@/lib/recall/recall-exclusion';
import { linkedAppointmentType } from '@/lib/recall/recall-appointment-type';
import { listAppointmentTypes, type AppointmentType } from '@/lib/appointments/appointment-types-api';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import type { RowAction } from '@/components/shared/row-actions';
import { RecallTypeFormModal } from './recall-type-form-modal';

export const recallTypesCopy = {
  newType: 'Nuevo tipo',
  count: (n: number) => (n === 1 ? '1 tipo de recall' : `${n} tipos de recall`),
  empty: 'Todavía no hay tipos de recall.',
  emptyHint: 'Crea los controles que la clínica pide a sus pacientes (higiene, control, mantenimiento…) con su intervalo.',
  loadError: 'No pudimos cargar los tipos de recall.',
  forbiddenTitle: 'Solo administración gestiona los tipos de recall.',
  forbiddenHint: 'El resto del equipo los usa en la ficha del paciente y en la lista de recall.',
  tableLabel: 'Tipos de recall',
  colName: 'Tipo',
  colInterval: 'Intervalo',
  colTriggers: 'Disparadores',
  colStatus: 'Estado',
  colAppointmentType: 'Al agendar',
  noAppointmentType: 'Ninguno',
  missingAppointmentType: '—',
  inactiveAppointmentType: (name: string) => `${name} (inactivo)`,
  appointmentTypeMeta: (label: string) => `Agenda: ${label}`,
  months: (n: number) => (n === 1 ? '1 mes' : `${n} meses`),
  noTriggers: 'Ninguno',
  exclusiveWith: (names: string) => `Excluyente con ${names}`,
  active: 'Activo',
  inactive: 'Inactivo',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  remove: 'Retirar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
  removeTitle: (name: string) => `¿Retirar «${name}»?`,
  removeDescription:
    'Deja de aparecer aquí y de crear recalls. Los recalls que ya tiene se conservan, pero salen de la lista de recall y de la ficha del paciente.',
  removeConfirm: 'Retirar tipo',
  removeError: 'No pudimos retirar el tipo de recall.',
};
const copy = recallTypesCopy;

interface RecallTypesManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir). */
  allowed: boolean;
}

/** Sustituye los tipos guardados en su sitio; uno nuevo va al final (la API le da el último orden). */
export function mergeRecallTypes(prev: readonly RecallType[], saved: readonly RecallType[]): RecallType[] {
  const next = prev.map((t) => saved.find((s) => s.id === t.id) ?? t);
  for (const s of saved) if (!prev.some((t) => t.id === s.id)) next.push(s);
  return next;
}

/**
 * Ajustes › Recall (DX-015-bis): los tipos de recall de la clínica, en el orden
 * de la API. Crear, editar (con disparadores y «Excluyente con…»), desactivar
 * y retirar (borrado lógico; Higiene y Control, con `systemKey`, solo se
 * desactivan). Nada de esto cambia los recalls que ya existen.
 */
export function RecallTypesManager({ token, allowed }: RecallTypesManagerProps) {
  const [types, setTypes] = useState<RecallType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<RecallType | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RecallType | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  // D20: los tipos de cita (también los inactivos, para nombrar un enlace que se desactivó).
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[] | 'loading' | 'failed'>('loading');
  const [appointmentTypesKey, setAppointmentTypesKey] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    listAppointmentTypes(token, { includeInactive: true })
      .then((list) => {
        if (!cancelled) setAppointmentTypes(list);
      })
      .catch(() => {
        // Rung 2 en el modal (con «Reintentar»); en la lista, «—».
        if (!cancelled) setAppointmentTypes('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [token, allowed, appointmentTypesKey]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listRecallTypes(token);
        if (cancelled) return;
        setTypes(data);
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

  function openModal(type: RecallType | null) {
    setEditing(type);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: RecallType[]) {
    setTypes((prev) => mergeRecallTypes(prev, saved));
  }

  async function toggleActive(type: RecallType) {
    setPendingId(type.id);
    try {
      upsert([await updateRecallType(token, type.id, { active: !type.active })]);
    } catch {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(copy.toggleError(type.name), { onRetry: () => void toggleActive(type) });
    } finally {
      setPendingId(null);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await retireRecallType(token, removing.id);
      setTypes((prev) => prev.filter((t) => t.id !== removing.id));
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  function rowActions(type: RecallType): RowAction[] {
    const actions: RowAction[] = [
      { label: copy.edit, icon: <Pencil />, onSelect: () => openModal(type) },
      {
        label: type.active ? copy.deactivate : copy.activate,
        icon: type.active ? <EyeOff /> : <Eye />,
        disabled: pendingId === type.id,
        onSelect: () => void toggleActive(type),
      },
    ];
    // Higiene y Control (con clave del sistema) no se retiran: la API da 409.
    if (type.systemKey === null) {
      actions.push({
        label: copy.remove,
        icon: <Trash2 />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => {
          setRemoveError(null);
          setRemoving(type);
        },
      });
    }
    return actions;
  }

  function nameCell(type: RecallType) {
    const partners = exclusivePartners(type, types);
    return (
      <span className="flex min-w-0 flex-col">
        <span className="min-w-0 break-words font-medium">{type.name}</span>
        {partners.length > 0 ? (
          <span className="text-xs text-muted">{copy.exclusiveWith(partners.map((p) => p.name).join(', '))}</span>
        ) : null}
      </span>
    );
  }

  function triggersText(type: RecallType): string | null {
    return type.triggers.length > 0 ? type.triggers.map((t) => t.name).join(', ') : null;
  }

  /** D20: el tipo de cita enlazado; `null` sin enlace. */
  function appointmentTypeText(type: RecallType): string | null {
    const linked = linkedAppointmentType(
      type.appointmentTypeId,
      Array.isArray(appointmentTypes) ? appointmentTypes : null,
    );
    if (linked.kind === 'none') return null;
    if (linked.kind === 'missing') return copy.missingAppointmentType;
    return linked.kind === 'active' ? linked.name : copy.inactiveAppointmentType(linked.name);
  }

  /** «Activo» es lo normal: texto discreto. Solo «Inactivo» lleva chip. */
  function status(type: RecallType) {
    return type.active ? (
      <span className="text-muted">{copy.active}</span>
    ) : (
      <Badge variant="neutral">{copy.inactive}</Badge>
    );
  }

  const columns: DataListColumn<RecallType>[] = [
    { id: 'name', header: copy.colName, mobile: 'primary', cell: nameCell },
    {
      id: 'interval',
      header: copy.colInterval,
      mobile: 'meta',
      cellClassName: 'tabular-nums whitespace-nowrap',
      cell: (t) => copy.months(t.defaultIntervalMonths),
    },
    {
      id: 'triggers',
      header: copy.colTriggers,
      mobile: 'meta',
      cell: (t) => triggersText(t) ?? <span className="text-muted">{copy.noTriggers}</span>,
      mobileCell: (t) => triggersText(t),
    },
    {
      id: 'appointment-type',
      header: copy.colAppointmentType,
      mobile: 'meta',
      cell: (t) => appointmentTypeText(t) ?? <span className="text-muted">{copy.noAppointmentType}</span>,
      mobileCell: (t) => {
        const text = appointmentTypeText(t);
        return text && text !== copy.missingAppointmentType ? copy.appointmentTypeMeta(text) : null;
      },
    },
    { id: 'status', header: copy.colStatus, mobile: 'trailing', cell: status },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted tabular-nums" aria-live="polite">
          {loading || error || types.length === 0 ? '' : copy.count(types.length)}
        </p>
        <Button type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
          <Plus aria-hidden />
          {copy.newType}
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={types.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<BellRing aria-hidden />}
      >
        <DataList
          label={copy.tableLabel}
          rows={types}
          columns={columns}
          getRowKey={(t) => t.id}
          onRowClick={(t) => openModal(t)}
          rowActions={rowActions}
          getRowLabel={(t) => t.name}
        />
      </AsyncSection>

      <RecallTypeFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        type={editing}
        types={types}
        onSaved={upsert}
        appointmentTypes={appointmentTypes}
        onRetryAppointmentTypes={() => {
          setAppointmentTypes('loading');
          setAppointmentTypesKey((k) => k + 1);
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? copy.removeTitle(removing.name) : ''}
        description={copy.removeDescription}
        confirmLabel={copy.removeConfirm}
        onConfirm={() => void confirmRemove()}
        confirming={removeBusy}
        destructive
        error={removeError}
      />
    </div>
  );
}
