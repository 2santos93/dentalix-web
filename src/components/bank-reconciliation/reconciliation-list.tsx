'use client';
import * as React from 'react';
import Link from 'next/link';
import { FileSearch, Link2, Link2Off, PlusCircle } from 'lucide-react';
import type { ReconciliationItem, ReconciliationStatus } from '@/lib/bank-reconciliation/bank-reconciliation-api';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { amountCents, centsToAmount } from '@/lib/money/round';

export const reconciliationListCopy = {
  labels: {
    CONCILIADO: 'Movimientos conciliados',
    IMPORTE_DISTINTO: 'Movimientos con importe distinto',
    MOVIMIENTO_SIN_ABONO: 'Movimientos sin abono',
    SIN_MOVIMIENTO: 'Abonos sin movimiento',
  } satisfies Record<ReconciliationStatus, string>,
  colDate: 'Fecha',
  colReference: 'Referencia',
  colBank: 'Banco',
  colPayment: 'Abono',
  colPatient: 'Paciente',
  colReceipt: 'Recibo',
  colMethod: 'Medio',
  colDescription: 'Descripción',
  noReference: 'Sin referencia',
  none: '—',
  auto: 'Automático',
  manual: 'A mano',
  difference: (amount: string) => `Diferencia ${amount}`,
  unmatch: 'Deshacer emparejado',
  matchAnyway: 'Emparejar igualmente',
  matchWith: 'Emparejar con un abono…',
  register: 'Registrar abono',
  viewProof: 'Ver comprobante',
  rowLabel: (date: string, reference: string | null) => `movimiento del ${date}${reference ? ` · ${reference}` : ''}`,
  paymentRowLabel: (patient: string, amount: string) => `abono de ${patient} por ${amount}`,
};
const copy = reconciliationListCopy;

export interface ReconciliationListActions {
  onUnmatch: (item: ReconciliationItem) => void;
  onMatchAnyway: (item: ReconciliationItem) => void;
  onMatchWith: (item: ReconciliationItem) => void;
  onRegister: (item: ReconciliationItem) => void;
  onViewProof: (paymentId: string) => void;
}

interface ReconciliationListProps {
  status: ReconciliationStatus;
  items: ReconciliationItem[];
  stamp: SedeStamp;
  actions: ReconciliationListActions;
}

export const itemKey = (item: ReconciliationItem) => item.match?.id ?? item.movement?.id ?? item.payment?.id ?? 'item';

/**
 * DX-571: una de las cuatro listas de la conciliación con `DataList` (tabla
 * desde 640 px, tarjetas en el teléfono). Cada fila junta lo del banco (día,
 * referencia, importe del movimiento) y lo de la caja (importe cobrado,
 * paciente, recibo, medio), con el dinero con su código ISO. Las acciones van
 * en el «⋯» según la lista.
 */
