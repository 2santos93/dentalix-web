'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Landmark, Lock, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  deletePayer,
  listPayers,
  updatePayer,
  type Payer,
} from '@/lib/payers/payers-api';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PayerFormModal } from './payer-form-modal';
import { PAYER_COUNTRY_LABELS, PAYER_NO_COUNTRY_LABEL, PAYER_TYPE_LABELS } from './payer-labels';

const copy = {
  newPayer: 'Nuevo pagador',
  count: (n: number) => (n === 1 ? '1 pagador' : `${n} pagadores`),
  empty: 'Todavía no hay pagadores.',
  emptyHint:
    'Crea las aseguradoras, EPS, mutuas o empresas con las que trabajas para registrar la cobertura de tus pacientes.',
  loadError: 'No pudimos cargar los pagadores.',
  forbiddenTitle: 'Solo administración gestiona los pagadores.',
  forbiddenHint: 'El resto del equipo los elige al registrar la cobertura de un paciente.',
  tableLabel: 'Pagadores',
  colName: 'Nombre',
  colType: 'Tipo',
  colCountry: 'País',
  colStatus: 'Estado',
  colActions: 'Acciones',
  active: 'Activo',
  inactive: 'Inactivo',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  remove: 'Retirar',
  actionFor: (action: string, name: string) => `${action} «${name}»`,
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
  removeTitle: (name: string) => `¿Retirar «${name}»?`,
  removeDescription:
    'Deja de aparecer aquí y en los selectores. No se puede retirar mientras algún paciente tenga una cobertura con este pagador.',
  removeConfirm: 'Retirar pagador',
  removeError: 'No pudimos retirar el pagador.',
};

interface PayersManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir). */
  allowed: boolean;
}

function countryLabel(payer: Payer): string {
  return payer.country ? PAYER_COUNTRY_LABELS[payer.country] : PAYER_NO_COUNTRY_LABEL;
}

/**
 * Gestión del catálogo de pagadores en /settings/pagadores (DX-153). Crear,
 * editar, desactivar (sale de los selectores) y retirar (borrado lógico; la API
 * lo rechaza con 409 si hay coberturas vivas).
 */
export function PayersManager({ token, allowed }: PayersManagerProps) {
  const [payers, setPayers] = useState<Payer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Payer | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Payer | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPayers(token, { includeInactive: true });
        if (cancelled) return;
        setPayers(data);
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

  function openModal(payer: Payer | null) {
    setEditing(payer);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: Payer) {
    setPayers((prev) => {
      const rest = prev.filter((t) => t.id !== saved.id);
      return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    });
  }

  async function toggleActive(payer: Payer) {
    setPendingId(payer.id);
    try {
      upsert(await updatePayer(token, payer.id, { active: !payer.active }));
    } catch {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(copy.toggleError(payer.name), { onRetry: () => void toggleActive(payer) });
    } finally {
      setPendingId(null);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await deletePayer(token, removing.id);
      setPayers((prev) => prev.filter((t) => t.id !== removing.id));
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  function actions(payer: Payer) {
    const toggleLabel = payer.active ? copy.deactivate : copy.activate;
    return (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="max-sm:h-11"
          onClick={() => openModal(payer)}
          aria-label={copy.actionFor(copy.edit, payer.name)}
        >
          {copy.edit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-sm:h-11"
          loading={pendingId === payer.id}
          onClick={() => void toggleActive(payer)}
          aria-label={copy.actionFor(toggleLabel, payer.name)}
        >
          {toggleLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-sm:h-11"
          onClick={() => {
            setRemoveError(null);
            setRemoving(payer);
          }}
          aria-label={copy.actionFor(copy.remove, payer.name)}
        >
          {copy.remove}
        </Button>
      </div>
    );
  }

  function status(payer: Payer) {
    return (
      <Badge variant={payer.active ? 'success' : 'muted'}>
        {payer.active ? copy.active : copy.inactive}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {loading || error ? '' : copy.count(payers.length)}
        </p>
        <Button type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
          <Plus aria-hidden />
          {copy.newPayer}
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={payers.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Landmark aria-hidden />}
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
                {copy.colType}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colCountry}
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
            {payers.map((p) => (
              <tr key={p.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">{PAYER_TYPE_LABELS[p.type]}</td>
                <td className="px-4 py-3">{countryLabel(p)}</td>
                <td className="px-4 py-3">{status(p)}</td>
                <td className="px-4 py-3">{actions(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {payers.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                {status(p)}
              </div>
              <p className="text-xs text-muted">
                {PAYER_TYPE_LABELS[p.type]} · {countryLabel(p)}
              </p>
              {actions(p)}
            </li>
          ))}
        </ul>
      </AsyncSection>

      <PayerFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        payer={editing}
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
      />
    </div>
  );
}
