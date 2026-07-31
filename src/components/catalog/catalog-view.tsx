'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  listCatalogItems,
  createCatalogItem,
  updateCatalogItem,
  type DentalCatalogItem,
  type CreateCatalogItemInput,
  type UpdateCatalogItemInput,
} from '@/lib/odontogram/catalog-api';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/molecules/form-field';
import { FormModal } from '@/components/molecules/form-modal';
import { EmptyState } from '@/components/molecules/empty-state';
import { AsyncSection, TableSkeleton } from '@/components/molecules/async-section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type CatalogKind = 'PROCEDURE' | 'DIAGNOSIS';

// Copy as constants (i18n-ready) — es first, matches the rest of the app's
// copy convention (staff-view.tsx / treatment-plans-tab.tsx) until next-intl
// wiring lands.
const copy = {
  addToggle: 'Agregar ítem',
  createTitle: 'Agregar ítem',
  editTitle: 'Editar ítem',
  formDescription:
    'Crea un procedimiento o diagnóstico reutilizable. Los procedimientos aparecen al agregar ítems a un plan de tratamiento; los diagnósticos, en el odontograma.',
  nameLabel: 'Nombre',
  kindLabel: 'Tipo',
  codeLabel: 'Código',
  codeHint: 'Código corto único dentro de la clínica (ej. PROF, RESINA, DX-CARIES).',
  priceLabel: 'Precio por defecto',
  priceHint: 'Opcional. Se usa para prellenar el precio al agregarlo a un plan.',
  colorLabel: 'Color',
  colorHint: 'Se usa para distinguirlo en el odontograma.',
  categoryLabel: 'Categoría',
  categoryHint: 'Opcional (ej. Preventiva, Restauradora, Endodoncia).',
  submit: 'Crear',
  editSubmit: 'Guardar',
  retry: 'Reintentar',
  loading: 'Cargando catálogo…',
  tableLabel: 'Catálogo dental',
  genericLoadError: 'No pudimos cargar el catálogo. Intenta de nuevo.',
  genericCreateError: 'No pudimos crear el ítem del catálogo. Intenta de nuevo.',
  genericUpdateError: 'No pudimos guardar los cambios. Intenta de nuevo.',
  genericToggleError: 'No pudimos cambiar el estado del ítem. Intenta de nuevo.',
  empty: 'El catálogo todavía está vacío.',
  emptyHint: 'Agrega tu primer procedimiento para poder usarlo en los planes de tratamiento.',
  searchLabel: 'Buscar',
  searchPlaceholder: 'Nombre o código',
  filterKindLabel: 'Tipo',
  filterStatusLabel: 'Estado',
  filterAll: 'Todos',
  filterActive: 'Activos',
  filterInactive: 'Inactivos',
  /** Total when no filter is applied, e.g. "98 ítems". */
  totalCount: (n: number) => `${n} ${n === 1 ? 'ítem' : 'ítems'}`,
  /** Visible slice while filtering, e.g. "12 de 98". */
  filteredCount: (shown: number, total: number) => `${shown} de ${total}`,
  noMatches: 'Ningún ítem coincide con la búsqueda.',
  noMatchesHint: 'Prueba con otro término o quita los filtros.',
  clearFilters: 'Limpiar filtros',
  colName: 'Nombre',
  colKind: 'Tipo',
  colCode: 'Código',
  colPrice: 'Precio',
  colStatus: 'Estado',
  colActions: 'Acciones',
  editAction: 'Editar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  inactive: 'Inactivo',
  active: 'Activo',
  priceFallback: '—',
  categoryFallback: '',
};

const KIND_OPTIONS: { value: CatalogKind; label: string }[] = [
  { value: 'PROCEDURE', label: 'Procedimiento' },
  { value: 'DIAGNOSIS', label: 'Diagnóstico' },
];

const KIND_LABELS: Record<CatalogKind, string> = {
  PROCEDURE: 'Procedimiento',
  DIAGNOSIS: 'Diagnóstico',
};

// Brand teal (DESIGN.md "The Clinical Record") as the default swatch, so the
// required `color` field never blocks a quick "just add a procedure" flow.
const DEFAULT_COLOR = '#0E7490';

// Native <select> styled to match the Input atom (kept native for a11y/tests) —
// same class/rationale as staff-view.tsx's `fieldClass`.
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

// v1 currency formatting: fixed `es`/`USD`, same convention (and same
// explicit follow-up for per-clinic currency) as treatment-plans-tab.tsx.
const currencyFormatter = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' });
function formatPrice(price: number | null): string {
  return price == null ? copy.priceFallback : currencyFormatter.format(price);
}

