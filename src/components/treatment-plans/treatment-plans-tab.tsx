'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
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
  PLAN_STATUS_BADGE_VARIANT,
  PLAN_STATUS_LABELS,
  isPlanBillable,
  isPlanClosed,
} from '@/lib/treatment-plans/plan-status';
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
import { isFdiToothNumber } from '@/lib/odontogram/fdi';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { paymentLocationHint } from '@/lib/payments/payment-location';
import Link from 'next/link';
import { formatCurrency } from '@/lib/format/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { parseMoneyInput } from '@/lib/format/money';
import { FormModal } from '@/components/shared/form-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Disclosure } from '@/components/shared/disclosure';
import { CatalogPicker } from '@/components/odontogram/catalog-picker';
import { ToothPicker } from '@/components/odontogram/tooth-picker';
import {
  PAYMENT_METHOD_BADGE_VARIANT,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
} from '@/lib/payments/payment-method';
import { PaymentReceiptDialog } from '@/components/payments/payment-receipt-dialog';
import { VoidPaymentModal } from '@/components/payments/void-payment-modal';
import { voidPaymentErrorMessage } from '@/components/payments/use-void-payment';
import { getTokenAllowedLocationIds, getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import { PaymentPlanSection } from './payment-plan-section';
import { PlanVisitsBoard } from './plan-visits-board';
import { PlanQuoteActions } from './plan-quote-actions';
import { PlanOptionsPanel } from './plan-options-panel';
import { optionGroupOf, patchableStatuses } from '@/lib/treatment-plans/plan-options';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { cn } from '@/lib/utils';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';
import { sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SURFACE_LABELS, SURFACE_ORDER } from '@/lib/odontogram/surface-labels';
import { getDiscountPolicy } from '@/lib/discounts/discounts-api';
import {
  DISCOUNT_REASON_LABELS,
  PRICE_BELOW_CATALOG_NOTICE,
  capFor,
  effectiveDiscount,
  exceedsCap,
  NO_DISCOUNT_ALLOWED_NOTICE,
  needsReason,
  noDiscountAllowed,
  priceBelowCatalogCapMessage,
  roleCapMessage,
  type DiscountReasonCode,
  type DiscountRules,
} from '@/lib/discounts/discount-rules';
import {
  DiscountReasonFields,
  EMPTY_REASON,
  reasonPayload,
  validateDiscountReason,
  type DiscountReasonValue,
} from '@/components/discounts/discount-reason-fields';
import { BulkDiscountModal, bulkDiscountCopy } from '@/components/discounts/bulk-discount-modal';
import { usePriceQuote } from '@/lib/treatment-plans/use-price-quote';
import { FieldError } from '@/components/errors/field-error';
import { PriceQuoteLine, itemPriceOriginText } from './price-quote-line';
import { MarkDoneModal } from './mark-done-modal';
import { attributionText } from '@/lib/treatment-plans/item-attribution';

// Copy as constants (i18n-ready, es-first) — matches odontogram-tab.tsx /
// agenda-view.tsx convention until next-intl wiring lands.
const copy = {
  loading: 'Cargando planes de tratamiento…',
  // No «Intenta de nuevo.» — `SectionError` has its own retry button.
  genericLoadError: 'No pudimos cargar los planes de tratamiento.',
  refreshing: 'Actualizando…',
  // No «Intenta de nuevo.» — the toast carries its own retry action.
  genericRefreshError: 'No pudimos actualizar los planes de tratamiento.',
  plansHeading: 'Planes de tratamiento',
  newPlan: 'Nuevo plan',
  // No adjacent `<label>` for this one (it sits next to the "Nuevo plan"
  // button, not in a `FormField`) — passed as `CurrencySelect`'s `ariaLabel`
  // so it still has an accessible name (WCAG 4.1.2).
  newPlanCurrencyLabel: 'Moneda del nuevo plan',
  creatingPlan: 'Creando…',
  planCreated: 'Plan creado y seleccionado abajo.',
  // Reuse path (dup guard): an empty DRAFT already existed, so "Nuevo plan"
  // switched to it instead of POSTing another identical empty plan.
  planReused: 'Ya había un plan en borrador vacío; lo seleccionamos abajo.',
  genericCreatePlanError: 'No pudimos crear el plan. Intenta de nuevo.',
  emptyPlansTitle: 'Este paciente todavía no tiene un plan de tratamiento.',
  emptyPlansDescription: 'Crea el primer plan para empezar a registrar procedimientos.',
  selectPlanLabel: 'Plan',
  // Numbered + timestamped down to the minute so multiple plans created the
  // same day are distinguishable in the selector (fixes the "Nuevo plan looks
  // like it did nothing" perception — every option used to read identically as
  // "Plan del <date> — Borrador").
  // Con alternativas (DX-040), la etiqueta de la opción va al final: dos
  // opciones del mismo día se distinguen por ella.
  planOptionLabel: (
    createdAt: string,
    status: TreatmentPlanStatus,
    number: number,
    optionLabel?: string | null,
  ) =>
    `Plan ${number} · ${formatDateTime(createdAt)} — ${PLAN_STATUS_LABELS[status]}${optionLabel ? ` · ${optionLabel}` : ''}`,
  detailHeading: 'Detalle del plan',
  planStatusLabel: 'Estado del plan',
  loadingPlanDetail: 'Cargando plan…',
  // No «Intenta de nuevo.» — `SectionError` has its own retry button.
  genericPlanDetailError: 'No pudimos cargar el plan.',
  // No «Intenta de nuevo.» — the toast carries its own retry action.
  genericPlanDetailRefreshError: 'No pudimos actualizar el plan.',
  genericPlanStatusError: 'No pudimos actualizar el estado del plan. Intenta de nuevo.',
  itemsTableCaption: 'Ítems del plan de tratamiento',
  colTooth: 'Diente',
  // DX-291: un cargo administrativo (inasistencia) no es de ningún diente.
  noTooth: 'Sin diente',
  noSurfaces: '—',
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
  removeConfirmTitle: '¿Quitar este ítem del plan?',
  // El backend hace soft-delete (`deletedAt`) y `getPlan` incluye los ítems
  // con `deletedAt: null`, así que el ítem desaparece del plan y de la app
  // aunque la fila siga en la base de datos. La copia lo dice tal cual en vez
  // de prometer un historial que en pantalla no existe. Lo que sí sobrevive
  // es el registro que el ítem creó en el odontograma al marcarse realizado
  // (Pieza B): `RemoveTreatmentPlanItemUseCase` no lo toca.
  removeConfirmDescription:
    'El ítem sale del plan y deja de contar en el total y en el saldo. No se borra de la base de datos, pero ya no podrás verlo desde la aplicación. Si ya estaba realizado, su registro en el odontograma se mantiene.',
  removeConfirm: 'Quitar ítem',
  genericItemUpdateError: 'No pudimos actualizar el estado del ítem. Intenta de nuevo.',
  genericRemoveItemError: 'No pudimos quitar el ítem. Intenta de nuevo.',
  itemStatusSelectLabel: (tooth: string) => `Estado del ítem del diente ${tooth}`,
  // DX-050: quién lo realizó. Corregirlo es solo de la administración.
  correctAttribution: 'Corregir',
  correctAttributionFor: (tooth: string) => `Corregir quién realizó el ítem del diente ${tooth}`,
  // DX-305: un realizado «Sin atribuir» se atribuye con quién, cuándo y dónde.
  attributeItem: 'Atribuir',
  attributeItemFor: (tooth: string) => `Atribuir quién, cuándo y dónde se realizó el ítem del diente ${tooth}`,
  markDoneSubject: (procedure: string, tooth: string) => `${procedure} · diente ${tooth}`,
  addItemHeading: 'Agregar ítem',
  invalidToothNumber: 'Número de diente inválido. Usa la notación FDI (ej. 11, 26, 55).',
  procedureLabel: 'Procedimiento',
  procedureFilterPlaceholder: 'Resina, corona, limpieza…',
  selectProcedurePrompt: 'Selecciona un procedimiento del catálogo.',
  /**
   * El puente que faltaba. El odontograma proyecta automáticamente un ítem
   * DONE (Pieza B); el camino de vuelta era escribir el número a mano. Estos
   * enlaces lo cierran en los dos sentidos, y el nombre accesible EMPIEZA por
   * el texto visible para no romper «label in name» (WCAG 2.5.3).
   */
  viewInOdontogram: 'Ver en el odontograma',
  viewInOdontogramFor: (tooth: string) => `Ver en el odontograma el diente ${tooth}`,
  // DX-191: acceso directo al formulario «Registrar implante» con el ítem y el
  // diente puestos.
  registerImplant: 'Registrar implante',
  registerImplantFor: (tooth: string) => `Registrar implante en el diente ${tooth}`,
  focusedToothNotice: (tooth: string) => `Diente ${tooth}: sus ítems aparecen resaltados abajo.`,
  focusedToothRow: 'Diente en foco',
  clearFocusedTooth: 'Ver todos los dientes',
  priceLabel: 'Precio',
  // DX-105: precio resuelto por convenio / lista de la sede.
  priceQuoteLoading: 'Calculando el precio…',
  priceQuoteError: 'No pudimos traer el precio',
  // Descuento por ítem (DX-012): sale en el presupuesto imprimible y resta del
  // total y del saldo.
  discountLabel: 'Descuento (opcional)',
  discountHint: 'En la moneda del plan. Sale en el presupuesto.',
  invalidDiscount: 'El descuento debe ser un monto válido, no mayor que el precio.',
  unreadablePrice: (reason: string) => `El precio no se entiende. ${reason}`,
  unreadableDiscount: (reason: string) => `El descuento no se entiende. ${reason}`,
  itemDiscount: (amount: string) => `Descuento −${amount}`,
  // SEC-041: el precio por debajo del de catálogo cuenta como descuento.
  itemPriceReduction: (amount: string, catalog: string) => `Rebaja −${amount} (catálogo ${catalog})`,
  priceBelowCatalogDetail: (reduction: string, catalog: string) =>
    `Rebaja de ${reduction} sobre ${catalog}. Se compara con el tope de tu rol y sale en el informe de descuentos.`,
  // DX-204: motivo del descuento y «Descuento %» sobre varios ítems.
  itemDiscountReason: (reason: string) => `Motivo: ${reason}`,
  selectItem: (tooth: string) => `Seleccionar el ítem del diente ${tooth}`,
  selectAll: 'Seleccionar todos',
  clearSelection: 'Quitar selección',
  selectedCount: (n: number) =>
    n === 0 ? 'Selecciona ítems para descontar' : n === 1 ? '1 ítem seleccionado' : `${n} ítems seleccionados`,
  bulkDiscount: 'Descuento %',
  bulkDiscountApplied: (n: number) =>
    n === 1 ? 'Descuento aplicado a 1 ítem.' : `Descuento aplicado a ${n} ítems.`,
  acceptedDiscountNotice: 'El presupuesto está aceptado: sus descuentos ya no se pueden cambiar.',
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
  /**
   * Alcance de la región de dinero (Principio 6 de PRODUCT.md). Verificado
   * contra el backend, NO deducido de la documentación: `listPayments` y
   * `getPlanBalance` acaban los dos en `PrismaPaymentRepository.listByPlan`,
   * que deliberadamente NO aplica el filtro de sede — el plan es de la
   * clínica, no de una sede. La cabecera `X-Location-Id` viaja en estas
   * peticiones pero el backend la ignora aquí.
   */
  paymentsScopeNote: 'El saldo suma los abonos de todas las sedes.',
  loadingBalance: 'Cargando saldo…',
  // No «Intenta de nuevo.» — `SectionError` has its own retry button.
  genericBalanceError: 'No pudimos cargar el saldo.',
  // No «Intenta de nuevo.» — the toast carries its own retry action.
  genericBalanceRefreshError: 'No pudimos actualizar el saldo.',
  billableLabel: 'A pagar',
  paidLabel: 'Pagado',
  balanceLabel: 'Saldo',
  registerPayment: 'Registrar abono',
  notBillableHint: (status: string) =>
    `Este plan está «${status}»: no admite abonos ni planes de cuotas.`,
  closedItemsNotice: (status: string) =>
    `Este plan está «${status}»: sus ítems ya no se pueden añadir, cambiar ni quitar.`,
  completedItemsNotice:
    'Este plan está «Completado»: sus ítems ya no se pueden añadir, cambiar ni quitar. Solo puedes marcar como realizado un procedimiento que quedó aceptado.',
  cancelPaymentForm: 'Cancelar',
  paymentAmountLabel: 'Monto',
  paymentCurrencyLabel: 'Moneda',
  paymentDateLabel: 'Fecha',
  paymentMethodLabel: 'Método',
  paymentMethodEmptyOption: 'Sin especificar',
  paymentNotesLabel: 'Notas',
  addPaymentSubmit: 'Registrar abono',
  addPaymentSubmitting: 'Registrando…',
  invalidPaymentAmount: 'Escribe un importe mayor que 0.',
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
  // Recibo de caja numerado (DX-136).
  receiptAction: 'Recibo',
  colPaymentReceipt: 'N.º de recibo',
  paymentReceiptLegacy: 'Sin serie',
  paymentReceiptMobile: (receiptNumber: string | null) =>
    `Recibo ${receiptNumber ?? 'sin serie'}`,
  emptyPaymentsTitle: 'Este plan todavía no tiene abonos.',
  emptyPaymentsDescription: 'Registra el primer abono con el formulario de arriba.',

  // Divulgación progresiva. La lista de abonos y el calendario de cuotas son
  // el DETALLE de cifras que ya están arriba: se pliegan, pero su encabezado
  // lleva el dato que decide si hace falta abrirlos (cuántos abonos hay), así
  // que plegar no esconde información necesaria para decidir.
  paymentsDisclosure: 'Abonos registrados',
  paymentsDisclosureMeta: (n: number) => (n === 1 ? '1 abono' : `${n} abonos`),
};

const ITEM_STATUS_OPTIONS: TreatmentPlanItemStatus[] = ['PROPOSED', 'ACCEPTED', 'DONE'];

const ITEM_STATUS_LABELS: Record<TreatmentPlanItemStatus, string> = {
  PROPOSED: 'Propuesto',
  ACCEPTED: 'Aceptado',
  DONE: 'Realizado',
};

// Semantic Badge variants (never raw color utilities) — PROPOSED is neutral
// (nothing has happened yet), ACCEPTED maps to the brand/primary token
// (acknowledged), DONE to success; the plan-level map lives in
// `@/lib/treatment-plans/plan-status` — same convention as `day-agenda.tsx`.
const ITEM_STATUS_BADGE_VARIANT: Record<TreatmentPlanItemStatus, BadgeProps['variant']> = {
  PROPOSED: 'muted',
  ACCEPTED: 'default',
  DONE: 'success',
};

/**
 * Un importe opcional de un campo de dinero (DX-241): `undefined` si está
 * vacío, `null` si no se entiende, o el número leído con la regla común.
 */
function optionalAmount(text: string, currency: string): number | undefined | null {
  if (text.trim() === '') return undefined;
  const parsed = parseMoneyInput(text, currency);
  return parsed.ok ? parsed.value : null;
}

/** El motivo por el que no se entiende un importe escrito. */
function unreadableReason(text: string, currency: string): string {
  const parsed = parseMoneyInput(text, currency);
  return parsed.ok ? '' : parsed.message;
}

function emptySurfacesState(): Record<ToothSurface, boolean> {
  return { VESTIBULAR: false, LINGUAL: false, MESIAL: false, DISTAL: false, OCCLUSAL: false };
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

interface ItemsTableProps {
  items: TreatmentPlanItem[];
  catalogById: Map<string, DentalCatalogItem>;
  /** The plan's currency (`planDetail.currency`) — item prices don't carry their own currency. */
  currency: string;
  updatingItemId: string | null;
  /** FDI code whose rows are marked as the ones the user arrived looking for. */
  focusedTooth?: string | null;
  odontogramHref?: (toothNumber: string) => string;
  implantHref?: (item: TreatmentPlanItem) => string;
  onStatusChange: (itemId: string, status: TreatmentPlanItemStatus) => void;
  onRemove: (itemId: string) => void;
  /**
   * DX-050: sacar un ítem de «Realizado» es de la administración o de quien
   * lo realizó (la API responde 403 a otro): si no, solo se ofrece su estado.
   */
  canLeaveDone?: (item: TreatmentPlanItem) => boolean;
  /** DX-050: ADMIN corrige quién realizó un ítem (sin ella, no se ofrece). */
  onCorrectAttribution?: (itemId: string) => void;
  /**
   * Plan aceptado con firma (DX-012): sus ítems no se quitan ni vuelven a
   * «Propuesto» (la API responde 409); el tratamiento sí avanza.
   */
  locked?: boolean;
  /**
   * Plan cerrado (cancelado, rechazado o completado, DX-109): sus ítems no se
   * tocan, ni siquiera de estado (la API responde 409)...
   */
  closed?: boolean;
  /**
   * ...salvo en un plan completado: ahí un ítem aceptado sí se marca como
   * realizado (y llega al odontograma).
   */
  markDoneOnly?: boolean;
  /**
   * DX-204: ítems marcados para «Descuento %». Sin ella (plan aceptado,
   * firmado o cerrado: no se vuelve a descontar) no hay casillas.
   */
  selection?: {
    selectedIds: ReadonlySet<string>;
    onToggle: (itemId: string, checked: boolean) => void;
  };
}

/**
 * DX-050: «Realizado por Dra. X · fecha · sede» (o «Sin atribuir») bajo un
 * ítem realizado; con `onCorrect` (ADMIN), el enlace para corregirlo.
 */
function ItemAttributionLine({
  item,
  onCorrect,
}: {
  item: TreatmentPlanItem;
  onCorrect?: (itemId: string) => void;
}) {
  const text = attributionText(item);
  if (!text) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
      <span className="tabular-nums">{text}</span>
      {onCorrect ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 px-2 text-xs md:h-7"
          aria-label={
            item.performedLocationId === null
              ? copy.attributeItemFor(item.toothNumber)
              : copy.correctAttributionFor(item.toothNumber)
          }
          onClick={() => onCorrect(item.id)}
        >
          {item.performedLocationId === null ? copy.attributeItem : copy.correctAttribution}
        </Button>
      ) : null}
    </span>
  );
}

