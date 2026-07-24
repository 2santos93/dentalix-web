'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  addItem,
  createPlan,
  getPlan,
  listPlans,
  removeItem,
  updateItem,
  updatePlan,
  type AddTreatmentPlanItemInput,
  type TreatmentPlan,
  type TreatmentPlanItem,
  type TreatmentPlanItemStatus,
  type TreatmentPlanStatus,
} from '@/lib/treatment-plans/treatment-plans-api';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { FormField } from '@/components/molecules/form-field';
import { EmptyState } from '@/components/molecules/empty-state';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready, es-first) — matches odontogram-tab.tsx /
// agenda-view.tsx convention until next-intl wiring lands.
const copy = {
  loading: 'Cargando planes de tratamiento…',
  genericLoadError: 'No pudimos cargar los planes de tratamiento. Intenta de nuevo.',
  refreshing: 'Actualizando…',
  genericRefreshError: 'No pudimos actualizar los planes de tratamiento. Intenta de nuevo.',
  retry: 'Reintentar',
  plansHeading: 'Planes de tratamiento',
  newPlan: 'Nuevo plan',
  creatingPlan: 'Creando…',
  genericCreatePlanError: 'No pudimos crear el plan. Intenta de nuevo.',
  emptyPlansTitle: 'Este paciente todavía no tiene un plan de tratamiento.',
  emptyPlansDescription: 'Crea el primer plan para empezar a registrar procedimientos.',
  selectPlanLabel: 'Plan',
  planOptionLabel: (createdAt: string, status: TreatmentPlanStatus) =>
    `Plan del ${new Date(createdAt).toLocaleDateString('es')} — ${PLAN_STATUS_LABELS[status]}`,
  detailHeading: 'Detalle del plan',
  planStatusLabel: 'Estado del plan',
  loadingPlanDetail: 'Cargando plan…',
  genericPlanDetailError: 'No pudimos cargar el plan. Intenta de nuevo.',
  genericPlanDetailRefreshError: 'No pudimos actualizar el plan. Intenta de nuevo.',
  genericPlanStatusError: 'No pudimos actualizar el estado del plan. Intenta de nuevo.',
  itemsTableCaption: 'Ítems del plan de tratamiento',
  colTooth: 'Diente',
  colProcedure: 'Procedimiento',
  colSurfaces: 'Caras',
  colPrice: 'Precio',
  colStatus: 'Estado',
  colActions: 'Acciones',
  wholeToothFallback: 'Diente completo',
  emptyItemsTitle: 'Este plan todavía no tiene ítems.',
  emptyItemsDescription: 'Agrega un procedimiento con el formulario de abajo.',
  totalLabel: 'Total',
  remove: 'Quitar',
  removing: 'Quitando…',
  genericItemUpdateError: 'No pudimos actualizar el estado del ítem. Intenta de nuevo.',
  genericRemoveItemError: 'No pudimos quitar el ítem. Intenta de nuevo.',
  itemStatusSelectLabel: (tooth: string) => `Estado del ítem del diente ${tooth}`,
  addItemHeading: 'Agregar ítem',
  toothLabel: 'Diente (FDI)',
  toothPlaceholder: 'Ej. 11',
  toothHint: 'Notación FDI: permanentes 11-18/21-28/31-38/41-48, temporales 51-55/61-65/71-75/81-85.',
  invalidToothNumber: 'Número de diente inválido. Usa la notación FDI (ej. 11, 26, 55).',
  procedureLabel: 'Procedimiento',
  procedureEmptyOption: 'Selecciona un procedimiento',
  selectProcedurePrompt: 'Selecciona un procedimiento del catálogo.',
  priceLabel: 'Precio',
  surfacesLegend: 'Caras (opcional)',
  notesLabel: 'Notas',
  addItemSubmit: 'Agregar ítem',
  addItemSubmitting: 'Agregando…',
  genericAddItemError: 'No pudimos agregar el ítem. Intenta de nuevo.',
  emptyCatalogTitle: 'No hay procedimientos en el catálogo.',
  emptyCatalogDescription: 'Crea procedimientos en el catálogo dental para poder agregarlos a un plan.',
};

