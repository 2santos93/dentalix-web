'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Handshake, Lock, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  deleteAgreement,
  listAgreements,
  updateAgreement,
  type Agreement,
} from '@/lib/agreements/agreements-api';
import { listPayers, type Payer } from '@/lib/payers/payers-api';
import { isExternalPayer } from '@/lib/payers/payer-type';
import { listPriceLists, type PriceList } from '@/lib/price-lists/price-lists-api';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { notifyError } from '@/components/errors/notify';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { AgreementFormModal } from './agreement-form-modal';

/**
 * SEC-047: un convenio de pagador OTHER solo lo asigna ADMIN. El relleno de
 * DX-153 creó pagadores OTHER para aseguradoras reales: aviso para reclasificar.
 */
function InternalPayerNote({ agreement }: { agreement: Agreement }) {
  if (isExternalPayer(agreement.payer.type)) return null;
  return (
    <span className="mt-1 flex items-start gap-1.5 t-caption font-normal text-warning-text">
      <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{copy.internalPayer}</span>
    </span>
  );
}

const copy = {
  newAgreement: 'Nuevo convenio',
  count: (n: number) => (n === 1 ? '1 convenio' : `${n} convenios`),
  empty: 'Todavía no hay convenios.',
  emptyHint:
    'Crea un convenio con un pagador para aplicar un descuento o una lista de precios a sus pacientes.',
  loadError: 'No pudimos cargar los convenios.',
  forbiddenTitle: 'Solo administración gestiona los convenios.',
  forbiddenHint: 'El resto del equipo los asigna al paciente desde su ficha.',
  tableLabel: 'Convenios',
  internalPayer:
    'Solo un administrador podrá asignarlo. Si es una aseguradora o una empresa, reclasifica el pagador.',
  colName: 'Convenio',
  colCondition: 'Condición',
  colLocation: 'Sede',
  colValidity: 'Vigencia',
  colPatients: 'Pacientes',
  wholeClinic: 'Toda la clínica',
  unknownLocation: 'Sede',
  noLimit: 'Sin límite',
  /** Fechas con el formato de la sede (DX-378); sin él, «—». */
  validity: (from: string | null, to: string | null, fmt: RegionalFormat | null) => {
    const day = (d: string) => (fmt ? fmt.civilDate(d) : NO_SEDE_FORMAT);
    if (from && to) return `${day(from)} – ${day(to)}`;
    if (from) return `Desde ${day(from)}`;
    if (to) return `Hasta ${day(to)}`;
    return copy.noLimit;
  },
  byCategory: (n: number) => (n === 1 ? '1 categoría con porcentaje propio' : `${n} categorías con porcentaje propio`),
  /** El tipo va dicho en la condición: «15 % de descuento» o «Lista: …». */
  percentCondition: (percent: string) => `${percent} de descuento`,
  listCondition: (name: string) => `Lista: ${name}`,
  patients: (n: number) => (n === 1 ? '1 paciente' : `${n} pacientes`),
  inactive: 'Inactivo',
  deactivate: 'Desactivar',
  activate: 'Reactivar',
  remove: 'Retirar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
  removeTitle: (name: string) => `¿Retirar «${name}»?`,
  removeDescription:
    'Deja de aparecer aquí y de aplicarse. No se puede retirar mientras tenga pacientes asignados; en ese caso, desactívalo.',
  /** La consecuencia, con el número: lo que decide si retirar es posible. */
  removeWithPatients: (n: number) =>
    `${n === 1 ? 'Tiene 1 paciente asignado' : `Tiene ${n} pacientes asignados`}: no se puede retirar mientras los tenga. Desactívalo para que deje de aplicarse.`,
  removeConfirm: 'Retirar convenio',
  removeError: 'No pudimos retirar el convenio.',
};

interface AgreementsManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol para escribir). */
  allowed: boolean;
}

interface Lookups {
  payers: Payer[];
  priceLists: PriceList[];
  categories: string[];
  locations: ClinicLocation[];
}