/** Línea del descuento de un ítem: importe y, si lo tiene, su motivo. */
function ItemDiscountLine({ item, currency }: { item: TreatmentPlanItem; currency: string }) {
  const { priceReduction } = effectiveDiscount(item.catalogPrice, item.price, item.discount);
  const origin = itemPriceOriginText(item, currency);
  if (item.discount <= 0 && priceReduction <= 0 && !origin) return null;
  const reason = item.discountReason as DiscountReasonCode | null;
  return (
    <span className="block text-xs font-normal text-muted">
      {origin ? <span className="block tabular-nums">{origin}</span> : null}
      {priceReduction > 0 && item.catalogPrice !== null ? (
        <span className="block">
          {copy.itemPriceReduction(
            formatCurrency(priceReduction, currency),
            formatCurrency(item.catalogPrice, currency),
          )}
        </span>
      ) : null}
      {item.discount > 0 ? <span className="block">{copy.itemDiscount(formatCurrency(item.discount, currency))}</span> : null}
      {reason ? (
        <span className="block">{copy.itemDiscountReason(DISCOUNT_REASON_LABELS[reason])}</span>
      ) : null}
    </span>
  );
}

function ItemSelectBox({
  item,
  selection,
}: {
  item: TreatmentPlanItem;
  selection: NonNullable<ItemsTableProps['selection']>;
}) {
  return (
    <input
      type="checkbox"
      aria-label={copy.selectItem(item.toothNumber)}
      checked={selection.selectedIds.has(item.id)}
      onChange={(e) => selection.onToggle(item.id, e.target.checked)}
      className="size-5 shrink-0 accent-[var(--color-primary)]"
    />
  );
}

