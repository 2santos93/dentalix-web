'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ListOrdered, Lock, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  deletePriceList,
  listPriceLists,
  updatePriceList,
  type PriceList,
} from '@/lib/price-lists/price-lists-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { notifyError } from '@/components/errors/notify';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { PriceListFormModal } from './price-list-form-modal';

const copy = {
  newList: 'Nueva lista',
  count: (n: number) => (n === 1 ? '1 lista' : `${n} listas`),
  empty: 'Todavía no hay listas de precios.',
  emptyHint:
    'Crea una lista con los precios de una sede o de un convenio. Los procedimientos sin precio en la lista usan el del catálogo.',
  loadError: 'No pudimos cargar las listas de precios.',
  forbiddenTitle: 'Solo administración gestiona las listas de precios.',
  forbiddenHint: 'Los precios se aplican solos al añadir un procedimiento a un plan.',
  tableLabel: 'Listas de precios',
  colName: 'Nombre',
  colCurrency: 'Moneda',
  colLocation: 'Sede',
  colItems: 'Precios',
  wholeClinic: 'Toda la clínica',
  unknownLocation: 'Sede',
  items: (n: number) => (n === 1 ? '1 precio' : `${n} precios`),
  inactive: 'Inactiva',
  edit: 'Editar datos',
  deactivate: 'Desactivar',
  activate: 'Reactivar',
  remove: 'Retirar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
  removeTitle: (name: string) => `¿Retirar «${name}»?`,
  removeDescription:
    'Deja de aparecer aquí y de aplicarse. No se puede retirar mientras un convenio la use; en ese caso, desactívala.',
  removeConfirm: 'Retirar lista',
  removeError: 'No pudimos retirar la lista de precios.',
};

interface PriceListsManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir). */
  allowed: boolean;
}

/**
 * Gestión de las listas de precios en /settings/listas-de-precios (DX-105).
 * Crear, editar, activar/desactivar y retirar; los precios de cada lista se
 * editan en su propia pantalla, que es a donde lleva la fila.
 */
export function PriceListsManager({ token, allowed }: PriceListsManagerProps) {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PriceList | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const removedRef = useRef(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [data, sedes] = await Promise.all([
          listPriceLists(token, { includeInactive: true }),
          listLocations(token),
        ]);
        if (cancelled) return;
        setLists(data);
        setLocations(sedes);
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

  function locationLabel(list: PriceList): string {
    if (list.locationId === null) return copy.wholeClinic;
    return locations.find((l) => l.id === list.locationId)?.name ?? copy.unknownLocation;
  }

  function openModal(list: PriceList | null) {
    setEditing(list);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: PriceList) {
    setLists((prev) => {
      const rest = prev.filter((t) => t.id !== saved.id);
      return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    });
  }

  async function toggleActive(list: PriceList) {
    setPendingId(list.id);
    try {
      upsert(await updatePriceList(token, list.id, { active: !list.active }));
    } catch (err) {
      // Escalón 3: la lista sigue siendo correcta. El mensaje de la API explica
      // el caso habitual («ya hay una lista activa en esa sede»).
      notifyError(apiErrorMessage(err, copy.toggleError(list.name)), {
        onRetry: () => void toggleActive(list),
      });
    } finally {
      setPendingId(null);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await deletePriceList(token, removing.id);
      setLists((prev) => prev.filter((t) => t.id !== removing.id));
      removedRef.current = true;
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  function rowActions(list: PriceList): RowAction[] {
    const busy = pendingId === list.id;
    return [
      { label: copy.edit, onSelect: () => openModal(list), disabled: busy },
      {
        label: list.active ? copy.deactivate : copy.activate,
        onSelect: () => void toggleActive(list),
        disabled: busy,
      },
      {
        label: copy.remove,
        destructive: true,
        separatorBefore: true,
        disabled: busy,
        onSelect: () => {
          setRemoveError(null);
          setRemoving(list);
        },
      },
    ];
  }

  const columns: DataListColumn<PriceList>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      // El estado solo se pinta cuando es la excepción (critique-settings).
      cell: (l) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">{l.name}</span>
          {l.active ? null : <Badge variant="neutral">{copy.inactive}</Badge>}
        </span>
      ),
    },
    { id: 'currency', header: copy.colCurrency, cell: (l) => l.currency, cellClassName: 'tabular-nums' },
    { id: 'location', header: copy.colLocation, cell: (l) => locationLabel(l) },
    {
      id: 'items',
      header: copy.colItems,
      numeric: true,
      mobile: 'trailing',
      cell: (l) => l.itemCount,
      mobileCell: (l) => copy.items(l.itemCount),
    },
  ];

  const isEmpty = !loading && !error && lists.length === 0;
  const newButton = (
    <Button ref={newButtonRef} type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
      <Plus aria-hidden />
      {copy.newList}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Lista vacía: sin «0 listas» y la acción dentro del estado vacío. */}
      {isEmpty ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="t-body text-muted" aria-live="polite">
            {loading || error ? '' : copy.count(lists.length)}
          </p>
          {newButton}
        </div>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={lists.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<ListOrdered aria-hidden />}
        emptyAction={newButton}
      >
        {/* La fila abre sus precios, que es a lo que se viene; editar los
            datos, desactivar y retirar van en el «⋯». */}
        <DataList
          label={copy.tableLabel}
          rows={lists}
          columns={columns}
          getRowKey={(l) => l.id}
          getRowHref={(l) => `/settings/listas-de-precios/${l.id}`}
          rowActions={rowActions}
          getRowLabel={(l) => l.name}
        />
      </AsyncSection>

      <PriceListFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        priceList={editing}
        locations={locations}
        onSaved={upsert}
        onRetryLocations={() => {
          // Solo relee las sedes (la elegida no tenía moneda); el formulario
          // sigue abierto. Si vuelve a fallar, el campo conserva su reintento.
          listLocations(token)
            .then(setLocations)
            .catch(() => {});
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
        onCloseAutoFocus={(event) => {
          // La fila retirada ya no existe: el foco pasa a «Nueva lista».
          if (!removedRef.current) return;
          removedRef.current = false;
          event.preventDefault();
          newButtonRef.current?.focus();
        }}
      />
    </div>
  );
}
