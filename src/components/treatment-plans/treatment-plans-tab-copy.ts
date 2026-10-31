import { formatDateTime } from '@/lib/format/date';
import { parseMoneyInput } from '@/lib/format/money';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { SURFACE_LABELS } from '@/lib/odontogram/surface-labels';
import type { Payment } from '@/lib/payments/payments-api';
import { PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';
import type {
  TreatmentPlanItem,
  TreatmentPlanItemStatus,
  TreatmentPlanStatus,
} from '@/lib/treatment-plans/treatment-plans-api';

/*
 * Copy y utilidades compartidas por la pestaña «Plan de tratamiento» y sus
 * piezas (`plan-items-table`, `plan-payments-list`, `plan-item-form`,
 * `plan-payment-form-modal`, `plan-money-summary`).
 */

// El pliegue «Abonos y saldo»: destino estable del foco cuando un modal de un
// abono se cierra y la fila que lo abrió ya no existe.
export const PAYMENTS_TRIGGER_ID = 'tp-payments-trigger';

// Copy as constants (i18n-ready, es-first) — matches odontogram-tab.tsx /
// agenda-view.tsx convention until next-intl wiring lands.
export const copy = {
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
  newPlanCurrencyPlaceholder: 'Elige la moneda',
  // GLOBAL-G1 (R14): sin sede activa y con sedes en monedas distintas (o una
  // sede sin moneda) no hay moneda que suponer.
  newPlanCurrencyRequired: 'Elige la moneda del nuevo plan.',
  creatingPlan: 'Creando…',
  planCreated: 'Plan creado y seleccionado abajo.',
  // Reuse path (dup guard): an empty DRAFT already existed, so "Nuevo plan"
  // switched to it instead of POSTing another identical empty plan.
  planReused: 'Ya había un plan en borrador vacío; lo seleccionamos abajo.',
  genericCreatePlanError: 'No pudimos crear el plan. Intenta de nuevo.',
  emptyPlansTitle: 'Este paciente todavía no tiene un plan de tratamiento.',
  emptyPlansDescription: 'Crea el primer plan para presupuestar y seguir sus procedimientos.',
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
  // DX-343: cada tabla nombra su visita; el encabezado visible ya dice «Ítems
  // del plan de tratamiento» y repetirlo en N tablas no distingue ninguna.
  visitItemsTableCaption: (visit: number) => `Ítems de la visita ${visit}`,
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
  emptyItemsDescription: 'Agrega un procedimiento con «Agregar ítem», más abajo.',
  totalLabel: 'Total',
  remove: 'Quitar',
  // SEC-050: el ítem de un cargo por inasistencia vigente.
  feeItemNote: 'Cargo por inasistencia o cancelación tardía: su importe y su estado no se cambian aquí.',
  feeItemNoteAdmin:
    'Cargo por inasistencia o cancelación tardía: su importe y su estado no se cambian aquí; si se generó por error, anúlalo con motivo.',
  // DX-343: cada «Anular cargo» se distingue por el ítem y su importe y, si
  // hay varios cargos en el plan, por la referencia visible «Cargo n de N».
  feeReference: (n: number, total: number) => `Cargo ${n} de ${total}`,
  voidFeeFor: (item: string, amount: string, ref?: { n: number; total: number }) =>
    `Anular cargo${ref ? ` ${ref.n} de ${ref.total}` : ''}: ${item}, ${amount}`,
  feeRefreshing: 'Actualizando el estado del cargo…',
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
  // DX-051: un ADMIN fijó a mano a qué ítems va este abono.
  manualAllocation: 'Fijada a mano',
  // DX-051: abre «Imputar abono» (solo ADMIN).
  allocationAction: 'Imputación',
  emptyPaymentsTitle: 'Este plan todavía no tiene abonos.',
  emptyPaymentsDescription: 'Registra el primer abono con «Registrar abono».',

  // Divulgación progresiva. La lista de abonos y el calendario de cuotas son
  // el DETALLE de cifras que ya están arriba: se pliegan, pero su encabezado
  // lleva el dato que decide si hace falta abrirlos (cuántos abonos hay), así
  // que plegar no esconde información necesaria para decidir.
  paymentsDisclosure: 'Abonos registrados',
  paymentsDisclosureMeta: (n: number) => (n === 1 ? '1 abono' : `${n} abonos`),
};

export const ITEM_STATUS_OPTIONS: TreatmentPlanItemStatus[] = ['PROPOSED', 'ACCEPTED', 'DONE'];

/**
 * Un importe opcional de un campo de dinero (DX-241): `undefined` si está
 * vacío, `null` si no se entiende, o el número leído con la regla común.
 */
export function optionalAmount(text: string, currency: string): number | undefined | null {
  if (text.trim() === '') return undefined;
  const parsed = parseMoneyInput(text, currency);
  return parsed.ok ? parsed.value : null;
}

/** El motivo por el que no se entiende un importe escrito. */
export function unreadableReason(text: string, currency: string): string {
  const parsed = parseMoneyInput(text, currency);
  return parsed.ok ? '' : parsed.message;
}

export function emptySurfacesState(): Record<ToothSurface, boolean> {
  return { VESTIBULAR: false, LINGUAL: false, MESIAL: false, DISTAL: false, OCCLUSAL: false };
}

export type FeeRef = { n: number; total: number };

/**
 * DX-343: «Cargo n de N» por ítem de cargo, en el orden en que se pintan
 * (visita a visita, el de `PlanVisitsBoard`) y sobre el plan entero, para que
 * dos cargos del mismo importe no se confundan.
 * Vacío con un solo cargo: ítem e importe ya lo distinguen.
 */
export function feeReferences(items: TreatmentPlanItem[]): ReadonlyMap<string, FeeRef> {
  const fees = items.filter((item) => item.cancellationFeeAppointmentId);
  if (fees.length < 2) return new Map();
  return new Map(fees.map((item, index) => [item.id, { n: index + 1, total: fees.length }]));
}

export function procedureName(item: TreatmentPlanItem, catalogById: Map<string, DentalCatalogItem>): string {
  return catalogById.get(item.catalogItemId)?.labelEs ?? item.catalogItemId;
}

export function surfacesLabel(item: TreatmentPlanItem): string {
  if (item.surfaces.length > 0) return item.surfaces.map((s) => SURFACE_LABELS[s]).join(', ');
  // DX-291: un cargo administrativo no tiene diente ni caras.
  return item.toothNumber ? copy.wholeToothFallback : copy.noSurfaces;
}

/** DX-390: cuántas formas de pago tiene el cobro dividido del abono (0 si es suelto). */
export function splitLinesOf(payments: Payment[], paymentId: string | null): number {
  const splitId = payments.find((p) => p.id === paymentId)?.splitId;
  return splitId ? payments.filter((p) => p.splitId === splitId).length : 0;
}
