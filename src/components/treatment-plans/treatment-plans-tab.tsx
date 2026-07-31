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
import {
  getPlanBalance,
  listPayments,
  recordPayment,
  voidPayment,
  type Payment,
  type PaymentMethod,
  type PlanBalance,
  type RecordPaymentInput,
} from '@/lib/payments/payments-api';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import { getPatient } from '@/lib/patients/patients-api';
import { fetchClinicName } from '@/lib/clinic-branding';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/molecules/form-field';
import { FormModal } from '@/components/molecules/form-modal';
import { EmptyState } from '@/components/molecules/empty-state';
import { PaymentReceipt } from './payment-receipt';
import { cn } from '@/lib/utils';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';

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
  planCreated: 'Plan creado y seleccionado abajo.',
  genericCreatePlanError: 'No pudimos crear el plan. Intenta de nuevo.',
  emptyPlansTitle: 'Este paciente todavía no tiene un plan de tratamiento.',
  emptyPlansDescription: 'Crea el primer plan para empezar a registrar procedimientos.',
  selectPlanLabel: 'Plan',
  // Numbered + timestamped down to the minute so multiple plans created the
  // same day are distinguishable in the selector (fixes the "Nuevo plan looks
  // like it did nothing" perception — every option used to read identically as
  // "Plan del <date> — Borrador").
  planOptionLabel: (createdAt: string, status: TreatmentPlanStatus, number: number) =>
    `Plan ${number} · ${formatDateTime(createdAt)} — ${PLAN_STATUS_LABELS[status]}`,
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
  manageCatalogCta: 'Ir al catálogo',

  // Abonos + saldo (PAY-T4).
  paymentsHeading: 'Abonos y saldo',
  loadingBalance: 'Cargando saldo…',
  genericBalanceError: 'No pudimos cargar el saldo. Intenta de nuevo.',
  genericBalanceRefreshError: 'No pudimos actualizar el saldo. Intenta de nuevo.',
  billableLabel: 'A pagar',
  paidLabel: 'Pagado',
  balanceLabel: 'Saldo',
  registerPayment: 'Registrar abono',
  cancelPaymentForm: 'Cancelar',
  paymentAmountLabel: 'Monto',
  paymentCurrencyLabel: 'Moneda',
  paymentDateLabel: 'Fecha',
  paymentMethodLabel: 'Método',
  paymentMethodEmptyOption: 'Sin especificar',
  paymentNotesLabel: 'Notas',
  addPaymentSubmit: 'Registrar abono',
  addPaymentSubmitting: 'Registrando…',
  invalidPaymentAmount: 'Ingresa un monto válido mayor a 0.',
  invalidPaymentCurrency: 'Ingresa una moneda válida.',
  invalidPaymentDate: 'Ingresa una fecha válida.',
  genericAddPaymentError: 'No pudimos registrar el abono. Intenta de nuevo.',
  paymentsTableCaption: 'Abonos del plan de tratamiento',
  colPaymentDate: 'Fecha',
  colPaymentAmount: 'Monto',
  colPaymentMethod: 'Método',
  colPaymentNotes: 'Notas',
  colPaymentActions: 'Acciones',
  paymentMethodFallback: '—',
  paymentNotesFallback: '—',
  voidPaymentAction: 'Anular',
  voidingPayment: 'Anulando…',
  // Recibo imprimible (RECIBO-T1).
  receiptAction: 'Recibo',
  genericVoidPaymentError: 'No pudimos anular el abono. Intenta de nuevo.',
  emptyPaymentsTitle: 'Este plan todavía no tiene abonos.',
  emptyPaymentsDescription: 'Registra el primer abono con el formulario de arriba.',
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

const PAYMENT_METHOD_OPTIONS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