type KindFilter = 'ALL' | CatalogKind;
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

/**
 * Lowercased and diacritic-stripped, so "paginacion" matches "Paginación" and
 * "PROFILAXIS" matches "Profilaxis" — the catalog is written in Spanish and
 * nobody types accents into a search box.
 */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

interface CatalogViewProps {
  token: string;
}

/**
 * Catalog management screen — list of dental catalog items + a create/edit
 * modal + per-row activate/deactivate. Mirrors `StaffView`'s shape (list via
 * `AsyncSection` + `FormModal` + `refreshInPlace` after mutation), since both
 * are the same "clinic-config list you manage" pattern.
 *
 * This screen exists to unblock the odontogram/treatment plans: their pickers
 * only render when the catalog is non-empty. The backend already exposes
 * `POST`/`PATCH /catalog/items`; there is no DELETE, so "removing" an item means
 * deactivating it (`{ active: false }`) — it disappears from the pickers but the
 * history in `ToothRecord` / plan items that reference it is preserved.
 */
export function CatalogView({ token }: CatalogViewProps) {
  const [items, setItems] = useState<DentalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  // null = create mode; a DentalCatalogItem = editing that item.
  const [editingItem, setEditingItem] = useState<DentalCatalogItem | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CatalogKind>('PROCEDURE');
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Per-row activate/deactivate: the id being toggled (to disable its button)
  // and a banner-level error surfaced above the table.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Client-side search/filters: the catalog is a bounded per-clinic list
  // (~100 items) that's already fully fetched, so filtering in memory is
  // instant and needs no request per keystroke. The API's `kind`/`activeOnly`
  // params stay unused here on purpose — refetching would be slower and would
  // lose the "N de M" total.
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const query = normalize(search.trim());
  const filteredItems = items.filter((item) => {
    if (kindFilter !== 'ALL' && item.kind !== kindFilter) return false;
    if (statusFilter === 'ACTIVE' && !item.active) return false;
    if (statusFilter === 'INACTIVE' && item.active) return false;
    if (!query) return true;
    return normalize(item.labelEs).includes(query) || normalize(item.code).includes(query);
  });
  const isFiltering = query !== '' || kindFilter !== 'ALL' || statusFilter !== 'ALL';

  function clearFilters() {
    setSearch('');
    setKindFilter('ALL');
    setStatusFilter('ALL');
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listCatalogItems(token);
        if (cancelled) return;
        setItems(data);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  function refreshInPlace(): Promise<void> {
    if (!token) return Promise.resolve();
    return listCatalogItems(token)
      .then((data) => {
        setItems(data);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
      });
  }

  function resetForm() {
    setName('');
    setKind('PROCEDURE');
    setCode('');
    setPrice('');
    setColor(DEFAULT_COLOR);
    setCategory('');
  }

  function openCreate() {
    resetForm();
    setEditingItem(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(item: DentalCatalogItem) {
    setName(item.labelEs);
    setKind(item.kind);
    setCode(item.code);
    setPrice(item.defaultPrice == null ? '' : String(item.defaultPrice));
    setColor(item.color);
    setCategory(item.category ?? '');
    setEditingItem(item);
    setFormError(null);
    setShowForm(true);
  }

  // Builds the shared payload from the current form fields. Empty optional
  // fields are omitted (so a blank price/category doesn't send anything) — a
  // known v1 limitation for edit: you can't clear an existing price/category
  // from the UI (the backend partial DTO rejects null for those).
  function buildPayload(): CreateCatalogItemInput {
    const trimmedPrice = price.trim();
    const trimmedCategory = category.trim();
    return {
      code: code.trim(),
      kind,
      labelEs: name.trim(),
      color,
      ...(trimmedPrice ? { defaultPrice: Number(trimmedPrice) } : {}),
      ...(trimmedCategory ? { category: trimmedCategory } : {}),
    };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingItem) {
        await updateCatalogItem(token, editingItem.id, payload as UpdateCatalogItemInput);
      } else {
        await createCatalogItem(token, payload);
      }
      resetForm();
      setEditingItem(null);
      setShowForm(false);
      await refreshInPlace();
    } catch (err) {
      // Surfaces the backend's 400/409 (duplicate code, invalid color) verbatim.
      const fallback = editingItem ? copy.genericUpdateError : copy.genericCreateError;
      setFormError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  }

  function handleFormOpenChange(next: boolean) {
    setShowForm(next);
    if (!next) {
      setFormError(null);
      setEditingItem(null);
      resetForm();
    }
  }

  async function handleToggleActive(item: DentalCatalogItem) {
    setActionError(null);
    setTogglingId(item.id);
    try {
      await updateCatalogItem(token, item.id, { active: !item.active });
      await refreshInPlace();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : copy.genericToggleError);
    } finally {
      setTogglingId(null);
    }
  }

  const isEditing = editingItem !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {/* Filters only once there's something to filter — an empty catalog
            shows just the primary action. */}
        {items.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <FormField
              htmlFor="catalog-search"
              label={copy.searchLabel}
              className="min-w-[13rem]"
            >
              <Input
                id="catalog-search"
                type="search"
                placeholder={copy.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FormField>
            <FormField htmlFor="catalog-filter-kind" label={copy.filterKindLabel}>
              <select
                id="catalog-filter-kind"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                className={fieldClass}
              >
                <option value="ALL">{copy.filterAll}</option>
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField htmlFor="catalog-filter-status" label={copy.filterStatusLabel}>
              <select
                id="catalog-filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className={fieldClass}
              >
                <option value="ALL">{copy.filterAll}</option>
                <option value="ACTIVE">{copy.filterActive}</option>
                <option value="INACTIVE">{copy.filterInactive}</option>
              </select>
            </FormField>
          </div>
        ) : (
          <span />
        )}
        <Button type="button" onClick={openCreate}>
          <Plus /> {copy.addToggle}
        </Button>
      </div>

      <FormModal
        open={showForm}
        onOpenChange={handleFormOpenChange}
        title={isEditing ? copy.editTitle : copy.createTitle}
        description={copy.formDescription}
        onSubmit={handleSubmit}
        submitLabel={isEditing ? copy.editSubmit : copy.submit}
        submitting={saving}
        error={formError}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="catalog-name" label={copy.nameLabel}>
            <Input
              id="catalog-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="catalog-kind" label={copy.kindLabel}>
            <select
              id="catalog-kind"
              required
              value={kind}
              onChange={(e) => setKind(e.target.value as CatalogKind)}
              className={fieldClass}
            >
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="catalog-code" label={copy.codeLabel} hint={copy.codeHint}>
            <Input
              id="catalog-code"
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="catalog-price" label={copy.priceLabel} hint={copy.priceHint}>
            <Input
              id="catalog-price"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="catalog-category" label={copy.categoryLabel} hint={copy.categoryHint}>
            <Input
              id="catalog-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="catalog-color" label={copy.colorLabel} hint={copy.colorHint}>
            <Input
              id="catalog-color"
              type="color"
              required
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-16 cursor-pointer p-1"
            />
          </FormField>
        </div>
      </FormModal>

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      {!loading && !loadError && items.length > 0 && (
        <p role="status" className="-mb-2 text-xs text-muted tabular-nums">
          {isFiltering
            ? copy.filteredCount(filteredItems.length, items.length)
            : copy.totalCount(items.length)}
        </p>
      )}

      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        retryLabel={copy.retry}
        isEmpty={items.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        skeleton={<TableSkeleton rows={4} />}
      >
        {filteredItems.length === 0 ? (
          // Distinct from the catalog-is-empty state above: there ARE items,
          // the active search/filters just exclude all of them.
          <EmptyState
            role="status"
            title={copy.noMatches}
            description={copy.noMatchesHint}
            action={
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                {copy.clearFilters}
              </Button>
            }
          />
        ) : (
        <Card className="overflow-hidden p-0">
          <Table aria-label={copy.tableLabel}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{copy.colName}</TableHead>
                <TableHead>{copy.colKind}</TableHead>
                <TableHead>{copy.colCode}</TableHead>
                <TableHead>{copy.colPrice}</TableHead>
                <TableHead>{copy.colStatus}</TableHead>
                <TableHead className="text-right">{copy.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.labelEs}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted">{KIND_LABELS[item.kind]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted tabular-nums">{item.code}</TableCell>
                  <TableCell className="tabular-nums">{formatPrice(item.defaultPrice)}</TableCell>
                  <TableCell>
                    <Badge variant={item.active ? 'success' : 'muted'}>
                      {item.active ? copy.active : copy.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(item)}
                        aria-label={`${copy.editAction} ${item.labelEs}`}
                      >
                        <Pencil className="size-3.5" /> {copy.editAction}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={togglingId === item.id}
                        onClick={() => handleToggleActive(item)}
                        aria-label={`${item.active ? copy.deactivate : copy.activate} ${item.labelEs}`}
                      >
                        {item.active ? copy.deactivate : copy.activate}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        )}
      </AsyncSection>
    </div>
  );
}
