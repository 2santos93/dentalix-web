'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ClipboardList, FileText, Lock, Pencil, Plus, Wrench } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  equipmentHref,
  listEquipment,
  retireEquipment,
  type Equipment,
  type EquipmentStatusFilter,
} from '@/lib/equipment/equipment-api';
import { equipmentSubtitle } from '@/lib/equipment/equipment-format';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { ListToolbar, ResultCount } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { StatusBadge } from '@/components/ui/status-badge';
import { EquipmentFormModal } from './equipment-form-modal';
import { EquipmentReasonModal } from './equipment-reason-modal';
import { MaintenanceFormModal } from './maintenance-form-modal';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

export const equipmentManagerCopy = {
  location: 'Sede',
  allLocations: 'Todas las sedes',
  status: 'Estado',
  statusActive: 'Activos',
  statusRetired: 'Dados de baja',
  statusAll: 'Todos',
  searchLabel: 'Buscar por nombre, marca, modelo o número de serie',
  searchPlaceholder: 'Buscar equipo',
  newEquipment: 'Nuevo equipo',
  countNoun: 'equipo',
  countNounPlural: 'equipos',
  empty: 'Todavía no hay equipos en esta sede',
  emptyHint:
    'Registra los equipos de la sede (autoclave, unidades, rayos X…) para llevar su hoja de vida y su programa de mantenimiento.',
  emptyFiltered: 'Ningún equipo coincide con la búsqueda',
  emptyFilteredHint: 'Prueba con otro texto u otro estado.',
  createEquipment: 'Crear equipo',
  loadError: 'No pudimos cargar los equipos.',
  forbiddenTitle: 'Solo administración gestiona los equipos biomédicos.',
  forbiddenHint: 'Pide a un administrador de la clínica que registre los equipos y sus mantenimientos.',
  noLocations: 'Todavía no hay sedes.',
  noLocationsHint: 'Crea una sede para registrar sus equipos.',
  tableLabel: 'Equipos biomédicos',
  colName: 'Equipo',
  colType: 'Tipo',
  colLocation: 'Sede',
  colChair: 'Sillón',
  colSerial: 'Nº de serie',
  colNext: 'Próximo mantenimiento',
  colStatus: 'Estado',
  noChair: 'Sin sillón',
  unscheduled: 'Sin programar',
  open: 'Ver hoja de vida',
  record: 'Registrar mantenimiento',
  edit: 'Editar',
  retire: 'Dar de baja',
  saved: (name: string) => `Equipo «${name}» guardado.`,
  recorded: (name: string) => `Mantenimiento de «${name}» registrado.`,
  retiredDone: (name: string) => `«${name}» dado de baja.`,
  retireTitle: (name: string) => `¿Dar de baja «${name}»?`,
  retireDescription:
    'Deja de estar en el inventario activo y ya no se le registran mantenimientos. Su hoja de vida se conserva. No se puede deshacer.',
  retireSubmit: 'Dar de baja',
  retireError: 'No pudimos dar de baja el equipo. Intenta de nuevo.',
};

const copy = equipmentManagerCopy;

interface EquipmentManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para leer y escribir). */
  allowed: boolean;
  /** Sedes activas de la clínica. */
  locations: ClinicLocation[];
  /** La sede activa del selector del shell, si hay una. */
  initialLocationId: string | null;
}

type Modal =
  | { kind: 'form'; equipment: Equipment | null; key: number }
  | { kind: 'maintenance'; equipment: Equipment; key: number }
  | { kind: 'retire'; equipment: Equipment; key: number }
  | null;

/**
 * Ajustes › Equipos biomédicos (DX-542): el inventario de dotación de cada
 * sede, con el próximo mantenimiento y si está vencido o vence pronto (en el
 * día de la sede de cada equipo). Una fila abre su hoja de vida.
 */
