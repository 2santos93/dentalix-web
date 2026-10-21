'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ListOrdered } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listPriceListItems,
  listPriceLists,
  replacePriceListItems,
  type PriceList,
  type PriceListItemRow,
} from '@/lib/price-lists/price-lists-api';
import { formatCurrency } from '@/lib/format/currency';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar, ResultCount } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PriceListItemPriceModal } from './price-list-item-price-modal';

const copy = {
  back: 'Listas de precios',
  description: (currency: string) =>
    `Precios en ${currency}. Un procedimiento sin precio en la lista usa el del catálogo.`,
  inactiveBadge: 'Lista inactiva',
  searchLabel: 'Buscar por código, nombre o categoría',
  searchPlaceholder: 'Buscar…',
  countNoun: 'procedimiento',
  countNounPlural: 'procedimientos',
  loadError: 'No pudimos cargar los precios de la lista.',
  retry: 'Reintentar',
  empty: 'El catálogo todavía no tiene procedimientos.',
  emptyHint: 'Agrega procedimientos al catálogo para ponerles precio en esta lista.',
  noMatches: 'Ningún procedimiento coincide con la búsqueda.',
  noMatchesHint: 'Prueba con otro término.',
  clearSearch: 'Limpiar búsqueda',
  notFoundTitle: 'Esa lista de precios no existe.',
  notFoundHint: 'Puede que la hayan retirado. Vuelve a la lista de listas para elegir otra.',
  tableLabel: 'Precios de la lista',
  colCode: 'Código',
  colName: 'Procedimiento',
  colCategory: 'Categoría',
  colCatalogPrice: 'Precio de catálogo',
  colListPrice: 'Precio de lista',
  colActions: 'Acciones',
  noPrice: 'Sin precio',
  noCategory: '—',
  noCatalogPrice: '—',
  editPrice: 'Editar precio',
  removePrice: 'Quitar precio',
  actionFor: (action: string, name: string) => `${action} de «${name}»`,
  removeTitle: (name: string) => `¿Quitar el precio de «${name}»?`,
  removeDescription:
    'El procedimiento deja de tener precio en esta lista y vuelve a usar el del catálogo.',
  removeConfirm: 'Quitar precio',
  removeError: 'No pudimos quitar el precio.',
  listPriceLabel: 'Precio de lista',
  catalogPriceLabel: 'Catálogo',
};

const PAGE_SIZE = 20;
// Mismo valor que el catálogo: corto para no notarse, largo para no pedir por tecla.
const SEARCH_DEBOUNCE_MS = 300;

interface PriceListItemsViewProps {
  token: string;
  priceListId: string;
}

/**
 * Precios de una lista (DX-105): directorio paginado del catálogo de
 * procedimientos con el precio de lista de cada uno. Se edita de a uno, en un
 * modal por fila (no hay edición en rejilla): «Guardar» manda el `PUT` con una
 * sola fila y «Quitar precio» lo manda con `price: null`.
 */
