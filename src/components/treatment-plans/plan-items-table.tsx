'use client';
import Link from 'next/link';
import { formatCurrency } from '@/lib/format/currency';
import type { RegionalFormat } from '@/lib/format/regional-format';
import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import type { PlanItemBalance } from '@/lib/payments/payments-api';
import { DISCOUNT_REASON_LABELS, effectiveDiscount, type DiscountReasonCode } from '@/lib/discounts/discount-rules';
import { ITEM_STATUS_LABELS } from '@/lib/treatment-plans/item-status';
import { attributionText } from '@/lib/treatment-plans/item-attribution';
import type { TreatmentPlanItem, TreatmentPlanItemStatus } from '@/lib/treatment-plans/treatment-plans-api';
import { voidFeeCopy } from '@/components/appointments/fee-reason-modal';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ItemPaidCell, ItemPaidLine, itemPaidCopy } from './item-paid-cell';
import { itemPriceOriginText } from './price-quote-line';
import {
  ITEM_STATUS_OPTIONS,
  copy,
  procedureName,
  surfacesLabel,
  type FeeRef,
} from './treatment-plans-tab-copy';

/*
 * Los ítems de un plan (o de una visita) como hoja de trabajo: tabla desde
 * `md`, filas con hairline en el teléfono. No es un `DataList`: cada fila se
 * edita en su sitio (estado, selección para «Descuento %»), no abre nada.
 */

