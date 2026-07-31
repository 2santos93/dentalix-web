'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  recordInventoryMovement,
  listInventoryMovements,
  type InventoryItem,
  type CreateInventoryItemInput,
  type UpdateInventoryItemInput,
  type InventoryMovement,
  type InventoryMovementType,
  type RecordMovementInput,
} from '@/lib/inventory/inventory-api';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { FormField } from '@/components/molecules/form-field';
import { FormModal } from '@/components/molecules/form-modal';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { AsyncSection, TableSkeleton } from '@/components/molecules/async-section';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format/date';
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

  // Editar / eliminar insumo.
  editButtonLabel: 'Editar',
  editAction: (name: string) => `Editar ${name}`,
  editTitle: 'Editar insumo',
  editSubmit: 'Guardar',
  genericEditError: 'No pudimos actualizar el insumo. Intenta de nuevo.',
  deleteButtonLabel: 'Eliminar',
  deleteAction: (name: string) => `Eliminar ${name}`,
  deleteTitle: 'Eliminar insumo',
  deleteDescription: (name: string) =>
    `${name} dejará de aparecer en el inventario. Sus movimientos quedan registrados.`,
  deleteConfirm: 'Sí, eliminar',
  genericDeleteError: 'No pudimos eliminar el insumo. Intenta de nuevo.',

  // Movimientos (entrada/salida/ajuste).
  movementButtonLabel: 'Movimiento',
  historyButtonLabel: 'Historial',
  movementAction: (name: string) => `Movimiento de ${name}`,
  historyAction: (name: string) => `Historial de ${name}`,
  movementTitle: 'Registrar movimiento',
  movementDescription:
    'El stock se recalcula a partir de todos los movimientos registrados para este insumo.',
  movementTypeLabel: 'Tipo',
  movementQuantityLabel: 'Cantidad',
  movementReasonLabel: 'Motivo',
  movementSubmit: 'Registrar',
  invalidAdjustmentQuantity: 'La cantidad de un ajuste no puede ser 0.',
  genericMovementError: 'No pudimos registrar el movimiento. Intenta de nuevo.',

  historyTitle: (name: string) => `Historial de movimientos — ${name}`,
  historyDescription: 'Todos los movimientos de entrada, salida y ajuste registrados para este insumo.',
  historyTableLabel: 'Movimientos',
  colMovementDate: 'Fecha',
  colMovementType: 'Tipo',
  colMovementQuantity: 'Cantidad',
  colMovementReason: 'Motivo',
  movementReasonFallback: '—',
  genericHistoryError: 'No pudimos cargar el historial. Intenta de nuevo.',
  emptyHistory: 'Este insumo todavía no tiene movimientos.',
};

const MOVEMENT_TYPE_OPTIONS: InventoryMovementType[] = ['IN', 'OUT', 'ADJUSTMENT'];

const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  IN: 'Entrada',
  OUT: 'Salida',
  ADJUSTMENT: 'Ajuste',
};

// Semantic Badge variants: IN is the happy "stock coming in" path (success),
// OUT is a neutral fact (muted, not danger — leaving stock isn't a problem
// by itself), ADJUSTMENT flags a manual correction worth a second look
// (warning) — same "muted for neutral facts" convention as
// `treatment-plans-tab.tsx`'s `PLAN_STATUS_BADGE_VARIANT`.
const MOVEMENT_TYPE_BADGE_VARIANT: Record<InventoryMovementType, BadgeProps['variant']> = {
  IN: 'success',
  OUT: 'muted',
  ADJUSTMENT: 'warning',
};