// Same semantic-token convention as `ITEM_STATUS_BADGE_VARIANT` above / the
// (now removed) `sales-view.tsx`'s `PAYMENT_METHOD_BADGE_VARIANT`: CASH is
// the "money in hand" happy path (success), the rest are neutral
// distinctions rather than states.
const PAYMENT_METHOD_BADGE_VARIANT: Record<PaymentMethod, BadgeProps['variant']> = {
  CASH: 'success',
  CARD: 'default',
  TRANSFER: 'muted',
  OTHER: 'muted',
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

/**
 * Abonos/balance formatting (PAY-T4): unlike item prices/the plan total
 * (always `formatCurrency`'s fixed USD, unchanged by this task), an abono
 * may be recorded in a currency different from the plan's, and the balance
 * figures are always in `planCurrency` — both need to format an arbitrary
 * ISO 4217 code, not a fixed one.
 */
function formatCurrencyIn(amount: number, currency: string): string {
  return new Intl.NumberFormat('es', { style: 'currency', currency }).format(amount);
}

/** `YYYY-MM-DD` for today, local time — same convention as `dashboard-view.tsx`'s `todayLocalDateString`, used to default the abono form's "fecha" field. */
function todayLocalDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

interface PaymentsListProps {
  payments: Payment[];
  voidingPaymentId: string | null;
  onVoid: (paymentId: string) => void;
  onReceipt: (payment: Payment) => void;
}

/** Desktop table + mobile cards for the abonos list — same responsive split as `ItemsTable`. */
function PaymentsList({ payments, voidingPaymentId, onVoid, onReceipt }: PaymentsListProps) {
  if (payments.length === 0) {
    return <EmptyState role="status" title={copy.emptyPaymentsTitle} description={copy.emptyPaymentsDescription} />;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{copy.paymentsTableCaption}</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{copy.colPaymentDate}</TableHead>
              <TableHead>{copy.colPaymentAmount}</TableHead>
              <TableHead>{copy.colPaymentMethod}</TableHead>
              <TableHead>{copy.colPaymentNotes}</TableHead>
              <TableHead className="sr-only">{copy.colPaymentActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const voiding = voidingPaymentId === payment.id;
              return (
                <TableRow key={payment.id}>
                  <TableCell>{formatCivilDate(payment.paidAt)}</TableCell>
                  <TableCell className="font-medium">
                    {formatCurrencyIn(payment.amount, payment.currency)}
                  </TableCell>
                  <TableCell>
                    {payment.method ? (
                      <Badge variant={PAYMENT_METHOD_BADGE_VARIANT[payment.method]}>
                        {PAYMENT_METHOD_LABELS[payment.method]}
                      </Badge>
                    ) : (
                      <span className="text-muted">{copy.paymentMethodFallback}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">{payment.notes ?? copy.paymentNotesFallback}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => onReceipt(payment)}>
                        {copy.receiptAction}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={voiding}
                        onClick={() => onVoid(payment.id)}
                      >
                        {voiding ? copy.voidingPayment : copy.voidPaymentAction}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {payments.map((payment) => {
          const voiding = voidingPaymentId === payment.id;
          return (
            <li key={payment.id}>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{formatCivilDate(payment.paidAt)}</span>
                  {payment.method ? (
                    <Badge variant={PAYMENT_METHOD_BADGE_VARIANT[payment.method]}>
                      {PAYMENT_METHOD_LABELS[payment.method]}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted">{copy.paymentMethodFallback}</span>
                  )}
                </div>
                <p className="mt-2 font-medium text-ink">{formatCurrencyIn(payment.amount, payment.currency)}</p>
                <p className="mt-1 text-sm text-muted">{payment.notes ?? copy.paymentNotesFallback}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => onReceipt(payment)}>
                    {copy.receiptAction}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={voiding}
                    onClick={() => onVoid(payment.id)}
                  >
                    {voiding ? copy.voidingPayment : copy.voidPaymentAction}
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
  // Transient "Plan creado" confirmation — the POST always succeeded, but with
  // same-day identical labels the create looked like a no-op; this makes the
  // success visible. Stays until the next create (cleared at its start).
  const [planCreated, setPlanCreated] = useState(false);

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

  // Balance + abonos (PAY-T4) — a genuinely separate resource from
  // `planDetail` (its own endpoints, `getPlanBalance`/`listPayments`), loaded
  // together whenever `selectedPlanId` changes, same
  // isInitialLoad/loadedXIdRef shape as `planDetail` below.
  const [planBalance, setPlanBalance] = useState<PlanBalance | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [paymentsRefreshing, setPaymentsRefreshing] = useState(false);
  const [paymentsRefreshError, setPaymentsRefreshError] = useState<string | null>(null);
  const loadedPaymentsPlanIdRef = useRef<string | null>(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [addPaymentSubmitting, setAddPaymentSubmitting] = useState(false);
  const [addPaymentValidationError, setAddPaymentValidationError] = useState<string | null>(null);
  const [addPaymentError, setAddPaymentError] = useState<string | null>(null);

  const [voidingPaymentId, setVoidingPaymentId] = useState<string | null>(null);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);

  // Receipt (RECIBO-T1): `receiptPayment` doubles as the printable receipt
  // dialog's target abono AND its open flag (`PaymentReceipt` treats
  // `payment !== null` as "open"). `patientName`/`clinicName` are fetched
  // ONCE per patient (not per row/receipt-open) — see the effect below.
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);

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

  // Patient name + clinic name (RECIBO-T1): fetched ONCE per patient — the
  // receipt is the only consumer, and neither value changes while this tab
  // is mounted, so there is no "refresh in place" concern like `planDetail`/
  // `planBalance` above. Both fail soft (no loading/error UI): a failure
  // here only degrades the receipt's header (name/clinic fallback), it must
  // never block or error out the rest of the tab.
  useEffect(() => {
    let cancelled = false;
    getPatient(token, patientId)
      .then((data) => {
        if (!cancelled) setPatientName(`${data.firstName} ${data.lastName}`.trim());
      })
      .catch(() => {
        /* fail soft — the receipt shows a fallback for a missing patientName */
      });
    fetchClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name);
      })
      .catch(() => {
        /* fail soft — fetchClinicName already resolves null on failure, this is just a safety net */
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId]);

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
    // Balance/abonos (PAY-T4) — same rationale: a different plan is a
    // genuinely different resource, and an in-progress abono form must not
    // carry over to the wrong plan.
    setPlanBalance(null);
    setPayments([]);
    setShowPaymentForm(false);
    setPaymentAmount('');
    setPaymentCurrency('');
    setPaymentDate('');
    setPaymentMethod('');
    setPaymentNotes('');
    setAddPaymentValidationError(null);
    setAddPaymentError(null);
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
    setPlanCreated(false);
    try {
      const created = await createPlan(token, patientId, {});
      await refreshPlansInPlace();
      setSelectedPlanId(created.id);
      setPlanCreated(true);
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

  // Balance + abonos (PAY-T4): a genuinely separate resource from
  // `planDetail` above (different endpoints), but fetched with the exact
  // same isInitialLoad/loadedXIdRef shape whenever `selectedPlanId` changes —
  // `planBalance`/`payments` are already cleared synchronously (during
  // render, see the `prevSelectedPlanId` block) whenever `selectedPlanId`
  // changes, so this effect only needs to handle the "fetch" case.
  useEffect(() => {
    if (!selectedPlanId) return;
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
        setPaymentsRefreshError(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : copy.genericBalanceError;
        if (isInitialLoad) {
          setPaymentsError(message);
        } else {
          setPaymentsRefreshError(copy.genericBalanceRefreshError);
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
  }, [token, selectedPlanId]);

  /**
   * Re-fetches the balance + abonos list in place. Called directly by
   * `handleAddPayment`/`handleVoidPayment` below AND awaited by them before
   * clearing their own busy flag — same "await the refresh before
   * re-enabling" fix as `refreshPlanDetail` above.
   */
  function refreshBalanceAndPayments(): Promise<void> {
    if (!selectedPlanId) return Promise.resolve();
    setPaymentsRefreshing(true);
    return Promise.all([getPlanBalance(token, selectedPlanId), listPayments(token, selectedPlanId)])
      .then(([balanceData, paymentsData]) => {
        setPlanBalance(balanceData);
        setPayments(paymentsData);
        setPaymentsRefreshError(null);
      })
      .catch((err) => {
        setPaymentsRefreshError(err instanceof ApiError ? err.message : copy.genericBalanceRefreshError);
      })
      .finally(() => setPaymentsRefreshing(false));
  }

  /** Opens the "Registrar pago" modal, defaulting currency=plan.currency / fecha=today. */
  function openPaymentForm() {
    setPaymentAmount('');
    setPaymentCurrency(planDetail?.currency ?? 'USD');
    setPaymentDate(todayLocalDateString());
    setPaymentMethod('');
    setPaymentNotes('');
    setAddPaymentValidationError(null);
    setAddPaymentError(null);
    setShowPaymentForm(true);
  }

  async function handleAddPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddPaymentValidationError(null);
    setAddPaymentError(null);

    if (!selectedPlanId) return;

    const amountNumber = Number(paymentAmount.trim());
    if (!paymentAmount.trim() || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      setAddPaymentValidationError(copy.invalidPaymentAmount);
      return;
    }
    const currencyValue = paymentCurrency.trim().toUpperCase();
    if (!currencyValue) {
      setAddPaymentValidationError(copy.invalidPaymentCurrency);
      return;
    }
    if (!paymentDate) {
      setAddPaymentValidationError(copy.invalidPaymentDate);
      return;
    }

    setAddPaymentSubmitting(true);
    try {
      const input: RecordPaymentInput = {
        amount: amountNumber,
        currency: currencyValue,
        paidAt: new Date(paymentDate).toISOString(),
        ...(paymentMethod ? { method: paymentMethod } : {}),
        ...(paymentNotes.trim() ? { notes: paymentNotes.trim() } : {}),
      };
      await recordPayment(token, selectedPlanId, input);
      setPaymentAmount('');
      setPaymentMethod('');
      setPaymentNotes('');
      setShowPaymentForm(false);
      await refreshBalanceAndPayments();
    } catch (err) {
      // Surfaces the backend's 400 (invalid amount/currency) verbatim —
      // `ApiError.message` is the backend's validation message.
      setAddPaymentError(err instanceof ApiError ? err.message : copy.genericAddPaymentError);
    } finally {
      setAddPaymentSubmitting(false);
    }
  }

  async function handleVoidPayment(paymentId: string) {
    setVoidingPaymentId(paymentId);
    setPaymentActionError(null);
    try {
      await voidPayment(token, paymentId);
      await refreshBalanceAndPayments();
    } catch (err) {
      setPaymentActionError(err instanceof ApiError ? err.message : copy.genericVoidPaymentError);
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
      <div className="flex flex-col gap-3" role="status">
        <span className="sr-only">{copy.loading}</span>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
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
          {planCreated && !createPlanError && (
            <p role="status" className="text-sm font-medium text-primary">
              {copy.planCreated}
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
                {plans.map((plan, index) => (
                  <option key={plan.id} value={plan.id}>
                    {copy.planOptionLabel(plan.createdAt, plan.status, index + 1)}
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
              <div className="flex flex-col gap-3" role="status">
                <span className="sr-only">{copy.loadingPlanDetail}</span>
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
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

                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-ink">{copy.paymentsHeading}</h3>
                    <Button type="button" variant="outline" size="sm" onClick={openPaymentForm}>
                      {copy.registerPayment}
                    </Button>
                  </div>

                  {paymentsLoading && (
                    <p role="status" className="text-sm text-muted">
                      {copy.loadingBalance}
                    </p>
                  )}
                  {paymentsError && (
                    <div className="flex flex-col items-start gap-3">
                      <p role="alert" className="text-sm text-danger">
                        {paymentsError}
                      </p>
                      <Button type="button" variant="outline" onClick={refreshBalanceAndPayments}>
                        {copy.retry}
                      </Button>
                    </div>
                  )}

                  {!paymentsLoading && !paymentsError && planBalance && (
                    <>
                      {paymentsRefreshing && (
                        <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
                          {copy.refreshing}
                        </p>
                      )}
                      {paymentsRefreshError && (
                        <div className="flex items-center gap-3">
                          <p role="alert" className="text-xs text-danger">
                            {paymentsRefreshError}
                          </p>
                          <Button variant="outline" size="sm" onClick={refreshBalanceAndPayments}>
                            {copy.retry}
                          </Button>
                        </div>
                      )}
                      {paymentActionError && (
                        <p role="alert" className="text-sm text-danger">
                          {paymentActionError}
                        </p>
                      )}

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">
                            {copy.billableLabel}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-ink">
                            {formatCurrencyIn(planBalance.billable, planBalance.planCurrency)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">
                            {copy.paidLabel}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-ink">
                            {formatCurrencyIn(planBalance.paid, planBalance.planCurrency)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">
                            {copy.balanceLabel}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-ink">
                            {formatCurrencyIn(planBalance.balance, planBalance.planCurrency)}
                          </p>
                        </div>
                      </div>

                      <FormModal
                        open={showPaymentForm}
                        onOpenChange={setShowPaymentForm}
                        title={copy.registerPayment}
                        onSubmit={handleAddPayment}
                        submitLabel={copy.addPaymentSubmit}
                        submitting={addPaymentSubmitting}
                        error={addPaymentValidationError ?? addPaymentError}
                        size="lg"
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField htmlFor="tp-payment-amount" label={copy.paymentAmountLabel}>
                            <Input
                              id="tp-payment-amount"
                              type="number"
                              min={0}
                              step="0.01"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                            />
                          </FormField>

                          <FormField htmlFor="tp-payment-currency" label={copy.paymentCurrencyLabel}>
                            <Input
                              id="tp-payment-currency"
                              value={paymentCurrency}
                              maxLength={3}
                              onChange={(e) => setPaymentCurrency(e.target.value.toUpperCase())}
                              className="uppercase"
                            />
                          </FormField>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField htmlFor="tp-payment-date" label={copy.paymentDateLabel}>
                            <Input
                              id="tp-payment-date"
                              type="date"
                              value={paymentDate}
                              onChange={(e) => setPaymentDate(e.target.value)}
                            />
                          </FormField>

                          <FormField htmlFor="tp-payment-method" label={copy.paymentMethodLabel}>
                            <select
                              id="tp-payment-method"
                              value={paymentMethod}
                              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}
                              className={fieldClass}
                            >
                              <option value="">{copy.paymentMethodEmptyOption}</option>
                              {PAYMENT_METHOD_OPTIONS.map((method) => (
                                <option key={method} value={method}>
                                  {PAYMENT_METHOD_LABELS[method]}
                                </option>
                              ))}
                            </select>
                          </FormField>
                        </div>

                        <FormField htmlFor="tp-payment-notes" label={copy.paymentNotesLabel}>
                          <textarea
                            id="tp-payment-notes"
                            rows={2}
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            className={cn(fieldClass, 'h-auto')}
                          />
                        </FormField>
                      </FormModal>

                      <PaymentsList
                        payments={payments}
                        voidingPaymentId={voidingPaymentId}
                        onVoid={handleVoidPayment}
                        onReceipt={setReceiptPayment}
                      />
                    </>
                  )}
                </div>

                <Separator />

                {catalogItems.length === 0 ? (
                  <EmptyState
                    role="status"
                    title={copy.emptyCatalogTitle}
                    description={copy.emptyCatalogDescription}
                    action={
                      <Link
                        href="/catalog"
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                      >
                        {copy.manageCatalogCta}
                      </Link>
                    }
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

      <PaymentReceipt
        payment={receiptPayment}
        planBalance={planBalance}
        planLabel={
          selectedPlan
            ? copy.planOptionLabel(
                selectedPlan.createdAt,
                selectedPlan.status,
                plans.findIndex((p) => p.id === selectedPlan.id) + 1,
              )
            : ''
        }
        patientName={patientName}
        clinicName={clinicName}
        onOpenChange={(open) => {
          if (!open) setReceiptPayment(null);
        }}
      />
    </div>
  );
}
