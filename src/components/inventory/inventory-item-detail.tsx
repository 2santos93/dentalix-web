'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import {
  getItem,
  updateItem,
  deleteItem,
  recordMovement,
  type InventoryItemDetail as InventoryItemDetailData,
  type InventoryMovement,
  type MovementType,
} from '@/lib/inventory/inventory-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/molecules/form-field';
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
  loading: 'Cargando insumo…',
  retry: 'Reintentar',
  genericLoadError: 'No pudimos cargar el insumo. Intenta de nuevo.',
  forbidden: 'No tienes permiso para ver el inventario.',
  stockLabel: 'Stock actual',
  lowStockBadge: 'Stock bajo',
  minStockLabel: 'Stock mínimo',
  unitLabel: 'Unidad',
  skuLabel: 'SKU',
  notesLabel: 'Notas',
  fallback: '—',
  editCta: 'Editar',
  deleteCta: 'Eliminar',
  cancel: 'Cancelar',
  save: 'Guardar',
  saving: 'Guardando…',
  nameLabel: 'Nombre',
  genericUpdateError: 'No pudimos actualizar el insumo. Intenta de nuevo.',
  deleteConfirmPrompt: '¿Eliminar este insumo?',
  deleteConfirmYes: 'Sí, eliminar',
  deleting: 'Eliminando…',
  genericDeleteError: 'No pudimos eliminar el insumo. Intenta de nuevo.',
  // Movement form
  movementHeading: 'Registrar movimiento',
  typeLabel: 'Tipo',
  typeIn: 'Entrada',
  typeOut: 'Salida',
  typeAdjustment: 'Ajuste',
  quantityLabel: 'Cantidad',
  reasonLabel: 'Motivo (opcional)',
  record: 'Registrar',
  recording: 'Registrando…',
  qtyRequired: 'Ingresa una cantidad válida.',
  qtyPositive: 'La cantidad debe ser mayor que 0 para entradas y salidas.',
  qtyNonZero: 'La cantidad del ajuste no puede ser 0.',
  genericMovementError: 'No pudimos registrar el movimiento. Intenta de nuevo.',
  // Ledger
  ledgerHeading: 'Movimientos',
  ledgerEmpty: 'Sin movimientos aún.',
  colDate: 'Fecha',
  colType: 'Tipo',
  colQuantity: 'Cantidad',
  colReason: 'Motivo',
};

const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  IN: copy.typeIn,
  OUT: copy.typeOut,
  ADJUSTMENT: copy.typeAdjustment,
};

const MOVEMENT_TYPE_VARIANT: Record<MovementType, 'success' | 'danger' | 'warning'> = {
  IN: 'success',
  OUT: 'danger',
  ADJUSTMENT: 'warning',
};

