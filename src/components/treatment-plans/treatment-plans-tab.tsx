'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createPlan,
  getPlan,
  listPlans,
  removeItem,
  updateItem,
  updatePlan,
  type TreatmentPlan,
  type TreatmentPlanItem,
  type TreatmentPlanItemStatus,
  type TreatmentPlanStatus,
} from '@/lib/treatment-plans/treatment-plans-api';
import { PLAN_STATUS_LABELS, isPlanBillable, isPlanClosed } from '@/lib/treatment-plans/plan-status';
import {
  getPlanBalance,
  listPayments,
  voidPayment,
  type Payment,
  type PlanBalance,
} from '@/lib/payments/payments-api';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { activeSedeCurrency } from '@/lib/locations/location-settings';
import { paymentLocationHint } from '@/lib/payments/payment-location';
import { getTokenAllowedLocationIds, getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import { canRecordPayments } from '@/lib/payments/billable-plans-api';
import { optionGroupOf, patchableStatuses } from '@/lib/treatment-plans/plan-options';
import { useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { getDiscountPolicy } from '@/lib/discounts/discounts-api';
import type { DiscountRules } from '@/lib/discounts/discount-rules';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { FormField } from '@/components/shared/form-field';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Disclosure } from '@/components/shared/disclosure';
import { PaymentReceiptDialog } from '@/components/payments/payment-receipt-dialog';
import { VoidPaymentModal } from '@/components/payments/void-payment-modal';
import { voidPaymentErrorMessage } from '@/components/payments/use-void-payment';
import { ReallocatePaymentModal } from '@/components/payments/reallocate-payment-modal';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { BulkDiscountModal, bulkDiscountCopy } from '@/components/discounts/bulk-discount-modal';
import { VoidCancellationFeeModal } from '@/components/appointments/fee-reason-modal';
import { PaymentPlanSection } from './payment-plan-section';
import { PlanVisitsBoard } from './plan-visits-board';
import { PlanQuoteActions } from './plan-quote-actions';
import { planPrimaryAction } from '@/lib/treatment-plans/plan-primary-action';
import { PlanOptionsPanel } from './plan-options-panel';
import { MarkDoneModal } from './mark-done-modal';
import { ItemsTable } from './plan-items-table';
import { PlanItemForm } from './plan-item-form';
import { PlanMoneySummary } from './plan-money-summary';
import { PlanPaymentFormModal } from './plan-payment-form-modal';
import { PlanPaymentsList, paymentRowActionsButton } from './plan-payments-list';
import {
  PAYMENTS_TRIGGER_ID,
  copy,
  feeReferences,
  procedureName,
  splitLinesOf,
} from './treatment-plans-tab-copy';

/*
 * La pestaña «Plan de tratamiento» de la ficha. Las piezas viven en ficheros
 * propios: la tabla de ítems (`plan-items-table`), el formulario «Agregar
 * ítem» (`plan-item-form`), el modal «Registrar abono»
 * (`plan-payment-form-modal`), la lista de abonos (`plan-payments-list`) y
 * las cifras (`plan-money-summary`); el copy, en `treatment-plans-tab-copy`.
 */

interface TreatmentPlansTabProps {
  patientId: string;
  token: string;
  /**
   * The tooth carried in the page's `?tooth=` param (the odontogram's half of
   * the bridge): its items come highlighted and "Agregar ítem" opens on it.
   */
  focusedTooth?: string | null;
  /** Builds the href of the odontogram tab focused on `toothNumber`. */
  odontogramHref?: (toothNumber: string) => string;
  /**
   * DX-191: href de «Registrar implante» para un ítem (sección «Implantes» con
   * el formulario abierto, el diente y el ítem puestos). Sin él (rol que no
   * registra implantes) no se pinta.
   */
  implantHref?: (item: TreatmentPlanItem) => string;
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
 * - the SELECTED plan's balance + abonos (`getPlanBalance`/`listPayments`,
 *   PAY-T4) — a genuinely separate pair of endpoints from `getPlan` above,
 *   but loaded with the exact same `loadedPaymentsPlanIdRef` shape whenever
 *   `selectedPlanId` changes.
 *
 * All item/plan mutations (`addItem`, `updateItem`, `removeItem`,
 * `updatePlan`) call `refreshPlanDetail()` directly and AWAIT it before
 * clearing their own busy flag — this is `AgendaView.handleStatusChange`'s
 * fix, not `OdontogramTab`'s reload-key bump: a row's disabled control must
 * stay disabled for the whole window until the refetched `planDetail`
 * actually lands, not just until the mutation's own promise settles,
 * otherwise the control re-enables showing the stale pre-change value. The
 * abono mutations (`recordPayment`/`voidPayment`) follow the identical
 * pattern against `refreshBalanceAndPayments()`.
 */
export function TreatmentPlansTab({
  patientId,
  token,
  // El diente que trajo al usuario desde el odontograma (`?tooth=` en la
  // página). Se renombra al desestructurar porque dentro de este componente
  // «focusedTooth» ya es el nombre de la prop que baja a `ItemsTable`.
  focusedTooth: focusedToothOnPlan = null,
  odontogramHref,
  implantHref,
}: TreatmentPlansTabProps) {
  // DX-097: la fecha por defecto del abono es hoy en la zona de la sede. Sin
  // su zona, la fecha empieza vacía (nunca se cuenta en otra zona).
  const sedeZone = useSedeTimeZone(token);
  // DX-375/DX-378: la tasa congelada de cada abono, con el formato de la sede.
  const sedeFmt = readyFormat(useSedeFormat(token));
  // DX-051: saldo y abonos solo para los roles de cobro (los mismos
  // PAYMENT_ROLES que la API). DENTIST y ASSISTANT no ven datos de pago: ni se
  // piden (serían 403 y un toast en cada acción) ni se pinta su sección.
  const canSeeBilling = canRecordPayments(getTokenRole(token));
  // Plans list + catalog (loaded together).
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [catalogItems, setCatalogItems] = useState<DentalCatalogItem[]>([]);
  const [allCatalogItems, setAllCatalogItems] = useState<DentalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [creatingPlan, setCreatingPlan] = useState(false);
  const [createPlanError, setCreatePlanError] = useState<string | null>(null);
  // Transient "Plan creado" confirmation — the POST always succeeded, but with
  // same-day identical labels the create looked like a no-op; this makes the
  // success visible. Stays until the next create (cleared at its start).
  const [planCreated, setPlanCreated] = useState(false);
  // Distinct from `planCreated`: set when "Nuevo plan" reused an existing empty
  // DRAFT (no POST) instead of creating one. Cleared at the next create attempt.
  const [planReused, setPlanReused] = useState(false);
  // GLOBAL-G1 (R14): la moneda de un plan nuevo empieza vacía y se sugiere con
  // la de la sede activa o, sin sede activa, la común de la clínica (más abajo,
  // al tener las sedes). Si no hay ninguna, hay que elegirla. Nunca USD.
  const [newPlanCurrencyChoice, setNewPlanCurrency] = useState('');

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Selected plan's detail (items + total).
  const [planDetail, setPlanDetail] = useState<TreatmentPlan | null>(null);
  const [planDetailLoading, setPlanDetailLoading] = useState(false);
  const [planDetailError, setPlanDetailError] = useState<string | null>(null);
  const [planDetailRefreshing, setPlanDetailRefreshing] = useState(false);
  // Bumped by the `planDetailRefreshError` toast's retry action — a
  // functional `setState` updater has stable identity across renders, so
  // this needs no ref to stay "fresh": the effect below re-derives from
  // whatever `selectedPlanId` currently is when it re-runs, rather than the
  // stale one captured when the toast was built (Fix round 1, see plan doc).
  const [planDetailReloadKey, setPlanDetailReloadKey] = useState(0);
  const loadedPlanIdRef = useRef<string | null>(null);

  const [updatingPlanStatus, setUpdatingPlanStatus] = useState(false);
  const [planStatusError, setPlanStatusError] = useState<string | null>(null);

  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  // Quitar un ítem es irreversible desde la app (soft-delete que ya no se
  // vuelve a listar): la fila abre un `ConfirmDialog` y el id vive aquí hasta
  // que se confirma o se cancela. El error va al diálogo, no a la línea
  // inline de arriba, que es la del cambio de estado.
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  // SEC-050: el ítem cuyo cargo por inasistencia se está anulando.
  const [feeToVoid, setFeeToVoid] = useState<TreatmentPlanItem | null>(null);
  // DX-343: tras anular (o un 409) la fila del cargo puede desaparecer; el
  // foco va al encabezado de los ítems en vez de perderse.
  const itemsHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusItemsHeadingOnClose = useRef(false);
  // DX-343: el plan cuyo cargo dio 409. Hasta que una lectura del plan salga
  // bien, sus «Anular cargo» quedan deshabilitados; el ref deja al efecto de
  // carga comprobarlo sin depender de este estado.
  const [feeStalePlanId, setFeeStalePlanId] = useState<string | null>(null);
  const feeStalePlanRef = useRef<string | null>(null);
  const feeStale = feeStalePlanId === selectedPlanId && selectedPlanId !== null;
  const [feeReloadFailed, setFeeReloadFailed] = useState(false);
  // DX-050: el ítem que se marca como realizado (eligiendo quién lo hizo) o
  // cuya atribución corrige un ADMIN.
  const [markDone, setMarkDone] = useState<{ itemId: string; mode: 'done' | 'correct' } | null>(null);
  const [removeItemError, setRemoveItemError] = useState<string | null>(null);

  // Balance + abonos (PAY-T4) — a genuinely separate resource from
  // `planDetail` (its own endpoints, `getPlanBalance`/`listPayments`), loaded
  // together whenever `selectedPlanId` changes, same
  // isInitialLoad/loadedXIdRef shape as `planDetail` below.
  const [planBalance, setPlanBalance] = useState<PlanBalance | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [paymentsRefreshing, setPaymentsRefreshing] = useState(false);
  // Same rationale as `planDetailReloadKey` above: the `paymentsRefreshError`
  // toast's retry bumps this instead of closing over a ref.
  const [paymentsReloadKey, setPaymentsReloadKey] = useState(0);
  const loadedPaymentsPlanIdRef = useRef<string | null>(null);


  // «Registrar abono»: `seq` remonta el modal en cada apertura (formulario
  // limpio e Idempotency-Key nueva); `open` aparte para cerrar con animación.
  const [paymentForm, setPaymentForm] = useState<{ open: boolean; seq: number } | null>(null);

  const [voidingPaymentId, setVoidingPaymentId] = useState<string | null>(null);
  // Igual que `itemToRemove`: anular mueve dinero en el saldo y no tiene
  // deshacer, así que pasa por confirmación y su fallo se queda en el diálogo.
  const [paymentToVoid, setPaymentToVoid] = useState<string | null>(null);
  // DX-051: el abono cuya imputación edita un ADMIN, y el botón que lo abrió
  // (para devolverle el foco, o llevarlo al pliegue si la fila ya no está).
  // `open` aparte del abono, para que el modal se cierre con su animación;
  // `seq` lo remonta (y relee) en cada apertura, aunque sea el mismo abono.
  const [allocation, setAllocation] = useState<{ paymentId: string; open: boolean; seq: number } | null>(null);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);

  // Bumped whenever the balance/abonos refresh, so the payment-plan section
  // refetches and recomputes installment coverage.
  const [paymentPlanRefreshSignal, setPaymentPlanRefreshSignal] = useState(0);

  // Recibo de caja (DX-136): el id del abono es a la vez el destino del
  // diálogo y su bandera de apertura. El diálogo pide el recibo a la API (su
  // foto inmutable), así que aquí no hace falta nada más del paciente.
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);

  // Sedes de la clínica + sede activa: para decir a qué sede quedará
  // atribuido un abono nuevo y para sugerir la moneda de un plan nuevo. Se
  // piden una vez y fallan en silencio: si no se sabe la sede, la línea no
  // aparece y la moneda del plan nuevo queda por elegir.
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [locationsReloadKey, setLocationsReloadKey] = useState(0);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const newPlanCurrency =
    newPlanCurrencyChoice || activeSedeCurrency(locations, activeLocationId).currency || '';

  // DX-204: motivo del descuento del ítem nuevo, política de la clínica (para
  // avisar antes; la API la aplica) y la selección de «Descuento %».
  const [discountRules, setDiscountRules] = useState<DiscountRules | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKey, setBulkKey] = useState(0);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

  // Política de descuentos (DX-204): solo para avisar del tope y del motivo
  // antes de enviar. Si no carga, el formulario no avisa y la API sigue
  // aplicándola (sus 403/422 llegan en español).
  useEffect(() => {
    let cancelled = false;
    getDiscountPolicy(token)
      .then((policy) => {
        if (!cancelled) setDiscountRules(policy);
      })
      .catch(() => {
        /* sin política, sin aviso previo: decide la API */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Otra selección de plan, otra selección de ítems.
  const [selectionPlanId, setSelectionPlanId] = useState(selectedPlanId);
  if (selectionPlanId !== selectedPlanId) {
    setSelectionPlanId(selectedPlanId);
    setSelectedItemIds(new Set());
    setBulkNotice(null);
  }

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
          // Todos (también los inactivos): un ítem ya dado de alta conserva su
          // nombre aunque el procedimiento se retire (p. ej. el cargo por
          // inasistencia de DX-291, inactivo a propósito). El selector solo
          // ofrece los activos.
          listCatalogItems(token, { kind: 'PROCEDURE' }),
        ]);
        if (cancelled) return;
        setPlans(plansData);
        setAllCatalogItems(catalogData);
        setCatalogItems(catalogData.filter((item) => item.active));
        setLoadError(null);
        setHasLoadedOnce(true);
      } catch (err) {
        if (cancelled) return;
        const message = apiErrorMessage(err, copy.genericLoadError);
        if (isInitialLoad) {
          setLoadError(message);
        } else {
          // Retry re-triggers this same effect (dep below) rather than
          // closing over a ref — a functional `setState` updater has stable
          // identity, so it can't go stale even if `token`/`patientId`
          // change again before the toast is dismissed (Fix round 1).
          notifyError(copy.genericRefreshError, { onRetry: () => setReloadKey((k) => k + 1) });
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

  useEffect(() => {
    let cancelled = false;
    // La sede activa vive en localStorage, que solo existe en el cliente: se
    // lee en el efecto, no como estado inicial, para no romper la hidratación
    // (mismo criterio que `LocationSwitcher`). Cambiar de sede fuerza un
    // `window.location.reload()` allí, así que no hace falta suscribirse.
    //
    // Se lee DENTRO del `.then` y no en el cuerpo del efecto: sin la lista de
    // sedes el id no se puede convertir en nombre, así que antes de que
    // resuelva no sirve de nada — y un setState síncrono en el cuerpo de un
    // efecto encadena renders.
    listLocations(token)
      .then((data) => {
        if (cancelled) return;
        setLocations(data ?? []);
        setActiveLocationId(getActiveLocationId());
      })
      .catch(() => {
        /* fail soft — sin la lista de sedes simplemente no se nombra ninguna */
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, locationsReloadKey]);

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
  // D2: lo informa `PlanVisitsBoard` (¿queda alguna visita por agendar?).
  const [hasSchedulableVisit, setHasSchedulableVisit] = useState(false);
  if (selectedPlanId !== prevSelectedPlanId) {
    setPrevSelectedPlanId(selectedPlanId);
    setHasSchedulableVisit(false);
    setPlanDetail(null);
    // Balance/abonos (PAY-T4) — same rationale: a different plan is a
    // genuinely different resource, and an in-progress abono form must not
    // carry over to the wrong plan.
    setPlanBalance(null);
    setPayments([]);
  }

  const catalogById = new Map(allCatalogItems.map((item) => [item.id, item]));


  // Lo único de esta página donde la sede activa SÍ decide algo: a qué sede
  // queda atribuido un abono nuevo. Mismo aviso que el estado de cuenta
  // (`paymentLocationHint`: nada con una sola sede).
  const locationHint = paymentLocationHint(
    locations,
    activeLocationId,
    getTokenAllowedLocationIds(token),
  );


  function refreshPlansInPlace(): Promise<void> {
    setRefreshing(true);
    return listPlans(token, patientId)
      .then((data) => {
        setPlans(data);
      })
      .catch((err) => {
        // The toast's `onRetry` is built once inside this `catch` and can sit
        // on screen across renders. Bumping `reloadKey` (a functional
        // `setState` updater, stable identity) re-triggers the mount effect
        // above instead of closing over `refreshPlansInPlace` directly — a
        // ref-based guard was tried first but writing `ref.current` during
        // render trips this project's `react-hooks/refs` lint (Fix round 1;
        // see the plan doc's "Global Constraints" for the accepted forms).
        notifyError(apiErrorMessage(err, copy.genericRefreshError), {
          onRetry: () => setReloadKey((k) => k + 1),
        });
      })
      .finally(() => setRefreshing(false));
  }

  /**
   * Finds an existing reusable DRAFT plan (open + no items) to switch to
   * instead of POSTing another empty plan. `listPlans` returns plans WITHOUT
   * `items`/`total` (only `getPlan` populates them — see treatment-plans-api.ts),
   * so each DRAFT candidate's emptiness is confirmed with a `getPlan` fetch.
   * Returns the first empty DRAFT, or null when there's none to reuse (no DRAFT
   * at all, or every DRAFT already has items — a real in-progress plan we must
   * never collapse into).
   */
  async function findReusableDraftPlan(): Promise<TreatmentPlan | null> {
    const drafts = plans.filter((p) => p.status === 'DRAFT');
    for (const draft of drafts) {
      const detail = await getPlan(token, draft.id);
      if ((detail.items?.length ?? 0) === 0) return detail;
    }
    return null;
  }

  async function handleCreatePlan() {
    setCreatingPlan(true);
    setCreatePlanError(null);
    setPlanCreated(false);
    setPlanReused(false);
    try {
      // Dup guard: before POSTing, reuse an existing open DRAFT that has no
      // items — clicking "Nuevo plan" repeatedly used to accumulate empty
      // DRAFTs. Only create when there's genuinely nothing to reuse.
      const reusable = await findReusableDraftPlan();
      if (reusable) {
        await refreshPlansInPlace();
        setSelectedPlanId(reusable.id);
        setPlanReused(true);
        return;
      }
      if (!newPlanCurrency) {
        setCreatePlanError(copy.newPlanCurrencyRequired);
        document.getElementById('tp-new-plan-currency')?.focus();
        return;
      }
      const created = await createPlan(token, patientId, { currency: newPlanCurrency });
      await refreshPlansInPlace();
      setSelectedPlanId(created.id);
      setPlanCreated(true);
    } catch (err) {
      setCreatePlanError(apiErrorMessage(err, copy.genericCreatePlanError));
    } finally {
      setCreatingPlan(false);
    }
  }

  // Selected plan's detail: a genuinely new plan id (tracked via
  // `loadedPlanIdRef`, not state) is an initial load — full blocking status,
  // nothing to preserve from the previously-selected plan. Reloading the SAME
  // plan happens two ways: mutations call `refreshPlanDetail()` directly
  // (see below), and the `planDetailRefreshError` toast's retry bumps
  // `planDetailReloadKey` instead — either way this effect only ever treats
  // it as a background refresh (`isInitialLoad` stays false once a plan has
  // loaded once), never as the initial blocking load.
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
        if (feeStalePlanRef.current === selectedPlanId) {
          feeStalePlanRef.current = null;
          setFeeStalePlanId(null);
          setFeeReloadFailed(false);
        }
        loadedPlanIdRef.current = selectedPlanId;
        setPlanDetailError(null);
      } catch (err) {
        if (cancelled) return;
        const message = apiErrorMessage(err, copy.genericPlanDetailError);
        if (isInitialLoad) {
          setPlanDetailError(message);
        } else if (feeStalePlanRef.current === selectedPlanId) {
          setFeeReloadFailed(true);
        } else {
          // Retry bumps `planDetailReloadKey` (functional `setState`
          // updater, stable identity) rather than closing over a ref — see
          // `refreshPlanDetail`'s catch below for the full rationale.
          notifyError(copy.genericPlanDetailRefreshError, {
            onRetry: () => setPlanDetailReloadKey((k) => k + 1),
          });
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
    // `planDetailReloadKey` is a dep purely so the toast above can retry by
    // bumping it — it re-runs this exact effect, which re-reads
    // `selectedPlanId` fresh rather than a value closed over when the toast
    // was built.
  }, [token, selectedPlanId, planDetailReloadKey]);

  /**
   * Re-fetches the selected plan's detail in place. Called directly by every
   * item/plan mutation below AND awaited by them before clearing their own
   * busy flag — see the component doc comment for why
   * (`AgendaView.handleStatusChange`'s fix).
   */
  function refreshPlanDetail(): Promise<void> {
    if (!selectedPlanId) return Promise.resolve();
    setPlanDetailRefreshing(true);
    return getPlan(token, selectedPlanId)
      .then((data) => {
        setPlanDetail(data);
        setPlanDetailError(null);
      })
      .catch((err) => {
        // The toast's `onRetry` is built once inside this `catch` and can
        // sit on screen across renders. Bumping `planDetailReloadKey`
        // re-triggers the effect above (which re-reads `selectedPlanId`
        // fresh) instead of closing over `refreshPlanDetail` directly — a
        // ref-based guard was tried first but writing `ref.current` during
        // render trips this project's `react-hooks/refs` lint (Fix round 1;
        // see the plan doc's "Global Constraints" for the accepted forms).
        notifyError(apiErrorMessage(err, copy.genericPlanDetailRefreshError), {
          onRetry: () => setPlanDetailReloadKey((k) => k + 1),
        });
      })
      .finally(() => setPlanDetailRefreshing(false));
  }

  // Balance + abonos (PAY-T4): a genuinely separate resource from
  // `planDetail` above (different endpoints), but fetched with the exact
  // same isInitialLoad/loadedXIdRef shape whenever `selectedPlanId` changes —
  // `planBalance`/`payments` are already cleared synchronously (during
  // render, see the `prevSelectedPlanId` block) whenever `selectedPlanId`
  // changes, so this effect only needs to handle the "fetch" case.
  useEffect(() => {
    if (!selectedPlanId || !canSeeBilling) return;
    let cancelled = false;
    const isInitialLoad = loadedPaymentsPlanIdRef.current !== selectedPlanId;

    async function load() {
      if (isInitialLoad) {
        setPlanBalance(null);
        setPayments([]);
        setPaymentsLoading(true);
      } else {
        setPaymentsRefreshing(true);
      }
      try {
        const [balanceData, paymentsData] = await Promise.all([
          getPlanBalance(token, selectedPlanId as string),
          listPayments(token, selectedPlanId as string),
        ]);
        if (cancelled) return;
        setPlanBalance(balanceData);
        setPayments(paymentsData);
        loadedPaymentsPlanIdRef.current = selectedPlanId;
        setPaymentsError(null);
      } catch (err) {
        if (cancelled) return;
        const message = apiErrorMessage(err, copy.genericBalanceError);
        if (isInitialLoad) {
          setPaymentsError(message);
        } else {
          // Retry bumps `paymentsReloadKey` (functional `setState` updater,
          // stable identity) rather than closing over a ref — see
          // `refreshBalanceAndPayments`'s catch below for the full rationale.
          notifyError(copy.genericBalanceRefreshError, {
            onRetry: () => setPaymentsReloadKey((k) => k + 1),
          });
        }
      } finally {
        if (!cancelled) {
          setPaymentsLoading(false);
          setPaymentsRefreshing(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // `paymentsReloadKey` is a dep purely so the toast above can retry by
    // bumping it — same rationale as `planDetailReloadKey` above.
  }, [token, selectedPlanId, paymentsReloadKey, canSeeBilling]);

  /**
   * Re-fetches the balance + abonos list in place. Called directly by
   * `handleAddPayment`/`handleVoidPayment` below AND awaited by them before
   * clearing their own busy flag — same "await the refresh before
   * re-enabling" fix as `refreshPlanDetail` above.
   */
  function refreshBalanceAndPayments(): Promise<void> {
    if (!selectedPlanId || !canSeeBilling) return Promise.resolve();
    setPaymentsRefreshing(true);
    return Promise.all([getPlanBalance(token, selectedPlanId), listPayments(token, selectedPlanId)])
      .then(([balanceData, paymentsData]) => {
        setPlanBalance(balanceData);
        setPayments(paymentsData);
        setPaymentPlanRefreshSignal((n) => n + 1);
        setPaymentsError(null);
      })
      .catch((err) => {
        // The toast's `onRetry` is built once inside this `catch` and can
        // sit on screen across renders. Bumping `paymentsReloadKey`
        // re-triggers the effect above (which re-reads `selectedPlanId`
        // fresh) instead of closing over `refreshBalanceAndPayments`
        // directly — a ref-based guard was tried first but writing
        // `ref.current` during render trips this project's `react-hooks/refs`
        // lint (Fix round 1; see the plan doc's "Global Constraints" for the
        // accepted forms).
        notifyError(apiErrorMessage(err, copy.genericBalanceRefreshError), {
          onRetry: () => setPaymentsReloadKey((k) => k + 1),
        });
      })
      .finally(() => setPaymentsRefreshing(false));
  }


  /** Abre «Registrar abono» con un formulario nuevo. */
  function openPaymentForm() {
    setPaymentForm((prev) => ({ open: true, seq: (prev?.seq ?? 0) + 1 }));
  }

  function openAllocation(paymentId: string) {
    setAllocation((prev) => ({ paymentId, open: true, seq: (prev?.seq ?? 0) + 1 }));
  }

  /**
   * Al cerrar «Imputar abono» el foco vuelve al «⋯» de su fila; si la fila ya
   * no está (p. ej. lo anuló otra persona), al pliegue de abonos.
   */
  function focusAfterAllocation(event: Event) {
    event.preventDefault();
    const payment = payments.find((p) => p.id === allocation?.paymentId);
    const trigger = payment ? paymentRowActionsButton(payment, sedeFmt) : null;
    (trigger ?? document.getElementById(PAYMENTS_TRIGGER_ID))?.focus();
  }

  /** La fila ya no anula: abre la confirmación. */
  function openVoidConfirm(paymentId: string) {
    setPaymentActionError(null);
    setPaymentToVoid(paymentId);
  }

  async function handleVoidPayment(reason: string) {
    const paymentId = paymentToVoid;
    if (!paymentId) return;
    setVoidingPaymentId(paymentId);
    setPaymentActionError(null);
    try {
      await voidPayment(token, paymentId, reason);
      // Se cierra antes de refrescar, como en `payment-plan-section`: el
      // diálogo solo sigue abierto si hay algo que decidir.
      setPaymentToVoid(null);
      await refreshBalanceAndPayments();
    } catch (err) {
      setPaymentActionError(voidPaymentErrorMessage(err));
    } finally {
      setVoidingPaymentId(null);
    }
  }

  async function handlePlanStatusChange(status: TreatmentPlanStatus) {
    if (!selectedPlanId) return;
    setUpdatingPlanStatus(true);
    setPlanStatusError(null);
    try {
      await updatePlan(token, selectedPlanId, { status });
      // Aceptar pasa los ítems propuestos a aceptados (lo facturable deja de
      // ser 0) y cancelar anula también el plan de cuotas activo (DX-109): el
      // saldo y el plan de pagos se refrescan con el plan, como al firmar.
      await Promise.all([refreshPlanDetail(), refreshPlansInPlace(), refreshBalanceAndPayments()]);
    } catch (err) {
      setPlanStatusError(apiErrorMessage(err, copy.genericPlanStatusError));
    } finally {
      setUpdatingPlanStatus(false);
    }
  }

  async function handleItemStatusChange(itemId: string, status: TreatmentPlanItemStatus) {
    if (!selectedPlanId) return;
    // DX-050: «Realizado» pide antes quién lo hizo.
    const current = planDetail?.items?.find((i) => i.id === itemId);
    if (status === 'DONE' && current && current.status !== 'DONE') {
      setMarkDone({ itemId, mode: 'done' });
      return;
    }
    setUpdatingItemId(itemId);
    setItemActionError(null);
    try {
      await updateItem(token, selectedPlanId, itemId, { status });
      // Propuesto ↔ aceptado cambia lo facturable: el saldo va con el ítem.
      await Promise.all([refreshPlanDetail(), refreshBalanceAndPayments()]);
    } catch (err) {
      setItemActionError(apiErrorMessage(err, copy.genericItemUpdateError));
    } finally {
      setUpdatingItemId(null);
    }
  }

  /** DX-050: el modal guardó; el ítem (y lo facturable) se refrescan. */
  function handleMarkDoneSaved() {
    setMarkDone(null);
    setItemActionError(null);
    void Promise.all([refreshPlanDetail(), refreshBalanceAndPayments()]);
  }

  /** La fila ya no quita: abre la confirmación. */
  function openRemoveConfirm(itemId: string) {
    setRemoveItemError(null);
    setItemToRemove(itemId);
  }

  async function handleRemoveItem() {
    const itemId = itemToRemove;
    if (!selectedPlanId || !itemId) return;
    setUpdatingItemId(itemId);
    setRemoveItemError(null);
    try {
      await removeItem(token, selectedPlanId, itemId);
      setItemToRemove(null);
      // DX-051: quitar un ítem libera lo que tenía imputado y lo reparte.
      await Promise.all([refreshPlanDetail(), refreshBalanceAndPayments()]);
    } catch (err) {
      setRemoveItemError(apiErrorMessage(err, copy.genericRemoveItemError));
    } finally {
      setUpdatingItemId(null);
    }
  }

  /**
   * Tras aceptar con firma (DX-012) cambian el estado del plan (selector y
   * lista), sus ítems (propuestos → aceptados, ya congelados) y por tanto lo
   * facturable: se refresca todo en su sitio.
   */
  function handlePlanAccepted() {
    void Promise.all([refreshPlanDetail(), refreshPlansInPlace(), refreshBalanceAndPayments()]);
  }

  /**
   * Presentar, rechazar o crear una alternativa (DX-040) cambian el estado del
   * plan y, con una alternativa nueva, la lista de planes: se refrescan los
   * dos en su sitio. Y el saldo: rechazar libera todo lo imputado (DX-051).
   */
  async function handlePlanOptionsChanged(): Promise<void> {
    await Promise.all([refreshPlanDetail(), refreshPlansInPlace(), refreshBalanceAndPayments()]);
  }


  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <span className="sr-only">{copy.loading}</span>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError) {
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const signed = Boolean(planDetail?.acceptance);
  // DX-109: lo mismo que la API aplica con 409, para no ofrecerlo.
  const closed = planDetail ? isPlanClosed(planDetail.status) : false;
  const billable = planDetail ? isPlanBillable(planDetail.status) : true;
  const role = getTokenRole(token);
  const sessionUserId = getTokenUserId(token);
  // DX-051: cobrado por ítem y abonos fijados a mano. Solo existen si el saldo
  // respondió: DENTIST y ASSISTANT (403) no ven nada nuevo.
  const itemBalances = planBalance ? new Map(planBalance.items.map((item) => [item.itemId, item])) : undefined;
  const manualPaymentIds = planBalance ? new Set(planBalance.manualPaymentIds) : undefined;
  // DX-050: el ítem del modal «Marcar como realizado» / «Corregir».
  const markDoneItem = markDone ? (planDetail?.items?.find((i) => i.id === markDone.itemId) ?? null) : null;
  // DX-204: un presupuesto aceptado (firmado o no) o cerrado no se vuelve a
  // descontar.
  const discountable = Boolean(planDetail) && !signed && !closed && planDetail?.status !== 'ACCEPTED';
  const statusChoices = planDetail ? patchableStatuses(planDetail.status, role) : [];
  const optionGroup = selectedPlan ? optionGroupOf(plans, selectedPlan) : [];
  // D2: UNA primaria con el plan abierto, elegida por su estado (borrador →
  // «Agregar ítem», presentado → «Aceptar con firma», aceptado → «Agendar
  // visita N» o cobrar). Todo lo demás del plan va en secundario.
  const primary = planDetail
    ? planPrimaryAction({
        status: planDetail.status,
        role,
        signed,
        itemCount: planDetail.items?.length ?? 0,
        canAddItems: !closed && catalogItems.length > 0,
        hasSchedulableVisit,
        canBill: canSeeBilling && billable,
        balance: planBalance?.balance ?? null,
      })
    : null;

  // Sin planes, crear el primero ES la acción de la pestaña (primaria); con
  // planes, la primaria del bloque es «Agregar ítem» y «Nuevo plan» baja a
  // secundaria (una primaria por vista, DESIGN.md).
  const newPlanVariant = plans.length === 0 ? 'default' : 'secondary';

  return (
    <div className="flex flex-col gap-8">
      {refreshing && (
        <p role="status" aria-live="polite" className="t-caption text-muted">
          {copy.refreshing}
        </p>
      )}

      {/* Bloques planos con cabecera de sección (UX v2): antes cada bloque era
          una `Card` y los vacíos, tarjetas discontinuas dentro de ella
          (tarjetas anidadas). */}
      <section className="flex flex-col gap-4" aria-labelledby="tp-plans-heading">
        <SectionHeader
          titleId="tp-plans-heading"
          title={copy.plansHeading}
          actions={
            // A 390px la moneda y «Nuevo plan» no caben junto al título: bajan
            // a su propia fila.
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <CurrencySelect
                id="tp-new-plan-currency"
                token={token}
                value={newPlanCurrency}
                onChange={(code) => {
                  setNewPlanCurrency(code);
                  setCreatePlanError(null);
                }}
                placeholder={newPlanCurrency ? undefined : copy.newPlanCurrencyPlaceholder}
                className="min-w-0 flex-1 sm:w-44 sm:flex-none"
                ariaLabel={copy.newPlanCurrencyLabel}
              />
              <Button type="button" variant={newPlanVariant} onClick={handleCreatePlan} disabled={creatingPlan}>
                {creatingPlan ? copy.creatingPlan : copy.newPlan}
              </Button>
            </div>
          }
        />
        {createPlanError && <InlineError>{createPlanError}</InlineError>}
        {planCreated && !createPlanError && (
          <p role="status" className="text-sm font-medium text-success-text">
            {copy.planCreated}
          </p>
        )}
        {planReused && !createPlanError && (
          <p role="status" className="text-sm font-medium text-ink">
            {copy.planReused}
          </p>
        )}
        {plans.length === 0 ? (
          <EmptyState role="status" title={copy.emptyPlansTitle} description={copy.emptyPlansDescription} />
        ) : (
          <FormField htmlFor="tp-plan-select" label={copy.selectPlanLabel} className="sm:max-w-md">
            <NativeSelect id="tp-plan-select" value={selectedPlanId ?? ''} onChange={(e) => setSelectedPlanId(e.target.value)}>
              {plans.map((plan, index) => (
                <option key={plan.id} value={plan.id}>
                  {copy.planOptionLabel(plan.createdAt, plan.status, index + 1, plan.optionLabel)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
      </section>

      {selectedPlanId && (
        <section className="flex flex-col gap-4 border-t border-border-subtle pt-6" aria-labelledby="tp-detail-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id="tp-detail-heading" className="t-title text-ink">
                {copy.detailHeading}
              </h2>
              {selectedPlan ? (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge kind="treatmentPlan" status={selectedPlan.status} />
                  {selectedPlan.optionLabel ? (
                    <span className="text-sm font-medium text-muted">{selectedPlan.optionLabel}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
            {planDetail && (
              <FormField htmlFor="tp-plan-status" label={copy.planStatusLabel} className="sm:w-56">
                {/* Solo el estado actual y sus transiciones (máquina de
                    estados, DX-040): presentar y rechazar tienen botón
                    propio, y aceptar es de odontólogo y ADMIN. */}
                <NativeSelect
                  id="tp-plan-status"
                  value={planDetail.status}
                  disabled={updatingPlanStatus || statusChoices.length === 1}
                  onChange={(e) => handlePlanStatusChange(e.target.value as TreatmentPlanStatus)}
                >
                  {statusChoices.map((status) => (
                    <option key={status} value={status}>
                      {PLAN_STATUS_LABELS[status]}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          </div>

          {planDetailLoading && (
            <div className="flex flex-col gap-3" role="status">
              <span className="sr-only">{copy.loadingPlanDetail}</span>
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          )}
          {/* El reintento de un fallo de escalón 1 bombea la reload key, no
              llama a `refreshPlanDetail`. Las dos cargan lo mismo, pero
              `refreshPlanDetail` es el camino de escalón 3 y su `catch` lanza
              un toast: si el reintento vuelve a fallar, el aviso se apilaría
              sobre esta misma superficie. La reload key re-dispara el efecto,
              cuyo `isInitialLoad` sigue siendo cierto (la carga inicial nunca
              fijó `loadedPlanIdRef`), así que el fallo se queda en el escalón
              1 donde le corresponde. */}
          {planDetailError && (
            <SectionError description={planDetailError} onRetry={() => setPlanDetailReloadKey((k) => k + 1)} />
          )}

          {!planDetailLoading && !planDetailError && planDetail && (
            <>
              {planDetailRefreshing && (
                <p role="status" aria-live="polite" className="t-caption text-muted">
                  {copy.refreshing}
                </p>
              )}
              {planStatusError && <InlineError>{planStatusError}</InlineError>}
              {itemActionError && <InlineError>{itemActionError}</InlineError>}

              {/* El presupuesto del plan (DX-012): imprimirlo y aceptarlo con
                  firma. Va antes de las cifras porque es lo que se presenta al
                  paciente. */}
              <PlanQuoteActions
                token={token}
                patientId={patientId}
                plan={planDetail}
                role={role}
                onAccepted={handlePlanAccepted}
                acceptPrimary={primary === 'accept'}
              />

              {/* La opción que se le presenta al paciente (DX-040): presentar,
                  rechazar, crear alternativa y comparar. */}
              <PlanOptionsPanel
                token={token}
                plan={planDetail}
                group={optionGroup}
                role={role}
                onChanged={handlePlanOptionsChanged}
                onSelectPlan={setSelectedPlanId}
              />

              {/* UNA región de dinero: las cuatro cifras del PLAN en una fila
                  etiquetada; las del financiamiento se quedan bajo «Plan de
                  pagos». */}
              <PlanMoneySummary
                token={token}
                total={planDetail.total ?? 0}
                currency={planDetail.currency}
                balance={planBalance}
              />
              {/* La nota de alcance califica la región entera, por eso va
                  pegada debajo y no repetida en cada número. */}
              <p className="t-label text-muted">{copy.paymentsScopeNote}</p>

              <div className="flex flex-col gap-4 border-t border-border-subtle pt-6">
                {/* El diente que trajo al usuario desde el odontograma, dicho
                    antes de la tabla para que se entienda por qué hay filas
                    resaltadas. */}
                {focusedToothOnPlan && (
                  <p role="status" className="text-sm font-medium text-ink">
                    {copy.focusedToothNotice(focusedToothOnPlan)}
                  </p>
                )}

                {/* DX-343: destino del foco cuando la fila del cargo desaparece. */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 ref={itemsHeadingRef} tabIndex={-1} className="t-title text-ink">
                    {copy.itemsTableCaption}
                  </h3>
                  {discountable && (planDetail.items ?? []).length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted tabular-nums">{copy.selectedCount(selectedItemIds.size)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setSelectedItemIds(
                              selectedItemIds.size === (planDetail.items ?? []).length
                                ? new Set()
                                : new Set((planDetail.items ?? []).map((i) => i.id)),
                            )
                          }
                        >
                          {selectedItemIds.size === (planDetail.items ?? []).length
                            ? copy.clearSelection
                            : copy.selectAll}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={selectedItemIds.size === 0 || discountRules === null}
                          onClick={() => {
                            setBulkNotice(null);
                            setBulkKey((k) => k + 1);
                            setBulkOpen(true);
                          }}
                        >
                          {copy.bulkDiscount}
                        </Button>
                    </div>
                  ) : null}
                </div>
                {planDetail.status === 'ACCEPTED' && !signed ? (
                  <p role="status" className="text-sm text-muted">
                    {copy.acceptedDiscountNotice}
                  </p>
                ) : null}
                <p role="status" className={bulkNotice ? 'text-sm text-success-text' : 'sr-only'}>
                  {bulkNotice}
                </p>

                {/* DX-343: tras un 409 la lista de ítems ya no es fiable. Si
                    releerla falla, cede su sitio al error de sección (escalón
                    1): no queda una tabla vieja con un aviso de «actualizando»
                    que ya no es verdad. */}
                {feeStale && feeReloadFailed ? (
                  <SectionError
                    description={copy.genericPlanDetailRefreshError}
                    onRetry={() => {
                      setFeeReloadFailed(false);
                      setPlanDetailReloadKey((k) => k + 1);
                    }}
                  />
                ) : (
                  <>
                    {feeStale ? (
                      <p role="status" className="text-sm text-muted">
                        {copy.feeRefreshing}
                      </p>
                    ) : null}
                    <PlanVisitsBoard
                      key={planDetail.id}
                      token={token}
                      plan={planDetail}
                      role={role}
                      onChanged={refreshPlanDetail}
                      primaryScheduling={primary === 'scheduleVisit'}
                      onSchedulableChange={setHasSchedulableVisit}
                      renderItems={(visitItems, { visit, ordered }) => (
                        <ItemsTable
                          items={visitItems}
                          visit={visit}
                          catalogById={catalogById}
                          currency={planDetail.currency}
                          feeStale={feeStale}
                          feeRefs={feeReferences(ordered)}
                          updatingItemId={updatingItemId}
                          focusedTooth={focusedToothOnPlan}
                          odontogramHref={odontogramHref}
                          implantHref={implantHref}
                          onStatusChange={handleItemStatusChange}
                          onRemove={openRemoveConfirm}
                          canLeaveDone={(item) => role === 'ADMIN' || item.performedById === sessionUserId}
                          onCorrectAttribution={
                            role === 'ADMIN' ? (itemId) => setMarkDone({ itemId, mode: 'correct' }) : undefined
                          }
                          onVoidFee={role === 'ADMIN' ? setFeeToVoid : undefined}
                          itemBalances={itemBalances}
                          fmt={sedeFmt}
                          locked={signed}
                          closed={closed}
                          markDoneOnly={planDetail?.status === 'COMPLETED'}
                          selection={
                            discountable
                              ? {
                                  selectedIds: selectedItemIds,
                                  onToggle: (itemId, checked) =>
                                    setSelectedItemIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) next.add(itemId);
                                      else next.delete(itemId);
                                      return next;
                                    }),
                                }
                              : undefined
                          }
                        />
                      )}
                    />
                  </>
                )}
              </div>

              {canSeeBilling ? (
                <div className="flex flex-col gap-4 border-t border-border-subtle pt-6">
                  {/* La nota de alcance NO se repite aquí: vive una sola vez
                      pegada a `PlanMoneySummary`. */}
                  <SectionHeader
                    as="h3"
                    title={copy.paymentsHeading}
                    actions={
                      <Button
                        type="button"
                        variant={primary === 'registerPayment' ? 'default' : 'secondary'}
                        size="sm"
                        onClick={openPaymentForm}
                        disabled={!billable}
                        aria-describedby={billable ? undefined : 'plan-not-billable-hint'}
                      >
                        {copy.registerPayment}
                      </Button>
                    }
                  />
                  {!billable && planDetail && (
                    <p id="plan-not-billable-hint" className="text-sm text-muted">
                      {copy.notBillableHint(PLAN_STATUS_LABELS[planDetail.status])}
                    </p>
                  )}

                  {paymentsLoading && (
                    <p role="status" className="text-sm text-muted">
                      {copy.loadingBalance}
                    </p>
                  )}
                  {paymentsError && (
                    // Misma razón que en `planDetailError` arriba: la reload
                    // key mantiene el fallo en el escalón 1 en vez de apilarle
                    // un toast de escalón 3.
                    <SectionError description={paymentsError} onRetry={() => setPaymentsReloadKey((k) => k + 1)} />
                  )}

                  {!paymentsLoading && !paymentsError && planBalance && (
                    <>
                      {paymentsRefreshing && (
                        <p role="status" aria-live="polite" className="t-caption text-muted">
                          {copy.refreshing}
                        </p>
                      )}

                      {paymentForm ? (
                        <PlanPaymentFormModal
                          key={`${planDetail.id}-${paymentForm.seq}`}
                          token={token}
                          open={paymentForm.open}
                          onOpenChange={(open) =>
                            setPaymentForm((prev) => (prev && !open ? { ...prev, open: false } : prev))
                          }
                          plan={planDetail}
                          planBalance={planBalance}
                          sedeZone={sedeZone}
                          sedeFmt={sedeFmt}
                          locationHint={locationHint}
                          onRecorded={refreshBalanceAndPayments}
                        />
                      ) : null}

                      {/* El detalle abono a abono se pliega; lo que decide si
                          hace falta abrirlo —cuántos abonos hay— se queda en la
                          propia fila, y el Saldo sigue arriba. Se esconde la
                          TABLA, nunca el número. Abierta por defecto cuando aún
                          no hay ningún abono, para que el vacío enseñe el
                          siguiente paso. */}
                      <Disclosure
                        triggerId={PAYMENTS_TRIGGER_ID}
                        summary={copy.paymentsDisclosure}
                        meta={copy.paymentsDisclosureMeta(payments.length)}
                        defaultOpen={payments.length === 0}
                      >
                        <PlanPaymentsList
                          payments={payments}
                          voidingPaymentId={voidingPaymentId}
                          onVoid={openVoidConfirm}
                          onReceipt={setReceiptPaymentId}
                          billable={billable}
                          manualPaymentIds={manualPaymentIds}
                          onAllocate={role === 'ADMIN' && billable ? openAllocation : undefined}
                          fmt={sedeFmt}
                        />
                      </Disclosure>

                      <div className="border-t border-border-subtle pt-6">
                        <PaymentPlanSection
                          token={token}
                          planId={selectedPlanId!}
                          planCurrency={planBalance.planCurrency}
                          billable={planBalance.billable}
                          canCreate={billable}
                          refreshSignal={paymentPlanRefreshSignal}
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {/* Firmado (DX-012): no se agregan ítems; `PlanQuoteActions` ya
                  dice arriba que el plan quedó congelado. Cerrado (DX-109):
                  tampoco. */}
              {closed && planDetail && !signed ? (
                <p role="status" className="text-sm text-muted">
                  {planDetail.status === 'COMPLETED'
                    ? copy.completedItemsNotice
                    : copy.closedItemsNotice(PLAN_STATUS_LABELS[planDetail.status])}
                </p>
              ) : null}
              {signed || closed ? null : (
                <div className="border-t border-border-subtle pt-6">
                  {catalogItems.length === 0 ? (
                    <EmptyState
                      size="inline"
                      role="status"
                      title={copy.emptyCatalogTitle}
                      description={copy.emptyCatalogDescription}
                      action={
                        <Button asChild variant="secondary" size="sm">
                          <Link href="/catalog">{copy.manageCatalogCta}</Link>
                        </Button>
                      }
                    />
                  ) : (
                    <PlanItemForm
                      key={planDetail.id}
                      token={token}
                      patientId={patientId}
                      plan={planDetail}
                      catalogItems={catalogItems}
                      catalogById={catalogById}
                      discountRules={discountRules}
                      role={role}
                      onAdded={() => Promise.all([refreshPlanDetail(), refreshBalanceAndPayments()])}
                      submitPrimary={primary === 'addItem'}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {planDetail && discountRules ? (
        <BulkDiscountModal
          key={bulkKey}
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          token={token}
          planId={planDetail.id}
          currency={planDetail.currency}
          items={(planDetail.items ?? []).filter((i) => selectedItemIds.has(i.id))}
          procedureOf={(item) => procedureName(item, catalogById)}
          rules={discountRules}
          role={role}
          onApplied={(updated, skippedNoDiscount) => {
            setSelectedItemIds(new Set());
            // DX-105: lo que no admite descuento se salta; se dice cuántos.
            setBulkNotice(
              [
                updated.length > 0 || skippedNoDiscount === 0 ? copy.bulkDiscountApplied(updated.length) : null,
                skippedNoDiscount > 0 ? bulkDiscountCopy.skipped(skippedNoDiscount) : null,
              ]
                .filter(Boolean)
                .join(' '),
            );
            // DX-051: el descuento baja lo facturable y libera lo imputado de más.
            void Promise.all([refreshPlanDetail(), refreshBalanceAndPayments()]);
          }}
        />
      ) : null}

      <PaymentReceiptDialog
        token={token}
        paymentId={receiptPaymentId}
        onOpenChange={(open) => {
          if (!open) setReceiptPaymentId(null);
        }}
      />

      {markDone && markDoneItem && planDetail ? (
        <MarkDoneModal
          key={`${markDone.itemId}-${markDone.mode}`}
          open
          onOpenChange={(open) => {
            if (!open) setMarkDone(null);
          }}
          token={token}
          planId={planDetail.id}
          item={markDoneItem}
          subject={copy.markDoneSubject(procedureName(markDoneItem, catalogById), markDoneItem.toothNumber)}
          mode={markDone.mode}
          // Se lee al abrir (tras un clic, sin riesgo de hidratación): es la
          // sede que el cliente HTTP manda en `X-Location-Id`.
          activeLocationId={getActiveLocationId()}
          locationName={locations.find((l) => l.id === getActiveLocationId())?.name ?? null}
          locations={locations}
          onRetryLocations={() => setLocationsReloadKey((k) => k + 1)}
          onSaved={handleMarkDoneSaved}
        />
      ) : null}

      {feeToVoid?.cancellationFeeAppointmentId ? (
        <VoidCancellationFeeModal
          key={feeToVoid.id}
          token={token}
          appointmentId={feeToVoid.cancellationFeeAppointmentId}
          onCloseAutoFocus={(event) => {
            if (!focusItemsHeadingOnClose.current) return;
            focusItemsHeadingOnClose.current = false;
            event.preventDefault();
            itemsHeadingRef.current?.focus();
          }}
          onClose={() => setFeeToVoid(null)}
          onDone={() => {
            focusItemsHeadingOnClose.current = true;
            setFeeToVoid(null);
            // El ítem sale del plan y deja de ser facturable.
            void Promise.all([refreshPlanDetail(), refreshBalanceAndPayments()]);
          }}
          onStale={() => {
            focusItemsHeadingOnClose.current = true;
            feeStalePlanRef.current = selectedPlanId;
            setFeeStalePlanId(selectedPlanId);
            setFeeReloadFailed(false);
            setPlanDetailReloadKey((k) => k + 1);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={itemToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setItemToRemove(null);
        }}
        title={copy.removeConfirmTitle}
        description={copy.removeConfirmDescription}
        confirmLabel={copy.removeConfirm}
        onConfirm={handleRemoveItem}
        confirming={updatingItemId !== null && updatingItemId === itemToRemove}
        error={removeItemError}
      />

      {allocation ? (
        <ReallocatePaymentModal
          key={allocation.seq}
          open={allocation.open}
          onOpenChange={(open) => {
            if (!open) setAllocation((prev) => (prev ? { ...prev, open: false } : prev));
          }}
          paymentId={allocation.paymentId}
          token={token}
          onSaved={() => void refreshBalanceAndPayments()}
          onCloseAutoFocus={focusAfterAllocation}
        />
      ) : null}

      {/* `key` por abono: cada anulación empieza con el motivo en blanco. */}
      <VoidPaymentModal
        key={paymentToVoid ?? 'none'}
        open={paymentToVoid !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentToVoid(null);
        }}
        onConfirm={handleVoidPayment}
        submitting={voidingPaymentId !== null && voidingPaymentId === paymentToVoid}
        error={paymentActionError}
        // Pinta el aviso de la ventana de recepción; la regla la aplica la API.
        restrictedToOwnToday={role !== 'ADMIN'}
        splitLines={splitLinesOf(payments, paymentToVoid)}
      />
    </div>
  );
}
