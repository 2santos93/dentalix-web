'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  listInventoryItems,
  createInventoryItem,
  type InventoryItem,
  type CreateInventoryItemInput,
} from '@/lib/inventory/inventory-api';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/molecules/form-field';
import { FormModal } from '@/components/molecules/form-modal';
import { AsyncSection, TableSkeleton } from '@/components/molecules/async-section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Copy as constants (i18n-ready) — es first, matches the rest of the app's
// copy convention (catalog-view.tsx / staff-view.tsx) until next-intl wiring
// lands.
const copy = {
  addToggle: 'Agregar insumo',
  createTitle: 'Agregar insumo',
  formDescription:
    'Registra un insumo para controlar su stock. El stock actual se calcula a partir de los movimientos (entradas, salidas y ajustes).',
  nameLabel: 'Nombre',
  unitLabel: 'Unidad',
  unitPlaceholder: 'caja, unidad, ml',
  skuLabel: 'SKU',
  minStockLabel: 'Stock mínimo',
  notesLabel: 'Notas',
  submit: 'Crear',
  retry: 'Reintentar',
  tableLabel: 'Inventario',
  genericLoadError: 'No pudimos cargar el inventario. Intenta de nuevo.',
  genericCreateError: 'No pudimos crear el insumo. Intenta de nuevo.',
  empty: 'Todavía no hay insumos registrados.',
  emptyHint: 'Agrega tu primer insumo para controlar el stock.',
  colItem: 'Insumo',
  colUnit: 'Unidad',
  colStock: 'Stock',
  colMinStock: 'Mínimo',
  colStatus: 'Estado',
  colActions: 'Acciones',
  lowStock: 'Bajo stock',
  ok: 'OK',
};

interface InventoryViewProps {
  token: string;
}

/**
 * Inventory management screen — list of insumos with computed stock/lowStock
 * + a create modal. Mirrors `CatalogView`'s shape (list via `AsyncSection` +
 * `FormModal` + `refreshInPlace` after mutation): both are the same
 * "clinic-config list you manage" pattern.
 *
 * `stock`/`lowStock` always come from the API — they're derived server-side
 * from the movement ledger and never computed or cached here.
 */
export function InventoryView({ token }: InventoryViewProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [sku, setSku] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listInventoryItems(token);
        if (cancelled) return;
        setItems(data);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
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
    return listInventoryItems(token)
      .then((data) => {
        setItems(data);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
      });
  }

  function resetForm() {
    setName('');
    setUnit('');
    setSku('');
    setMinStock('0');
    setNotes('');
  }

  function openCreate() {
    resetForm();
    setFormError(null);
    setShowForm(true);
  }

  // Builds the create payload. Empty optional fields are omitted (so a blank
  // SKU/notes doesn't send anything) — same convention as
  // `catalog-view.tsx`'s `buildPayload`. `minStock` always travels (number,
  // default 0).
  function buildPayload(): CreateInventoryItemInput {
    const trimmedSku = sku.trim();
    const trimmedNotes = notes.trim();
    return {
      name: name.trim(),
      unit: unit.trim(),
      minStock: minStock.trim() === '' ? 0 : Number(minStock),
      ...(trimmedSku ? { sku: trimmedSku } : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = buildPayload();
      await createInventoryItem(token, payload);
      resetForm();
      setShowForm(false);
      await refreshInPlace();
    } catch (err) {
      // Surfaces the backend's error (e.g. validation) verbatim.
      setFormError(err instanceof ApiError ? err.message : copy.genericCreateError);
    } finally {
      setSaving(false);
    }
  }

  function handleFormOpenChange(next: boolean) {
    setShowForm(next);
    if (!next) {
      setFormError(null);
      resetForm();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          <Plus /> {copy.addToggle}
        </Button>
      </div>

      <FormModal
        open={showForm}
        onOpenChange={handleFormOpenChange}
        title={copy.createTitle}
        description={copy.formDescription}
        onSubmit={handleSubmit}
        submitLabel={copy.submit}
        submitting={saving}
        error={formError}
        size="lg"
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
              placeholder={copy.unitPlaceholder}
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
              min={0}
              step="0.001"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
            />
          </FormField>
        </div>

        <FormField htmlFor="inventory-notes" label={copy.notesLabel}>
          <textarea
            id="inventory-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          />
        </FormField>
      </FormModal>

      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        retryLabel={copy.retry}
        isEmpty={items.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        skeleton={<TableSkeleton rows={4} />}
      >
        <Card className="overflow-hidden p-0">
          <Table aria-label={copy.tableLabel}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{copy.colItem}</TableHead>
                <TableHead>{copy.colUnit}</TableHead>
                <TableHead>{copy.colStock}</TableHead>
                <TableHead>{copy.colMinStock}</TableHead>
                <TableHead>{copy.colStatus}</TableHead>
                <TableHead className="text-right">{copy.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">{item.name}</span>
                      {item.sku ? (
                        <span className="text-xs text-muted">{item.sku}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="tabular-nums">{item.stock ?? 0}</TableCell>
                  <TableCell className="tabular-nums">{item.minStock}</TableCell>
                  <TableCell>
                    {item.lowStock ? (
                      <Badge variant="danger">{copy.lowStock}</Badge>
                    ) : (
                      <Badge variant="success">{copy.ok}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right" />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </AsyncSection>
    </div>
  );
}