/** Cantidad con signo para el ledger: IN suma, OUT resta, ADJUSTMENT lleva su propio signo. */
function signedQuantity(m: InventoryMovement): string {
  if (m.type === 'IN') return `+${m.quantity}`;
  if (m.type === 'OUT') return `-${m.quantity}`;
  // ADJUSTMENT: el backend guarda la cantidad con su propio signo → tal cual.
  return `${m.quantity}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

interface InventoryItemDetailProps {
  token: string;
  id: string;
}

/**
 * Detalle de un insumo: cabecera (stock actual + stock bajo), edición/borrado
 * del item, formulario para registrar un movimiento (entrada/salida/ajuste con
 * validación de cantidad por tipo) y el ledger de movimientos. Mismo patrón que
 * `inventory-view.tsx`: estado propio (sin TanStack Query), errores inline
 * `role="alert"`, confirmación de borrado inline, y refresco en sitio tras
 * cada mutación.
 */
export function InventoryItemDetail({ token, id }: InventoryItemDetailProps) {
  const router = useRouter();
  const [item, setItem] = useState<InventoryItemDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Movement form
  const [mType, setMType] = useState<MovementType>('IN');
  const [mQty, setMQty] = useState('');
  const [mReason, setMReason] = useState('');
  const [recording, setRecording] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Edit form
  const [showEdit, setShowEdit] = useState(false);
  const [eName, setEName] = useState('');
  const [eUnit, setEUnit] = useState('');
  const [eSku, setESku] = useState('');
  const [eMinStock, setEMinStock] = useState('');
  const [eNotes, setENotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getItem(token, id);
        if (cancelled) return;
        setItem(data);
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
  }, [token, id, reloadKey]);

  function refreshInPlace(): Promise<void> {
    return getItem(token, id)
      .then((data) => {
        setItem(data);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
      });
  }

  function openEdit() {
    if (!item) return;
    setEName(item.name);
    setEUnit(item.unit);
    setESku(item.sku ?? '');
    setEMinStock(String(item.minStock));
    setENotes(item.notes ?? '');
    setEditError(null);
    setShowEdit(true);
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEditError(null);
    setSaving(true);
    try {
      await updateItem(token, id, {
        name: eName,
        unit: eUnit,
        sku: eSku.trim() || null,
        minStock: Number(eMinStock),
        notes: eNotes.trim() || null,
      });
      setShowEdit(false);
      await refreshInPlace();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : copy.genericUpdateError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteItem(token, id);
      router.push('/inventory');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : copy.genericDeleteError);
      setDeleting(false);
    }
  }

  async function handleRecord(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMoveError(null);
    const qty = Number(mQty);
    if (mQty.trim() === '' || Number.isNaN(qty)) {
      setMoveError(copy.qtyRequired);
      return;
    }
    if ((mType === 'IN' || mType === 'OUT') && qty <= 0) {
      setMoveError(copy.qtyPositive);
      return;
    }
    if (mType === 'ADJUSTMENT' && qty === 0) {
      setMoveError(copy.qtyNonZero);
      return;
    }
    setRecording(true);
    try {
      await recordMovement(token, id, {
        type: mType,
        quantity: qty,
        reason: mReason.trim() || undefined,
      });
      setMQty('');
      setMReason('');
      await refreshInPlace();
    } catch (err) {
      setMoveError(err instanceof ApiError ? err.message : copy.genericMovementError);
    } finally {
      setRecording(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loading}
      </p>
    );
  }

  if (forbidden) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.forbidden}
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          {copy.retry}
        </Button>
      </div>
    );
  }

  if (!item) return null;

  const movements = [...item.movements].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-ink">{item.name}</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">{copy.stockLabel}:</span>
              <span className="text-2xl font-semibold tabular-nums text-ink">{item.stock}</span>
              <span className="text-sm text-muted">{item.unit}</span>
              {item.lowStock && <Badge variant="warning">{copy.lowStockBadge}</Badge>}
            </div>
            <dl className="mt-1 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-muted">{copy.minStockLabel}:</dt>
                <dd className="text-ink">{item.minStock}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted">{copy.skuLabel}:</dt>
                <dd className="text-ink">{item.sku ?? copy.fallback}</dd>
              </div>
              {item.notes ? (
                <div className="flex gap-2 sm:col-span-2">
                  <dt className="text-muted">{copy.notesLabel}:</dt>
                  <dd className="text-ink">{item.notes}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div className="flex flex-col items-end gap-2">
            {confirmingDelete ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted">{copy.deleteConfirmPrompt}</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {deleting ? copy.deleting : copy.deleteConfirmYes}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setConfirmingDelete(false)}
                >
                  {copy.cancel}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={openEdit}>
                  {copy.editCta}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                >
                  {copy.deleteCta}
                </Button>
              </div>
            )}
            {deleteError && (
              <p role="alert" className="text-sm text-danger">
                {deleteError}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Editar item */}
      {showEdit && (
        <Card className="max-w-2xl">
          <CardContent className="p-6">
            <form onSubmit={handleEditSubmit} aria-label={copy.editCta} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField htmlFor="edit-name" label={copy.nameLabel}>
                  <Input id="edit-name" type="text" required value={eName} onChange={(e) => setEName(e.target.value)} />
                </FormField>
                <FormField htmlFor="edit-unit" label={copy.unitLabel}>
                  <Input id="edit-unit" type="text" required value={eUnit} onChange={(e) => setEUnit(e.target.value)} />
                </FormField>
                <FormField htmlFor="edit-sku" label={copy.skuLabel}>
                  <Input id="edit-sku" type="text" value={eSku} onChange={(e) => setESku(e.target.value)} />
                </FormField>
                <FormField htmlFor="edit-min" label={copy.minStockLabel}>
                  <Input id="edit-min" type="number" step="0.001" min={0} value={eMinStock} onChange={(e) => setEMinStock(e.target.value)} />
                </FormField>
              </div>
              <FormField htmlFor="edit-notes" label={copy.notesLabel}>
                <Input id="edit-notes" type="text" value={eNotes} onChange={(e) => setENotes(e.target.value)} />
              </FormField>
              {editError && (
                <p role="alert" className="text-sm text-danger">
                  {editError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? copy.saving : copy.save}
                </Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => setShowEdit(false)}>
                  {copy.cancel}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Registrar movimiento */}
      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <h3 className="mb-4 text-base font-semibold text-ink">{copy.movementHeading}</h3>
          <form onSubmit={handleRecord} aria-label={copy.movementHeading} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField htmlFor="movement-type" label={copy.typeLabel}>
                <select
                  id="movement-type"
                  value={mType}
                  onChange={(e) => setMType(e.target.value as MovementType)}
                  className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  <option value="IN">{copy.typeIn}</option>
                  <option value="OUT">{copy.typeOut}</option>
                  <option value="ADJUSTMENT">{copy.typeAdjustment}</option>
                </select>
              </FormField>
              <FormField htmlFor="movement-qty" label={copy.quantityLabel}>
                <Input
                  id="movement-qty"
                  type="number"
                  step="0.001"
                  value={mQty}
                  onChange={(e) => setMQty(e.target.value)}
                />
              </FormField>
              <FormField htmlFor="movement-reason" label={copy.reasonLabel}>
                <Input
                  id="movement-reason"
                  type="text"
                  value={mReason}
                  onChange={(e) => setMReason(e.target.value)}
                />
              </FormField>
            </div>
            {moveError && (
              <p role="alert" className="text-sm text-danger">
                {moveError}
              </p>
            )}
            <Button type="submit" disabled={recording} className="self-start">
              {recording ? copy.recording : copy.record}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Ledger */}
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-ink">{copy.ledgerHeading}</h3>
        {movements.length === 0 ? (
          <p role="status" className="text-sm text-muted">
            {copy.ledgerEmpty}
          </p>
        ) : (
          <Card className="overflow-hidden p-0">
            <Table aria-label={copy.ledgerHeading}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{copy.colDate}</TableHead>
                  <TableHead>{copy.colType}</TableHead>
                  <TableHead>{copy.colQuantity}</TableHead>
                  <TableHead>{copy.colReason}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDate(m.occurredAt)}</TableCell>
                    <TableCell>
                      <Badge variant={MOVEMENT_TYPE_VARIANT[m.type]}>
                        {MOVEMENT_TYPE_LABEL[m.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{signedQuantity(m)}</TableCell>
                    <TableCell>{m.reason ?? copy.fallback}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
