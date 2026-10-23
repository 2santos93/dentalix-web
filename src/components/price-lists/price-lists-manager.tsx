'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  colStatus: 'Estado',
  colActions: 'Acciones',
  wholeClinic: 'Toda la clínica',
  unknownLocation: 'Sede',
  items: (n: number) => (n === 1 ? '1 precio' : `${n} precios`),
  active: 'Activa',
  inactive: 'Inactiva',
  prices: 'Precios',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  remove: 'Retirar',
  actionFor: (action: string, name: string) => `${action} «${name}»`,
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
 * editan en su propia pantalla.
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

  function actions(list: PriceList) {
    const toggleLabel = list.active ? copy.deactivate : copy.activate;
    return (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="max-md:h-11"
        >
          <Link
            href={`/settings/listas-de-precios/${list.id}`}
            aria-label={copy.actionFor(copy.prices, list.name)}
          >
            {copy.prices}
          </Link>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="max-md:h-11"
          onClick={() => openModal(list)}
          aria-label={copy.actionFor(copy.edit, list.name)}
        >
          {copy.edit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-11"
          loading={pendingId === list.id}
          onClick={() => void toggleActive(list)}
          aria-label={copy.actionFor(toggleLabel, list.name)}
        >
          {toggleLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-11"
          onClick={() => {
            setRemoveError(null);
            setRemoving(list);
          }}
          aria-label={copy.actionFor(copy.remove, list.name)}
        >
          {copy.remove}
        </Button>
      </div>
    );
  }

  function status(list: PriceList) {
    return (
      <Badge variant={list.active ? 'success' : 'muted'}>
        {list.active ? copy.active : copy.inactive}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {loading || error ? '' : copy.count(lists.length)}
        </p>
        <Button
          ref={newButtonRef}
          type="button"
          onClick={() => openModal(null)}
          className="w-full sm:w-auto"
        >
          <Plus aria-hidden />
          {copy.newList}
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={lists.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<ListOrdered aria-hidden />}
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
                {copy.colCurrency}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colLocation}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                {copy.colItems}
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
            {lists.map((l) => (
              <tr key={l.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3 font-medium">{l.name}</td>
                <td className="px-4 py-3 tabular-nums">{l.currency}</td>
                <td className="px-4 py-3">{locationLabel(l)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{l.itemCount}</td>
                <td className="px-4 py-3">{status(l)}</td>
                <td className="px-4 py-3">{actions(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {lists.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium">{l.name}</span>
                {status(l)}
              </div>
              <p className="text-xs text-muted">
                {l.currency} · {locationLabel(l)} · {copy.items(l.itemCount)}
              </p>
              {actions(l)}
            </li>
          ))}
        </ul>
      </AsyncSection>

      <PriceListFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        priceList={editing}
        locations={locations}
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
