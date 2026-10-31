'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { CalendarClock, Eye, EyeOff, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  deleteAppointmentType,
  listAppointmentTypes,
  updateAppointmentType,
  type AppointmentType,
} from '@/lib/appointments/appointment-types-api';
import { appointmentTypeTextColor, isAppointmentTypeColor } from '@/lib/color/contrast';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import type { RowAction } from '@/components/shared/row-actions';
import { AppointmentTypeFormModal } from './appointment-type-form-modal';

const copy = {
  newType: 'Nuevo tipo',
  count: (n: number) => (n === 1 ? '1 tipo de cita' : `${n} tipos de cita`),
  empty: 'Todavía no hay tipos de cita.',
  emptyHint:
    'Crea los más habituales (valoración, limpieza, endodoncia…) con su duración y color para agendar más rápido.',
  loadError: 'No pudimos cargar los tipos de cita.',
  forbiddenTitle: 'Solo administración gestiona los tipos de cita.',
  forbiddenHint: 'El resto del equipo los elige al agendar.',
  tableLabel: 'Tipos de cita',
  colName: 'Tipo',
  colDuration: 'Duración',
  colStatus: 'Estado',
  minutes: (n: number) => `${n} min`,
  active: 'Activo',
  inactive: 'Inactivo',
  urgent: 'Urgencia',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  remove: 'Retirar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
  removeTitle: (name: string) => `¿Retirar «${name}»?`,
  removeDescription:
    'Deja de aparecer aquí y al agendar. Las citas que ya lo usan lo conservan, con su color.',
  removeConfirm: 'Retirar tipo',
  removeError: 'No pudimos retirar el tipo de cita.',
};

interface AppointmentTypesManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir; leer pueden todos). */
  allowed: boolean;
}

/** Muestra del color con el texto que tendrá la cita en la agenda. */
function TypeSwatch({ type }: { type: AppointmentType }) {
  const style = isAppointmentTypeColor(type.color)
    ? { backgroundColor: type.color, color: appointmentTypeTextColor(type.color) }
    : undefined;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-xs font-semibold"
        style={style}
      >
        Aa
      </span>
      <span className="min-w-0 break-words font-medium">{type.name}</span>
    </span>
  );
}

/**
 * Gestión de tipos de cita en /settings/tipos-de-cita (DX-121). Crear, editar,
 * desactivar (sale del selector al agendar) y retirar (borrado lógico). Nada de
 * esto cambia las citas ya agendadas.
 */
export function AppointmentTypesManager({ token, allowed }: AppointmentTypesManagerProps) {
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<AppointmentType | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AppointmentType | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listAppointmentTypes(token, { includeInactive: true });
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

  function openModal(type: AppointmentType | null) {
    setEditing(type);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: AppointmentType) {
    setTypes((prev) => {
      const rest = prev.filter((t) => t.id !== saved.id);
      return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    });
  }

  async function toggleActive(type: AppointmentType) {
    setPendingId(type.id);
    try {
      upsert(await updateAppointmentType(token, type.id, { active: !type.active }));
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
      await deleteAppointmentType(token, removing.id);
      setTypes((prev) => prev.filter((t) => t.id !== removing.id));
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  function rowActions(type: AppointmentType): RowAction[] {
    return [
      { label: copy.edit, icon: <Pencil />, onSelect: () => openModal(type) },
      {
        label: type.active ? copy.deactivate : copy.activate,
        icon: type.active ? <EyeOff /> : <Eye />,
        // Mientras se cambia, no se vuelve a pedir.
        disabled: pendingId === type.id,
        onSelect: () => void toggleActive(type),
      },
      {
        label: copy.remove,
        icon: <Trash2 />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => {
          setRemoveError(null);
          setRemoving(type);
        },
      },
    ];
  }

  /** «Activo» es lo normal: texto discreto. Solo lo que se sale (inactivo, urgencia) lleva chip. */
  function status(type: AppointmentType) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {type.active ? (
          <span className="text-muted">{copy.active}</span>
        ) : (
          <Badge variant="neutral">{copy.inactive}</Badge>
        )}
        {type.isUrgent ? <Badge variant="danger">{copy.urgent}</Badge> : null}
      </span>
    );
  }

  const columns: DataListColumn<AppointmentType>[] = [
    { id: 'name', header: copy.colName, mobile: 'primary', cell: (t) => <TypeSwatch type={t} /> },
    {
      id: 'duration',
      header: copy.colDuration,
      numeric: true,
      mobile: 'meta',
      cell: (t) => copy.minutes(t.durationMinutes),
    },
    { id: 'status', header: copy.colStatus, mobile: 'trailing', cell: status },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted tabular-nums" aria-live="polite">
          {loading || error ? '' : copy.count(types.length)}
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
        emptyIcon={<CalendarClock aria-hidden />}
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

      <AppointmentTypeFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        type={editing}
        onSaved={upsert}
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
