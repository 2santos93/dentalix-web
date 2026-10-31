'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Lock, Plus, Wallet } from 'lucide-react';
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
  colActions: 'Acciones',
  requiresReference: 'Pide referencia',
  noReference: 'Opcional',
  active: 'Activo',
  inactive: 'Inactivo',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  actionFor: (action: string, name: string) => `${action} «${name}»`,
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

  function actions(method: ClinicPaymentMethod) {
    const toggleLabel = method.active ? copy.deactivate : copy.activate;
    return (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => openModal(method)}
          aria-label={copy.actionFor(copy.edit, method.name)}
          className="max-sm:h-11 max-sm:flex-1"
        >
          {copy.edit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={pendingId === method.id}
          onClick={() => void toggleActive(method)}
          aria-label={copy.actionFor(toggleLabel, method.name)}
          className="max-sm:h-11 max-sm:flex-1"
        >
          {toggleLabel}
        </Button>
      </div>
    );
  }

  const status = (method: ClinicPaymentMethod) => (
    <Badge variant={method.active ? 'success' : 'muted'}>
      {method.active ? copy.active : copy.inactive}
    </Badge>
  );
  const reference = (method: ClinicPaymentMethod) =>
    method.requiresReference ? copy.requiresReference : copy.noReference;

  return (
    <section aria-labelledby="payment-methods-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="payment-methods-title" className="t-title text-ink">
          {copy.title}
        </h2>
        <p className="text-sm text-muted">{copy.description}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {loading || error ? '' : copy.count(methods.length)}
        </p>
        <Button type="button" onClick={() => openModal(null)} className="w-full max-sm:h-11 sm:w-auto">
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
                {copy.colKind}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colReference}
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
            {methods.map((m) => (
              <tr key={m.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3">{PAYMENT_METHOD_KIND_LABELS[m.kind]}</td>
                <td className="px-4 py-3">{reference(m)}</td>
                <td className="px-4 py-3">{status(m)}</td>
                <td className="px-4 py-3">{actions(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {methods.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{m.name}</span>
                {status(m)}
              </div>
              <p className="text-xs text-muted">
                {PAYMENT_METHOD_KIND_LABELS[m.kind]} · {reference(m)}
              </p>
              {actions(m)}
            </li>
          ))}
        </ul>
      </AsyncSection>

      <PaymentMethodFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        method={editing}
        onSaved={upsert}
      />
    </section>
  );
}