export function PriceListItemsView({ token, priceListId }: PriceListItemsViewProps) {
  const [list, setList] = useState<PriceList | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listReload, setListReload] = useState(0);

  const [items, setItems] = useState<PriceListItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [hasAny, setHasAny] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<PriceListItemRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [removing, setRemoving] = useState<PriceListItemRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // La moneda de la lista (y su nombre) salen de la lista de listas: el
  // endpoint de ítems solo trae las filas.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setListLoading(true);
      try {
        const all = await listPriceLists(token, { includeInactive: true });
        if (cancelled) return;
        setList(all.find((l) => l.id === priceListId) ?? null);
        setListError(null);
      } catch (err) {
        if (cancelled) return;
        setListError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, priceListId, listReload]);

  useEffect(() => {
    const next = searchInput.trim();
    // Sin búsqueda nueva no hay nada que aplicar (ver `CatalogView`).
    if (next === search) return;
    const debounce = setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounce);
  }, [searchInput, search]);

  const queryParams = useMemo(
    () => ({ ...(search ? { query: search } : {}), page, pageSize: PAGE_SIZE }),
    [search, page],
  );

  const listFound = list !== null;
  useEffect(() => {
    // Sin lista no hay precios que pedir (la API respondería 404).
    if (!listFound) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPriceListItems(token, priceListId, queryParams);
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setPageSize(data.pageSize);
        if (data.total > 0) setHasAny(true);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, priceListId, listFound, queryParams, reloadKey]);

  function setRowPrice(catalogItemId: string, price: number | null) {
    setItems((prev) => prev.map((r) => (r.catalogItemId === catalogItemId ? { ...r, price } : r)));
  }

  function openEdit(row: PriceListItemRow) {
    setEditing(row);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await replacePriceListItems(token, priceListId, [
        { catalogItemId: removing.catalogItemId, price: null },
      ]);
      setRowPrice(removing.catalogItemId, null);
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3 max-md:h-11">
      <Link href="/settings/listas-de-precios">
        <ArrowLeft aria-hidden />
        {copy.back}
      </Link>
    </Button>
  );

  if (listLoading) {
    return (
      <>
        {backLink}
        <TableSkeleton rows={5} />
      </>
    );
  }
  if (listError) {
    return (
      <>
        {backLink}
        <AsyncSection loading={false} error={listError} onRetry={() => setListReload((k) => k + 1)} retryLabel={copy.retry}>
          {null}
        </AsyncSection>
      </>
    );
  }
  if (!list) {
    return (
      <>
        {backLink}
        <EmptyState
          role="status"
          icon={<ListOrdered aria-hidden />}
          title={copy.notFoundTitle}
          description={copy.notFoundHint}
        />
      </>
    );
  }

  const currency = list.currency;
  const isSearching = search !== '';

  function priceCell(row: PriceListItemRow) {
    return row.price === null ? (
      <span className="text-muted">{copy.noPrice}</span>
    ) : (
      <span className="font-medium tabular-nums">{formatCurrency(row.price, currency)}</span>
    );
  }

  function catalogPriceText(row: PriceListItemRow) {
    return row.defaultPrice === null ? copy.noCatalogPrice : formatCurrency(row.defaultPrice, currency);
  }

  function actions(row: PriceListItemRow) {
    return (
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="max-md:h-11"
          onClick={() => openEdit(row)}
          aria-label={copy.actionFor(copy.editPrice, row.labelEs)}
        >
          {copy.editPrice}
        </Button>
        {row.price !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-md:h-11"
            onClick={() => {
              setRemoveError(null);
              setRemoving(row);
            }}
            aria-label={copy.actionFor(copy.removePrice, row.labelEs)}
          >
            {copy.removePrice}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {backLink}
      <PageHeader
          title={list.name}
          description={copy.description(currency)}
          meta={
            list.active ? undefined : (
              <Badge variant="muted" className="mt-3">
                {copy.inactiveBadge}
              </Badge>
            )
          }
        />

      <div className="flex flex-col gap-3">
        <ListToolbar
          searchLabel={copy.searchLabel}
          searchPlaceholder={copy.searchPlaceholder}
          value={searchInput}
          onChange={setSearchInput}
        />

        {!loading && !loadError && hasAny ? (
          <ResultCount total={total} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
        ) : null}

        <AsyncSection
          loading={loading}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          retryLabel={copy.retry}
          isEmpty={items.length === 0}
          emptyTitle={isSearching ? copy.noMatches : copy.empty}
          emptyDescription={isSearching ? copy.noMatchesHint : copy.emptyHint}
          emptyAction={
            isSearching ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setPage(1);
                }}
              >
                {copy.clearSearch}
              </Button>
            ) : undefined
          }
          skeleton={<TableSkeleton rows={5} />}
        >
          <table
            aria-label={copy.tableLabel}
            className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
          >
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left">
                <th scope="col" className="px-4 py-3 font-medium text-muted">
                  {copy.colCode}
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted">
                  {copy.colName}
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted">
                  {copy.colCategory}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                  {copy.colCatalogPrice}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                  {copy.colListPrice}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                  <span className="sr-only">{copy.colActions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.catalogItemId} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3 tabular-nums text-muted">{row.code}</td>
                  <td className="px-4 py-3 font-medium">{row.labelEs}</td>
                  <td className="px-4 py-3">{row.category ?? copy.noCategory}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{catalogPriceText(row)}</td>
                  <td className="px-4 py-3 text-right">{priceCell(row)}</td>
                  <td className="px-4 py-3">{actions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
            {items.map((row) => (
              <li
                key={row.catalogItemId}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">{row.labelEs}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{row.code}</span>
                </div>
                {row.category ? <p className="text-xs text-muted">{row.category}</p> : null}
                <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span>
                    <span className="text-xs text-muted">{copy.listPriceLabel}: </span>
                    {priceCell(row)}
                  </span>
                  <span className="text-xs text-muted">
                    {copy.catalogPriceLabel}: <span className="tabular-nums">{catalogPriceText(row)}</span>
                  </span>
                </p>
                {actions(row)}
              </li>
            ))}
          </ul>
        </AsyncSection>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          disabled={loading}
        />
      </div>

      {editing ? (
        <PriceListItemPriceModal
          key={modalKey}
          open={modalOpen}
          onOpenChange={setModalOpen}
          token={token}
          priceListId={priceListId}
          currency={currency}
          row={editing}
          onSaved={setRowPrice}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? copy.removeTitle(removing.labelEs) : ''}
        description={copy.removeDescription}
        confirmLabel={copy.removeConfirm}
        onConfirm={() => void confirmRemove()}
        confirming={removeBusy}
        destructive
        error={removeError}
      />
    </>
  );
}
