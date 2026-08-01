'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import {
  listItems,
  createItem,
  updateItem,
  deleteItem,
  type InventoryItemWithStock,
} from '@/lib/inventory/inventory-api';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/molecules/form-field';
import { EmptyState } from '@/components/molecules/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  addToggle: 'Nuevo insumo',
  cancel: 'Cancelar',
  nameLabel: 'Nombre',
  unitLabel: 'Unidad',
  skuLabel: 'SKU',
  minStockLabel: 'Stock mínimo',
  notesLabel: 'Notas',
  submit: 'Crear',
  submitting: 'Creando…',
  retry: 'Reintentar',
  loading: 'Cargando inventario…',
  tableLabel: 'Inventario de insumos',
  genericLoadError: 'No pudimos cargar el inventario. Intenta de nuevo.',
  genericCreateError: 'No pudimos crear el insumo. Intenta de nuevo.',
  genericUpdateError: 'No pudimos actualizar el insumo. Intenta de nuevo.',
  genericDeleteError: 'No pudimos eliminar el insumo. Intenta de nuevo.',
  forbidden: 'No tienes permiso para ver el inventario.',
  empty: 'No hay insumos registrados todavía.',
  emptyHint: 'Agrega el primer insumo para empezar a llevar el control de stock.',
  colName: 'Nombre',
  colSku: 'SKU',
  colUnit: 'Unidad',
  colStock: 'Stock',
  colMin: 'Mín',
  colActions: 'Acciones',
  lowStockBadge: 'Stock bajo',
  viewCta: 'Ver',
  deleteCta: 'Eliminar',
  deleteConfirmPrompt: '¿Eliminar este insumo?',
  deleteConfirmYes: 'Sí, eliminar',
  deleteConfirmNo: 'Cancelar',
  skuFallback: '—',
  nameFieldLabel: (name: string) => `Nombre de ${name}`,
  unitFieldLabel: (name: string) => `Unidad de ${name}`,
  skuFieldLabel: (name: string) => `SKU de ${name}`,
  minStockFieldLabel: (name: string) => `Stock mínimo de ${name}`,
};

const NEW_ITEM_FORM_ID = 'inventory-new-item-form';

interface InventoryViewProps {
  token: string;
}

/**
 * Composes the inventory list (table) + an inline "add item" reveal section,
 * mirroring `staff-view.tsx`'s dominant pattern for this app: a `Button`
 * toggling a revealed `Card` (not a dialog), inline row edit (blur-triggered
 * field updates) and inline delete confirmation (not `window.confirm`), with
 * `refreshInPlace` re-fetching the list in place after any mutation so the
 * table never remounts.
 */
