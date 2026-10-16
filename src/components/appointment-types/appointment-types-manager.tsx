'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { CalendarClock, Lock, Plus } from 'lucide-react';
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
  colActions: 'Acciones',
  minutes: (n: number) => `${n} min`,
  active: 'Activo',
  inactive: 'Inactivo',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  remove: 'Retirar',
  actionFor: (action: string, name: string) => `${action} «${name}»`,
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
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-[10px] font-bold"
        style={style}
      >
        Aa
      </span>
      <span className="truncate font-medium">{type.name}</span>
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

  function actions(type: AppointmentType) {
    const toggleLabel = type.active ? copy.deactivate : copy.activate;
    return (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => openModal(type)}
          aria-label={copy.actionFor(copy.edit, type.name)}
        >
          {copy.edit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={pendingId === type.id}
          onClick={() => void toggleActive(type)}
          aria-label={copy.actionFor(toggleLabel, type.name)}
        >
          {toggleLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setRemoveError(null);
            setRemoving(type);
          }}
          aria-label={copy.actionFor(copy.remove, type.name)}
        >
          {copy.remove}
        </Button>
      </div>
    );
  }

  function status(type: AppointmentType) {
    return (
      <Badge variant={type.active ? 'success' : 'muted'}>
        {type.active ? copy.active : copy.inactive}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
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
        <table
          aria-label={copy.tableLabel}
          className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
        >
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colName}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                {copy.colDuration}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colStatus}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                <span className="sr-only">{copy.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3">
                  <TypeSwatch type={t} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{copy.minutes(t.durationMinutes)}</td>
                <td className="px-4 py-3">{status(t)}</td>
                <td className="px-4 py-3">{actions(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {types.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <TypeSwatch type={t} />
                {status(t)}
              </div>
              <p className="text-xs tabular-nums text-muted">{copy.minutes(t.durationMinutes)}</p>
              {actions(t)}
            </li>
          ))}
        </ul>
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