// Native <select> styled to match the Input atom (kept native for a11y/tests) —
// same class/rationale as `catalog-view.tsx`'s `fieldClass`.
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

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

  // The create and edit flows share this same FormModal: `editingItem`
  // doubles as the "which insumo" AND the create/edit mode switch (`null` =
  // crear), same convention as `movementItem`/`historyItem` below — except
  // `showForm` stays a separate open flag because create mode needs the
  // modal open with `editingItem === null`.
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [sku, setSku] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation: `deletingItem` doubles as the ConfirmDialog's target
  // insumo AND its open flag, same convention as `movementItem`. `updatingId`
  // disables the in-flight row's controls, same as `staff-view.tsx`.
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Movimientos (entrada/salida/ajuste): `movementItem` doubles as the
  // modal's target insumo AND its open flag — same "record !== null is open"
  // convention as `TreatmentPlansTab`'s `receiptPayment`.
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<InventoryMovementType>('IN');
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [movementSubmitting, setMovementSubmitting] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  // Historial de movimientos: `historyItem` doubles as the panel's target
  // insumo AND its open flag, same convention as `movementItem` above. Owns
  // its own loading/error state — a failure here must never break the main
  // table.
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [historyMovements, setHistoryMovements] = useState<InventoryMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
    setEditingItem(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(item: InventoryItem) {
    setName(item.name);
    setUnit(item.unit);
    setSku(item.sku ?? '');
    setMinStock(String(item.minStock));
    setNotes(item.notes ?? '');
    setEditingItem(item);
    setFormError(null);
    setShowForm(true);
  }

  // Builds the CREATE payload. Empty optional fields are omitted (so a blank
  // SKU/notes doesn't send anything) — same convention as
  // `catalog-view.tsx`'s `buildPayload`. `minStock` always travels (number,
  // default 0). `CreateInventoryItemDto` doesn't accept `null` for
  // `sku`/`notes`, so omitting is the only way to say "not set" here.
  function buildCreatePayload(): CreateInventoryItemInput {
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

  // Builds the UPDATE payload. Unlike create, `UpdateInventoryItemDto`
  // accepts `string | null` for `sku`/`notes`, and the backend's PATCH
  // (`prisma-inventory.repository`) passes the payload straight to Prisma —
  // where `undefined` means "leave the column alone" and only an explicit
  // `null` clears it. So an omitted field here would silently keep the old
  // value: clearing the input must send `null`, not omit the key.
  function buildUpdatePayload(): UpdateInventoryItemInput {
    const trimmedSku = sku.trim();
    const trimmedNotes = notes.trim();
    return {
      name: name.trim(),
      unit: unit.trim(),
      minStock: minStock.trim() === '' ? 0 : Number(minStock),
      sku: trimmedSku || null,
      notes: trimmedNotes || null,
    };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editingItem) {
        await updateInventoryItem(token, editingItem.id, buildUpdatePayload());
      } else {
        await createInventoryItem(token, buildCreatePayload());
      }
      resetForm();
      setShowForm(false);
      setEditingItem(null);
      await refreshInPlace();
    } catch (err) {
      // Surfaces the backend's error (e.g. validation) verbatim.
      setFormError(
        err instanceof ApiError
          ? err.message
          : editingItem
            ? copy.genericEditError
            : copy.genericCreateError,
      );
    } finally {
      setSaving(false);
    }
  }

  function handleFormOpenChange(next: boolean) {
    setShowForm(next);
    if (!next) {
      setFormError(null);
      resetForm();
      setEditingItem(null);
    }
  }

  function openDelete(item: InventoryItem) {
    setDeleteError(null);
    setDeletingItem(item);
  }

  function handleDeleteOpenChange(next: boolean) {
    if (!next) {
      setDeletingItem(null);
      setDeleteError(null);
    }
  }

  async function handleDelete() {
    if (!deletingItem) return;
    setUpdatingId(deletingItem.id);
    setDeleteError(null);
    try {
      await deleteInventoryItem(token, deletingItem.id);
      setDeletingItem(null);
      await refreshInPlace();
    } catch (err) {
      // Movements have `onDelete: Restrict` at the DB level, so the backend
      // can reject the delete — surfaced verbatim here.
      setDeleteError(err instanceof ApiError ? err.message : copy.genericDeleteError);
    } finally {
      setUpdatingId(null);
    }
  }

  function openMovement(item: InventoryItem) {
    setMovementType('IN');
    setMovementQuantity('');
    setMovementReason('');
    setMovementError(null);
    setMovementItem(item);
  }

  function handleMovementOpenChange(next: boolean) {
    if (!next) {
      setMovementItem(null);
      setMovementError(null);
    }
  }

  async function handleMovementSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMovementError(null);
    if (!movementItem) return;

    const quantity = Number(movementQuantity);
    // ADJUSTMENT allows negatives (a correction can go either way) but a 0
    // adjustment is a no-op the backend would otherwise silently accept —
    // caught here client-side. IN/OUT already get `min={0}` on the input.
    if (movementType === 'ADJUSTMENT' && quantity === 0) {
      setMovementError(copy.invalidAdjustmentQuantity);
      return;
    }

    setMovementSubmitting(true);
    try {
      const trimmedReason = movementReason.trim();
      const input: RecordMovementInput = {
        type: movementType,
        quantity,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      };
      await recordInventoryMovement(token, movementItem.id, input);
      setMovementItem(null);
      // Stock is recomputed server-side from the movement ledger — re-read
      // the list rather than adjusting any number locally, and await it
      // BEFORE clearing `movementSubmitting` (same "await the refresh before
      // re-enabling" pattern as `treatment-plans-tab.tsx`).
      await refreshInPlace();
    } catch (err) {
      // Surfaces the backend's error (e.g. stock insuficiente en una salida)
      // verbatim.
      setMovementError(err instanceof ApiError ? err.message : copy.genericMovementError);
    } finally {
      setMovementSubmitting(false);
    }
  }

  function openHistory(item: InventoryItem) {
    setHistoryItem(item);
    setHistoryMovements([]);
    setHistoryError(null);
    setHistoryLoading(true);
    listInventoryMovements(token, item.id)
      .then((data) => {
        setHistoryMovements(data);
        setHistoryError(null);
      })
      .catch((err) => {
        setHistoryError(err instanceof ApiError ? err.message : copy.genericHistoryError);
      })
      .finally(() => setHistoryLoading(false));
  }

  function handleHistoryOpenChange(next: boolean) {
    if (!next) setHistoryItem(null);
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
        title={editingItem ? copy.editTitle : copy.createTitle}
        description={copy.formDescription}
        onSubmit={handleSubmit}
        submitLabel={editingItem ? copy.editSubmit : copy.submit}
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
              {items.map((item) => {
                const updating = updatingId === item.id;
                return (
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updating}
                          aria-label={copy.movementAction(item.name)}
                          onClick={() => openMovement(item)}
                        >
                          {copy.movementButtonLabel}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updating}
                          aria-label={copy.historyAction(item.name)}
                          onClick={() => openHistory(item)}
                        >
                          {copy.historyButtonLabel}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updating}
                          aria-label={copy.editAction(item.name)}
                          onClick={() => openEdit(item)}
                        >
                          {copy.editButtonLabel}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updating}
                          aria-label={copy.deleteAction(item.name)}
                          onClick={() => openDelete(item)}
                        >
                          {copy.deleteButtonLabel}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </AsyncSection>

      <FormModal
        open={movementItem !== null}
        onOpenChange={handleMovementOpenChange}
        title={copy.movementTitle}
        description={copy.movementDescription}
        onSubmit={handleMovementSubmit}
        submitLabel={copy.movementSubmit}
        submitting={movementSubmitting}
        error={movementError}
      >
        <FormField htmlFor="movement-type" label={copy.movementTypeLabel}>
          <select
            id="movement-type"
            value={movementType}
            onChange={(e) => setMovementType(e.target.value as InventoryMovementType)}
            className={fieldClass}
          >
            {MOVEMENT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {MOVEMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField htmlFor="movement-quantity" label={copy.movementQuantityLabel}>
          <Input
            id="movement-quantity"
            type="number"
            step="0.001"
            min={movementType === 'ADJUSTMENT' ? undefined : 0}
            required
            value={movementQuantity}
            onChange={(e) => setMovementQuantity(e.target.value)}
          />
        </FormField>
        <FormField htmlFor="movement-reason" label={copy.movementReasonLabel}>
          <Input
            id="movement-reason"
            type="text"
            value={movementReason}
            onChange={(e) => setMovementReason(e.target.value)}
          />
        </FormField>
      </FormModal>

      <Dialog open={historyItem !== null} onOpenChange={handleHistoryOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{historyItem ? copy.historyTitle(historyItem.name) : copy.historyTitle('')}</DialogTitle>
            <DialogDescription>{copy.historyDescription}</DialogDescription>
          </DialogHeader>
          <AsyncSection
            loading={historyLoading}
            error={historyError}
            onRetry={() => {
              if (historyItem) openHistory(historyItem);
            }}
            retryLabel={copy.retry}
            isEmpty={historyMovements.length === 0}
            emptyTitle={copy.emptyHistory}
            skeleton={<TableSkeleton rows={3} />}
          >
            <Table aria-label={copy.historyTableLabel}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{copy.colMovementDate}</TableHead>
                  <TableHead>{copy.colMovementType}</TableHead>
                  <TableHead>{copy.colMovementQuantity}</TableHead>
                  <TableHead>{copy.colMovementReason}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyMovements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                    <TableCell>
                      <Badge variant={MOVEMENT_TYPE_BADGE_VARIANT[movement.type]}>
                        {MOVEMENT_TYPE_LABELS[movement.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{movement.quantity}</TableCell>
                    <TableCell className="text-muted">
                      {movement.reason ?? copy.movementReasonFallback}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AsyncSection>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletingItem !== null}
        onOpenChange={handleDeleteOpenChange}
        title={copy.deleteTitle}
        description={deletingItem ? copy.deleteDescription(deletingItem.name) : undefined}
        confirmLabel={copy.deleteConfirm}
        confirming={deletingItem !== null && updatingId === deletingItem.id}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </div>
  );
}