export interface ItemsTableProps {
  items: TreatmentPlanItem[];
  catalogById: Map<string, DentalCatalogItem>;
  /** The plan's currency (`planDetail.currency`) — item prices don't carry their own currency. */
  currency: string;
  /** La visita cuyos ítems lista (`null` sin visitas): nombra la tabla. */
  visit: number | null;
  /** DX-343: «Cargo n de N» de cada ítem de cargo (ver `feeReferences`). */
  feeRefs: ReadonlyMap<string, FeeRef>;
  /** DX-343: un 409 dejó el cargo sin confirmar; «Anular cargo» espera. */
  feeStale?: boolean;
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
   * SEC-050: anular el cargo por inasistencia de un ítem que lo es (solo
   * ADMIN: recepción no ve el plan). Sin ella, el ítem solo lo explica.
   */
  onVoidFee?: (item: TreatmentPlanItem) => void;
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
   * DX-051: cobrado y pendiente de cada ítem, por id. Sin ella (el saldo aún
   * no llegó, o el rol no ve pagos: 403) no hay columnas de cobro.
   */
  itemBalances?: ReadonlyMap<string, PlanItemBalance>;
  /**
   * DX-204: ítems marcados para «Descuento %». Sin ella (plan aceptado,
   * firmado o cerrado: no se vuelve a descontar) no hay casillas.
   */
  selection?: {
    selectedIds: ReadonlySet<string>;
    onToggle: (itemId: string, checked: boolean) => void;
  };
  /** DX-386: formato de la sede para «Cobrado» y «Pendiente»; `null` mientras carga («—»). */
  fmt: RegionalFormat | null;
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
    <span className="flex flex-wrap items-center gap-x-2 t-caption text-muted">
      <span className="tabular-nums">{text}</span>
      {onCorrect ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2"
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

/**
 * SEC-050: el ítem de un cargo por inasistencia vigente no se quita ni cambia
 * de estado (la API responde 409 a todo rol): lo dice y, a un ADMIN, le ofrece
 * anularlo con motivo.
 */
function FeeItemLine({
  item,
  label,
  currency,
  feeRef,
  disabled,
  onVoid,
}: {
  item: TreatmentPlanItem;
  /** El procedimiento tal como lo dice la fila. */
  label: string;
  currency: string;
  /** Solo con más de un cargo en el plan. */
  feeRef?: FeeRef;
  /** DX-343: tras un 409, hasta releer el plan. */
  disabled?: boolean;
  onVoid?: (item: TreatmentPlanItem) => void;
}) {
  if (!item.cancellationFeeAppointmentId) return null;
  return (
    <span className="flex flex-col items-start gap-1 t-caption text-muted">
      <span>{onVoid ? copy.feeItemNoteAdmin : copy.feeItemNote}</span>
      {feeRef ? <span className="font-medium text-ink">{copy.feeReference(feeRef.n, feeRef.total)}</span> : null}
      {onVoid ? (
        <Button
          type="button"
          variant="destructive-ghost"
          size="sm"
          disabled={disabled}
          aria-label={copy.voidFeeFor(label, formatCurrency(item.price, currency), feeRef)}
          onClick={() => onVoid(item)}
        >
          {voidFeeCopy.action}
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
    <span className="block t-caption font-normal text-muted">
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
    <Checkbox
      aria-label={copy.selectItem(item.toothNumber)}
      checked={selection.selectedIds.has(item.id)}
      onChange={(e) => selection.onToggle(item.id, e.target.checked)}
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
      className="text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
      className="text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      {copy.registerImplant}
    </Link>
  );
}

export function ItemsTable({
  items,
  catalogById,
  currency,
  updatingItemId,
  visit,
  feeRefs,
  feeStale,
  focusedTooth,
  odontogramHref,
  implantHref,
  onStatusChange,
  onRemove,
  canLeaveDone = () => true,
  onCorrectAttribution,
  onVoidFee,
  locked = false,
  closed = false,
  markDoneOnly = false,
  itemBalances,
  selection,
  fmt,
}: ItemsTableProps) {
  // SEC-050: el ítem de un cargo vigente no se quita, no cambia de estado ni
  // entra en «Descuento %».
  const isFee = (item: TreatmentPlanItem) => Boolean(item.cancellationFeeAppointmentId);
  const removable = (item: TreatmentPlanItem) => !locked && !closed && !isFee(item);
  // DX-191: el implante se registra al ejecutar un ítem aceptado (o ya
  // realizado); no en uno solo propuesto ni en un plan cancelado o rechazado.
  const implantLinkFor = (item: TreatmentPlanItem) =>
    implantHref && (item.status === 'ACCEPTED' || item.status === 'DONE') && (!closed || markDoneOnly)
      ? implantHref
      : undefined;
  // Plan cerrado: el estado no se toca, salvo en uno completado marcar como
  // realizado lo que quedó aceptado (misma regla que la API).
  const statusFrozen = (item: TreatmentPlanItem) =>
    isFee(item) || (closed && !(markDoneOnly && item.status === 'ACCEPTED'));
  const optionDisabled = (item: TreatmentPlanItem, status: TreatmentPlanItemStatus) =>
    (locked && status === 'PROPOSED') ||
    (closed && status !== item.status && status !== 'DONE') ||
    (item.status === 'DONE' && status !== 'DONE' && !canLeaveDone(item));
  if (items.length === 0) {
    return <EmptyState size="inline" role="status" title={copy.emptyItemsTitle} description={copy.emptyItemsDescription} />;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">
            {visit === null ? copy.itemsTableCaption : copy.visitItemsTableCaption(visit)}
          </caption>
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
              {itemBalances ? (
                <>
                  <TableHead className="text-right">{itemPaidCopy.colPaid}</TableHead>
                  <TableHead className="text-right">{itemPaidCopy.colPending}</TableHead>
                </>
              ) : null}
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
                  className={cn(focused && 'bg-surface-sunken')}
                >
                  {selection ? (
                    <TableCell className="w-10">
                      {isFee(item) ? null : <ItemSelectBox item={item} selection={selection} />}
                    </TableCell>
                  ) : null}
                  <TableCell className="font-medium tabular-nums">{item.toothNumber || copy.noTooth}</TableCell>
                  <TableCell>{procedureName(item, catalogById)}</TableCell>
                  <TableCell className="text-muted">{surfacesLabel(item)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatCurrency(item.price, currency)}
                    <ItemDiscountLine item={item} currency={currency} />
                  </TableCell>
                  {itemBalances ? <ItemPaidCell item={itemBalances.get(item.id)} currency={currency} fmt={fmt} /> : null}
                  <TableCell>
                    <div className="flex flex-col items-start gap-1.5">
                      <StatusBadge kind="treatmentPlanItem" status={item.status} />
                      <span className="inline-flex items-center gap-2">
                        <NativeSelect
                          size="sm"
                          className="w-auto"
                          aria-label={copy.itemStatusSelectLabel(item.toothNumber)}
                          value={item.status}
                          disabled={updating || statusFrozen(item)}
                          onChange={(e) => onStatusChange(item.id, e.target.value as TreatmentPlanItemStatus)}
                        >
                          {ITEM_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status} disabled={optionDisabled(item, status)}>
                              {ITEM_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </NativeSelect>
                        {updating && (
                          <span role="status" className="t-caption text-muted">
                            {copy.refreshing}
                          </span>
                        )}
                      </span>
                      <ItemAttributionLine item={item} onCorrect={onCorrectAttribution} />
                      <FeeItemLine
                        item={item}
                        label={procedureName(item, catalogById)}
                        currency={currency}
                        feeRef={feeRefs.get(item.id)}
                        disabled={feeStale}
                        onVoid={onVoidFee}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* Mismo aislamiento que en la tabla de abonos: el enlace
                        inocuo y el botón destructivo no comparten zona de
                        toque. */}
                    <div className="flex flex-wrap items-center gap-3">
                      <OdontogramLink toothNumber={item.toothNumber} href={odontogramHref} />
                      {implantLink && item.toothNumber ? <RegisterImplantLink item={item} href={implantLink} /> : null}
                      {item.toothNumber && odontogramHref && removable(item) ? <Separator orientation="vertical" className="h-5" /> : null}
                      {!removable(item) ? null : (
                        <Button
                          type="button"
                          variant="destructive-ghost"
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
          lives in (DESIGN.md: "No nested cards; use border-subtle sections
          inside"). */}
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border md:hidden">
        {items.map((item) => {
          const updating = updatingItemId === item.id;
          const focused = focusedTooth === item.toothNumber;
          const implantLink = implantLinkFor(item);
          return (
            <li
              key={item.id}
              aria-current={focused ? true : undefined}
              className={cn('p-4', focused && 'bg-surface-sunken')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-3 font-medium text-ink tabular-nums">
                  {selection && !isFee(item) ? <ItemSelectBox item={item} selection={selection} /> : null}
                  {item.toothNumber ? `${copy.colTooth} ${item.toothNumber}` : copy.noTooth}
                </span>
                <StatusBadge kind="treatmentPlanItem" status={item.status} />
              </div>
              <p className="mt-2 text-ink">{procedureName(item, catalogById)}</p>
              <p className="mt-1 text-sm text-muted">{surfacesLabel(item)}</p>
              <p className="mt-1 font-medium text-ink tabular-nums">
                {formatCurrency(item.price, currency)}
                <ItemDiscountLine item={item} currency={currency} />
              </p>
              {itemBalances?.has(item.id) ? (
                <div className="mt-1">
                  <ItemPaidLine item={itemBalances.get(item.id)} currency={currency} fmt={fmt} />
                </div>
              ) : null}
              <div className="mt-1">
                <ItemAttributionLine item={item} onCorrect={onCorrectAttribution} />
              </div>
              {isFee(item) ? (
                <div className="mt-2">
                  <FeeItemLine
                    item={item}
                    label={procedureName(item, catalogById)}
                    currency={currency}
                    feeRef={feeRefs.get(item.id)}
                    disabled={feeStale}
                    onVoid={onVoidFee}
                  />
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-2">
                <NativeSelect
                  className="w-auto"
                  aria-label={copy.itemStatusSelectLabel(item.toothNumber)}
                  value={item.status}
                  disabled={updating || statusFrozen(item)}
                  onChange={(e) => onStatusChange(item.id, e.target.value as TreatmentPlanItemStatus)}
                >
                  {ITEM_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status} disabled={optionDisabled(item, status)}>
                      {ITEM_STATUS_LABELS[status]}
                    </option>
                  ))}
                </NativeSelect>
                {!removable(item) ? null : (
                  <Button
                    type="button"
                    variant="destructive-ghost"
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