const PLAN_STATUS_OPTIONS: TreatmentPlanStatus[] = ['DRAFT', 'ACCEPTED', 'COMPLETED', 'CANCELLED'];
const ITEM_STATUS_OPTIONS: TreatmentPlanItemStatus[] = ['PROPOSED', 'ACCEPTED', 'DONE'];

const PLAN_STATUS_LABELS: Record<TreatmentPlanStatus, string> = {
  DRAFT: 'Borrador',
  ACCEPTED: 'Aceptado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

const ITEM_STATUS_LABELS: Record<TreatmentPlanItemStatus, string> = {
  PROPOSED: 'Propuesto',
  ACCEPTED: 'Aceptado',
  DONE: 'Realizado',
};

// Semantic Badge variants (never raw color utilities) — DRAFT/PROPOSED are
// neutral (nothing has happened yet), ACCEPTED maps to the brand/primary
// token (acknowledged), COMPLETED/DONE to success, CANCELLED to danger —
// same convention as `day-agenda.tsx`'s STATUS_BADGE_CLASSES.
const PLAN_STATUS_BADGE_VARIANT: Record<TreatmentPlanStatus, BadgeProps['variant']> = {
  DRAFT: 'muted',
  ACCEPTED: 'default',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

const ITEM_STATUS_BADGE_VARIANT: Record<TreatmentPlanItemStatus, BadgeProps['variant']> = {
  PROPOSED: 'muted',
  ACCEPTED: 'default',
  DONE: 'success',
};

const SURFACE_LABELS: Record<ToothSurface, string> = {
  VESTIBULAR: 'Vestibular',
  LINGUAL: 'Lingual',
  MESIAL: 'Mesial',
  DISTAL: 'Distal',
  OCCLUSAL: 'Oclusal',
};

const SURFACE_ORDER: ToothSurface[] = ['VESTIBULAR', 'MESIAL', 'OCCLUSAL', 'DISTAL', 'LINGUAL'];

function emptySurfacesState(): Record<ToothSurface, boolean> {
  return { VESTIBULAR: false, LINGUAL: false, MESIAL: false, DISTAL: false, OCCLUSAL: false };
}

// v1 currency formatting: fixed `es`/`USD` per the plan's notes — per-group
// currency is an explicit follow-up, no existing formatCurrency helper to
// reuse (checked: no `Intl.NumberFormat`/currency helper anywhere else in
// this app yet).
const currencyFormatter = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' });
function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

// FDI/ISO-3950 tooth code, client-side mirror of the backend's
// `AddTreatmentPlanItemDto.toothNumber` validation (see schema.d.ts):
// permanent dentition is quadrant 1-4 + tooth position 1-8, primary
// dentition is quadrant 5-8 + tooth position 1-5. `isPermanentFdi` in
// `lib/odontogram/fdi.ts` only covers the 32 permanent codes (the
// odontogram chart only draws permanent teeth today), so it can't be reused
// as-is here — a treatment plan item may legitimately target a primary
// tooth. This regex mirrors both ranges without touching `fdi.ts`.
function isValidToothNumber(value: string): boolean {
  return /^[1-4][1-8]$|^[5-8][1-5]$/.test(value.trim());
}

// Native <select>/<input> styled to match the Input atom (kept native for
// a11y/tests) — same documented convention as `agenda-view.tsx` /
// `patient-form.tsx`'s `fieldClass`; this app has no tested consumer of the
// Radix-backed `ui/select` yet, and native controls keep this form directly
// testable with Testing Library without extra jsdom polyfills.
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

interface TreatmentPlansTabProps {
  patientId: string;
  token: string;
}

interface ItemsTableProps {
  items: TreatmentPlanItem[];
  catalogById: Map<string, DentalCatalogItem>;
  updatingItemId: string | null;
  onStatusChange: (itemId: string, status: TreatmentPlanItemStatus) => void;
  onRemove: (itemId: string) => void;
}

function procedureName(item: TreatmentPlanItem, catalogById: Map<string, DentalCatalogItem>): string {
  return catalogById.get(item.catalogItemId)?.labelEs ?? item.catalogItemId;
}

function surfacesLabel(item: TreatmentPlanItem): string {
  return item.surfaces.length > 0
    ? item.surfaces.map((s) => SURFACE_LABELS[s]).join(', ')
    : copy.wholeToothFallback;
}

function ItemsTable({ items, catalogById, updatingItemId, onStatusChange, onRemove }: ItemsTableProps) {
  if (items.length === 0) {
    return <EmptyState role="status" title={copy.emptyItemsTitle} description={copy.emptyItemsDescription} />;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{copy.itemsTableCaption}</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{copy.colTooth}</TableHead>
              <TableHead>{copy.colProcedure}</TableHead>
              <TableHead>{copy.colSurfaces}</TableHead>
              <TableHead>{copy.colPrice}</TableHead>
              <TableHead>{copy.colStatus}</TableHead>
              <TableHead className="sr-only">{copy.colActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const updating = updatingItemId === item.id;
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.toothNumber}</TableCell>
                  <TableCell>{procedureName(item, catalogById)}</TableCell>
                  <TableCell className="text-muted">{surfacesLabel(item)}</TableCell>
                  <TableCell>{formatCurrency(item.price)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1.5">
                      <Badge variant={ITEM_STATUS_BADGE_VARIANT[item.status]}>
                        {ITEM_STATUS_LABELS[item.status]}
                      </Badge>
                      <span className="inline-flex items-center gap-2">
                        <select
                          aria-label={copy.itemStatusSelectLabel(item.toothNumber)}
                          value={item.status}
                          disabled={updating}
                          onChange={(e) => onStatusChange(item.id, e.target.value as TreatmentPlanItemStatus)}
                          className={cn(fieldClass, 'h-8 px-2 py-1 text-xs')}
                        >
                          {ITEM_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {ITEM_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                        {updating && (
                          <span role="status" className="text-xs text-muted">
                            {copy.refreshing}
                          </span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={updating}
                      onClick={() => onRemove(item.id)}
                    >
                      {updating ? copy.removing : copy.remove}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => {
          const updating = updatingItemId === item.id;
          return (
            <li key={item.id}>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{copy.colTooth} {item.toothNumber}</span>
                  <Badge variant={ITEM_STATUS_BADGE_VARIANT[item.status]}>
                    {ITEM_STATUS_LABELS[item.status]}
                  </Badge>
                </div>
                <p className="mt-2 text-ink">{procedureName(item, catalogById)}</p>
                <p className="mt-1 text-sm text-muted">{surfacesLabel(item)}</p>
                <p className="mt-1 font-medium text-ink">{formatCurrency(item.price)}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <select
                    aria-label={copy.itemStatusSelectLabel(item.toothNumber)}
                    value={item.status}
                    disabled={updating}
                    onChange={(e) => onStatusChange(item.id, e.target.value as TreatmentPlanItemStatus)}
                    className={cn(fieldClass, 'h-9 w-auto text-xs')}
                  >
                    {ITEM_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {ITEM_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={updating}
                    onClick={() => onRemove(item.id)}
                  >
                    {updating ? copy.removing : copy.remove}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * `'use client'` tab for the patient-detail page's "Plan de tratamiento" tab
 * — mirrors `OdontogramTab`'s data-fetching shape: it owns its own fetch(es)
 * and refreshes in place after every mutation (never unmounting the table/
 * form subtree), and `AgendaView`'s row-level "await the refresh before
 * re-enabling" pattern for status/remove controls (`updatingItemId`,
 * `updatingPlanStatus`).
 *
 * Two independent resources are loaded:
 * - the patient's plans (`listPlans`) + the procedure catalog
 *   (`listCatalogItems`, kind=PROCEDURE) together on mount/retry — this
 *   pairing (like `OdontogramTab`'s `getOdontogram` + `listCatalogItems`
 *   `Promise.all`) is what builds `catalogById` (id -> name/defaultPrice),
 *   used both to render the procedure name in the items table (falling
 *   back to the raw id when a catalog item isn't found — e.g. deactivated)
 *   and to prefill the add-item form's price when a procedure is picked.
 * - the SELECTED plan's detail (`getPlan`, which alone populates `items` +
 *   `total`) — loaded whenever `selectedPlanId` changes (tracked via
 *   `loadedPlanIdRef`, a plain ref rather than state, so switching plans
 *   doesn't need an extra render to know it's a genuinely new resource and
 *   therefore a full "loading" state, not a background "refreshing" one).
 *
 * All item/plan mutations (`addItem`, `updateItem`, `removeItem`,
 * `updatePlan`) call `refreshPlanDetail()` directly and AWAIT it before
 * clearing their own busy flag — this is `AgendaView.handleStatusChange`'s
 * fix, not `OdontogramTab`'s reload-key bump: a row's disabled control must
 * stay disabled for the whole window until the refetched `planDetail`
 * actually lands, not just until the mutation's own promise settles,
 * otherwise the control re-enables showing the stale pre-change value.
 */
export function TreatmentPlansTab({ patientId, token }: TreatmentPlansTabProps) {
  // Plans list + catalog (loaded together).
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [catalogItems, setCatalogItems] = useState<DentalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [creatingPlan, setCreatingPlan] = useState(false);
  const [createPlanError, setCreatePlanError] = useState<string | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Selected plan's detail (items + total).
  const [planDetail, setPlanDetail] = useState<TreatmentPlan | null>(null);
  const [planDetailLoading, setPlanDetailLoading] = useState(false);
  const [planDetailError, setPlanDetailError] = useState<string | null>(null);
  const [planDetailRefreshing, setPlanDetailRefreshing] = useState(false);
  const [planDetailRefreshError, setPlanDetailRefreshError] = useState<string | null>(null);
  const loadedPlanIdRef = useRef<string | null>(null);

  const [updatingPlanStatus, setUpdatingPlanStatus] = useState(false);
  const [planStatusError, setPlanStatusError] = useState<string | null>(null);

  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);

  // Add-item form state.
  const [toothNumber, setToothNumber] = useState('');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [price, setPrice] = useState('');
  const [surfaces, setSurfaces] = useState<Record<ToothSurface, boolean>>(emptySurfacesState);
  const [notes, setNotes] = useState('');
  const [addItemSubmitting, setAddItemSubmitting] = useState(false);
  const [addItemValidationError, setAddItemValidationError] = useState<string | null>(null);
  const [addItemError, setAddItemError] = useState<string | null>(null);

  // Plans + catalog: initial load vs. background refresh, same
  // isInitialLoad/hasLoadedOnce shape as `OdontogramTab`.
  useEffect(() => {
    let cancelled = false;
    const isInitialLoad = !hasLoadedOnce;

    async function load() {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const [plansData, catalogData] = await Promise.all([
          listPlans(token, patientId),
          listCatalogItems(token, { kind: 'PROCEDURE', activeOnly: true }),
        ]);
        if (cancelled) return;
        setPlans(plansData);
        setCatalogItems(catalogData);
        setLoadError(null);
        setRefreshError(null);
        setHasLoadedOnce(true);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : copy.genericLoadError;
        if (isInitialLoad) {
          setLoadError(message);
        } else {
          setRefreshError(copy.genericRefreshError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // `hasLoadedOnce` intentionally excluded — same rationale as
    // `OdontogramTab`: it's read once per run to distinguish an initial load
    // from a background refresh, and is itself flipped true by this same
    // effect on success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, patientId, reloadKey]);

  // Default the plan selector to the first plan once plans load, so the
  // detail shows without an extra click — adjusts state DURING render (the
  // React-recommended pattern, see `AgendaView`'s `prevStaffLen`) since it's
  // a pure derivation from `plans` becoming non-empty.
  const [prevPlansLen, setPrevPlansLen] = useState(0);
  if (plans.length !== prevPlansLen) {
    setPrevPlansLen(plans.length);
    if (!selectedPlanId && plans.length > 0) setSelectedPlanId(plans[0].id);
  }

  // Reset the previously-selected plan's detail (a genuinely different
  // resource — nothing to preserve) and the in-progress add-item form
  // (carrying it over to a different plan would silently add it to the
  // wrong plan) whenever `selectedPlanId` changes. Adjusts state DURING
  // render (same pattern as `prevPlansLen` above / `ToothRecordPanel`'s
  // `prevToothNumber`) instead of a `useEffect`, since it's a pure
  // derivation from a prop/state change, not a synchronization with an
  // external system — a plain `useEffect` doing these `setState` calls
  // unconditionally on every run trips `react-hooks/set-state-in-effect`.
  const [prevSelectedPlanId, setPrevSelectedPlanId] = useState<string | null>(null);
  if (selectedPlanId !== prevSelectedPlanId) {
    setPrevSelectedPlanId(selectedPlanId);
    setPlanDetail(null);
    setToothNumber('');
    setCatalogItemId('');
    setPrice('');
    setSurfaces(emptySurfacesState());
    setNotes('');
    setAddItemValidationError(null);
    setAddItemError(null);
  }

  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));

  function refreshPlansInPlace(): Promise<void> {
    setRefreshing(true);
    return listPlans(token, patientId)
      .then((data) => {
        setPlans(data);
        setRefreshError(null);
      })
      .catch((err) => {
        setRefreshError(err instanceof ApiError ? err.message : copy.genericRefreshError);
      })
      .finally(() => setRefreshing(false));
  }

  async function handleCreatePlan() {
    setCreatingPlan(true);
    setCreatePlanError(null);
    try {
      const created = await createPlan(token, patientId, {});
      await refreshPlansInPlace();
      setSelectedPlanId(created.id);
    } catch (err) {
      setCreatePlanError(err instanceof ApiError ? err.message : copy.genericCreatePlanError);
    } finally {
      setCreatingPlan(false);
    }
  }

  // Selected plan's detail: a genuinely new plan id (tracked via
  // `loadedPlanIdRef`, not state) is an initial load — full blocking status,
  // nothing to preserve from the previously-selected plan. Reloading the
  // SAME plan (`planDetailReloadKey` isn't used — mutations call
  // `refreshPlanDetail()` directly, see below) never hits this branch as a
  // refresh; this effect only fires again when `selectedPlanId` changes.
  // `planDetail` is already cleared synchronously (during render, see the
  // `prevSelectedPlanId` block above) whenever `selectedPlanId` changes —
  // including to `null` — so this effect only needs to handle the "fetch a
  // plan" case.
  useEffect(() => {
    if (!selectedPlanId) return;
    let cancelled = false;
    const isInitialLoad = loadedPlanIdRef.current !== selectedPlanId;

    async function load() {
      if (isInitialLoad) {
        setPlanDetail(null);
        setPlanDetailLoading(true);
      } else {
        setPlanDetailRefreshing(true);
      }
      try {
        const data = await getPlan(token, selectedPlanId as string);
        if (cancelled) return;
        setPlanDetail(data);
        loadedPlanIdRef.current = selectedPlanId;
        setPlanDetailError(null);
        setPlanDetailRefreshError(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : copy.genericPlanDetailError;
        if (isInitialLoad) {
          setPlanDetailError(message);
        } else {
          setPlanDetailRefreshError(copy.genericPlanDetailRefreshError);
        }
      } finally {
        if (!cancelled) {
          setPlanDetailLoading(false);
          setPlanDetailRefreshing(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, selectedPlanId]);

  /**
   * Re-fetches the selected plan's detail in place. Called directly (never
   * via a reload-key bump) by every item/plan mutation below AND awaited by
   * them before clearing their own busy flag — see the component doc
   * comment for why (`AgendaView.handleStatusChange`'s fix).
   */
  function refreshPlanDetail(): Promise<void> {
    if (!selectedPlanId) return Promise.resolve();
    setPlanDetailRefreshing(true);
    return getPlan(token, selectedPlanId)
      .then((data) => {
        setPlanDetail(data);
        setPlanDetailRefreshError(null);
      })
      .catch((err) => {
        setPlanDetailRefreshError(err instanceof ApiError ? err.message : copy.genericPlanDetailRefreshError);
      })
      .finally(() => setPlanDetailRefreshing(false));
  }

  async function handlePlanStatusChange(status: TreatmentPlanStatus) {
    if (!selectedPlanId) return;
    setUpdatingPlanStatus(true);
    setPlanStatusError(null);
    try {
      await updatePlan(token, selectedPlanId, { status });
      await refreshPlanDetail();
      await refreshPlansInPlace();
    } catch (err) {
      setPlanStatusError(err instanceof ApiError ? err.message : copy.genericPlanStatusError);
    } finally {
      setUpdatingPlanStatus(false);
    }
  }

  async function handleItemStatusChange(itemId: string, status: TreatmentPlanItemStatus) {
    if (!selectedPlanId) return;
    setUpdatingItemId(itemId);
    setItemActionError(null);
    try {
      await updateItem(token, selectedPlanId, itemId, { status });
      await refreshPlanDetail();
    } catch (err) {
      setItemActionError(err instanceof ApiError ? err.message : copy.genericItemUpdateError);
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!selectedPlanId) return;
    setUpdatingItemId(itemId);
    setItemActionError(null);
    try {
      await removeItem(token, selectedPlanId, itemId);
      await refreshPlanDetail();
    } catch (err) {
      setItemActionError(err instanceof ApiError ? err.message : copy.genericRemoveItemError);
    } finally {
      setUpdatingItemId(null);
    }
  }

  function handleProcedureChange(nextCatalogItemId: string) {
    setCatalogItemId(nextCatalogItemId);
    // Prefill (not lock) the price with the chosen procedure's default —
    // the field stays editable afterwards.
    const item = catalogById.get(nextCatalogItemId);
    if (item?.defaultPrice != null) {
      setPrice(String(item.defaultPrice));
    }
  }

  function handleSurfaceChange(surface: ToothSurface, checked: boolean) {
    setSurfaces((prev) => ({ ...prev, [surface]: checked }));
  }

  async function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddItemValidationError(null);
    setAddItemError(null);

    if (!selectedPlanId) return;

    const tooth = toothNumber.trim();
    if (!isValidToothNumber(tooth)) {
      setAddItemValidationError(copy.invalidToothNumber);
      return;
    }
    if (!catalogItemId) {
      setAddItemValidationError(copy.selectProcedurePrompt);
      return;
    }

    const selectedSurfaces = SURFACE_ORDER.filter((s) => surfaces[s]);
    const trimmedPrice = price.trim();

    setAddItemSubmitting(true);
    try {
      const input: AddTreatmentPlanItemInput = {
        toothNumber: tooth,
        catalogItemId,
        ...(selectedSurfaces.length ? { surfaces: selectedSurfaces } : {}),
        ...(trimmedPrice ? { price: Number(trimmedPrice) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      await addItem(token, selectedPlanId, input);
      setToothNumber('');
      setCatalogItemId('');
      setPrice('');
      setSurfaces(emptySurfacesState());
      setNotes('');
      await refreshPlanDetail();
    } catch (err) {
      // Surfaces the backend's 400 (invalid FDI / price required when the
      // catalog item has no defaultPrice) verbatim — `ApiError.message` is
      // the backend's validation message.
      setAddItemError(err instanceof ApiError ? err.message : copy.genericAddItemError);
    } finally {
      setAddItemSubmitting(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loading}
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
        <Button type="button" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
          {copy.retry}
        </Button>
      </div>
    );
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {refreshing && (
        <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
          {copy.refreshing}
        </p>
      )}
      {refreshError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-xs text-danger">
            {refreshError}
          </p>
          <Button variant="outline" size="sm" onClick={refreshPlansInPlace}>
            {copy.retry}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{copy.plansHeading}</CardTitle>
          <Button type="button" onClick={handleCreatePlan} disabled={creatingPlan}>
            {creatingPlan ? copy.creatingPlan : copy.newPlan}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {createPlanError && (
            <p role="alert" className="text-sm text-danger">
              {createPlanError}
            </p>
          )}
          {plans.length === 0 ? (
            <EmptyState role="status" title={copy.emptyPlansTitle} description={copy.emptyPlansDescription} />
          ) : (
            <FormField htmlFor="tp-plan-select" label={copy.selectPlanLabel} className="sm:max-w-xs">
              <select
                id="tp-plan-select"
                value={selectedPlanId ?? ''}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                className={fieldClass}
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {copy.planOptionLabel(plan.createdAt, plan.status)}
                  </option>
                ))}
              </select>
            </FormField>
          )}
        </CardContent>
      </Card>

      {selectedPlanId && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>{copy.detailHeading}</CardTitle>
              {selectedPlan && (
                <Badge variant={PLAN_STATUS_BADGE_VARIANT[selectedPlan.status]}>
                  {PLAN_STATUS_LABELS[selectedPlan.status]}
                </Badge>
              )}
            </div>
            {planDetail && (
              <FormField htmlFor="tp-plan-status" label={copy.planStatusLabel} className="sm:w-56">
                <select
                  id="tp-plan-status"
                  value={planDetail.status}
                  disabled={updatingPlanStatus}
                  onChange={(e) => handlePlanStatusChange(e.target.value as TreatmentPlanStatus)}
                  className={cn(fieldClass, 'h-9')}
                >
                  {PLAN_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {PLAN_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {planDetailLoading && (
              <p role="status" className="text-sm text-muted">
                {copy.loadingPlanDetail}
              </p>
            )}
            {planDetailError && (
              <div className="flex flex-col items-start gap-3">
                <p role="alert" className="text-sm text-danger">
                  {planDetailError}
                </p>
                <Button type="button" variant="outline" onClick={refreshPlanDetail}>
                  {copy.retry}
                </Button>
              </div>
            )}

            {!planDetailLoading && !planDetailError && planDetail && (
              <>
                {planDetailRefreshing && (
                  <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
                    {copy.refreshing}
                  </p>
                )}
                {planDetailRefreshError && (
                  <div className="flex items-center gap-3">
                    <p role="alert" className="text-xs text-danger">
                      {planDetailRefreshError}
                    </p>
                    <Button variant="outline" size="sm" onClick={refreshPlanDetail}>
                      {copy.retry}
                    </Button>
                  </div>
                )}
                {planStatusError && (
                  <p role="alert" className="text-sm text-danger">
                    {planStatusError}
                  </p>
                )}
                {itemActionError && (
                  <p role="alert" className="text-sm text-danger">
                    {itemActionError}
                  </p>
                )}

                <ItemsTable
                  items={planDetail.items ?? []}
                  catalogById={catalogById}
                  updatingItemId={updatingItemId}
                  onStatusChange={handleItemStatusChange}
                  onRemove={handleRemoveItem}
                />

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm font-medium text-muted">{copy.totalLabel}</span>
                  <span className="text-lg font-semibold text-ink">
                    {formatCurrency(planDetail.total ?? 0)}
                  </span>
                </div>

                <Separator />

                {catalogItems.length === 0 ? (
                  <EmptyState
                    role="status"
                    title={copy.emptyCatalogTitle}
                    description={copy.emptyCatalogDescription}
                  />
                ) : (
                  <form onSubmit={handleAddItem} aria-label={copy.addItemHeading} className="flex flex-col gap-4">
                    <h3 className="text-base font-semibold text-ink">{copy.addItemHeading}</h3>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField htmlFor="tp-tooth-number" label={copy.toothLabel} hint={copy.toothHint}>
                        <Input
                          id="tp-tooth-number"
                          value={toothNumber}
                          placeholder={copy.toothPlaceholder}
                          onChange={(e) => setToothNumber(e.target.value)}
                        />
                      </FormField>

                      <FormField htmlFor="tp-procedure" label={copy.procedureLabel}>
                        <select
                          id="tp-procedure"
                          value={catalogItemId}
                          onChange={(e) => handleProcedureChange(e.target.value)}
                          className={fieldClass}
                        >
                          <option value="">{copy.procedureEmptyOption}</option>
                          {catalogItems.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.labelEs}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField htmlFor="tp-price" label={copy.priceLabel}>
                        <Input
                          id="tp-price"
                          type="number"
                          min={0}
                          step="0.01"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                        />
                      </FormField>

                      <fieldset className="flex flex-col gap-2">
                        <legend className="text-sm font-medium text-ink">{copy.surfacesLegend}</legend>
                        <div className="flex flex-wrap gap-3">
                          {SURFACE_ORDER.map((surface) => (
                            <label
                              key={surface}
                              htmlFor={`tp-surface-${surface}`}
                              className="flex items-center gap-1.5 text-sm text-ink"
                            >
                              <input
                                id={`tp-surface-${surface}`}
                                type="checkbox"
                                checked={surfaces[surface]}
                                onChange={(e) => handleSurfaceChange(surface, e.target.checked)}
                              />
                              {SURFACE_LABELS[surface]}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </div>

                    <FormField htmlFor="tp-notes" label={copy.notesLabel}>
                      <textarea
                        id="tp-notes"
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className={cn(fieldClass, 'h-auto')}
                      />
                    </FormField>

                    {addItemValidationError && (
                      <p role="alert" className="text-sm text-danger">
                        {addItemValidationError}
                      </p>
                    )}
                    {addItemError && (
                      <p role="alert" className="text-sm text-danger">
                        {addItemError}
                      </p>
                    )}

                    <Button type="submit" disabled={addItemSubmitting} className="self-start">
                      {addItemSubmitting ? copy.addItemSubmitting : copy.addItemSubmit}
                    </Button>
                  </form>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
