'use client';
import type * as React from 'react';
import type { TreatmentPlan, TreatmentPlanItem, TreatmentPlanItemStatus } from '@/lib/treatment-plans/treatment-plans-api';
import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import type { DiscountRules } from '@/lib/discounts/discount-rules';
import type { PlanPrimaryAction } from '@/lib/treatment-plans/plan-primary-action';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import type { readyFormat } from '@/lib/locations/use-sede-format';
import type { ClinicRole } from '@/lib/me/me-api';
import { Button } from '@/components/ui/button';
import { SectionError } from '@/components/errors/section-error';
import { PlanVisitsBoard } from './plan-visits-board';
import { ItemsTable } from './plan-items-table';
import { copy, feeReferences } from './treatment-plans-tab-copy';

/*
 * DX-117 (FE-021): el bloque de ítems de la pestaña «Plan de tratamiento»: el
 * aviso del diente en foco, la selección para «Descuento %» y las visitas con
 * su tabla de ítems. Solo pinta: el estado y las acciones viven en
 * `TreatmentPlansTab`.
 */

type ItemsTableProps = React.ComponentProps<typeof ItemsTable>;

export function PlanItemsSection({
  token,
  role,
  planDetail,
  focusedToothOnPlan,
  headingRef,
  discountable,
  selectedItemIds,
  setSelectedItemIds,
  discountRules,
  onOpenBulkDiscount,
  signed,
  closed,
  bulkNotice,
  feeStale,
  feeReloadFailed,
  onRetryFeeReload,
  onPlanChanged,
  primary,
  onSchedulableChange,
  catalogById,
  updatingItemId,
  odontogramHref,
  implantHref,
  onItemStatusChange,
  onRemoveItem,
  sessionUserId,
  onCorrectAttribution,
  onVoidFee,
  itemBalances,
  sedeFmt,
  stamp,
}: {
  token: string;
  role: ClinicRole | null;
  planDetail: TreatmentPlan;
  focusedToothOnPlan: string | null;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  discountable: boolean;
  selectedItemIds: ReadonlySet<string>;
  setSelectedItemIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  discountRules: DiscountRules | null;
  onOpenBulkDiscount: () => void;
  signed: boolean;
  closed: boolean;
  bulkNotice: string | null;
  feeStale: boolean;
  feeReloadFailed: boolean;
  onRetryFeeReload: () => void;
  onPlanChanged: () => Promise<void>;
  primary: PlanPrimaryAction | null;
  onSchedulableChange: (schedulable: boolean) => void;
  catalogById: Map<string, DentalCatalogItem>;
  updatingItemId: string | null;
  odontogramHref?: (toothNumber: string) => string;
  implantHref?: (item: TreatmentPlanItem) => string;
  onItemStatusChange: (itemId: string, status: TreatmentPlanItemStatus) => void;
  onRemoveItem: (itemId: string) => void;
  sessionUserId: string | null;
  onCorrectAttribution?: (itemId: string) => void;
  onVoidFee?: (item: TreatmentPlanItem) => void;
  itemBalances: ItemsTableProps['itemBalances'];
  sedeFmt: ReturnType<typeof readyFormat>;
  stamp: SedeStamp;
}) {
  return (
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
        <h3 ref={headingRef} tabIndex={-1} className="t-title text-ink">
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
                onClick={onOpenBulkDiscount}
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
        <SectionError description={copy.genericPlanDetailRefreshError} onRetry={onRetryFeeReload} />
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
            onChanged={onPlanChanged}
            primaryScheduling={primary === 'scheduleVisit'}
            onSchedulableChange={onSchedulableChange}
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
                onStatusChange={onItemStatusChange}
                onRemove={onRemoveItem}
                canLeaveDone={(item) => role === 'ADMIN' || item.performedById === sessionUserId}
                onCorrectAttribution={onCorrectAttribution}
                onVoidFee={onVoidFee}
                itemBalances={itemBalances}
                fmt={sedeFmt}
                stamp={stamp}
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
  );
}
