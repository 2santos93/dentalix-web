'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Armchair, Eye, EyeOff, Lock, Pencil, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listChairs,
  reorderChairs,
  setChairActive,
  type Chair,
} from '@/lib/chairs/chairs-api';
import { moveChairInOrder } from '@/lib/chairs/chair-columns';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { listAppointments } from '@/lib/appointments/appointments-api';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { ChairFormModal } from './chair-form-modal';

const copy = {
  location: 'Sede',
  newChair: 'Nuevo sillón',
  count: (n: number) => (n === 1 ? '1 sillón' : `${n} sillones`),
  empty: 'Esta sede no tiene sillones',
  emptyHint:
    'Sin sillones la agenda funciona igual, por profesional. Con ellos, cada cita puede ocupar un sillón y la vista Día se puede ver por sillón.',
  createChair: 'Crear sillón',
  loadError: 'No pudimos cargar los sillones de la sede.',
  forbiddenTitle: 'Solo administración gestiona los sillones.',
  forbiddenHint: 'El resto del equipo los elige al agendar y los ve en la agenda.',
  noLocations: 'Todavía no hay sedes.',
  noLocationsHint: 'Crea una sede para configurar sus sillones.',
  tableLabel: 'Sillones de la sede',
  colName: 'Sillón',
  colProvider: 'Profesional por defecto',
  colStatus: 'Estado',
  noProvider: 'Sin profesional por defecto',
  active: 'Activo',
  inactive: 'Inactivo',
  edit: 'Editar',
  moveUp: 'Subir',
  moveDown: 'Bajar',
  deactivate: 'Desactivar',
  reactivate: 'Reactivar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
  orderError: 'No pudimos cambiar el orden de los sillones.',
  saved: (name: string) => `Sillón «${name}» guardado.`,
  deactivated: (name: string) => `«${name}» desactivado: sus citas lo conservan.`,
  deactivateTitle: (name: string) => `¿Desactivar «${name}»?`,
  deactivateConfirm: 'Desactivar sillón',
  counting: 'Contando sus citas futuras…',
  futureCount: (n: number) =>
    n === 0
      ? 'No tiene citas futuras.'
      : n === 1
        ? 'Tiene 1 cita futura: la conserva y se verá con «(inactivo)».'
        : `Tiene ${n} citas futuras: las conserva y se verán con «(inactivo)».`,
  countError: 'No pudimos contar sus citas futuras; puedes desactivarlo igual.',
  deactivateHint: 'Deja de ofrecerse en las citas nuevas y de salir como columna. No se borra: puedes reactivarlo.',
  reactivated: (name: string) => `«${name}» reactivado.`,
};

interface ChairsManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir). */
  allowed: boolean;
  locations: ClinicLocation[];
  /** La sede activa del selector del shell, si hay una. */
  initialLocationId: string | null;
}

function byOrder(a: Chair, b: Chair): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es');
}

/**
 * Ajustes → Sillones (DX-211): los sillones de UNA sede (se elige arriba):
 * crear, renombrar, ordenar (el orden de las columnas de la agenda),
 * profesional por defecto y desactivar. No se borran: desactivado, un sillón
 * deja de ofrecerse en citas nuevas, pero sus citas lo siguen mostrando.
 */
