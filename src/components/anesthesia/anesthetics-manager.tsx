'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Pencil, Plus, Syringe } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  formatDecimal,
  listAnesthetics,
  loadSampleAnesthetics,
  updateAnesthetic,
  type AnestheticProduct,
} from '@/lib/anesthesia/anesthesia-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import type { RowAction } from '@/components/shared/row-actions';
import { AnestheticFormModal } from './anesthetic-form-modal';

const copy = {
  newAnesthetic: 'Nuevo anestésico',
  count: (n: number) => (n === 1 ? '1 anestésico' : `${n} anestésicos`),
  empty: 'Todavía no hay anestésicos en el catálogo.',
  emptyHint:
    'Carga los sugeridos (lidocaína, articaína, mepivacaína, prilocaína y bupivacaína, con dosis máximas de referencia que puedes editar) o añade los que usa la clínica.',
  loadSamples: 'Cargar sugeridos',
  addManually: 'Añadir uno a mano',
  samplesError: 'No pudimos cargar los anestésicos sugeridos.',
  loadError: 'No pudimos cargar el catálogo de anestésicos.',
  forbiddenTitle: 'Solo administración gestiona el catálogo de anestésicos.',
  forbiddenHint: 'El equipo clínico elige de este catálogo al registrar una anestesia.',
  tableLabel: 'Anestésicos',
  colName: 'Anestésico',
  colConcentration: 'Concentración',
  colVasoconstrictor: 'Vasoconstrictor',
  colCarpule: 'Carpule',
  colPerKg: 'mg/kg',
  colAbsolute: 'Tope absoluto',
  colStatus: 'Estado',
  noVasoconstrictor: 'Sin vasoconstrictor',
  percent: (v: number) => `${formatDecimal(v)} %`,
  ml: (v: number) => `${formatDecimal(v)} ml`,
  perKg: (v: number) => `${formatDecimal(v)} mg/kg`,
  mg: (v: number) => `${formatDecimal(v)} mg`,
  active: 'Activo',
  inactive: 'Inactivo',
  edit: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  toggleError: (name: string) => `No pudimos cambiar el estado de «${name}».`,
};

interface AnestheticsManagerProps {
  token: string;
  /** Solo ADMIN: la API exige el rol para escribir (y la pantalla no pide nada sin él). */
  allowed: boolean;
}

function byName(a: AnestheticProduct, b: AnestheticProduct): number {
  return a.name.localeCompare(b.name, 'es');
}

/**
 * Ajustes › Anestésicos (DX-408): el catálogo de anestésicos locales de la
 * clínica (DX-307). Alta y edición en un modal; desactivar lo saca del modal
 * de anestesia (la API solo lista los activos) sin tocar lo ya registrado,
 * porque cada anestesia copió los valores. No hay borrado.
 */
export function AnestheticsManager({ token, allowed }: AnestheticsManagerProps) {
  const [products, setProducts] = useState<AnestheticProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<AnestheticProduct | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listAnesthetics(token, true);
        if (cancelled) return;
        setProducts([...data].sort(byName));
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
      <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
    );
  }

  function openModal(product: AnestheticProduct | null) {
    setEditing(product);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function upsert(saved: AnestheticProduct) {
    setProducts((prev) => [...prev.filter((p) => p.id !== saved.id), saved].sort(byName));
  }

  async function toggleActive(product: AnestheticProduct) {
    setPendingId(product.id);
    try {
      upsert(await updateAnesthetic(token, product.id, { active: !product.active }));
    } catch {
      // Escalón 3: la lista sigue siendo correcta (no cambió nada).
      notifyError(copy.toggleError(product.name), { onRetry: () => void toggleActive(product) });
    } finally {
      setPendingId(null);
    }
  }

  async function handleLoadSamples() {
    setLoadingSamples(true);
    try {
      const created = await loadSampleAnesthetics(token);
      setProducts((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...created.filter((p) => !ids.has(p.id))].sort(byName);
      });
    } catch {
      // Escalón 3: el estado vacío sigue siendo cierto.
      notifyError(copy.samplesError, { onRetry: () => void handleLoadSamples() });
    } finally {
      setLoadingSamples(false);
    }
  }

  function rowActions(product: AnestheticProduct): RowAction[] {
    return [
      { label: copy.edit, icon: <Pencil />, onSelect: () => openModal(product) },
      {
        label: product.active ? copy.deactivate : copy.activate,
        icon: product.active ? <EyeOff /> : <Eye />,
        disabled: pendingId === product.id,
        onSelect: () => void toggleActive(product),
      },
    ];
  }

  const columns: DataListColumn<AnestheticProduct>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (p) => (
        <span className="flex min-w-0 flex-col">
          <span className="break-words font-medium">{p.name}</span>
          <span className="text-xs text-muted">{p.activeIngredient}</span>
        </span>
      ),
      mobileCell: (p) => p.name,
    },
    {
      id: 'concentration',
      header: copy.colConcentration,
      numeric: true,
      cell: (p) => copy.percent(p.concentrationPct),
    },
    {
      id: 'vasoconstrictor',
      header: copy.colVasoconstrictor,
      cell: (p) => p.vasoconstrictor ?? <span className="text-muted">{copy.noVasoconstrictor}</span>,
      mobileCell: (p) => p.vasoconstrictor ?? copy.noVasoconstrictor,
    },
    { id: 'carpule', header: copy.colCarpule, numeric: true, cell: (p) => copy.ml(p.mlPerCarpule) },
    { id: 'perKg', header: copy.colPerKg, numeric: true, cell: (p) => copy.perKg(p.maxMgPerKg) },
    {
      id: 'absolute',
      header: copy.colAbsolute,
      numeric: true,
      cell: (p) => copy.mg(p.maxAbsoluteMg),
      mobileCell: (p) => `${copy.colAbsolute.toLowerCase()} ${copy.mg(p.maxAbsoluteMg)}`,
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (p) =>
        p.active ? <span className="text-muted">{copy.active}</span> : <Badge variant="neutral">{copy.inactive}</Badge>,
    },
  ];

  const empty = !loading && !error && products.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {empty ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {loading || error ? '' : copy.count(products.length)}
          </p>
          <Button type="button" onClick={() => openModal(null)} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.newAnesthetic}
          </Button>
        </div>
      )}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<TableSkeleton rows={5} />}
        isEmpty={products.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Syringe aria-hidden />}
        emptyAction={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              onClick={() => void handleLoadSamples()}
              loading={loadingSamples}
              className="max-sm:min-h-11"
            >
              {copy.loadSamples}
            </Button>
            <Button type="button" variant="secondary" onClick={() => openModal(null)} className="max-sm:min-h-11">
              {copy.addManually}
            </Button>
          </div>
        }
      >
        <DataList
          label={copy.tableLabel}
          rows={products}
          columns={columns}
          getRowKey={(p) => p.id}
          onRowClick={(p) => openModal(p)}
          rowActions={rowActions}
          getRowLabel={(p) => p.name}
        />
      </AsyncSection>

      <AnestheticFormModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        product={editing}
        onSaved={upsert}
      />
    </div>
  );
}