/**
 * The row-level way back to the chart. Rendered as a real `<Link>` (not a
 * button): it is a location, so it must open in a new tab, be copied, and be
 * reachable with the browser's own affordances like any other address.
 */
function OdontogramLink({
  toothNumber,
  href,
}: {
  toothNumber: string;
  href?: (toothNumber: string) => string;
}) {
  // DX-291: un cargo administrativo no tiene diente al que volver.
  if (!href || !toothNumber) return null;
  return (
    <Link
      href={href(toothNumber)}
      // El nombre accesible EMPIEZA por el texto visible (WCAG 2.5.3): sin eso,
      // cinco filas ofrecerían cinco enlaces con el mismo nombre y ninguna
      // pista de a qué diente lleva cada uno.
      aria-label={copy.viewInOdontogramFor(toothNumber)}
      className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      {copy.viewInOdontogram}
    </Link>
  );
}

/**
 * DX-191: «Registrar implante» desde el ítem del plan que se ejecuta. Un
 * `<Link>` por la misma razón que `OdontogramLink`; el nombre accesible empieza
 * por el texto visible y lleva el diente (WCAG 2.5.3).
 */
function RegisterImplantLink({
  item,
  href,
}: {
  item: TreatmentPlanItem;
  href: (item: TreatmentPlanItem) => string;
}) {
  return (
    <Link
      href={href(item)}
      aria-label={copy.registerImplantFor(item.toothNumber)}
      className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      {copy.registerImplant}
    </Link>
  );
}

/**
 * Las cuatro cifras del plan en UNA fila etiquetada, no en tarjetas.
 *
 * Antes esta pantalla mostraba «Total» en su propia franja y luego tres
 * tarjetas con borde (A pagar / Pagado / Saldo) — la plantilla de
 * métrica-héroe que DESIGN.md prohíbe como estructura, y seis cifras con
 * alcances distintos compitiendo por la misma atención junto a las tres del
 * plan de pagos. Aquí las cuatro que describen ESTE plan van juntas y con el
 * mismo peso; las del financiamiento se quedan bajo «Plan de pagos», que es lo
 * que las distingue.
 *
 * `Saldo` es la única que se destaca (`text-ink` sobre el resto en `text-muted`
 * es lo que hace jerarquía sin volver a inventar una tarjeta): es la cifra que
 * el paciente pregunta en voz alta.
 */
