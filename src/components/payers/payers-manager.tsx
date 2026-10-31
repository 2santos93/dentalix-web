'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
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
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { PayerFormModal } from './payer-form-modal';
import { payerTypeLabel } from './payer-labels';

const copy = {
  newPayer: 'Nuevo pagador',
  count: (n: number) => (n === 1 ? '1 pagador' : `${n} pagadores`),
  empty: 'Todavía no hay pagadores.',
  emptyHint:
    'Crea las aseguradoras, planes prepago, sistemas públicos o empresas con las que trabajas para registrar la cobertura de tus pacientes.',
  loadError: 'No pudimos cargar los pagadores.',
  forbiddenTitle: 'Solo administración gestiona los pagadores.',
  forbiddenHint: 'El resto del equipo los elige al registrar la cobertura de un paciente.',
  tableLabel: 'Pagadores',
  colName: 'Nombre',
  colType: 'Tipo',
  inactive: 'Inactivo',
  deactivate: 'Desactivar',
  activate: 'Reactivar',
  remove: 'Retirar',
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

/**
 * Gestión del catálogo de pagadores en /settings/pagadores (DX-153). Crear,
 * editar, desactivar (sale de los selectores) y retirar (borrado lógico; la API
 * lo rechaza con 409 si hay coberturas vivas). La fila abre la edición; el
 * resto de acciones van en su «⋯».
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
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const removedRef = useRef(false);
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
      removedRef.current = true;
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  function rowActions(payer: Payer): RowAction[] {
    const busy = pendingId === payer.id;
    return [
      {
        label: payer.active ? copy.deactivate : copy.activate,
        onSelect: () => void toggleActive(payer),
        disabled: busy,
      },
      {
        label: copy.remove,
        destructive: true,
        separatorBefore: true,
        disabled: busy,
        onSelect: () => {
          setRemoveError(null);
          setRemoving(payer);
        },
      },
    ];
  }

  const columns: DataListColumn<Payer>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      // El estado solo se pinta cuando es la excepción: un «Activo» verde en
      // cada fila no dice nada (critique-settings, pagadores P2).
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">{p.name}</span>
          {p.active ? null : <Badge variant="neutral">{copy.inactive}</Badge>}
        </span>
      ),
    },
    { id: 'type', header: copy.colType, cell: (p) => payerTypeLabel(p.type) },
  ];

  const isEmpty = !loading && !error && payers.length === 0;
  const newButton = (
    <Button ref={newButtonRef} type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
      <Plus aria-hidden />
      {copy.newPayer}
    </Button>
  );

  return (
    <div className="flex max-w-[720px] flex-col gap-3">
      {/* Lista vacía: sin «0 pagadores» y la acción dentro del estado vacío. */}
      {isEmpty ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="t-body text-muted" aria-live="polite">
            {loading || error ? '' : copy.count(payers.length)}
          </p>
          {newButton}
        </div>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={payers.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Landmark aria-hidden />}
        emptyAction={newButton}
      >
        <DataList
          label={copy.tableLabel}
          rows={payers}
          columns={columns}
          getRowKey={(p) => p.id}
          onRowClick={(p) => openModal(p)}
          rowActions={rowActions}
          getRowLabel={(p) => p.name}
        />
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
        onCloseAutoFocus={(event) => {
          // La fila retirada ya no existe: el foco pasa a «Nuevo pagador».
          if (!removedRef.current) return;
          removedRef.current = false;
          event.preventDefault();
          newButtonRef.current?.focus();
        }}
      />
    </div>
  );
}
