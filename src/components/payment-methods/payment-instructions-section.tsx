'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  deletePaymentMethodInstructions,
  listPaymentMethodInstructions,
  type ClinicPaymentMethod,
  type PaymentMethodInstruction,
} from '@/lib/payments/payment-methods-api';
import { filledInstructionFields, PAYMENT_INSTRUCTION_LABELS } from '@/lib/payments/payment-instructions';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { AsyncSection } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SettingsSection } from '@/components/settings/settings-page';
import type { RowAction } from '@/components/shared/row-actions';
import {
  PaymentInstructionsFormModal,
  scopeLabel,
  type InstructionScopeChoice,
} from './payment-instructions-form-modal';

export const paymentInstructionsCopy = {
  title: 'Datos para pagar',
  description:
    'Lo que ve el paciente en su enlace de pago: titular, cuenta, teléfono… Por sede si cada una cobra en su cuenta; sin los suyos, una sede usa los de toda la clínica.',
  add: 'Añadir datos para pagar',
  empty: 'Ningún medio tiene datos para pagar.',
  emptyHint: 'Añádelos para que el paciente pueda pagar desde su enlace sin pedirlos por mensaje.',
  loadError: 'No pudimos cargar los datos para pagar.',
  tableLabel: 'Datos para pagar',
  colMethod: 'Medio',
  colScope: 'Para',
  colData: 'Datos',
  edit: 'Editar',
  remove: 'Eliminar',
  removeTitle: 'Eliminar estos datos para pagar',
  removeDescription: (method: string, scope: string) =>
    `«${method}» dejará de mostrar sus datos en los enlaces de ${scope === 'Toda la clínica' ? 'toda la clínica' : `la sede ${scope}`}. Los enlaces enviados se verán sin ellos.`,
  removeError: 'No pudimos eliminar los datos para pagar. Intenta de nuevo.',
  missingTitle: 'Permitidos en el enlace, pero sin datos para pagar',
  missing: (name: string) => `«${name}»: no se mostrará en el enlace hasta que tenga datos para pagar.`,
  readOnly: 'Solo administración los cambia.',
};
const copy = paymentInstructionsCopy;

type Row = { method: ClinicPaymentMethod; instruction: PaymentMethodInstruction };

interface PaymentInstructionsSectionProps {
  token: string;
  /** Todos los medios de la clínica (activos o no), ya cargados por el gestor. */
  methods: ClinicPaymentMethod[];
  /** Solo ADMIN escribe; quien cobra los ve. */
  canEdit: boolean;
}

/**
 * DX-569: los datos para pagar de cada medio, de toda la clínica o de una sede.
 * Avisa de los medios permitidos en el enlace de pago que no tienen ninguno:
 * la API no los ofrece al paciente hasta que los tengan.
 */
