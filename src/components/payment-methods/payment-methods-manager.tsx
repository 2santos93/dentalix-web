'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Lock, Pencil, Percent, Plus, Power, PowerOff, Wallet } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  PAYMENT_METHOD_KIND_LABELS,
  listPaymentMethods,
  updatePaymentAdjustment,
  updatePaymentMethod,
  type ClinicPaymentMethod,
  type PaymentMethodAdjustment,
} from '@/lib/payments/payment-methods-api';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SettingsSection } from '@/components/settings/settings-page';
import type { RowAction } from '@/components/shared/row-actions';
import { PaymentMethodFormModal } from './payment-method-form-modal';
import { PaymentAdjustmentFormModal } from './payment-adjustment-form-modal';
import { PAYMENT_ADJUSTMENT_TYPE_LABELS, adjustmentCalculationText } from '@/lib/payments/payment-adjustments';

export const paymentMethodsCopy = {
  title: 'Medios de pago',
  description:
    'Los medios con que la clínica cobra. Recepción elige uno activo al registrar un abono; los que piden referencia la exigen y la caja avisa si se repite.',
  newMethod: 'Nuevo medio',
  count: (n: number) => (n === 1 ? '1 medio de pago' : `${n} medios de pago`),
  empty: 'Todavía no hay medios de pago.',
  emptyHint: 'Crea los medios con que cobra la clínica.',
  loadError: 'No pudimos cargar los medios de pago.',
  forbiddenTitle: 'Solo administración gestiona los medios de pago.',
  forbiddenHint: 'El resto del equipo los elige al registrar un abono.',
  tableLabel: 'Medios de pago',
  colName: 'Medio',
  colKind: 'Tipo base',
  colReference: 'Referencia',
  colStatus: 'Estado',
  requiresReference: 'Pide referencia',
  noReference: 'Opcional',
  active: 'Activo',
  inactive: 'Inactivo',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
  // DX-516: ajustes por medio de pago.
  colAdjustments: 'Ajustes',
  noAdjustments: 'Ninguno',
  adjustmentsCount: (n: number) => (n === 1 ? '1 ajuste' : `${n} ajustes`),
  adjustmentsTitle: 'Ajustes por medio de pago',
  adjustmentsDescription:
    'Impuestos, recargos o descuentos que se calculan sobre cada abono con ese medio. Los impuestos y recargos se cobran aparte del tratamiento; los descuentos cuentan como abono.',
  newAdjustment: 'Nuevo ajuste',
  adjustmentsEmpty: 'Ningún medio de pago tiene ajustes.',
  adjustmentsEmptyHint:
    'Crea uno solo si la clínica cobra un impuesto, un recargo o hace un descuento según el medio de pago.',
  adjustmentsTableLabel: 'Ajustes por medio de pago',
  colAdjustment: 'Ajuste',
  colAdjustmentMethod: 'Medio',
  colAdjustmentType: 'Tipo',
  colAdjustmentCalculation: 'Cálculo',
  adjustmentToggleError: (label: string) => `No pudimos cambiar el estado de «${label}».`,
};

type AdjustmentRow = { method: ClinicPaymentMethod; adjustment: PaymentMethodAdjustment };
const copy = paymentMethodsCopy;

interface PaymentMethodsManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir). */
  allowed: boolean;
}

/**
 * Catálogo de medios de pago en Ajustes › Caja (DX-377): crear, editar y
 * activar o desactivar. No se borran: los abonos anteriores los conservan.
 */
