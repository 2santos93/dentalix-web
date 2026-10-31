'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Power, PowerOff, Wallet } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  PAYMENT_METHOD_KIND_LABELS,
  listPaymentMethods,
  updatePaymentMethod,
  type ClinicPaymentMethod,
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
};
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

  const reference = (method: ClinicPaymentMethod) =>
    method.requiresReference ? copy.requiresReference : copy.noReference;

  const columns: DataListColumn<ClinicPaymentMethod>[] = [
    { id: 'name', header: copy.colName, mobile: 'primary', cell: (m) => <span className="font-medium text-ink">{m.name}</span> },
    { id: 'kind', header: copy.colKind, cell: (m) => PAYMENT_METHOD_KIND_LABELS[m.kind] },
    { id: 'reference', header: copy.colReference, cell: reference },
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
    <SettingsSection id="payment-methods-title" title={copy.title} description={copy.description}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {loading || error ? '' : copy.count(methods.length)}
        </p>
        {/* Secundaria: los medios son un catálogo de apoyo dentro de Ajustes › Caja. */}
        <Button type="button" variant="secondary" onClick={() => openModal(null)} className="w-full max-sm:h-11 sm:w-auto">
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
  );
}