export function ReconciliationList({ status, items, stamp, actions }: ReconciliationListProps) {
  const paymentMoney = (item: ReconciliationItem) =>
    item.payment ? stamp.money(item.payment.collectedAmount, item.payment.currency, item.payment.location.id) : null;
  const bankMoney = (item: ReconciliationItem) =>
    item.movement ? stamp.money(item.movement.amount, item.movement.currency) : null;
  const dayOf = (item: ReconciliationItem) =>
    item.movement
      ? stamp.civilDate(item.movement.bookedOn)
      : item.payment
        ? stamp.civilDate(item.payment.paidOn, item.payment.location.id)
        : copy.none;
  const referenceOf = (item: ReconciliationItem) => item.movement?.reference ?? item.payment?.reference ?? null;

  const columns: DataListColumn<ReconciliationItem>[] = [
    {
      id: 'date',
      header: copy.colDate,
      cellClassName: 'tabular-nums whitespace-nowrap',
      cell: dayOf,
      mobileCell: (item) =>
        item.movement
          ? stamp.maybe.civilDate(item.movement.bookedOn)
          : item.payment
            ? stamp.maybe.civilDate(item.payment.paidOn, item.payment.location.id)
            : null,
    },
    {
      id: 'reference',
      header: copy.colReference,
      mobile: 'primary',
      cell: (item) => {
        const ref = referenceOf(item);
        return ref ? (
          <span className="break-all font-mono">{ref}</span>
        ) : (
          <span className="text-muted">{copy.noReference}</span>
        );
      },
      mobileCell: (item) => referenceOf(item) ?? copy.noReference,
    },
    ...(status !== 'SIN_MOVIMIENTO'
      ? [
          {
            id: 'bank',
            header: copy.colBank,
            numeric: true,
            mobile: 'trailing' as const,
            cell: (item: ReconciliationItem) => <span className="font-medium">{bankMoney(item)}</span>,
          },
        ]
      : []),
    ...(status !== 'MOVIMIENTO_SIN_ABONO'
      ? [
          {
            id: 'payment',
            header: copy.colPayment,
            numeric: true,
            mobile: status === 'SIN_MOVIMIENTO' ? ('trailing' as const) : ('meta' as const),
            cell: (item: ReconciliationItem) => (
              <span className="flex flex-col items-end">
                <span className={status === 'SIN_MOVIMIENTO' ? 'font-medium' : undefined}>{paymentMoney(item)}</span>
                {status === 'IMPORTE_DISTINTO' && item.movement && item.payment ? (
                  <Badge variant="warning" className="mt-1 tabular-nums">
                    {copy.difference(
                      stamp.money(
                        centsToAmount(
                          Math.abs(amountCents(item.movement.amount) - amountCents(item.payment.collectedAmount)),
                        ),
                        item.movement.currency,
                      ),
                    )}
                  </Badge>
                ) : null}
              </span>
            ),
            mobileCell: (item: ReconciliationItem) =>
              status === 'SIN_MOVIMIENTO'
                ? paymentMoney(item)
                : item.payment
                  ? `${copy.colPayment}: ${paymentMoney(item)}`
                  : null,
          },
          {
            id: 'patient',
            header: copy.colPatient,
            cell: (item: ReconciliationItem) =>
              item.payment ? (
                <Link
                  href={`/patients/${item.payment.patient.id}`}
                  className="relative z-10 text-ink underline-offset-4 hover:text-primary-text hover:underline"
                >
                  {item.payment.patient.fullName}
                </Link>
              ) : (
                copy.none
              ),
            mobileCell: (item: ReconciliationItem) => item.payment?.patient.fullName ?? null,
          },
          {
            id: 'receipt',
            header: copy.colReceipt,
            showFrom: 'lg' as const,
            cell: (item: ReconciliationItem) => (
              <span className="t-id">{item.payment?.receiptNumber ?? copy.none}</span>
            ),
            mobileCell: (item: ReconciliationItem) => item.payment?.receiptNumber ?? null,
          },
          {
            id: 'method',
            header: copy.colMethod,
            showFrom: 'md' as const,
            cell: (item: ReconciliationItem) => (
              <span className="flex flex-col">
                <span>{item.payment?.paymentMethod?.name ?? copy.none}</span>
                {item.match ? (
                  <span className="t-caption text-muted">{item.match.kind === 'AUTO' ? copy.auto : copy.manual}</span>
                ) : null}
              </span>
            ),
            mobileCell: (item: ReconciliationItem) => item.payment?.paymentMethod?.name ?? null,
          },
        ]
      : [
          {
            id: 'description',
            header: copy.colDescription,
            showFrom: 'md' as const,
            cell: (item: ReconciliationItem) => (
              <span className="break-words text-muted">{item.movement?.description ?? ''}</span>
            ),
            mobileCell: (item: ReconciliationItem) => item.movement?.description ?? null,
          },
        ]),
  ];

  const rowActions = (item: ReconciliationItem): RowAction[] => {
    switch (status) {
      case 'CONCILIADO':
        return [
          {
            label: copy.unmatch,
            icon: <Link2Off aria-hidden />,
            destructive: true,
            onSelect: () => actions.onUnmatch(item),
          },
        ];
      case 'IMPORTE_DISTINTO':
        return [{ label: copy.matchAnyway, icon: <Link2 aria-hidden />, onSelect: () => actions.onMatchAnyway(item) }];
      case 'MOVIMIENTO_SIN_ABONO':
        return [
          { label: copy.matchWith, icon: <Link2 aria-hidden />, onSelect: () => actions.onMatchWith(item) },
          { label: copy.register, icon: <PlusCircle aria-hidden />, onSelect: () => actions.onRegister(item) },
        ];
      case 'SIN_MOVIMIENTO':
        return item.payment?.hasProof
          ? [
              {
                label: copy.viewProof,
                icon: <FileSearch aria-hidden />,
                onSelect: () => item.payment && actions.onViewProof(item.payment.id),
              },
            ]
          : [];
    }
  };

  const hasActions = items.some((item) => rowActions(item).length > 0);

  return (
    <DataList
      label={copy.labels[status]}
      rows={items}
      columns={columns}
      getRowKey={itemKey}
      rowActions={hasActions ? rowActions : undefined}
      getRowLabel={(item) =>
        item.movement
          ? copy.rowLabel(dayOf(item), item.movement.reference)
          : copy.paymentRowLabel(item.payment?.patient.fullName ?? '', paymentMoney(item) ?? '')
      }
    />
  );
}