export function InventoryView({ token }: InventoryViewProps) {
  const [items, setItems] = useState<InventoryItemWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Distinguishes a 403 (no permission — nothing to retry) from any other
  // load failure (transient — show Reintentar).
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [sku, setSku] = useState('');
  const [minStock, setMinStock] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Which row is currently being mutated (field edit or delete) — disables
  // that row's controls, same as staff-view.tsx's `updatingId`.
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // Row awaiting delete confirmation (inline, not a dialog/native confirm()).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // The inline field editors are uncontrolled (defaultValue), so on a failed
  // PATCH the DOM keeps the edited value. Keep refs to reset the DOM value
  // back to the last-known-good value after a failure — same convention as
  // staff-view.tsx's `nameInputRefs`.
  const fieldRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listItems(token);
        if (cancelled) return;
        setItems(data);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
          setLoadError(null);
        } else {
          setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
          setForbidden(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  function refreshInPlace(): Promise<void> {
    if (!token) return Promise.resolve();
    return listItems(token)
      .then((data) => {
        setItems(data);
        setLoadError(null);
        setForbidden(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
        } else {
          setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
        }
      });
  }

  function resetForm() {
    setName('');
    setUnit('');
    setSku('');
    setMinStock('');
    setNotes('');
  }

  async function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const payload: Parameters<typeof createItem>[1] = {
        name,
        unit,
      };
      if (sku.trim()) payload.sku = sku.trim();
      if (minStock.trim()) payload.minStock = Number(minStock);
      if (notes.trim()) payload.notes = notes.trim();

      await createItem(token, payload);
      resetForm();
      setShowForm(false);
      await refreshInPlace();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : copy.genericCreateError);
    } finally {
      setCreating(false);
    }
  }

  async function handleFieldChange(
    itemId: string,
    patch: Parameters<typeof updateItem>[2],
    fieldKey: string,
    previousValue: string,
  ) {
    setUpdatingId(itemId);
    setRowError(null);
    try {
      await updateItem(token, itemId, patch);
      await refreshInPlace();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : copy.genericUpdateError);
      // Reset the (uncontrolled) input back to the last known value so a
      // subsequent no-op blur doesn't keep re-firing the same failed PATCH.
      const el = fieldRefs.current.get(`${itemId}:${fieldKey}`);
      if (el) el.value = previousValue;
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(itemId: string) {
    setUpdatingId(itemId);
    setRowError(null);
    try {
      await deleteItem(token, itemId);
      setConfirmingId(null);
      await refreshInPlace();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : copy.genericDeleteError);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-end gap-4 p-4">
          <Button
            type="button"
            variant={showForm ? 'outline' : 'default'}
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
            aria-controls={NEW_ITEM_FORM_ID}
          >
            {showForm ? (
              <>
                <X /> {copy.cancel}
              </>
            ) : (
              <>
                <Plus /> {copy.addToggle}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {showForm && (
        <Card id={NEW_ITEM_FORM_ID} className="max-w-2xl">
          <CardContent className="p-6">
            <form
              onSubmit={handleCreateSubmit}
              aria-label={copy.addToggle}
              className="flex flex-col gap-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField htmlFor="inventory-name" label={copy.nameLabel}>
                  <Input
                    id="inventory-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </FormField>
                <FormField htmlFor="inventory-unit" label={copy.unitLabel}>
                  <Input
                    id="inventory-unit"
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField htmlFor="inventory-sku" label={copy.skuLabel}>
                  <Input
                    id="inventory-sku"
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                  />
                </FormField>
                <FormField htmlFor="inventory-min-stock" label={copy.minStockLabel}>
                  <Input
                    id="inventory-min-stock"
                    type="number"
                    step="0.001"
                    min={0}
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField htmlFor="inventory-notes" label={copy.notesLabel}>
                <Input
                  id="inventory-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </FormField>

              {createError && (
                <p role="alert" className="text-sm text-danger">
                  {createError}
                </p>
              )}

              <Button type="submit" disabled={creating} className="self-start">
                {creating ? copy.submitting : copy.submit}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {rowError && (
        <p role="alert" className="text-sm text-danger">
          {rowError}
        </p>
      )}

      {loading ? (
        <p role="status" className="text-sm text-muted">
          {copy.loading}
        </p>
      ) : forbidden ? (
        <p role="status" className="text-sm text-muted">
          {copy.forbidden}
        </p>
      ) : loadError ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            {copy.retry}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState role="status" title={copy.empty} description={copy.emptyHint} />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table aria-label={copy.tableLabel}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{copy.colName}</TableHead>
                <TableHead>{copy.colSku}</TableHead>
                <TableHead>{copy.colUnit}</TableHead>
                <TableHead>{copy.colStock}</TableHead>
                <TableHead>{copy.colMin}</TableHead>
                <TableHead>{copy.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const updating = updatingId === item.id;
                const confirming = confirmingId === item.id;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Input
                        key={`${item.id}-name-${item.name}`}
                        ref={(el) => {
                          if (el) fieldRefs.current.set(`${item.id}:name`, el);
                          else fieldRefs.current.delete(`${item.id}:name`);
                        }}
                        defaultValue={item.name}
                        aria-label={copy.nameFieldLabel(item.name)}
                        disabled={updating}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value && value !== item.name) {
                            handleFieldChange(item.id, { name: value }, 'name', item.name);
                          }
                        }}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        key={`${item.id}-sku-${item.sku}`}
                        ref={(el) => {
                          if (el) fieldRefs.current.set(`${item.id}:sku`, el);
                          else fieldRefs.current.delete(`${item.id}:sku`);
                        }}
                        defaultValue={item.sku ?? ''}
                        aria-label={copy.skuFieldLabel(item.name)}
                        disabled={updating}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          const previous = item.sku ?? '';
                          if (value !== previous) {
                            handleFieldChange(
                              item.id,
                              { sku: value || null },
                              'sku',
                              previous,
                            );
                          }
                        }}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        key={`${item.id}-unit-${item.unit}`}
                        ref={(el) => {
                          if (el) fieldRefs.current.set(`${item.id}:unit`, el);
                          else fieldRefs.current.delete(`${item.id}:unit`);
                        }}
                        defaultValue={item.unit}
                        aria-label={copy.unitFieldLabel(item.name)}
                        disabled={updating}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value && value !== item.unit) {
                            handleFieldChange(item.id, { unit: value }, 'unit', item.unit);
                          }
                        }}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{item.stock}</span>
                        {item.lowStock && (
                          <Badge variant="warning">{copy.lowStockBadge}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        key={`${item.id}-min-${item.minStock}`}
                        ref={(el) => {
                          if (el) fieldRefs.current.set(`${item.id}:minStock`, el);
                          else fieldRefs.current.delete(`${item.id}:minStock`);
                        }}
                        type="number"
                        step="0.001"
                        min={0}
                        defaultValue={item.minStock}
                        aria-label={copy.minStockFieldLabel(item.name)}
                        disabled={updating}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          if (!raw) return;
                          const value = Number(raw);
                          if (!Number.isNaN(value) && value !== item.minStock) {
                            handleFieldChange(
                              item.id,
                              { minStock: value },
                              'minStock',
                              String(item.minStock),
                            );
                          }
                        }}
                        className="h-9 w-24"
                      />
                    </TableCell>
                    <TableCell>
                      {confirming ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted">
                            {copy.deleteConfirmPrompt}
                          </span>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={updating}
                            onClick={() => handleDelete(item.id)}
                          >
                            {copy.deleteConfirmYes}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={updating}
                            onClick={() => setConfirmingId(null)}
                          >
                            {copy.deleteConfirmNo}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/inventory/${item.id}`}>{copy.viewCta}</Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={updating}
                            onClick={() => setConfirmingId(item.id)}
                          >
                            {copy.deleteCta}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