function PlanMoneySummary({
  total,
  currency,
  balance,
}: {
  total: number;
  currency: string;
  balance: PlanBalance | null;
}) {
  const figures: { key: string; label: string; value: string; strong?: boolean }[] = [
    { key: 'total', label: copy.totalLabel, value: formatCurrency(total, currency) },
  ];
  if (balance) {
    figures.push(
      {
        key: 'billable',
        label: copy.billableLabel,
        value: formatCurrency(balance.billable, balance.planCurrency),
      },
      {
        key: 'paid',
        label: copy.paidLabel,
        value: formatCurrency(balance.paid, balance.planCurrency),
      },
      {
        key: 'balance',
        label: copy.balanceLabel,
        value: formatCurrency(balance.balance, balance.planCurrency),
        strong: true,
      },
    );
  }

  return (
    // `<dl>` y no divs: son pares etiqueta/valor, y así un lector de pantalla
    // los anuncia emparejados en vez de como ocho textos sueltos.
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      {figures.map((figure) => (
        <div key={figure.key} className="min-w-0">
          <dt className="t-label text-muted">{figure.label}</dt>
          <dd
            className={cn(
              'mt-0.5 tabular-nums',
              figure.strong ? 'text-lg font-semibold text-ink' : 'text-base text-muted',
            )}
          >
            {figure.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function procedureName(item: TreatmentPlanItem, catalogById: Map<string, DentalCatalogItem>): string {
  return catalogById.get(item.catalogItemId)?.labelEs ?? item.catalogItemId;
}

function surfacesLabel(item: TreatmentPlanItem): string {
  if (item.surfaces.length > 0) return item.surfaces.map((s) => SURFACE_LABELS[s]).join(', ');
  // DX-291: un cargo administrativo no tiene diente ni caras.
  return item.toothNumber ? copy.wholeToothFallback : copy.noSurfaces;
}

function ItemsTable({
  items,
  catalogById,
  currency,
  updatingItemId,
  focusedTooth,
  odontogramHref,
  implantHref,
  onStatusChange,
  onRemove,
  canLeaveDone = () => true,
  onCorrectAttribution,
  locked = false,
  closed = false,
  markDoneOnly = false,
  selection,
}: ItemsTableProps) {
  // DX-191: el implante se registra al ejecutar un ítem aceptado (o ya
  // realizado); no en uno solo propuesto ni en un plan cancelado o rechazado.
  const implantLinkFor = (item: TreatmentPlanItem) =>
    implantHref && (item.status === 'ACCEPTED' || item.status === 'DONE') && (!closed || markDoneOnly)
      ? implantHref
      : undefined;
  // Plan cerrado: el estado no se toca, salvo en uno completado marcar como
  // realizado lo que quedó aceptado (misma regla que la API).
  const statusFrozen = (item: TreatmentPlanItem) =>
    closed && !(markDoneOnly && item.status === 'ACCEPTED');
  const optionDisabled = (item: TreatmentPlanItem, status: TreatmentPlanItemStatus) =>
    (locked && status === 'PROPOSED') ||
    (closed && status !== item.status && status !== 'DONE') ||
    (item.status === 'DONE' && status !== 'DONE' && !canLeaveDone(item));
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
              {selection ? (
                <TableHead>
                  <span className="sr-only">{copy.bulkDiscount}</span>
                </TableHead>
              ) : null}
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
              const focused = focusedTooth === item.toothNumber;
              const implantLink = implantLinkFor(item);
              return (
                <TableRow
                  key={item.id}
                  // `aria-current` dice en la capa accesible lo mismo que el
                  // fondo dice en la visual: esta es la fila que el usuario
                  // vino a ver desde el odontograma.
                  aria-current={focused ? true : undefined}
                  className={cn(focused && 'bg-surface-2')}
                >
                  {selection ? (
                    <TableCell className="w-10">
                      <ItemSelectBox item={item} selection={selection} />
                    </TableCell>
                  ) : null}
                  <TableCell className="font-medium tabular-nums">{item.toothNumber || copy.noTooth}</TableCell>
                  <TableCell>{procedureName(item, catalogById)}</TableCell>
                  <TableCell className="text-muted">{surfacesLabel(item)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatCurrency(item.price, currency)}
                    <ItemDiscountLine item={item} currency={currency} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1.5">
                      <Badge variant={ITEM_STATUS_BADGE_VARIANT[item.status]}>
                        {ITEM_STATUS_LABELS[item.status]}
                      </Badge>
                      <span className="inline-flex items-center gap-2">
                        <select
                          aria-label={copy.itemStatusSelectLabel(item.toothNumber)}
                          value={item.status}
                          disabled={updating || statusFrozen(item)}
                          onChange={(e) => onStatusChange(item.id, e.target.value as TreatmentPlanItemStatus)}
                          className={cn(fieldClass, 'h-8 px-2 py-1 text-xs')}
                        >
                          {ITEM_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status} disabled={optionDisabled(item, status)}>
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
                      <ItemAttributionLine item={item} onCorrect={onCorrectAttribution} />
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* Mismo aislamiento que en la tabla de abonos: el enlace
                        inocuo y el botón destructivo no comparten zona de
                        toque. */}
                    <div className="flex flex-wrap items-center gap-3">
                      <OdontogramLink toothNumber={item.toothNumber} href={odontogramHref} />
                      {implantLink && item.toothNumber ? <RegisterImplantLink item={item} href={implantLink} /> : null}
                      {item.toothNumber && odontogramHref && !locked && !closed ? <Separator orientation="vertical" className="h-5" /> : null}
                      {locked || closed ? null : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updating}
                          onClick={() => onRemove(item.id)}
                        >
                          {updating ? copy.removing : copy.remove}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile list. Hairline-separated rows inside ONE bordered container —
          not a stack of `<Card>`s nested inside the card this section already
          lives in (DESIGN.md: "No nested cards; use hairline sections
          inside"). */}
      <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-border md:hidden">
        {items.map((item) => {
          const updating = updatingItemId === item.id;
          const focused = focusedTooth === item.toothNumber;
          const implantLink = implantLinkFor(item);
          return (
            <li
              key={item.id}
              aria-current={focused ? true : undefined}
              className={cn('p-4', focused && 'bg-surface-2')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-3 font-medium text-ink tabular-nums">
                  {selection ? <ItemSelectBox item={item} selection={selection} /> : null}
                  {item.toothNumber ? `${copy.colTooth} ${item.toothNumber}` : copy.noTooth}
                </span>
                <Badge variant={ITEM_STATUS_BADGE_VARIANT[item.status]}>
                  {ITEM_STATUS_LABELS[item.status]}
                </Badge>
              </div>
              <p className="mt-2 text-ink">{procedureName(item, catalogById)}</p>
              <p className="mt-1 text-sm text-muted">{surfacesLabel(item)}</p>
              <p className="mt-1 font-medium text-ink tabular-nums">
                {formatCurrency(item.price, currency)}
                <ItemDiscountLine item={item} currency={currency} />
              </p>
              <div className="mt-1">
                <ItemAttributionLine item={item} onCorrect={onCorrectAttribution} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <select
                  aria-label={copy.itemStatusSelectLabel(item.toothNumber)}
                  value={item.status}
                  disabled={updating || statusFrozen(item)}
                  onChange={(e) => onStatusChange(item.id, e.target.value as TreatmentPlanItemStatus)}
                  className={cn(fieldClass, 'h-9 w-auto text-xs')}
                >
                  {ITEM_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status} disabled={optionDisabled(item, status)}>
                      {ITEM_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                {locked || closed ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={updating}
                    onClick={() => onRemove(item.id)}
                  >
                    {updating ? copy.removing : copy.remove}
                  </Button>
                )}
              </div>
              {item.toothNumber && (odontogramHref || implantLink) ? (
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                  <OdontogramLink toothNumber={item.toothNumber} href={odontogramHref} />
                  {implantLink && item.toothNumber ? <RegisterImplantLink item={item} href={implantLink} /> : null}
                </p>
              ) : null}
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
  /** Abre el recibo de caja del abono (DX-136). */
  onReceipt: (paymentId: string) => void;
  /** Plan rechazado o cancelado (DX-109): el vacío no invita a registrar un abono. */
  billable?: boolean;
}

/** Desktop table + mobile cards for the abonos list — same responsive split as `ItemsTable`. */
function PaymentsList({ payments, voidingPaymentId, onVoid, onReceipt, billable = true }: PaymentsListProps) {
  if (payments.length === 0) {
    return (
      <EmptyState
        role="status"
        title={copy.emptyPaymentsTitle}
        description={billable ? copy.emptyPaymentsDescription : undefined}
      />
    );
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
              <TableHead>{copy.colPaymentReceipt}</TableHead>
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
                  <TableCell>{formatCivilDate(payment.paidOn)}</TableCell>
                  <TableCell className="tabular-nums">
                    {payment.receiptNumber ?? (
                      <span className="text-muted">{copy.paymentReceiptLegacy}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(payment.amount, payment.currency)}
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
                    {/* «Recibo» y «Anular» son dos botones de 36px: a 8px de
                        distancia, en tablet, anular es un dedo mal puesto.
                        Separador vertical + hueco mayor para que el destructivo
                        no comparta zona de toque con el inocuo. */}
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" size="sm" onClick={() => onReceipt(payment.id)}>
                        {copy.receiptAction}
                      </Button>
                      <Separator orientation="vertical" className="h-5" />
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

      {/* Mobile list — hairline rows in one bordered container, not `<Card>`s
          nested inside the card this section lives in (DESIGN.md). */}
      <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-border md:hidden">
        {payments.map((payment) => {
          const voiding = voidingPaymentId === payment.id;
          return (
            <li key={payment.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink tabular-nums">{formatCivilDate(payment.paidOn)}</span>
                {payment.method ? (
                  <Badge variant={PAYMENT_METHOD_BADGE_VARIANT[payment.method]}>
                    {PAYMENT_METHOD_LABELS[payment.method]}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted">{copy.paymentMethodFallback}</span>
                )}
              </div>
              <p className="mt-2 font-medium text-ink tabular-nums">
                {formatCurrency(payment.amount, payment.currency)}
              </p>
              <p className="mt-1 text-sm text-muted tabular-nums">
                {copy.paymentReceiptMobile(payment.receiptNumber)}
              </p>
              <p className="mt-1 text-sm text-muted">{payment.notes ?? copy.paymentNotesFallback}</p>
              {/* Mismo aislamiento del destructivo que en la tabla de
                  escritorio — en móvil el riesgo de mal toque es mayor, no
                  menor. */}
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => onReceipt(payment.id)}>
                  {copy.receiptAction}
                </Button>
                <Separator orientation="vertical" className="h-5" />
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
  // DX-097: la fecha por defecto del abono es hoy en la zona de la sede.
  const sedeTimeZone = useSedeTimeZone(token);
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
  const [newPlanCurrency, setNewPlanCurrency] = useState('USD');

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
  // Idempotency-Key for the in-progress abono. Minted when the form opens
  // (openPaymentForm) and rotated after a SUCCESSFUL submit, so every retry of
  // the SAME click (network error → user clicks again) reuses the same key and
  // the backend dedups it, while each new abono gets a fresh key.
  const paymentIdempotencyKeyRef = useRef<string | null>(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [addPaymentSubmitting, setAddPaymentSubmitting] = useState(false);
  const [addPaymentValidationError, setAddPaymentValidationError] = useState<string | null>(null);
  // DX-241: el motivo de un monto que no vale va junto al campo (escalón 4).
  const [paymentAmountError, setPaymentAmountError] = useState<string | null>(null);
  const [addPaymentError, setAddPaymentError] = useState<string | null>(null);

  const [voidingPaymentId, setVoidingPaymentId] = useState<string | null>(null);
  // Igual que `itemToRemove`: anular mueve dinero en el saldo y no tiene
  // deshacer, así que pasa por confirmación y su fallo se queda en el diálogo.
  const [paymentToVoid, setPaymentToVoid] = useState<string | null>(null);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);

  // Bumped whenever the balance/abonos refresh, so the payment-plan section
  // refetches and recomputes installment coverage.
  const [paymentPlanRefreshSignal, setPaymentPlanRefreshSignal] = useState(0);

  // Recibo de caja (DX-136): el id del abono es a la vez el destino del
  // diálogo y su bandera de apertura. El diálogo pide el recibo a la API (su
  // foto inmutable), así que aquí no hace falta nada más del paciente.
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);

  // Sedes de la clínica + sede activa, solo para decir a qué sede quedará
  // atribuido un abono nuevo. Se piden una vez y fallan en silencio: si no
  // se sabe la sede, la
  // línea no aparece — nunca bloquea ni rompe el formulario.
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);

  // Add-item form state.
  const [toothNumber, setToothNumber] = useState('');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [surfaces, setSurfaces] = useState<Record<ToothSurface, boolean>>(emptySurfacesState);
  const [notes, setNotes] = useState('');
  // DX-204: motivo del descuento del ítem nuevo, política de la clínica (para
  // avisar antes; la API la aplica) y la selección de «Descuento %».
  const [addReason, setAddReason] = useState<DiscountReasonValue>(EMPTY_REASON);
  const [addReasonErrors, setAddReasonErrors] = useState<{ reason?: string; note?: string } | null>(null);
  const [discountRules, setDiscountRules] = useState<DiscountRules | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKey, setBulkKey] = useState(0);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [addItemSubmitting, setAddItemSubmitting] = useState(false);
  // DX-105: el usuario tocó el precio precargado; solo entonces se envía.
  const [priceEdited, setPriceEdited] = useState(false);
  const [addItemValidationError, setAddItemValidationError] = useState<string | null>(null);
  // DX-241: precio y descuento que no valen, junto a su campo (escalón 4).
  const [itemAmountErrors, setItemAmountErrors] = useState<{ price?: string; discount?: string }>({});
  const [addItemError, setAddItemError] = useState<string | null>(null);

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
    setDiscount('');
    setSurfaces(emptySurfacesState());
    setNotes('');
    setAddItemValidationError(null);
    setItemAmountErrors({});
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
    setPaymentAmountError(null);
    setAddPaymentError(null);
  }

  const catalogById = new Map(allCatalogItems.map((item) => [item.id, item]));

  // DX-105: el precio resuelto de la prestación elegida para ESTE paciente
  // (convenio > lista de la sede > catálogo). Precarga el campo; si falla,
  // vuelve el precio de catálogo y el campo sigue editable.
  const priceQuote = usePriceQuote({
    token,
    patientId,
    catalogItemId,
    currency: planDetail?.currency ?? '',
    onSettled: (q) => {
      if (q) {
        setPrice(q.price !== null ? String(q.price) : '');
        if (noDiscountAllowed(q)) setDiscount('');
      } else {
        const fallback = catalogById.get(catalogItemId)?.defaultPrice;
        setPrice(fallback != null ? String(fallback) : '');
      }
      setPriceEdited(false);
    },
  });
  const quoteReady = priceQuote.status === 'ready' ? priceQuote.quote : null;
  const addPriceLoading = priceQuote.status === 'loading';
  const addNoDiscount = noDiscountAllowed(quoteReady);
  // Referencia de la rebaja (R1): el precio resuelto, no el de catálogo.
  const referencePrice = quoteReady ? quoteReady.price : (catalogById.get(catalogItemId)?.defaultPrice ?? null);

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
        loadedPlanIdRef.current = selectedPlanId;
        setPlanDetailError(null);
      } catch (err) {
        if (cancelled) return;
        const message = apiErrorMessage(err, copy.genericPlanDetailError);
        if (isInitialLoad) {
          setPlanDetailError(message);
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
  }, [token, selectedPlanId, paymentsReloadKey]);

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

  /** Opens the "Registrar pago" modal, defaulting currency=plan.currency / fecha=today. */
  function openPaymentForm() {
    paymentIdempotencyKeyRef.current = crypto.randomUUID();
    setPaymentAmount('');
    setPaymentCurrency(planDetail?.currency ?? 'USD');
    // DX-097: hoy en la zona de la sede, no en la del navegador.
    setPaymentDate(sedeToday(sedeTimeZone));
    setPaymentMethod('');
    setPaymentNotes('');
    setAddPaymentValidationError(null);
    setPaymentAmountError(null);
    setAddPaymentError(null);
    setShowPaymentForm(true);
  }

  async function handleAddPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddPaymentValidationError(null);
    setPaymentAmountError(null);
    setAddPaymentError(null);

    if (!selectedPlanId) return;

    const currencyValue = paymentCurrency.trim().toUpperCase();
    if (!currencyValue) {
      setAddPaymentValidationError(copy.invalidPaymentCurrency);
      return;
    }
    // DX-241: la lectura común de los campos de dinero, con los decimales de
    // la moneda del abono.
    const parsedAmount = parseMoneyInput(paymentAmount, currencyValue);
    if (!parsedAmount.ok || parsedAmount.value <= 0) {
      setPaymentAmountError(
        parsedAmount.ok || parsedAmount.reason === 'empty' ? copy.invalidPaymentAmount : parsedAmount.message,
      );
      return;
    }
    const amountNumber = parsedAmount.value;
    if (!paymentDate) {
      setAddPaymentValidationError(copy.invalidPaymentDate);
      return;
    }

    setAddPaymentSubmitting(true);
    try {
      const input: RecordPaymentInput = {
        amount: amountNumber,
        currency: currencyValue,
        // DX-097: el DÍA elegido; la API lo guarda al mediodía de la sede.
        paidAt: paymentDate,
        ...(paymentMethod ? { method: paymentMethod } : {}),
        ...(paymentNotes.trim() ? { notes: paymentNotes.trim() } : {}),
      };
      // Defensive: if the form was somehow submitted without an open-time key,
      // mint one now so this submit still dedups.
      const idempotencyKey =
        paymentIdempotencyKeyRef.current ??
        (paymentIdempotencyKeyRef.current = crypto.randomUUID());
      await recordPayment(token, selectedPlanId, input, idempotencyKey);
      // Success → rotate: the next abono is a genuinely different payment.
      paymentIdempotencyKeyRef.current = crypto.randomUUID();
      setPaymentAmount('');
      setPaymentMethod('');
      setPaymentNotes('');
      setShowPaymentForm(false);
      await refreshBalanceAndPayments();
    } catch (err) {
      // Key intentionally NOT rotated here: a retry of this same click must
      // reuse it so the backend dedups instead of double-charging.
      // Un 400 técnico (importe/moneda) se dice en español (apiErrorMessage).
      setAddPaymentError(apiErrorMessage(err, copy.genericAddPaymentError));
    } finally {
      setAddPaymentSubmitting(false);
    }
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
      await refreshPlanDetail();
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
   * dos en su sitio.
   */
  async function handlePlanOptionsChanged(): Promise<void> {
    await Promise.all([refreshPlanDetail(), refreshPlansInPlace()]);
  }

  function handleProcedureChange(nextCatalogItemId: string) {
    setCatalogItemId(nextCatalogItemId);
    // Prefill (not lock) the price with the chosen procedure's default —
    // the field stays editable afterwards.
    // El precio resuelto del paciente llega de `usePriceQuote`; hasta
    // entonces el campo está en espera.
    const item = catalogById.get(nextCatalogItemId);
    setPrice(item?.defaultPrice != null ? String(item.defaultPrice) : '');
    setPriceEdited(false);
  }

  function handleSurfaceChange(surface: ToothSurface, checked: boolean) {
    setSurfaces((prev) => ({ ...prev, [surface]: checked }));
  }

  async function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddItemValidationError(null);
    setItemAmountErrors({});
    setAddItemError(null);

    if (!selectedPlanId) return;

    const tooth = toothNumber.trim();
    if (!isFdiToothNumber(tooth)) {
      setAddItemValidationError(copy.invalidToothNumber);
      return;
    }
    if (!catalogItemId) {
      setAddItemValidationError(copy.selectProcedurePrompt);
      return;
    }

    const selectedSurfaces = SURFACE_ORDER.filter((s) => surfaces[s]);
    const itemCurrency = planDetail?.currency ?? '';
    const priceInput = optionalAmount(price, itemCurrency);
    const discountInput = optionalAmount(discount, itemCurrency);
    // Lo que no se entiende dice por qué (la regla común de los importes).
    if (priceInput === null || discountInput === null) {
      setItemAmountErrors({
        price: priceInput === null ? copy.unreadablePrice(unreadableReason(price, itemCurrency)) : undefined,
        discount: discountInput === null ? copy.unreadableDiscount(unreadableReason(discount, itemCurrency)) : undefined,
      });
      return;
    }
    const discountValue = discountInput ?? 0;
    if (priceInput !== undefined && discountValue > priceInput) {
      setItemAmountErrors({ discount: copy.invalidDiscount });
      return;
    }
    // DX-105: una prestación sin descuentos no admite rebajar el precio
    // resuelto ni descontar; se dice aquí, sin llamar a la API.
    if (
      addNoDiscount &&
      (discountValue > 0 || (priceInput !== undefined && referencePrice !== null && priceInput < referencePrice))
    ) {
      setItemAmountErrors({
        [discountValue > 0 ? 'discount' : 'price']: NO_DISCOUNT_ALLOWED_NOTICE,
      });
      return;
    }
    // DX-204: tope del rol y motivo por encima del umbral, avisados aquí; la
    // API los vuelve a aplicar. SEC-041: sobre el descuento EFECTIVO, que
    // suma la rebaja del precio frente al de catálogo.
    setAddReasonErrors(null);
    const catalogPrice = referencePrice;
    const effectivePrice = priceInput ?? catalogPrice;
    const effective =
      effectivePrice !== null ? effectiveDiscount(catalogPrice, effectivePrice, discountValue) : null;
    if (discountRules && role && effective && exceedsCap(discountRules, role, effective.listPrice, effective.total)) {
      const cap = capFor(discountRules, role);
      setAddItemValidationError(
        effective.priceReduction > 0 ? priceBelowCatalogCapMessage(cap) : roleCapMessage(cap),
      );
      return;
    }
    const discounted = (effective?.total ?? discountValue) > 0;
    const reasonRequired =
      discountRules !== null && effective !== null && needsReason(discountRules, effective.listPrice, effective.total);
    const reasonProblems = discounted ? validateDiscountReason(addReason, reasonRequired) : null;
    if (reasonProblems) {
      setAddReasonErrors(reasonProblems);
      return;
    }

    setAddItemSubmitting(true);
    try {
      const input: AddTreatmentPlanItemInput = {
        toothNumber: tooth,
        catalogItemId,
        ...(selectedSurfaces.length ? { surfaces: selectedSurfaces } : {}),
        // DX-105: el precio resuelto lo vuelve a calcular la API; solo se
        // manda lo que el usuario escribió. Un fallo de vista previa tampoco
        // convierte el precio de catálogo precargado en un precio manual.
        ...(priceInput !== undefined && priceEdited ? { price: priceInput } : {}),
        ...(discountValue > 0 ? { discount: discountValue } : {}),
        ...(discounted ? reasonPayload(addReason) : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      await addItem(token, selectedPlanId, input);
      setToothNumber('');
      setCatalogItemId('');
      setPrice('');
      setPriceEdited(false);
      setDiscount('');
      setAddReason(EMPTY_REASON);
      setSurfaces(emptySurfacesState());
      setNotes('');
      await refreshPlanDetail();
    } catch (err) {
      // Un 400 (FDI inválido / precio obligatorio si el ítem del catálogo no
      // tiene defaultPrice) llega en inglés: apiErrorMessage lo dice en español.
      setAddItemError(apiErrorMessage(err, copy.genericAddItemError));
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
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const signed = Boolean(planDetail?.acceptance);
  // DX-109: lo mismo que la API aplica con 409, para no ofrecerlo.
  const closed = planDetail ? isPlanClosed(planDetail.status) : false;
  const billable = planDetail ? isPlanBillable(planDetail.status) : true;
  const role = getTokenRole(token);
  const sessionUserId = getTokenUserId(token);
  // DX-050: el ítem del modal «Marcar como realizado» / «Corregir».
  const markDoneItem = markDone ? (planDetail?.items?.find((i) => i.id === markDone.itemId) ?? null) : null;
  // DX-204: un presupuesto aceptado (firmado o no) o cerrado no se vuelve a
  // descontar.
  const discountable = Boolean(planDetail) && !signed && !closed && planDetail?.status !== 'ACCEPTED';
  const addCurrency = planDetail?.currency ?? '';
  const addDiscountInput = optionalAmount(discount, addCurrency);
  const addPriceInput = optionalAmount(price, addCurrency);
  const addDiscountValue = addDiscountInput ?? 0;
  const addCatalogPrice = referencePrice;
  const addPrice = addPriceInput ?? addCatalogPrice;
  // SEC-041: descuento efectivo = rebaja frente al catálogo + descuento. Con
  // un precio o descuento que no se entiende no hay aviso (el envío lo para).
  const addEffective =
    addPrice !== null && addDiscountInput !== null && addPriceInput !== null
      ? effectiveDiscount(addCatalogPrice, addPrice, addDiscountValue)
      : null;
  const addBelowCatalog = addEffective !== null && addEffective.priceReduction > 0;
  const addDiscounted = addEffective ? addEffective.total > 0 : addDiscountValue > 0;
  const addReasonRequired =
    discountRules !== null &&
    addEffective !== null &&
    needsReason(discountRules, addEffective.listPrice, addEffective.total);
  const statusChoices = planDetail ? patchableStatuses(planDetail.status, role) : [];
  const optionGroup = selectedPlan ? optionGroupOf(plans, selectedPlan) : [];

  return (
    <div className="flex flex-col gap-6">
      {refreshing && (
        <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
          {copy.refreshing}
        </p>
      )}

      <Card>
        {/* A 390px la moneda y «Nuevo plan» no caben junto al título: bajan a
            su propia fila (sin desbordar la tarjeta). */}
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{copy.plansHeading}</CardTitle>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <CurrencySelect
              id="tp-new-plan-currency"
              token={token}
              value={newPlanCurrency}
              onChange={setNewPlanCurrency}
              className="min-w-0 flex-1 sm:w-44 sm:flex-none"
              ariaLabel={copy.newPlanCurrencyLabel}
            />
            <Button type="button" onClick={handleCreatePlan} disabled={creatingPlan}>
              {creatingPlan ? copy.creatingPlan : copy.newPlan}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {createPlanError && <InlineError>{createPlanError}</InlineError>}
          {planCreated && !createPlanError && (
            <p role="status" className="text-sm font-medium text-primary">
              {copy.planCreated}
            </p>
          )}
          {planReused && !createPlanError && (
            <p role="status" className="text-sm font-medium text-primary">
              {copy.planReused}
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
                    {copy.planOptionLabel(plan.createdAt, plan.status, index + 1, plan.optionLabel)}
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CardTitle>{copy.detailHeading}</CardTitle>
              {selectedPlan && (
                <Badge variant={PLAN_STATUS_BADGE_VARIANT[selectedPlan.status]}>
                  {PLAN_STATUS_LABELS[selectedPlan.status]}
                </Badge>
              )}
              {selectedPlan?.optionLabel ? (
                <span className="text-sm font-medium text-muted">{selectedPlan.optionLabel}</span>
              ) : null}
            </div>
            {planDetail && (
              <FormField htmlFor="tp-plan-status" label={copy.planStatusLabel} className="sm:w-56">
                <select
                  id="tp-plan-status"
                  value={planDetail.status}
                  disabled={updatingPlanStatus || statusChoices.length === 1}
                  onChange={(e) => handlePlanStatusChange(e.target.value as TreatmentPlanStatus)}
                  className={cn(fieldClass, 'h-9')}
                >
                  {/* Solo el estado actual y sus transiciones (máquina de
                      estados, DX-040): presentar y rechazar tienen botón
                      propio, y aceptar es de odontólogo y ADMIN. */}
                  {statusChoices.map((status) => (
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
            {/* El reintento de un fallo de escalón 1 bombea la reload key, no
                llama a `refreshPlanDetail`. Las dos cargan lo mismo, pero
                `refreshPlanDetail` es el camino de escalón 3 y su `catch`
                lanza un toast: si el reintento vuelve a fallar, el aviso se
                apilaría sobre esta misma superficie. La reload key re-dispara
                el efecto, cuyo `isInitialLoad` sigue siendo cierto (la carga
                inicial nunca fijó `loadedPlanIdRef`), así que el fallo se
                queda en el escalón 1 donde le corresponde. */}
            {planDetailError && (
              <SectionError
                description={planDetailError}
                onRetry={() => setPlanDetailReloadKey((k) => k + 1)}
              />
            )}

            {!planDetailLoading && !planDetailError && planDetail && (
              <>
                {planDetailRefreshing && (
                  <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
                    {copy.refreshing}
                  </p>
                )}
                {planStatusError && <InlineError>{planStatusError}</InlineError>}
                {itemActionError && <InlineError>{itemActionError}</InlineError>}

                {/* El presupuesto del plan (DX-012): imprimirlo y aceptarlo
                    con firma. Va antes de las cifras porque es lo que se
                    presenta al paciente. */}
                <PlanQuoteActions
                  token={token}
                  patientId={patientId}
                  plan={planDetail}
                  role={role}
                  onAccepted={handlePlanAccepted}
                />

                {/* La opción que se le presenta al paciente (DX-040):
                    presentar, rechazar, crear alternativa y comparar. */}
                <PlanOptionsPanel
                  token={token}
                  plan={planDetail}
                  group={optionGroup}
                  role={role}
                  onChanged={handlePlanOptionsChanged}
                  onSelectPlan={setSelectedPlanId}
                />

                {/* UNA región de dinero, no dos racimos de tarjetas. Antes el
                    plan mostraba «Total» en su propia franja y luego tres
                    tarjetas (A pagar / Pagado / Saldo), y más abajo el plan de
                    pagos repetía otras tres — seis cifras con etiquetas de
                    alcances distintos compitiendo por la misma atención, que es
                    justo la plantilla de métrica-héroe que DESIGN.md prohíbe
                    como estructura. Ahora las cuatro cifras del PLAN viven en
                    una sola fila etiquetada; las del financiamiento se quedan
                    bajo el encabezado «Plan de pagos», que es lo que las
                    distingue. Ninguna cifra desapareció. */}
                <PlanMoneySummary
                  total={planDetail.total ?? 0}
                  currency={planDetail.currency}
                  balance={planBalance}
                />
                {/* La nota de alcance califica la región entera (las cuatro
                    cifras y todo lo que cuelga de ellas), por eso va pegada
                    debajo y no repetida en cada número. */}
                <p className="t-label text-muted">{copy.paymentsScopeNote}</p>

                {/* El estado de carga/fallo del saldo NO se repite aquí: vive
                    una sola vez en la región «Abonos y saldo» de abajo, que es
                    la que hace la petición. Duplicarlo daba dos `role="alert"`
                    para un solo fallo. */}

                <Separator />

                {/* El diente que trajo al usuario desde el odontograma, dicho
                    antes de la tabla para que se entienda por qué hay filas
                    resaltadas. */}
                {focusedToothOnPlan && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p role="status" className="text-sm font-medium text-ink">
                      {copy.focusedToothNotice(focusedToothOnPlan)}
                    </p>
                  </div>
                )}

                {discountable && (planDetail.items ?? []).length > 0 ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted tabular-nums">{copy.selectedCount(selectedItemIds.size)}</p>
                    <div className="flex flex-wrap items-center gap-2">
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
                        {selectedItemIds.size === (planDetail.items ?? []).length ? copy.clearSelection : copy.selectAll}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
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
                  </div>
                ) : null}
                {planDetail.status === 'ACCEPTED' && !signed ? (
                  <p role="status" className="text-sm text-muted">
                    {copy.acceptedDiscountNotice}
                  </p>
                ) : null}
                <p role="status" className={bulkNotice ? 'text-sm text-success' : 'sr-only'}>
                  {bulkNotice}
                </p>

                <PlanVisitsBoard key={planDetail.id} token={token} plan={planDetail} role={role} onChanged={refreshPlanDetail} renderItems={visitItems => <ItemsTable
                  items={visitItems}
                  catalogById={catalogById}
                  currency={planDetail.currency}
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
                />} />

                <Separator />

                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* La nota de alcance NO se repite aquí: vive una sola vez
                        pegada a `PlanMoneySummary`, que es donde está el Saldo
                        que califica. Decirla dos veces en la misma pantalla la
                        convierte en ruido y sugiere que son dos alcances. */}
                    <h3 className="text-base font-semibold text-ink">{copy.paymentsHeading}</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openPaymentForm}
                      disabled={!billable}
                      aria-describedby={billable ? undefined : 'plan-not-billable-hint'}
                    >
                      {copy.registerPayment}
                    </Button>
                  </div>
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
                    <SectionError
                      description={paymentsError}
                      onRetry={() => setPaymentsReloadKey((k) => k + 1)}
                    />
                  )}

                  {!paymentsLoading && !paymentsError && planBalance && (
                    <>
                      {paymentsRefreshing && (
                        <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
                          {copy.refreshing}
                        </p>
                      )}

                      {/* Las tres tarjetas que vivían aquí (A pagar / Pagado /
                          Saldo) subieron a `PlanMoneySummary`, junto al Total
                          del plan: son cifras del MISMO plan y separarlas en
                          dos racimos era lo que producía seis números con
                          alcances distintos en una pantalla. Ninguna
                          desapareció. */}
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
                        {/* Va antes de los campos: la sede a la que se
                            atribuye el abono se lee ANTES de escribir el
                            monto, no como una nota al pie ya con el dedo en
                            «Registrar abono». */}
                        {locationHint ? <p className="t-label text-muted">{locationHint}</p> : null}

                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField htmlFor="tp-payment-amount" label={copy.paymentAmountLabel} error={paymentAmountError}>
                            <MoneyInput
                              id="tp-payment-amount"
                              currency={paymentCurrency}
                              requirePositive
                              value={paymentAmount}
                              onValueChange={(text) => {
                                setPaymentAmount(text);
                                setPaymentAmountError(null);
                              }}
                              aria-invalid={paymentAmountError ? true : undefined}
                              aria-describedby={paymentAmountError ? fieldErrorId('tp-payment-amount') : undefined}
                            />
                          </FormField>

                          <FormField htmlFor="tp-payment-currency" label={copy.paymentCurrencyLabel}>
                            <CurrencySelect
                              id="tp-payment-currency"
                              token={token}
                              value={paymentCurrency}
                              onChange={setPaymentCurrency}
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

                      {/* El detalle abono a abono se pliega; lo que decide si
                          hace falta abrirlo —cuántos abonos hay— se queda
                          leído en la propia fila, y el Saldo sigue arriba en
                          `PlanMoneySummary`. En una pantalla financiera no se
                          puede esconder una cifra que alguien necesita para
                          decidir: se esconde la TABLA, nunca el número.
                          Abierta por defecto cuando aún no hay ningún abono,
                          para que el estado vacío enseñe el siguiente paso en
                          vez de esconderlo tras un plegado. */}
                      <Disclosure
                        summary={copy.paymentsHeading}
                        meta={copy.paymentsDisclosureMeta(payments.length)}
                        defaultOpen={payments.length === 0}
                      >
                        <PaymentsList
                          payments={payments}
                          voidingPaymentId={voidingPaymentId}
                          onVoid={openVoidConfirm}
                          onReceipt={setReceiptPaymentId}
                          billable={billable}
                        />
                      </Disclosure>

                      <Separator />

                      <PaymentPlanSection
                        token={token}
                        planId={selectedPlanId!}
                        planCurrency={planBalance.planCurrency}
                        billable={planBalance.billable}
                        canCreate={billable}
                        refreshSignal={paymentPlanRefreshSignal}
                      />
                    </>
                  )}
                </div>

                <Separator />

                {/* Firmado (DX-012): no se agregan ítems; `PlanQuoteActions`
                    ya dice arriba que el plan quedó congelado. */}
                {/* Cerrado (DX-109): tampoco se agregan ítems. */}
                {closed && planDetail && !signed ? (
                  <p role="status" className="text-sm text-muted">
                    {planDetail.status === 'COMPLETED'
                      ? copy.completedItemsNotice
                      : copy.closedItemsNotice(PLAN_STATUS_LABELS[planDetail.status])}
                  </p>
                ) : null}
                {signed || closed ? null : catalogItems.length === 0 ? (
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

                    {/* El diente se TOCA en el mapa, no se transcribe de
                        memoria: es el mismo `OdontogramChart` del tab de al
                        lado. El campo de texto sigue ahí dentro del picker
                        como segunda vía (más rápido si ya sabes el código, y
                        único camino para un temporal, que el mapa no dibuja).
                        Y el procedimiento usa el MISMO selector filtrado que
                        el odontograma: antes esta era la peor afordancia de
                        las dos —un `<select>` nativo sobre el catálogo
                        entero, sin filtro— y estaba justo en la vía del
                        dinero. */}
                    <ToothPicker
                      inputId="tp-tooth-number"
                      value={toothNumber}
                      onChange={setToothNumber}
                    />

                    <CatalogPicker
                      items={catalogItems}
                      value={catalogItemId || null}
                      onChange={handleProcedureChange}
                      idPrefix="tp-procedure"
                      legend={copy.procedureLabel}
                      // Un ítem de plan sólo puede ser un PROCEDURE, así que la
                      // etiqueta de tipo se repetiría en todas las filas sin
                      // decir nada.
                      showKind={false}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField htmlFor="tp-price" label={copy.priceLabel} error={itemAmountErrors.price}>
                        <MoneyInput
                          id="tp-price"
                          currency={addCurrency}
                          value={price}
                          disabled={addPriceLoading}
                          aria-busy={addPriceLoading || undefined}
                          className={addPriceLoading ? 'animate-pulse' : undefined}
                          onValueChange={(text) => {
                            setPrice(text);
                            setPriceEdited(true);
                            setItemAmountErrors((errors) => ({ ...errors, price: undefined }));
                          }}
                          aria-invalid={itemAmountErrors.price ? true : undefined}
                          aria-describedby={
                            [
                              itemAmountErrors.price ? fieldErrorId('tp-price') : null,
                              quoteReady && priceQuote.status === 'ready' ? 'tp-price-source' : null,
                              addBelowCatalog ? 'tp-price-below-catalog' : null,
                            ]
                              .filter(Boolean)
                              .join(' ') || undefined
                          }
                        />
                        {/* DX-105: de dónde sale el precio precargado. */}
                        {addPriceLoading ? (
                          <p role="status" className="text-xs text-muted">
                            {copy.priceQuoteLoading}
                          </p>
                        ) : priceQuote.status === 'error' ? (
                          <FieldError label={copy.priceQuoteError} onRetry={priceQuote.retry} />
                        ) : quoteReady && selectedPlan ? (
                          <PriceQuoteLine id="tp-price-source" quote={quoteReady} currency={addCurrency} />
                        ) : null}
                        {/* SEC-041: aviso, no bloqueo; la API decide con el
                            tope del rol. */}
                        <p id="tp-price-below-catalog" role="status" className="text-xs text-warning">
                          {addBelowCatalog && addEffective && addCatalogPrice !== null && selectedPlan ? (
                            <>
                              <span className="block font-medium">{PRICE_BELOW_CATALOG_NOTICE}</span>
                              <span className="block">
                                {copy.priceBelowCatalogDetail(
                                  formatCurrency(addEffective.priceReduction, selectedPlan.currency),
                                  formatCurrency(addCatalogPrice, selectedPlan.currency),
                                )}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </FormField>

                      <FormField
                        htmlFor="tp-discount"
                        label={copy.discountLabel}
                        hint={addNoDiscount ? NO_DISCOUNT_ALLOWED_NOTICE : copy.discountHint}
                        hintId="tp-discount-hint"
                        error={itemAmountErrors.discount}
                      >
                        <MoneyInput
                          id="tp-discount"
                          currency={addCurrency}
                          disabled={addNoDiscount}
                          value={discount}
                          onValueChange={(text) => {
                            setDiscount(text);
                            setItemAmountErrors((errors) => ({ ...errors, discount: undefined }));
                          }}
                          aria-invalid={itemAmountErrors.discount ? true : undefined}
                          aria-describedby={
                            [
                              itemAmountErrors.discount ? fieldErrorId('tp-discount') : null,
                              addNoDiscount && !itemAmountErrors.discount ? 'tp-discount-hint' : null,
                            ]
                              .filter(Boolean)
                              .join(' ') || undefined
                          }
                        />
                      </FormField>

                      {addDiscounted ? (
                        <DiscountReasonFields
                          idPrefix="tp-discount"
                          value={addReason}
                          onChange={setAddReason}
                          required={addReasonRequired}
                          thresholdPercent={discountRules?.reasonRequiredAbovePercent ?? null}
                          errors={addReasonErrors}
                        />
                      ) : null}

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

                    {addItemValidationError && <InlineError>{addItemValidationError}</InlineError>}
                    {addItemError && <InlineError>{addItemError}</InlineError>}

                    <Button type="submit" disabled={addItemSubmitting || addPriceLoading} className="self-start">
                      {addItemSubmitting ? copy.addItemSubmitting : copy.addItemSubmit}
                    </Button>
                  </form>
                )}
              </>
            )}
          </CardContent>
        </Card>
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
            void refreshPlanDetail();
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
          onSaved={handleMarkDoneSaved}
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
      />
    </div>
  );
}