/** Categorías distintas de los procedimientos del catálogo, ordenadas. */
function distinctCategories(items: { category: string | null }[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const category = item.category?.trim();
    if (category) set.add(category);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Gestión de convenios en /settings/convenios (DX-105). Crear, editar,
 * desactivar (deja de fijar precios) y retirar (la API responde 409 si hay
 * pacientes asignados). La fila abre la edición; el resto va en su «⋯».
 */
export function AgreementsManager({ token, allowed }: AgreementsManagerProps) {
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [lookups, setLookups] = useState<Lookups>({
    payers: [],
    priceLists: [],
    categories: [],
    locations: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Agreement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Agreement | null>(null);
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
        const [data, payers, priceLists, catalog, locations] = await Promise.all([
          listAgreements(token, { includeInactive: true }),
          listPayers(token),
          listPriceLists(token),
          listCatalogItems(token, { kind: 'PROCEDURE' }),
          listLocations(token),
        ]);
        if (cancelled) return;
        setAgreements(data);
        setLookups({ payers, priceLists, categories: distinctCategories(catalog), locations });
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

  function locationLabel(a: Agreement): string {
    if (a.locationId === null) return copy.wholeClinic;
    return lookups.locations.find((l) => l.id === a.locationId)?.name ?? copy.unknownLocation;
  }

  function conditionText(a: Agreement): string {
    if (a.kind === 'PRICE_LIST') return copy.listCondition(a.priceList?.name ?? '—');
    // DX-378 (FE-078): el % con el formato de la sede, no con «es».
    const general = copy.percentCondition(
      a.percent === null || !fmt ? NO_SEDE_FORMAT : fmt.percent(a.percent, 2),
    );
    const n = Object.keys(a.percentByCategory ?? {}).length;
    return n > 0 ? `${general} · ${copy.byCategory(n)}` : general;
  }

  function openModal(agreement: Agreement | null) {
    setEditing(agreement);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: Agreement) {
    setAgreements((prev) => {
      const rest = prev.filter((t) => t.id !== saved.id);
      return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    });
  }

  async function toggleActive(agreement: Agreement) {
    setPendingId(agreement.id);
    try {
      upsert(await updateAgreement(token, agreement.id, { active: !agreement.active }));
    } catch (err) {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(apiErrorMessage(err, copy.toggleError(agreement.name)), {
        onRetry: () => void toggleActive(agreement),
      });
    } finally {
      setPendingId(null);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await deleteAgreement(token, removing.id);
      setAgreements((prev) => prev.filter((t) => t.id !== removing.id));
      removedRef.current = true;
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  function rowActions(agreement: Agreement): RowAction[] {
    const busy = pendingId === agreement.id;
    return [
      {
        label: agreement.active ? copy.deactivate : copy.activate,
        onSelect: () => void toggleActive(agreement),
        disabled: busy,
      },
      {
        label: copy.remove,
        destructive: true,
        separatorBefore: true,
        disabled: busy,
        onSelect: () => {
          setRemoveError(null);
          setRemoving(agreement);
        },
      },
    ];
  }

  const columns: DataListColumn<Agreement>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (a) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate">{a.name}</span>
            {/* El estado solo se pinta cuando es la excepción (critique-settings). */}
            {a.active ? null : <Badge variant="neutral">{copy.inactive}</Badge>}
          </span>
          <span className="t-caption font-normal text-muted">{a.payer.name}</span>
          <InternalPayerNote agreement={a} />
        </span>
      ),
      mobileCell: (a) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">{a.name}</span>
          {a.active ? null : <Badge variant="neutral">{copy.inactive}</Badge>}
        </span>
      ),
    },
    {
      id: 'condition',
      header: copy.colCondition,
      cell: (a) => conditionText(a),
      // En el teléfono el pagador (y su aviso) van en la línea 2, delante.
      mobileCell: (a) => (
        <>
          {a.payer.name} · {conditionText(a)}
          <InternalPayerNote agreement={a} />
        </>
      ),
    },
    { id: 'location', header: copy.colLocation, cell: (a) => locationLabel(a), showFrom: 'lg' },
    {
      id: 'validity',
      header: copy.colValidity,
      cell: (a) => copy.validity(a.validFrom, a.validTo, fmt),
      cellClassName: 'tabular-nums',
    },
    {
      id: 'patients',
      header: copy.colPatients,
      numeric: true,
      mobile: 'trailing',
      cell: (a) => a.assignedCount,
      // En el teléfono el conteo se queda: es lo que dice si retirar es seguro.
      mobileCell: (a) => copy.patients(a.assignedCount),
    },
  ];

  const isEmpty = !loading && !error && agreements.length === 0;
  const newButton = (
    <Button ref={newButtonRef} type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
      <Plus aria-hidden />
      {copy.newAgreement}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Lista vacía: sin «0 convenios» y la acción dentro del estado vacío. */}
      {isEmpty ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="t-body text-muted" aria-live="polite">
            {loading || error ? '' : copy.count(agreements.length)}
          </p>
          {newButton}
        </div>
      )}

      {sedeFormat.status === 'error' ? (
        <SedeConfigError
          kind="locale"
          variant="note"
          description={sedeFormat.message}
          onRetry={sedeFormat.retry}
          locationId={sedeFormat.locationId}
        />
      ) : null}
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={agreements.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Handshake aria-hidden />}
        emptyAction={newButton}
      >
        <DataList
          label={copy.tableLabel}
          rows={agreements}
          columns={columns}
          getRowKey={(a) => a.id}
          onRowClick={(a) => openModal(a)}
          rowActions={rowActions}
          getRowLabel={(a) => a.name}
        />
      </AsyncSection>

      <AgreementFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        agreement={editing}
        payers={lookups.payers}
        priceLists={lookups.priceLists}
        categories={lookups.categories}
        locations={lookups.locations}
        onSaved={upsert}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? copy.removeTitle(removing.name) : ''}
        description={
          removing && removing.assignedCount > 0
            ? copy.removeWithPatients(removing.assignedCount)
            : copy.removeDescription
        }
        confirmLabel={copy.removeConfirm}
        onConfirm={() => void confirmRemove()}
        confirming={removeBusy}
        destructive
        error={removeError}
        onCloseAutoFocus={(event) => {
          // La fila retirada ya no existe: el foco pasa a «Nuevo convenio».
          if (!removedRef.current) return;
          removedRef.current = false;
          event.preventDefault();
          newButtonRef.current?.focus();
        }}
      />
    </div>
  );
}
