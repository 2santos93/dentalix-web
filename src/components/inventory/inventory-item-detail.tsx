'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  recordInventoryMovement,
  type InventoryItem as InventoryItemDetailData,
  type InventoryMovement,
  type InventoryMovementType,
} from '@/lib/inventory/inventory-api';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { DescriptionList, DescriptionItem } from '@/components/ui/description-list';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { formatDate } from '@/lib/format/date';
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_VARIANT, signedQuantity } from '@/components/inventory/movement-format';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Detalle del insumo',
  back: 'Inventario',
  loading: 'Cargando insumo…',
  // Sin "Intenta de nuevo." — `SectionError` trae su propio botón.
  genericLoadError: 'No pudimos cargar el insumo.',
  forbidden: 'No tienes permiso para ver el inventario.',
  stockLabel: 'Stock actual',
  minStockLabel: 'Stock mínimo',
  unitLabel: 'Unidad',
  skuLabel: 'SKU',
  notesLabel: 'Notas',
  fallback: '—',
  editCta: 'Editar',
  deleteCta: 'Eliminar',
  save: 'Guardar',
  nameLabel: 'Nombre',
  genericUpdateError: 'No pudimos actualizar el insumo. Intenta de nuevo.',
  editTitle: 'Editar insumo',
  deleteTitle: 'Eliminar insumo',
  deleteDescription: (name: string) =>
    `${name} dejará de aparecer en el inventario. Sus movimientos quedan registrados.`,
  deleteConfirmYes: 'Sí, eliminar',
  genericDeleteError: 'No pudimos eliminar el insumo. Intenta de nuevo.',
  // Movement form
  movementHeading: 'Registrar movimiento',
  typeLabel: 'Tipo',
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

