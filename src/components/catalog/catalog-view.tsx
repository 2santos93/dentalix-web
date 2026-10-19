'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listCatalogDirectory,
  listCatalogItems,
  createCatalogItem,
  updateCatalogItem,
  canEditCatalog,
  CUPS_PATTERN,
  type DentalCatalogItem,
  type CreateCatalogItemInput,
  type UpdateCatalogItemInput,
} from '@/lib/odontogram/catalog-api';
import { Plus, Pencil, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import {
  AsyncSection,
  TableSkeleton,
} from '@/components/shared/async-section';
import { Pagination } from '@/components/shared/pagination';
import { PageHeader } from '@/components/shared/page-header';
import { RowActions } from '@/components/shared/row-actions';
import {
  ListToolbar,
  ResultCount,
  toolbarFieldClass,
} from '@/components/shared/list-toolbar';
import { notifyError } from '@/components/errors/notify';
import { ClinicWideNote } from '@/components/locations/clinic-wide-note';
import { cn } from '@/lib/utils';
import { formatAmount, formatCurrency } from '@/lib/format/currency';
import { useClinicCurrency } from '@/lib/locations/clinic-currency';
import { getTokenRole } from '@/lib/auth/token-role';
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
  // Titulo y descripcion viven aqui, no en `page.tsx`: la accion primaria va
  // dentro de la barra de la lista y el estado que la abre es de la vista.
  title: 'Catálogo',
  description:
    'Procedimientos y diagnósticos reutilizables de tu clínica. Los procedimientos habilitan los ítems de los planes de tratamiento.',
  clinicWideNote:
    'El catálogo es de toda la clínica: estos procedimientos y diagnósticos son los mismos en todas las sedes.',
  addToggle: 'Agregar ítem',
  createTitle: 'Agregar ítem',
  editTitle: 'Editar ítem',
  // La descripción dice QUÉ crea esta pantalla; la distinción entre los dos
  // tipos es de `kindHint` y solo de él. Antes se repartía entre los dos textos
  // —y decía además que los diagnósticos iban «en el odontograma» y los
  // procedimientos en los planes, como si fueran sitios excluyentes, que no lo
  // son: `tooth-record-panel.tsx` monta el picker sin filtrar por `kind`.
  formDescription:
    'Crea un procedimiento o diagnóstico reutilizable en toda la clínica.',
  nameLabel: 'Nombre',
  kindLabel: 'Tipo',
  // El tipo era el ÚNICO campo del formulario sin ayuda, y es el que decide
  // dónde acaba el ítem: un tratamiento creado como diagnóstico no se podrá
  // presupuestar nunca, y un hallazgo creado como procedimiento aparecerá como
  // cobrable. Elegir mal no da error — el ítem simplemente no aparece donde se
  // le espera, que es la peor forma de fallar. La pregunta que lo resuelve
  // —«¿esto se lo cobro al paciente?»— va delante, en vez de nombrar la
  // distinción y darla por obvia.
  //
  // Sin ejemplos aquí a propósito: ya viven en las opciones del desplegable, a
  // un centímetro. Repetirlos alarga el hint hasta donde deja de leerse.
  kindHint:
    'Procedimiento: lo que le haces al paciente y le cobras. Diagnóstico: lo que le encuentras en el diente. Los dos van al odontograma; solo los procedimientos entran en un plan de tratamiento.',
  codeLabel: 'Código',
  codeHint:
    'Código corto único dentro de la clínica (ej. PROF, RESINA, DX-CARIES).',
  priceLabel: 'Precio por defecto',
  priceHint:
    'Opcional. Se usa para prellenar el precio al agregarlo a un plan.',
  colorLabel: 'Color',
  colorHint: 'Se usa para distinguirlo en el odontograma.',
  categoryLabel: 'Categoría',
  categoryHint: 'Opcional (ej. Preventiva, Restauradora, Endodoncia).',
  // DX-212: código CUPS que piden el RDA y el RIPS en Colombia.
  cupsLabel: 'Código CUPS',
  cupsHint: '6 caracteres alfanuméricos (ej. 890203). Lo piden el RDA y el RIPS en Colombia.',
  cupsReadOnly: 'Solo un administrador puede cambiarlo.',
  cupsInvalid: 'El código CUPS debe tener 6 caracteres alfanuméricos (ej. 890203).',
  colCups: 'CUPS',
  cupsFallback: '—',
  submit: 'Crear',
  editSubmit: 'Guardar',
  retry: 'Reintentar',
  loading: 'Cargando catálogo…',
  tableLabel: 'Catálogo dental',
  genericLoadError: 'No pudimos cargar el catálogo.',
  genericCreateError:
    'No pudimos crear el ítem del catálogo. Intenta de nuevo.',
  genericUpdateError: 'No pudimos guardar los cambios. Intenta de nuevo.',
  // Escalón 3 (segundo plano): sin "Intenta de nuevo." — el toast trae acción.
  genericToggleError: 'No pudimos cambiar el estado del ítem.',
  empty: 'El catálogo todavía está vacío.',
  emptyHint:
    'Agrega tu primer procedimiento para poder usarlo en los planes de tratamiento.',
  searchLabel: 'Buscar por nombre, código o categoría',
  searchPlaceholder: 'Buscar…',
  filterKindLabel: 'Filtrar por tipo',
  filterStatusLabel: 'Filtrar por estado',
  filterAll: 'Todos los tipos',
  filterAllStatuses: 'Activos e inactivos',
  filterActive: 'Solo activos',
  filterInactive: 'Solo inactivos',
  countNoun: 'ítem',
  countNounPlural: 'ítems',
  actionsFor: (name: string) => `Acciones de ${name}`,
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

/**
 * `label` es el nombre a secas: sirve para el filtro de la barra y para la
 * etiqueta de la fila, donde la columna ya dice «Tipo» y un ejemplo sobraría.
 *
 * `example` solo se usa en el desplegable del formulario, que es el único sitio
 * donde hay que ELEGIR entre los dos sin conocerlos. Un ejemplo concreto
 * («resina, corona») resuelve la duda más rápido que cualquier definición.
 */
const KIND_OPTIONS: { value: CatalogKind; label: string; example: string }[] = [
  { value: 'PROCEDURE', label: 'Procedimiento', example: 'resina, corona, profilaxis' },
  { value: 'DIAGNOSIS', label: 'Diagnóstico', example: 'caries, fractura, gingivitis' },
];

const KIND_LABELS: Record<CatalogKind, string> = {
  PROCEDURE: 'Procedimiento',
  DIAGNOSIS: 'Diagnóstico',
};

// Brand teal (DESIGN.md "The Clinical Record") as the default swatch, so the
// required `color` field never blocks a quick "just add a procedure" flow.
const DEFAULT_COLOR = '#0E7490';

/**
 * Precio por defecto en la moneda base de la clínica (DX-063 / FE-014: antes,
 * siempre en USD). Mientras no se sabe la moneda — cargando, o si las sedes no
 * cargaron — el importe va sin símbolo: nunca con una moneda que no es la suya.
 */
function formatPrice(price: number | null, currency: string | null | undefined): string {
  if (price == null) return copy.priceFallback;
  return currency ? formatCurrency(price, currency) : formatAmount(price);
}

type KindFilter = 'ALL' | CatalogKind;
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const PAGE_SIZE = 20;
// Corto para no notarse al teclear, largo para no lanzar una petición por
// tecla. Mismo valor que `StaffView` e `InventoryView`.
const SEARCH_DEBOUNCE_MS = 300;

interface CatalogViewProps {
  token: string;
  /**
   * DX-212: ítem a abrir en edición al llegar (`/catalog?item=<id>`, el enlace
   * «Completar» del chip RDA cuando falta su CUPS).
   */
  initialItemId?: string | null;
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
export function CatalogView({ token, initialItemId = null }: CatalogViewProps) {
  const currency = useClinicCurrency(token);
  // DX-212: el CUPS (como el resto del catálogo) solo lo edita ADMIN; para los
  // demás el campo es de solo lectura.
  const canEdit = canEditCatalog(getTokenRole(token));
  const [items, setItems] = useState<DentalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  // null = create mode; a DentalCatalogItem = editing that item.
  const [editingItem, setEditingItem] = useState<DentalCatalogItem | null>(
    null,
  );
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CatalogKind>('PROCEDURE');
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [category, setCategory] = useState('');
  const [cups, setCups] = useState('');
  const [cupsError, setCupsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Per-row activate/deactivate: the id being toggled, to disable its button.
  // A failure surfaces as a background toast (escalón 3) — the table stays
  // correct and on screen, so nothing needs to block it.
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Búsqueda y filtros del SERVIDOR (`GET /catalog/items/directory`). Antes se
  // filtraba en memoria sobre el catálogo entero, lo cual funcionaba mientras
  // "el catálogo entero" fueran cien filas; en cuanto una clínica grande carga
  // su nomenclador, traerlo completo en cada visita para descartar el 95% en el
  // cliente deja de ser gratis. Ahora la página, el conteo y el filtro los
  // decide la base.
  //
  // `searchInput` es lo que se teclea, `search` lo que se consulta: separarlos
  // es lo que permite el debounce sin que el campo se sienta lento.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  // `hasAny` distingue "el catálogo está vacío" de "la búsqueda no encuentra
  // nada", que necesitan mensajes distintos. Con filtrado en servidor no se
  // puede mirar `items.length`: en una búsqueda sin resultados vale 0 en los
  // dos casos. Se recuerda que alguna vez hubo filas.
  const [hasAny, setHasAny] = useState(false);

  const isFiltering =
    search !== '' || kindFilter !== 'ALL' || statusFilter !== 'ALL';

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setKindFilter('ALL');
    setStatusFilter('ALL');
    setPage(1);
  }

  useEffect(() => {
    const next = searchInput.trim();
    // Sin búsqueda nueva no hay nada que aplicar. Sin esta guarda, el debounce
    // que arranca al montar (y al teclear y borrar lo mismo) devolvía a la
    // página 1 a quien ya había pulsado «Siguiente».
    if (next === search) return;
    const debounce = setTimeout(() => {
      setSearch(next);
      // Toda búsqueda nueva vuelve a la página 1: quedarse en la 3 de un
      // resultado que ahora tiene una sola deja la tabla vacía sin motivo.
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounce);
  }, [searchInput, search]);

  // Los filtros de la UI ('ALL') y los de la API (parámetro ausente) no son la
  // misma cosa; la traducción vive aquí, en un solo sitio, para que el efecto y
  // el refresco no puedan discrepar.
  const queryParams = React.useMemo(
    () => ({
      ...(search ? { query: search } : {}),
      ...(kindFilter !== 'ALL' ? { kind: kindFilter } : {}),
      ...(statusFilter !== 'ALL'
        ? { activeOnly: statusFilter === 'ACTIVE' }
        : {}),
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, kindFilter, statusFilter, page],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listCatalogDirectory(token, queryParams);
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        // El backend acota `pageSize`: se lee de la respuesta, no se asume.
        setPageSize(data.pageSize);
        // Una sola fila devuelta alguna vez basta para saber que el catálogo no
        // está vacío, aunque la búsqueda de ahora no encuentre nada.
        if (data.total > 0) setHasAny(true);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          apiErrorMessage(err, copy.genericLoadError),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, queryParams, reloadKey]);

  /**
   * Recarga la página actual SIN pasar por el esqueleto, tras crear, editar o
   * activar/desactivar. El `loading` no se toca a propósito: la tabla ya es
   * correcta en pantalla, y hacerla parpadear a esqueleto por un cambio de una
   * fila es peor que dejarla quieta medio segundo.
   */
  function refreshInPlace(): Promise<void> {
    if (!token) return Promise.resolve();
    return listCatalogDirectory(token, queryParams)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setPageSize(data.pageSize);
        if (data.total > 0) setHasAny(true);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(
          apiErrorMessage(err, copy.genericLoadError),
        );
      });
  }

  function resetForm() {
    setName('');
    setKind('PROCEDURE');
    setCode('');
    setPrice('');
    setColor(DEFAULT_COLOR);
    setCategory('');
    setCups('');
    setCupsError(null);
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
    setCups(item.cupsCode ?? '');
    setCupsError(null);
    setEditingItem(item);
    setFormError(null);
    setShowForm(true);
  }

  // DX-212: `/catalog?item=<id>` abre ese ítem en edición una vez cargado.
  const [openedInitial, setOpenedInitial] = useState(false);
  useEffect(() => {
    if (!initialItemId || openedInitial || !token) return;
    let cancelled = false;
    listCatalogItems(token)
      .then((all) => {
        if (cancelled) return;
        setOpenedInitial(true);
        const item = all.find((i) => i.id === initialItemId);
        if (item) openEdit(item);
      })
      .catch(() => {
        // Sin el ítem, la pantalla sigue igual: el usuario lo busca a mano.
        if (!cancelled) setOpenedInitial(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialItemId, openedInitial, token]);

  // Builds the shared payload from the current form fields. Empty optional
  // fields are omitted (so a blank price/category doesn't send anything) — a
  // known v1 limitation for edit: you can't clear an existing price/category
  // from the UI (the backend partial DTO rejects null for those).
  function buildPayload(): CreateCatalogItemInput {
    const trimmedPrice = price.trim();
    const trimmedCategory = category.trim();
    const trimmedCups = cups.trim().toUpperCase();
    return {
      code: code.trim(),
      kind,
      labelEs: name.trim(),
      color,
      ...(trimmedPrice ? { defaultPrice: Number(trimmedPrice) } : {}),
      ...(trimmedCategory ? { category: trimmedCategory } : {}),
      ...(canEdit && trimmedCups ? { cupsCode: trimmedCups } : {}),
    };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setCupsError(null);
    const trimmedCups = cups.trim().toUpperCase();
    if (canEdit && trimmedCups && !CUPS_PATTERN.test(trimmedCups)) {
      setCupsError(copy.cupsInvalid);
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingItem) {
        // Editar con el campo vacío QUITA el CUPS (la API acepta null).
        const patch: UpdateCatalogItemInput = {
          ...payload,
          ...(canEdit && !trimmedCups && editingItem.cupsCode ? { cupsCode: null } : {}),
        };
        await updateCatalogItem(token, editingItem.id, patch);
      } else {
        await createCatalogItem(token, payload);
      }
      resetForm();
      setEditingItem(null);
      setShowForm(false);
      await refreshInPlace();
    } catch (err) {
      // El 409 en español de la API («Ya existe un ítem del catálogo con ese
      // código») se conserva; un 400 técnico se dice en español.
      const fallback = editingItem
        ? copy.genericUpdateError
        : copy.genericCreateError;
      setFormError(apiErrorMessage(err, fallback));
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
    setTogglingId(item.id);
    try {
      await updateCatalogItem(token, item.id, { active: !item.active });
      await refreshInPlace();
    } catch (err) {
      notifyError(
        apiErrorMessage(err, copy.genericToggleError),
        {
          onRetry: () => handleToggleActive(item),
        },
      );
    } finally {
      setTogglingId(null);
    }
  }

  const isEditing = editingItem !== null;

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        meta={<ClinicWideNote>{copy.clinicWideNote}</ClinicWideNote>}
      />

      {/* Un solo bloque apretado (12px) para filtrar → contar → leer: los tres
          pasos son el mismo gesto. La separación grande de la página es la que
          hay sobre él, contra la cabecera. El `FormModal` vive dentro sin
          alterar el ritmo: cerrado no pinta nada y abierto se va a un portal, así
          que no ocupa hueco en la columna. */}
      <div className="flex flex-col gap-3">
        <ListToolbar
          searchLabel={copy.searchLabel}
          searchPlaceholder={copy.searchPlaceholder}
          value={searchInput}
          onChange={setSearchInput}
          action={
            <Button type="button" onClick={openCreate}>
              <Plus /> {copy.addToggle}
            </Button>
          }
        >
          <select
            aria-label={copy.filterKindLabel}
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value as KindFilter);
              setPage(1);
            }}
            className={cn(toolbarFieldClass, 'sm:w-48')}
          >
            <option value="ALL">{copy.filterAll}</option>
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            aria-label={copy.filterStatusLabel}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
            className={cn(toolbarFieldClass, 'sm:w-48')}
          >
            <option value="ALL">{copy.filterAllStatuses}</option>
            <option value="ACTIVE">{copy.filterActive}</option>
            <option value="INACTIVE">{copy.filterInactive}</option>
          </select>
        </ListToolbar>

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
            <FormField
              htmlFor="catalog-kind"
              label={copy.kindLabel}
              hint={copy.kindHint}
            >
              <select
                id="catalog-kind"
                required
                value={kind}
                onChange={(e) => setKind(e.target.value as CatalogKind)}
                className={toolbarFieldClass}
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.example})
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              htmlFor="catalog-code"
              label={copy.codeLabel}
              hint={copy.codeHint}
            >
              <Input
                id="catalog-code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </FormField>
            <FormField
              htmlFor="catalog-price"
              label={copy.priceLabel}
              hint={copy.priceHint}
            >
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
            <FormField
              htmlFor="catalog-category"
              label={copy.categoryLabel}
              hint={copy.categoryHint}
            >
              <Input
                id="catalog-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </FormField>
            <FormField
              htmlFor="catalog-cups"
              label={copy.cupsLabel}
              hint={canEdit ? copy.cupsHint : copy.cupsReadOnly}
              error={cupsError}
            >
              <Input
                id="catalog-cups"
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={6}
                readOnly={!canEdit}
                aria-readonly={!canEdit || undefined}
                aria-invalid={cupsError ? true : undefined}
                aria-describedby={cupsError ? 'catalog-cups-error' : undefined}
                value={cups}
                onChange={(e) => setCups(e.target.value.toUpperCase())}
                className={cn('uppercase tabular-nums', !canEdit && 'bg-surface-2 text-muted')}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              htmlFor="catalog-color"
              label={copy.colorLabel}
              hint={copy.colorHint}
            >
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

        {!loading && !loadError && hasAny ? (
          <ResultCount
            total={total}
            noun={copy.countNoun}
            nounPlural={copy.countNounPlural}
          />
        ) : null}

        <AsyncSection
          loading={loading}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          retryLabel={copy.retry}
          // "Todavía no hay catálogo" y "la búsqueda no encuentra nada" son
          // situaciones distintas y solo la segunda tiene remedio desde aquí, así
          // que solo esa ofrece limpiar los filtros.
          isEmpty={items.length === 0}
          emptyTitle={isFiltering ? copy.noMatches : copy.empty}
          emptyDescription={isFiltering ? copy.noMatchesHint : copy.emptyHint}
          emptyAction={
            isFiltering ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                {copy.clearFilters}
              </Button>
            ) : undefined
          }
          skeleton={<TableSkeleton rows={5} />}
        >
          <Card className="overflow-hidden p-0">
            <Table aria-label={copy.tableLabel}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{copy.colName}</TableHead>
                  <TableHead>{copy.colKind}</TableHead>
                  <TableHead>{copy.colCode}</TableHead>
                  <TableHead>{copy.colCups}</TableHead>
                  <TableHead className="text-right">{copy.colPrice}</TableHead>
                  <TableHead>{copy.colStatus}</TableHead>
                  <TableHead className="w-px text-right">
                    <span className="sr-only">{copy.colActions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell data-label={copy.colName}>
                      <span className="flex items-center gap-2.5 font-medium text-ink">
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-ink/10"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="flex flex-col">
                          {item.labelEs}
                          {item.category ? (
                            <span className="text-xs font-normal text-muted">
                              {item.category}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell data-label={copy.colKind}>
                      <Badge variant="muted">{KIND_LABELS[item.kind]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted tabular-nums" data-label={copy.colCode}>
                      {item.code}
                    </TableCell>
                    <TableCell className="tabular-nums" data-label={copy.colCups}>
                      {item.cupsCode ?? <span className="text-muted">{copy.cupsFallback}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" data-label={copy.colPrice}>
                      {formatPrice(item.defaultPrice, currency)}
                    </TableCell>
                    <TableCell data-label={copy.colStatus}>
                      <Badge variant={item.active ? 'success' : 'muted'}>
                        {item.active ? copy.active : copy.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" data-label={copy.colActions}>
                      <RowActions
                        label={copy.actionsFor(item.labelEs)}
                        busy={togglingId === item.id}
                        actions={[
                          {
                            label: copy.editAction,
                            icon: <Pencil />,
                            onSelect: () => openEdit(item),
                          },
                          {
                            // No hay DELETE en el catálogo a propósito: un ítem
                            // referenciado por un odontograma o un plan no puede
                            // desaparecer sin romper esa historia. Desactivar lo
                            // saca de los selectores y conserva el registro; por
                            // eso no va marcado como destructivo.
                            label: item.active ? copy.deactivate : copy.activate,
                            icon: item.active ? <EyeOff /> : <Eye />,
                            separatorBefore: true,
                            onSelect: () => void handleToggleActive(item),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </AsyncSection>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          disabled={loading}
        />
      </div>
    </>
  );
}