export function EquipmentManager({ token, allowed, locations, initialLocationId }: EquipmentManagerProps) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(
    () => locations.find((l) => l.id === initialLocationId)?.id ?? (locations.length > 1 ? '' : (locations[0]?.id ?? '')),
  );
  const [status, setStatus] = useState<EquipmentStatusFilter>('ACTIVE');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Equipment[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [modalSeq, setModalSeq] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const stamp = useSedeStamp(token, rows.map((r) => r.locationId));

  useEffect(() => {
    if (!allowed || locations.length === 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listEquipment(token, {
          locationId: locationId || undefined,
          status,
          query: debouncedQuery,
          page,
          pageSize: PAGE_SIZE,
        });
        if (cancelled) return;
        setRows(res.items);
        setTotal(res.total);
        setPageSize(res.pageSize);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, allowed, locations.length, locationId, status, debouncedQuery, page, reloadKey]);

  if (!allowed) {
    return (
      <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
    );
  }
  if (locations.length === 0) {
    return <EmptyState title={copy.noLocations} description={copy.noLocationsHint} />;
  }

  function open(next: Exclude<Modal, null>['kind'], equipment: Equipment | null) {
    setModalSeq((k) => k + 1);
    if (next === 'form') setModal({ kind: 'form', equipment, key: modalSeq + 1 });
    else if (equipment) setModal({ kind: next, equipment, key: modalSeq + 1 });
  }

  function close(isOpen: boolean) {
    if (!isOpen) setModal(null);
  }

  function reload(message: string) {
    setAnnouncement(message);
    setReloadKey((k) => k + 1);
  }

  const filtered = debouncedQuery.trim() !== '' || status !== 'ACTIVE';
  const defaultLocation = locationId || initialLocationId || locations[0].id;
  const locationOf = (id: string) => locations.find((l) => l.id === id);
  const retireToday = (e: Equipment) => {
    const zone = locationOf(e.locationId)?.timeZone;
    return zone ? sedeToday(zone) : null;
  };

  const columns: DataListColumn<Equipment>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (e) => <span className="font-medium">{e.name}</span>,
    },
    {
      id: 'type',
      header: copy.colType,
      cell: (e) => equipmentSubtitle(e),
    },
    ...(locationId === ''
      ? [
          {
            id: 'location',
            header: copy.colLocation,
            cell: (e: Equipment) => e.locationName,
            mobileCell: (e: Equipment) => e.locationName,
          },
        ]
      : []),
    {
      id: 'chair',
      header: copy.colChair,
      showFrom: 'lg',
      cell: (e) => e.chairName ?? <span className="text-muted">{copy.noChair}</span>,
      mobileCell: (e) => e.chairName,
    },
    {
      id: 'serial',
      header: copy.colSerial,
      showFrom: 'xl',
      cell: (e) => <span className="tabular-nums">{e.serialNumber ?? '—'}</span>,
      mobileCell: () => null,
    },
    {
      id: 'next',
      header: copy.colNext,
      cell: (e) =>
        e.nextMaintenanceOn ? (
          <span className="tabular-nums">{stamp.civilDate(e.nextMaintenanceOn, e.locationId)}</span>
        ) : (
          <span className="text-muted">{copy.unscheduled}</span>
        ),
      mobileCell: (e) => (e.nextMaintenanceOn ? stamp.maybe.civilDate(e.nextMaintenanceOn, e.locationId) : null),
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (e) =>
        e.maintenanceStatus ? (
          <StatusBadge kind="equipmentMaintenance" status={e.maintenanceStatus} />
        ) : (
          <StatusBadge kind="equipment" status={e.status} />
        ),
    },
  ];

  const active = modal?.kind === 'maintenance' || modal?.kind === 'retire' ? modal.equipment : null;

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        searchLabel={copy.searchLabel}
        searchPlaceholder={copy.searchPlaceholder}
        value={query}
        onChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        action={
          <Button type="button" onClick={() => open('form', null)} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.newEquipment}
          </Button>
        }
      >
        <FormField htmlFor="equipment-filter-location" label={copy.location} className="sm:w-56">
          <NativeSelect
            id="equipment-filter-location"
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPage(1);
            }}
          >
            {locations.length > 1 ? <option value="">{copy.allLocations}</option> : null}
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="equipment-filter-status" label={copy.status} className="sm:w-44">
          <NativeSelect
            id="equipment-filter-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as EquipmentStatusFilter);
              setPage(1);
            }}
          >
            <option value="ACTIVE">{copy.statusActive}</option>
            <option value="RETIRED">{copy.statusRetired}</option>
            <option value="ALL">{copy.statusAll}</option>
          </NativeSelect>
        </FormField>
      </ListToolbar>

      {!loading && !error && rows.length > 0 ? (
        <ResultCount total={total} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <SedeStampNote stamp={stamp} />

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={rows.length === 0}
        emptyTitle={filtered ? copy.emptyFiltered : copy.empty}
        emptyDescription={filtered ? copy.emptyFilteredHint : copy.emptyHint}
        emptyIcon={<ClipboardList aria-hidden />}
        emptyAction={
          filtered ? undefined : (
            <Button type="button" onClick={() => open('form', null)}>
              <Plus aria-hidden /> {copy.createEquipment}
            </Button>
          )
        }
        skeleton={<TableSkeleton rows={4} />}
      >
        <DataList
          label={copy.tableLabel}
          rows={rows}
          columns={columns}
          getRowKey={(e) => e.id}
          getRowLabel={(e) => e.name}
          getRowHref={(e) => equipmentHref(e.id)}
          rowActions={(e) => [
            { label: copy.open, icon: <FileText />, onSelect: () => router.push(equipmentHref(e.id)) },
            ...(e.status === 'ACTIVE'
              ? [
                  { label: copy.record, icon: <Wrench />, onSelect: () => open('maintenance', e) },
                  { label: copy.edit, icon: <Pencil />, onSelect: () => open('form', e) },
                  {
                    label: copy.retire,
                    icon: <Archive />,
                    onSelect: () => open('retire', e),
                    destructive: true,
                    separatorBefore: true,
                  },
                ]
              : []),
          ]}
        />
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} disabled={loading} />
      </AsyncSection>

      {modal?.kind === 'form' ? (
        <EquipmentFormModal
          key={modal.key}
          open
          onOpenChange={close}
          token={token}
          locations={locations}
          defaultLocationId={defaultLocation}
          equipment={modal.equipment}
          onSaved={(saved) => reload(copy.saved(saved.name))}
        />
      ) : null}
      {modal?.kind === 'maintenance' && active ? (
        <MaintenanceFormModal
          key={modal.key}
          open
          onOpenChange={close}
          token={token}
          equipment={active}
          location={locationOf(active.locationId)}
          onSaved={() => reload(copy.recorded(active.name))}
        />
      ) : null}
      {modal?.kind === 'retire' && active ? (
        <EquipmentReasonModal
          key={modal.key}
          open
          onOpenChange={close}
          title={copy.retireTitle(active.name)}
          description={copy.retireDescription}
          submitLabel={copy.retireSubmit}
          fallbackError={copy.retireError}
          withDate={retireToday(active) ? { today: retireToday(active)!, min: active.acquiredOn } : undefined}
          onConfirm={async ({ reason, date }) => {
            await retireEquipment(token, active.id, { reason, ...(date ? { retiredOn: date } : {}) });
            reload(copy.retiredDone(active.name));
          }}
        />
      ) : null}
    </div>
  );
}