const LEDGER_COLUMNS: DataListColumn<InventoryMovement>[] = [
  { id: 'date', header: copy.colDate, cell: (m) => <span className="tabular-nums">{formatDate(m.occurredAt)}</span> },
  {
    id: 'type',
    header: copy.colType,
    mobile: 'primary',
    cell: (m) => <Badge variant={MOVEMENT_TYPE_VARIANT[m.type]}>{MOVEMENT_TYPE_LABELS[m.type]}</Badge>,
  },
  { id: 'quantity', header: copy.colQuantity, numeric: true, mobile: 'trailing', cell: (m) => signedQuantity(m) },
  {
    id: 'reason',
    header: copy.colReason,
    cell: (m) => <span className="text-muted">{m.reason ?? copy.fallback}</span>,
    mobileCell: (m) => m.reason ?? null,
  },
];

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
export function InventoryItem({ token, id }: InventoryItemDetailProps) {
  const router = useRouter();
  const [item, setItem] = useState<InventoryItemDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Movement form
  const [mType, setMType] = useState<InventoryMovementType>('IN');
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

  // Delete (ConfirmDialog)
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getInventoryItem(token, id);
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
          setLoadError(apiErrorMessage(err, copy.genericLoadError));
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
    return getInventoryItem(token, id)
      .then((data) => {
        setItem(data);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(apiErrorMessage(err, copy.genericLoadError));
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
      await updateInventoryItem(token, id, {
        name: eName,
        unit: eUnit,
        sku: eSku.trim() || null,
        minStock: Number(eMinStock),
        notes: eNotes.trim() || null,
      });
      setShowEdit(false);
      await refreshInPlace();
    } catch (err) {
      setEditError(apiErrorMessage(err, copy.genericUpdateError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteInventoryItem(token, id);
      router.push('/inventory');
    } catch (err) {
      setDeleteError(apiErrorMessage(err, copy.genericDeleteError));
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
      await recordInventoryMovement(token, id, {
        type: mType,
        quantity: qty,
        reason: mReason.trim() || undefined,
      });
      setMQty('');
      setMReason('');
      await refreshInPlace();
    } catch (err) {
      setMoveError(apiErrorMessage(err, copy.genericMovementError));
    } finally {
      setRecording(false);
    }
  }

  const back = { href: '/inventory', label: copy.back };

  if (loading) {
    return (
      <>
        <PageHeader title={copy.title} back={back} />
        <p role="status" className="text-sm text-muted">
          {copy.loading}
        </p>
      </>
    );
  }

  if (forbidden) {
    return (
      <>
        <PageHeader title={copy.title} back={back} />
        <p role="status" className="text-sm text-muted">
          {copy.forbidden}
        </p>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <PageHeader title={copy.title} back={back} />
        <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      </>
    );
  }

  if (!item) return null;

  // `movements` es opcional en el DTO (el listado devuelve el ítem pelado);
  // en el detalle siempre viene, pero el ledger vacío es un caso legítimo.
  const movements = [...(item.movements ?? [])].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return (
    <>
      {/* La acción primaria de la ficha es «Registrar» (el gesto frecuente);
          editar y eliminar son secundarias de la cabecera. */}
      <PageHeader
        title={item.name}
        back={back}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={openEdit}>
              <Pencil /> {copy.editCta}
            </Button>
            <Button
              type="button"
              variant="destructive-ghost"
              onClick={() => {
                setDeleteError(null);
                setConfirmingDelete(true);
              }}
            >
              <Trash2 /> {copy.deleteCta}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-8">
        <DescriptionList columns={3}>
          <DescriptionItem label={copy.stockLabel} numeric>
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>
                {item.stock ?? copy.fallback} <span className="text-muted">{item.unit}</span>
              </span>
              {item.lowStock ? (
<StatusBadge kind="inventoryStock" status="LOW" />
              ) : null}
            </span>
          </DescriptionItem>
          <DescriptionItem label={copy.minStockLabel} numeric>
            {item.minStock} <span className="text-muted">{item.unit}</span>
          </DescriptionItem>
          <DescriptionItem label={copy.skuLabel}>
            {item.sku ? <span className="t-id">{item.sku}</span> : copy.fallback}
          </DescriptionItem>
          {item.notes ? (
            <DescriptionItem label={copy.notesLabel} wide>
              {item.notes}
            </DescriptionItem>
          ) : null}
        </DescriptionList>

        <section className="flex max-w-2xl flex-col gap-3" aria-labelledby="inventory-movement-heading">
          <SectionHeader title={copy.movementHeading} titleId="inventory-movement-heading" />
          <Card className="p-4 sm:p-6">
            <form onSubmit={handleRecord} aria-label={copy.movementHeading} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField htmlFor="movement-type" label={copy.typeLabel}>
                  <NativeSelect
                    id="movement-type"
                    value={mType}
                    onChange={(e) => setMType(e.target.value as InventoryMovementType)}
                  >
                    <option value="IN">{MOVEMENT_TYPE_LABELS.IN}</option>
                    <option value="OUT">{MOVEMENT_TYPE_LABELS.OUT}</option>
                    <option value="ADJUSTMENT">{MOVEMENT_TYPE_LABELS.ADJUSTMENT}</option>
                  </NativeSelect>
                </FormField>
                <FormField htmlFor="movement-qty" label={copy.quantityLabel}>
                  <Input
                    id="movement-qty"
                    type="number"
                    inputMode="decimal"
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
              {moveError && <InlineError>{moveError}</InlineError>}
              <Button type="submit" disabled={recording} className="max-sm:w-full sm:self-start">
                {recording ? copy.recording : copy.record}
              </Button>
            </form>
          </Card>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="inventory-ledger-heading">
          <SectionHeader title={copy.ledgerHeading} titleId="inventory-ledger-heading" />
          {movements.length === 0 ? (
            <p role="status" className="text-sm text-muted">
              {copy.ledgerEmpty}
            </p>
          ) : (
            <DataList
              label={copy.ledgerHeading}
              rows={movements}
              columns={LEDGER_COLUMNS}
              getRowKey={(m) => m.id}
            />
          )}
        </section>
      </div>

      <FormModal
        open={showEdit}
        onOpenChange={(next) => {
          if (!saving) setShowEdit(next);
        }}
        title={copy.editTitle}
        onSubmit={handleEditSubmit}
        submitLabel={copy.save}
        submitting={saving}
        error={editError}
        size="lg"
        touchTargets
      >
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
            <Input
              id="edit-min"
              type="number"
              inputMode="decimal"
              step="0.001"
              min={0}
              value={eMinStock}
              onChange={(e) => setEMinStock(e.target.value)}
            />
          </FormField>
        </div>
        <FormField htmlFor="edit-notes" label={copy.notesLabel}>
          <Textarea id="edit-notes" rows={3} autoGrow value={eNotes} onChange={(e) => setENotes(e.target.value)} />
        </FormField>
      </FormModal>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={(next) => {
          if (!next && !deleting) {
            setConfirmingDelete(false);
            setDeleteError(null);
          }
        }}
        title={copy.deleteTitle}
        description={copy.deleteDescription(item.name)}
        confirmLabel={copy.deleteConfirmYes}
        confirming={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </>
  );
}