export function ChairsManager({ token, allowed, locations, initialLocationId }: ChairsManagerProps) {
  const [locationId, setLocationId] = useState(
    () =>
      locations.find((l) => l.id === initialLocationId)?.id ?? locations[0]?.id ?? '',
  );
  const [chairs, setChairs] = useState<Chair[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Chair | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // Desactivar pide confirmación con sus citas futuras (null = contando).
  const [deactivating, setDeactivating] = useState<Chair | null>(null);
  const [futureCount, setFutureCount] = useState<number | 'error' | null>(null);

  useEffect(() => {
    if (!allowed || !locationId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [data, members] = await Promise.all([
          listChairs(token, locationId, { includeInactive: true }),
          listStaff(token),
        ]);
        if (cancelled) return;
        setChairs([...data].sort(byOrder));
        setStaff(members);
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
  }, [token, allowed, locationId, reloadKey]);

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
  if (locations.length === 0) {
    return <EmptyState title={copy.noLocations} description={copy.noLocationsHint} />;
  }

  const staffName = (id: string | null) =>
    id ? (staff.find((s) => s.userId === id)?.fullName ?? null) : null;

  function openModal(chair: Chair | null) {
    setEditing(chair);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: Chair) {
    setChairs((prev) => [...prev.filter((c) => c.id !== saved.id), saved].sort(byOrder));
    setAnnouncement(copy.saved(saved.name));
  }

  async function toggleActive(chair: Chair) {
    setPendingId(chair.id);
    try {
      const saved = await setChairActive(token, chair.id, !chair.active);
      setChairs((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      setAnnouncement(saved.active ? copy.reactivated(saved.name) : copy.deactivated(saved.name));
    } catch {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(copy.toggleError(chair.name), { onRetry: () => void toggleActive(chair) });
    } finally {
      setPendingId(null);
    }
  }

  /** Citas vivas y no canceladas del sillón desde ahora (horizonte de 5 años). */
  function askDeactivate(chair: Chair) {
    setDeactivating(chair);
    setFutureCount(null);
    const from = new Date();
    const to = new Date(from.getTime() + 5 * 366 * 24 * 3600_000);
    listAppointments(token, {
      from: from.toISOString(),
      to: to.toISOString(),
      locationId: chair.locationId,
      chairIds: [chair.id],
    })
      .then((rows) =>
        setFutureCount(rows.filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW').length),
      )
      .catch(() => setFutureCount('error'));
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    const chair = deactivating;
    setDeactivating(null);
    await toggleActive(chair);
  }

  async function move(chair: Chair, step: -1 | 1) {
    const ids = moveChairInOrder(
      chairs.map((c) => c.id),
      chair.id,
      step,
    );
    setPendingId(chair.id);
    try {
      setChairs((await reorderChairs(token, locationId, ids)).sort(byOrder));
    } catch {
      notifyError(copy.orderError, { onRetry: () => setReloadKey((k) => k + 1) });
    } finally {
      setPendingId(null);
    }
  }

  const columns: DataListColumn<Chair>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      id: 'provider',
      header: copy.colProvider,
      cell: (c) => staffName(c.defaultProviderId) ?? <span className="text-muted">{copy.noProvider}</span>,
      mobileCell: (c) => staffName(c.defaultProviderId),
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      // «Activo» es lo normal: texto discreto; solo lo que se sale lleva chip.
      cell: (c) =>
        c.active ? <span className="text-muted">{copy.active}</span> : <Badge variant="neutral">{copy.inactive}</Badge>,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <FormField htmlFor="chairs-location" label={copy.location} className="sm:w-72">
          <NativeSelect
            id="chairs-location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <Button type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
          <Plus aria-hidden />
          {copy.newChair}
        </Button>
      </div>
      <p className="text-sm text-muted tabular-nums">{loading || error ? '' : copy.count(chairs.length)}</p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={chairs.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Armchair aria-hidden />}
        emptyAction={
          <Button type="button" onClick={() => openModal(null)}>
            <Plus aria-hidden /> {copy.createChair}
          </Button>
        }
      >
        <DataList
          label={copy.tableLabel}
          rows={chairs}
          columns={columns}
          getRowKey={(c) => c.id}
          getRowLabel={(c) => c.name}
          rowActions={(c) => {
            const index = chairs.findIndex((x) => x.id === c.id);
            return [
              { label: copy.edit, icon: <Pencil />, onSelect: () => openModal(c) },
              {
                label: copy.moveUp,
                icon: <ArrowUp />,
                onSelect: () => void move(c, -1),
                disabled: index === 0 || pendingId !== null,
              },
              {
                label: copy.moveDown,
                icon: <ArrowDown />,
                onSelect: () => void move(c, 1),
                disabled: index === chairs.length - 1 || pendingId !== null,
              },
              {
                label: c.active ? copy.deactivate : copy.reactivate,
                icon: c.active ? <EyeOff /> : <Eye />,
                onSelect: () => (c.active ? askDeactivate(c) : void toggleActive(c)),
                destructive: c.active,
                disabled: pendingId !== null,
                separatorBefore: true,
              },
            ];
          }}
        />
      </AsyncSection>

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        title={deactivating ? copy.deactivateTitle(deactivating.name) : ''}
        description={
          <>
            <span className="block">{copy.deactivateHint}</span>
            <span className="mt-2 block" role="status" data-testid="chair-future-count">
              {futureCount === null
                ? copy.counting
                : futureCount === 'error'
                  ? copy.countError
                  : copy.futureCount(futureCount)}
            </span>
          </>
        }
        confirmLabel={copy.deactivateConfirm}
        onConfirm={() => void confirmDeactivate()}
        destructive
      />

      <ChairFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        locationId={locationId}
        chair={editing}
        staff={staff}
        onSaved={upsert}
      />
    </div>
  );
}