export function PaymentMethodsManager({ token, allowed }: PaymentMethodsManagerProps) {
  const [methods, setMethods] = useState<ClinicPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<ClinicPaymentMethod | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [adjustmentModal, setAdjustmentModal] = useState<{ open: boolean; key: number; editing: AdjustmentRow | null }>(
    { open: false, key: 0, editing: null },
  );

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPaymentMethods(token, { includeInactive: true });
        if (cancelled) return;
        setMethods(data);
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

  function openModal(method: ClinicPaymentMethod | null) {
    setEditing(method);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: ClinicPaymentMethod) {
    setMethods((prev) =>
      [...prev.filter((m) => m.id !== saved.id), saved].sort((a, b) =>
        a.name.localeCompare(b.name, 'es'),
      ),
    );
  }

  async function toggleActive(method: ClinicPaymentMethod) {
    setPendingId(method.id);
    try {
      upsert(await updatePaymentMethod(token, method.id, { active: !method.active }));
    } catch {
      notifyError(copy.toggleError(method.name), {
        onRetry: () => void toggleActive(method),
      });
    } finally {
      setPendingId(null);
    }
  }

  function rowActions(method: ClinicPaymentMethod): RowAction[] {
    // Mientras su cambio de estado va en vuelo, la fila no ofrece otro.
    const busy = pendingId === method.id;
    return [
      { label: copy.edit, icon: <Pencil aria-hidden />, onSelect: () => openModal(method) },
      method.active
        ? {
            label: copy.deactivate,
            icon: <PowerOff aria-hidden />,
            destructive: true,
            separatorBefore: true,
            disabled: busy,
            onSelect: () => void toggleActive(method),
          }
        : {
            label: copy.activate,
            icon: <Power aria-hidden />,
            separatorBefore: true,
            disabled: busy,
            onSelect: () => void toggleActive(method),
          },
    ];
  }

  // DX-516: un ajuste guardado reemplaza (o se añade a) los de su medio.
  function upsertAdjustment(paymentMethodId: string, saved: PaymentMethodAdjustment) {
    setMethods((prev) =>
      prev.map((m) =>
        m.id === paymentMethodId
          ? {
              ...m,
              adjustments: m.adjustments.some((a) => a.id === saved.id)
                ? m.adjustments.map((a) => (a.id === saved.id ? saved : a))
                : [...m.adjustments, saved],
            }
          : m,
      ),
    );
  }

  function openAdjustment(editing: AdjustmentRow | null) {
    setAdjustmentModal((prev) => ({ open: true, key: prev.key + 1, editing }));
  }

  async function toggleAdjustment(row: AdjustmentRow) {
    setPendingId(row.adjustment.id);
    try {
      upsertAdjustment(
        row.method.id,
        await updatePaymentAdjustment(token, row.method.id, row.adjustment.id, { active: !row.adjustment.active }),
      );
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.adjustmentToggleError(row.adjustment.label)), {
        onRetry: () => void toggleAdjustment(row),
      });
    } finally {
      setPendingId(null);
    }
  }

  const adjustmentRows: AdjustmentRow[] = methods.flatMap((method) =>
    method.adjustments.map((adjustment) => ({ method, adjustment })),
  );

  function adjustmentActions(row: AdjustmentRow): RowAction[] {
    const busy = pendingId === row.adjustment.id;
    return [
      { label: copy.edit, icon: <Pencil aria-hidden />, onSelect: () => openAdjustment(row) },
      row.adjustment.active
        ? {
            label: copy.deactivate,
            icon: <PowerOff aria-hidden />,
            destructive: true,
            separatorBefore: true,
            disabled: busy,
            onSelect: () => void toggleAdjustment(row),
          }
        : {
            label: copy.activate,
            icon: <Power aria-hidden />,
            separatorBefore: true,
            disabled: busy,
            onSelect: () => void toggleAdjustment(row),
          },
    ];
  }

  const adjustmentColumns: DataListColumn<AdjustmentRow>[] = [
    { id: 'label', header: copy.colAdjustment, mobile: 'primary', cell: (r) => <span className="font-medium text-ink">{r.adjustment.label}</span> },
    { id: 'method', header: copy.colAdjustmentMethod, cell: (r) => r.method.name },
    { id: 'type', header: copy.colAdjustmentType, cell: (r) => PAYMENT_ADJUSTMENT_TYPE_LABELS[r.adjustment.type] },
    { id: 'calculation', header: copy.colAdjustmentCalculation, cell: (r) => <span className="tabular-nums">{adjustmentCalculationText(r.adjustment)}</span> },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (r) => (
        <Badge variant={r.adjustment.active ? 'success' : 'neutral'} dot>
          {r.adjustment.active ? copy.active : copy.inactive}
        </Badge>
      ),
    },
  ];

  const reference = (method: ClinicPaymentMethod) =>
    method.requiresReference ? copy.requiresReference : copy.noReference;

  const columns: DataListColumn<ClinicPaymentMethod>[] = [
    { id: 'name', header: copy.colName, mobile: 'primary', cell: (m) => <span className="font-medium text-ink">{m.name}</span> },
    { id: 'kind', header: copy.colKind, cell: (m) => PAYMENT_METHOD_KIND_LABELS[m.kind] },
    { id: 'reference', header: copy.colReference, cell: reference },
    {
      id: 'adjustments',
      header: copy.colAdjustments,
      cell: (m) => {
        const live = m.adjustments.filter((a) => a.active).length;
        return live === 0 ? <span className="text-muted">{copy.noAdjustments}</span> : copy.adjustmentsCount(live);
      },
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      // Activo / Inactivo es un estado del medio (no su categoría): tono del vocabulario común.
      cell: (m) => (
        <Badge variant={m.active ? 'success' : 'neutral'} dot>
          {m.active ? copy.active : copy.inactive}
        </Badge>
      ),
    },
  ];

  return (
    <>
    <SettingsSection id="payment-methods-title" title={copy.title} description={copy.description}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {loading || error ? '' : copy.count(methods.length)}
        </p>
        {/* Secundaria: los medios son un catálogo de apoyo dentro de Ajustes › Caja. */}
        <Button type="button" variant="secondary" onClick={() => openModal(null)} className="w-full max-sm:min-h-11 sm:w-auto">
          <Plus aria-hidden />
          {copy.newMethod}
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={methods.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Wallet aria-hidden />}
      >
        <DataList
          label={copy.tableLabel}
          rows={methods}
          columns={columns}
          getRowKey={(m) => m.id}
          getRowLabel={(m) => m.name}
          onRowClick={(m) => openModal(m)}
          rowActions={rowActions}
        />
      </AsyncSection>

      <PaymentMethodFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        method={editing}
        onSaved={upsert}
      />
    </SettingsSection>

    {/* DX-516: impuestos, recargos y descuentos por medio de pago (ninguno por
        defecto). Si los medios no cargan, el error y su reintento ya están arriba. */}
    {error ? null : (
    <SettingsSection id="payment-adjustments-title" title={copy.adjustmentsTitle} description={copy.adjustmentsDescription}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          disabled={loading || methods.length === 0}
          onClick={() => openAdjustment(null)}
          className="w-full max-sm:min-h-11 sm:w-auto"
        >
          <Plus aria-hidden />
          {copy.newAdjustment}
        </Button>
      </div>
      <AsyncSection
        loading={loading}
        error={null}
        isEmpty={adjustmentRows.length === 0}
        emptyTitle={copy.adjustmentsEmpty}
        emptyDescription={copy.adjustmentsEmptyHint}
        emptyIcon={<Percent aria-hidden />}
      >
        <DataList
          label={copy.adjustmentsTableLabel}
          rows={adjustmentRows}
          columns={adjustmentColumns}
          getRowKey={(r) => r.adjustment.id}
          getRowLabel={(r) => `${r.adjustment.label} · ${r.method.name}`}
          onRowClick={(r) => openAdjustment(r)}
          rowActions={adjustmentActions}
        />
      </AsyncSection>
      <PaymentAdjustmentFormModal
        key={`adj-${adjustmentModal.key}`}
        open={adjustmentModal.open}
        onOpenChange={(open) => setAdjustmentModal((prev) => ({ ...prev, open }))}
        token={token}
        methods={methods}
        editing={adjustmentModal.editing}
        onSaved={upsertAdjustment}
      />
    </SettingsSection>
    )}
    </>
  );
}