export function PaymentInstructionsSection({ token, methods, canEdit }: PaymentInstructionsSectionProps) {
  const locationsState = useLocationsState(token);
  const locations = locationsState.status === 'ready' ? locationsState.locations : [];
  const [byMethod, setByMethod] = useState<Record<string, PaymentMethodInstruction[]>>({});
  const [reloadKey, setReloadKey] = useState(0);
  // La carga de ESTA clave (medios + reintento); otra clave aún es «cargando».
  const [loaded, setLoaded] = useState<{ key: string; error: string | null } | null>(null);
  const [modal, setModal] = useState<{ open: boolean; key: number; editing: Row | null }>({
    open: false,
    key: 0,
    editing: null,
  });
  const [removing, setRemoving] = useState<Row | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const methodIds = methods.map((m) => m.id).join(',');
  const loadKey = `${token}|${methodIds}|${reloadKey}`;
  const loading = loaded?.key !== loadKey;
  const error = loading ? null : (loaded?.error ?? null);

  useEffect(() => {
    let cancelled = false;
    const ids = methodIds ? methodIds.split(',') : [];
    Promise.all(ids.map(async (id) => [id, await listPaymentMethodInstructions(token, id)] as const))
      .then((entries) => {
        if (cancelled) return;
        setByMethod(Object.fromEntries(entries));
        setLoaded({ key: loadKey, error: null });
      })
      .catch((err) => {
        if (!cancelled) setLoaded({ key: loadKey, error: apiErrorMessage(err, copy.loadError) });
      });
    return () => {
      cancelled = true;
    };
  }, [token, methodIds, loadKey]);

  const rows: Row[] = methods.flatMap((method) =>
    (byMethod[method.id] ?? [])
      .slice()
      .sort((a, b) => (a.locationId === null ? -1 : b.locationId === null ? 1 : 0))
      .map((instruction) => ({ method, instruction })),
  );

  const missing = loading || error
    ? []
    : methods.filter((m) => m.active && m.allowInPaymentLink && (byMethod[m.id] ?? []).length === 0);

  const activeLocationIds = locations.filter((l) => l.isActive).map((l) => l.id);
  const choices: InstructionScopeChoice[] = methods
    .filter((m) => m.active)
    .map((method) => {
      const taken = new Set((byMethod[method.id] ?? []).map((i) => i.locationId ?? ''));
      return { method, scopes: ['', ...activeLocationIds].filter((s) => !taken.has(s)) };
    })
    .filter((c) => c.scopes.length > 0);

  function upsert(paymentMethodId: string, saved: PaymentMethodInstruction) {
    setByMethod((prev) => ({
      ...prev,
      [paymentMethodId]: [
        ...(prev[paymentMethodId] ?? []).filter((i) => (i.locationId ?? '') !== (saved.locationId ?? '')),
        saved,
      ],
    }));
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await deletePaymentMethodInstructions(token, removing.method.id, removing.instruction.id);
      const { method, instruction } = removing;
      setByMethod((prev) => ({
        ...prev,
        [method.id]: (prev[method.id] ?? []).filter((i) => i.id !== instruction.id),
      }));
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  const columns: DataListColumn<Row>[] = [
    {
      id: 'method',
      header: copy.colMethod,
      mobile: 'primary',
      cell: (r) => <span className="font-medium text-ink">{r.method.name}</span>,
    },
    { id: 'scope', header: copy.colScope, mobile: 'trailing', cell: (r) => scopeLabel(r.instruction.locationId, locations) },
    {
      id: 'data',
      header: copy.colData,
      cell: (r) => (
        <span className="break-words">
          {filledInstructionFields(r.instruction)
            .map(({ field, value }) => `${PAYMENT_INSTRUCTION_LABELS[field]}: ${value}`)
            .join(' · ')}
        </span>
      ),
    },
  ];

  const rowActions = (r: Row): RowAction[] => [
    {
      label: copy.edit,
      icon: <Pencil aria-hidden />,
      onSelect: () => setModal((p) => ({ open: true, key: p.key + 1, editing: r })),
    },
    {
      label: copy.remove,
      icon: <Trash2 aria-hidden />,
      destructive: true,
      separatorBefore: true,
      onSelect: () => {
        setRemoveError(null);
        setRemoving(r);
      },
    },
  ];

  return (
    <SettingsSection id="payment-instructions-title" title={copy.title} description={copy.description}>
      {canEdit ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !!error || choices.length === 0}
            onClick={() => setModal((p) => ({ open: true, key: p.key + 1, editing: null }))}
            className="w-full max-sm:min-h-11 sm:w-auto"
          >
            <Plus aria-hidden />
            {copy.add}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">{copy.readOnly}</p>
      )}
      {missing.length > 0 ? (
        <Callout tone="warning" title={copy.missingTitle} data-testid="payment-instructions-missing">
          <ul className="flex flex-col gap-1">
            {missing.map((m) => (
              <li key={m.id}>{copy.missing(m.name)}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={rows.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Landmark aria-hidden />}
      >
        <DataList
          label={copy.tableLabel}
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.instruction.id}
          getRowLabel={(r) => `${r.method.name} · ${scopeLabel(r.instruction.locationId, locations)}`}
          onRowClick={canEdit ? (r) => setModal((p) => ({ open: true, key: p.key + 1, editing: r })) : undefined}
          rowActions={canEdit ? rowActions : undefined}
        />
      </AsyncSection>
      {canEdit ? (
        <>
          <PaymentInstructionsFormModal
            key={`pmi-${modal.key}`}
            open={modal.open}
            onOpenChange={(open) => setModal((p) => ({ ...p, open }))}
            token={token}
            editing={modal.editing}
            choices={choices}
            locations={locations}
            onSaved={upsert}
          />
          <ConfirmDialog
            open={removing !== null}
            onOpenChange={(open) => {
              if (!open) setRemoving(null);
            }}
            title={copy.removeTitle}
            description={
              removing
                ? copy.removeDescription(removing.method.name, scopeLabel(removing.instruction.locationId, locations))
                : undefined
            }
            confirmLabel={copy.remove}
            confirming={removeBusy}
            error={removeError}
            onConfirm={() => void confirmRemove()}
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
