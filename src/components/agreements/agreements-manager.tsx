'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Handshake, Lock, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  deleteAgreement,
  listAgreements,
  updateAgreement,
  type Agreement,
} from '@/lib/agreements/agreements-api';
import { listPayers, type Payer } from '@/lib/payers/payers-api';
import { listPriceLists, type PriceList } from '@/lib/price-lists/price-lists-api';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { formatCivilDate } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgreementFormModal } from './agreement-form-modal';
import { AGREEMENT_KIND_LABELS } from './agreement-labels';

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
  colName: 'Convenio',
  colKind: 'Tipo',
  colCondition: 'Condición',
  colLocation: 'Sede',
  colValidity: 'Vigencia',
  colPatients: 'Pacientes',
  colStatus: 'Estado',
  colActions: 'Acciones',
  wholeClinic: 'Toda la clínica',
  unknownLocation: 'Sede',
  noLimit: 'Sin límite',
  validity: (from: string | null, to: string | null) => {
    if (from && to) return `${formatCivilDate(from)} – ${formatCivilDate(to)}`;
    if (from) return `Desde ${formatCivilDate(from)}`;
    if (to) return `Hasta ${formatCivilDate(to)}`;
    return copy.noLimit;
  },
  generalPercent: (p: string) => `${p} %`,
  byCategory: (n: number) => (n === 1 ? '1 categoría con porcentaje propio' : `${n} categorías con porcentaje propio`),
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
    'Deja de aparecer aquí y de aplicarse. No se puede retirar mientras tenga pacientes asignados; en ese caso, desactívalo.',
  removeConfirm: 'Retirar convenio',
  removeError: 'No pudimos retirar el convenio.',
};

const percentFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });

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
 * pacientes asignados).
 */
export function AgreementsManager({ token, allowed }: AgreementsManagerProps) {
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
    if (a.kind === 'PRICE_LIST') return a.priceList?.name ?? '—';
    const general = a.percent === null ? '—' : copy.generalPercent(percentFormat.format(a.percent));
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

  function actions(agreement: Agreement) {
    const toggleLabel = agreement.active ? copy.deactivate : copy.activate;
    return (
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="max-md:h-11"
          onClick={() => openModal(agreement)}
          aria-label={copy.actionFor(copy.edit, agreement.name)}
        >
          {copy.edit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-11"
          loading={pendingId === agreement.id}
          onClick={() => void toggleActive(agreement)}
          aria-label={copy.actionFor(toggleLabel, agreement.name)}
        >
          {toggleLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-11"
          onClick={() => {
            setRemoveError(null);
            setRemoving(agreement);
          }}
          aria-label={copy.actionFor(copy.remove, agreement.name)}
        >
          {copy.remove}
        </Button>
      </div>
    );
  }

  function status(agreement: Agreement) {
    return (
      <Badge variant={agreement.active ? 'success' : 'muted'}>
        {agreement.active ? copy.active : copy.inactive}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {loading || error ? '' : copy.count(agreements.length)}
        </p>
        <Button
          ref={newButtonRef}
          type="button"
          onClick={() => openModal(null)}
          className="w-full sm:w-auto"
        >
          <Plus aria-hidden />
          {copy.newAgreement}
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={agreements.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Handshake aria-hidden />}
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
                {copy.colCondition}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colLocation}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colValidity}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                {copy.colPatients}
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
            {agreements.map((a) => (
              <tr key={a.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium">{a.name}</span>
                  <span className="block text-xs text-muted">{a.payer.name}</span>
                </td>
                <td className="px-4 py-3">{AGREEMENT_KIND_LABELS[a.kind]}</td>
                <td className="px-4 py-3">{conditionText(a)}</td>
                <td className="px-4 py-3">{locationLabel(a)}</td>
                <td className="px-4 py-3 tabular-nums">{copy.validity(a.validFrom, a.validTo)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{a.assignedCount}</td>
                <td className="px-4 py-3">{status(a)}</td>
                <td className="px-4 py-3">{actions(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {agreements.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium">{a.name}</span>
                {status(a)}
              </div>
              <p className="text-xs text-muted">
                {a.payer.name} · {AGREEMENT_KIND_LABELS[a.kind]}
              </p>
              <p>{conditionText(a)}</p>
              <p className="text-xs text-muted">
                {locationLabel(a)} · {copy.validity(a.validFrom, a.validTo)}
              </p>
              {actions(a)}
            </li>
          ))}
        </ul>
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
        description={copy.removeDescription}
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
