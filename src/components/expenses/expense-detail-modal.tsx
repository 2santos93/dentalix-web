'use client';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Eye, Pencil, Plus, Wallet } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { cashSessionHref } from '@/lib/cash-sessions/cash-sessions-api';
import {
  attachExpenseReceipt,
  getExpense,
  getExpenseReceiptUrl,
  requestExpenseReceiptUpload,
  voidExpense,
  voidExpensePayment,
  type ExpenseDetail,
  type ExpensePayment,
} from '@/lib/expenses/expenses-api';
import { EXPENSE_RECEIPT_ACCEPT, EXPENSE_RECEIPT_RULES, isImageReceipt } from '@/lib/expenses/presentation';
import type { SingleFileUploadRequest } from '@/lib/files/upload-single-file';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { startDownload } from '@/lib/patient-documents/download';
import { formatFileSize } from '@/lib/patient-documents/patient-documents-api';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';
import { SignedFileViewerDialog } from '@/components/shared/signed-file-viewer-dialog';
import { SingleFileField, useSingleFileUpload } from '@/components/shared/single-file-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ExpenseFormModal } from './expense-form-modal';
import { ExpensePaymentModal } from './expense-payment-modal';
import { ExpenseStatusBadges } from './expense-status-badges';
import { ExpenseVoidModal } from './expense-void-modal';
import type { ExpenseCategoriesState } from './use-expense-categories';

export const expenseDetailCopy = {
  title: 'Gasto',
  loading: 'Cargando el gasto',
  loadError: 'No pudimos cargar el gasto.',
  location: 'Sede',
  supplier: 'Proveedor',
  noSupplier: 'Sin proveedor',
  description: 'Descripción',
  invoiceDate: 'Fecha de factura',
  dueDate: 'Vencimiento',
  noDueDate: 'Sin vencimiento',
  amount: 'Importe',
  paid: 'Pagado',
  pending: 'Pendiente',
  createdBy: (name: string, at: string) => `Registrado por ${name} el ${at}`,
  voided: (name: string, reason: string) => `Anulado por ${name}: ${reason}`,
  someone: 'alguien',
  receipt: 'Soporte',
  noReceipt: 'Sin soporte.',
  view: 'Ver',
  download: 'Descargar',
  attachLabel: 'Adjuntar soporte',
  attachHint: 'Aún no tiene. PDF, JPG, PNG o foto HEIC, hasta 20 MB.',
  attach: 'Guardar soporte',
  attached: 'Soporte guardado.',
  attachError: 'No pudimos guardar el soporte. Intenta de nuevo.',
  downloadError: 'No pudimos descargar el soporte. Intenta de nuevo.',
  payments: 'Pagos',
  noPayments: 'Aún no tiene pagos.',
  fromCash: 'Salida de caja',
  fromCashLink: 'Ver la caja',
  paymentBy: (name: string) => `Registró ${name}`,
  voidPayment: 'Anular pago',
  voidPaymentLabel: (amount: string, day: string) => `Anular el pago de ${amount} del ${day}`,
  addPayment: 'Registrar pago',
  edit: 'Editar',
  voidExpense: 'Anular gasto',
  voidError: 'No pudimos anular. Intenta de nuevo.',
  expenseVoided: 'Gasto anulado.',
  paymentVoided: 'Pago anulado.',
};

type SubDialog =
  | { kind: 'pay' }
  | { kind: 'edit' }
  | { kind: 'void-expense' }
  | { kind: 'void-payment'; payment: ExpensePayment }
  | { kind: 'viewer' };

interface ExpenseDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  expenseId: string;
  locations: ClinicLocation[];
  categories: ExpenseCategoriesState;
  onManageCategories: () => void;
  /** Tras cualquier cambio, con el aviso: la lista se recarga. */
  onChanged: (notice: string) => void;
  /** A dónde va el foco al cerrar si la fila que abrió el detalle ya no está. */
  onCloseAutoFocus?: (event: Event) => void;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <dt className="t-label text-muted">{label}</dt>
      <dd className="text-sm text-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/**
 * Detalle de un gasto (DX-274): datos, soporte con visor, pagos (con la caja
 * de la que salió cada salida) y las acciones: registrar o anular un pago,
 * editar y anular el gasto. Los modales de cada acción se abren encima y los
 * fallos se dicen aquí dentro (un toast quedaría debajo del modal).
 */
export function ExpenseDetailModal({
  open,
  onOpenChange,
  token,
  expenseId,
  locations,
  categories,
  onManageCategories,
  onChanged,
  onCloseAutoFocus,
}: ExpenseDetailModalProps) {
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sub, setSub] = useState<SubDialog | null>(null);
  const [subKey, setSubKey] = useState(0);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  // Tras anular un pago, anular el gasto o pagarlo del todo, el botón que abrió
  // el modal desaparece: el foco vuelve entonces al título del detalle.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subTriggerRef = useRef<HTMLElement | null>(null);

  const requestTicket = useCallback(
    (request: SingleFileUploadRequest) => requestExpenseReceiptUpload(token, request),
    [token],
  );
  const upload = useSingleFileUpload(EXPENSE_RECEIPT_RULES, requestTicket);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getExpense(token, expenseId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, { fallback: expenseDetailCopy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, expenseId, reloadKey]);

  const loadUrl = useCallback(() => getExpenseReceiptUrl(token, expenseId, 'inline'), [token, expenseId]);

  function openSub(next: SubDialog) {
    const active = document.activeElement;
    subTriggerRef.current = active instanceof HTMLElement ? active : null;
    setActionError(null);
    setVoidError(null);
    setSubKey((k) => k + 1);
    setSub(next);
  }

  function focusAfterSub(event: Event) {
    if (subTriggerRef.current?.isConnected) return;
    event.preventDefault();
    titleRef.current?.focus();
  }

  function applyChange(saved: ExpenseDetail, message: string) {
    setDetail(saved);
    setNotice(message);
    onChanged(message);
  }

  async function confirmVoid(reason: string) {
    if (!sub || (sub.kind !== 'void-expense' && sub.kind !== 'void-payment')) return;
    setVoiding(true);
    setVoidError(null);
    try {
      const saved =
        sub.kind === 'void-expense'
          ? await voidExpense(token, expenseId, reason)
          : await voidExpensePayment(token, expenseId, sub.payment.id, reason);
      applyChange(saved, sub.kind === 'void-expense' ? expenseDetailCopy.expenseVoided : expenseDetailCopy.paymentVoided);
      setSub(null);
    } catch (err) {
      setVoidError(apiErrorMessage(err, { fallback: expenseDetailCopy.voidError }));
    } finally {
      setVoiding(false);
    }
  }

  async function attach() {
    if (!upload.uploadId) return;
    setAttaching(true);
    setActionError(null);
    try {
      const saved = await attachExpenseReceipt(token, expenseId, upload.uploadId);
      upload.clear();
      applyChange(saved, expenseDetailCopy.attached);
      // «Guardar soporte» desaparece al guardarlo.
      titleRef.current?.focus();
    } catch (err) {
      setActionError(apiErrorMessage(err, { fallback: expenseDetailCopy.attachError }));
    } finally {
      setAttaching(false);
    }
  }

  async function download() {
    setActionError(null);
    try {
      const { url } = await getExpenseReceiptUrl(token, expenseId, 'attachment');
      startDownload(url);
    } catch (err) {
      setActionError(apiErrorMessage(err, { fallback: expenseDetailCopy.downloadError }));
    }
  }

  const location = detail ? locations.find((l) => l.id === detail.locationId) : undefined;
  const live = detail !== null && detail.status !== 'VOIDED';
  const money = (amount: number) => (detail ? formatCurrency(amount, detail.currency) : '');

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  } else if (!detail) {
    body = (
      <div role="status" aria-label={expenseDetailCopy.loading} className="flex flex-col gap-3">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  } else {
    const attachment = detail.attachment;
    body = (
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <ExpenseStatusBadges expense={detail} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Field label={expenseDetailCopy.amount}>
              <span className="font-medium tabular-nums">{money(detail.amount)}</span>
            </Field>
            <Field label={expenseDetailCopy.paid}>
              <span className="tabular-nums">{money(detail.paidAmount)}</span>
            </Field>
            <Field label={expenseDetailCopy.pending}>
              <span className="tabular-nums">{money(detail.pendingAmount)}</span>
            </Field>
            <Field label={expenseDetailCopy.invoiceDate}>
              <span className="tabular-nums">{formatCivilDate(detail.invoiceDate)}</span>
            </Field>
            <Field label={expenseDetailCopy.dueDate}>
              <span className="tabular-nums">
                {detail.dueDate ? formatCivilDate(detail.dueDate) : expenseDetailCopy.noDueDate}
              </span>
            </Field>
            <Field label={expenseDetailCopy.location}>{location?.name ?? '—'}</Field>
            <Field label={expenseDetailCopy.supplier}>{detail.supplier ?? expenseDetailCopy.noSupplier}</Field>
            {detail.description ? (
              <Field label={expenseDetailCopy.description} className="col-span-2 sm:col-span-3">
                {detail.description}
              </Field>
            ) : null}
          </dl>
          <p className="text-xs text-muted tabular-nums">
            {expenseDetailCopy.createdBy(
              detail.createdByName ?? expenseDetailCopy.someone,
              formatDateTime(detail.createdAt),
            )}
          </p>
          {detail.voidedAt ? (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink">
              {expenseDetailCopy.voided(detail.voidedByName ?? expenseDetailCopy.someone, detail.voidReason ?? '')}
            </p>
          ) : null}
        </div>

        <section aria-labelledby="expense-receipt-title" className="flex flex-col gap-2 border-t border-hairline pt-4">
          <h3 id="expense-receipt-title" className="t-title text-ink">
            {expenseDetailCopy.receipt}
          </h3>
          {attachment ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">
                {attachment.name}{' '}
                <span className="text-xs tabular-nums text-muted">{formatFileSize(attachment.sizeBytes)}</span>
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => openSub({ kind: 'viewer' })} className="max-sm:min-h-11 max-sm:flex-1">
                  <Eye aria-hidden />
                  {expenseDetailCopy.view}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void download()} className="max-sm:min-h-11 max-sm:flex-1">
                  <Download aria-hidden />
                  {expenseDetailCopy.download}
                </Button>
              </div>
            </div>
          ) : live ? (
            <div className="flex flex-col gap-2">
              <SingleFileField
                id="expense-detail-receipt"
                label={expenseDetailCopy.attachLabel}
                hint={expenseDetailCopy.attachHint}
                accept={EXPENSE_RECEIPT_ACCEPT}
                upload={upload}
                disabled={attaching}
              />
              {upload.uploadId ? (
                <Button type="button" size="sm" loading={attaching} onClick={() => void attach()} className="self-start max-sm:min-h-11">
                  {expenseDetailCopy.attach}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">{expenseDetailCopy.noReceipt}</p>
          )}
        </section>

        <section aria-labelledby="expense-payments-title" className="flex flex-col gap-2 border-t border-hairline pt-4">
          <h3 id="expense-payments-title" className="t-title text-ink">
            {expenseDetailCopy.payments}
          </h3>
          {detail.payments.length === 0 ? (
            <p className="text-sm text-muted">{expenseDetailCopy.noPayments}</p>
          ) : (
            <ul className="divide-y divide-hairline rounded-lg border border-border">
              {detail.payments.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  canVoid={live && !payment.voidedAt}
                  onVoid={() => openSub({ kind: 'void-payment', payment })}
                />
              ))}
            </ul>
          )}
        </section>

        {live ? (
          <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => openSub({ kind: 'void-expense' })} className="max-sm:min-h-11">
              {expenseDetailCopy.voidExpense}
            </Button>
            <Button type="button" variant="secondary" onClick={() => openSub({ kind: 'edit' })} className="max-sm:min-h-11">
              <Pencil aria-hidden />
              {expenseDetailCopy.edit}
            </Button>
            {detail.pendingAmount > 0 ? (
              <Button type="button" onClick={() => openSub({ kind: 'pay' })} className="max-sm:min-h-11">
                <Plus aria-hidden />
                {expenseDetailCopy.addPayment}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const title = detail
    ? `${detail.category}${detail.supplier ? ` · ${detail.supplier}` : ''}`
    : expenseDetailCopy.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            className="[overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {title}
          </DialogTitle>
          <DialogDescription>
            {detail ? `${formatCivilDate(detail.invoiceDate)} · ${money(detail.amount)}` : expenseDetailCopy.loading}
          </DialogDescription>
        </DialogHeader>
        {actionError ? <InlineError variant="summary">{actionError}</InlineError> : null}
        <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
          {notice}
        </p>
        {body}

        {detail && sub?.kind === 'pay' ? (
          <ExpensePaymentModal
            key={subKey}
            open
            onOpenChange={(next) => !next && setSub(null)}
            onCloseAutoFocus={focusAfterSub}
            token={token}
            expense={detail}
            today={sedeToday(location?.timeZone ?? null)}
            onSaved={applyChange}
          />
        ) : null}
        {detail && sub?.kind === 'edit' ? (
          <ExpenseFormModal
            key={subKey}
            open
            onOpenChange={(next) => !next && setSub(null)}
            onCloseAutoFocus={focusAfterSub}
            token={token}
            locations={locations}
            defaultLocationId={detail.locationId}
            categories={categories}
            onManageCategories={onManageCategories}
            expense={detail}
            onSaved={applyChange}
          />
        ) : null}
        {detail && (sub?.kind === 'void-expense' || sub?.kind === 'void-payment') ? (
          <ExpenseVoidModal
            key={subKey}
            open
            onOpenChange={(next) => !next && setSub(null)}
            onCloseAutoFocus={focusAfterSub}
            kind={sub.kind === 'void-expense' ? 'expense' : 'payment'}
            subject={
              sub.kind === 'void-expense'
                ? `${title} · ${money(detail.amount)} · ${formatCivilDate(detail.invoiceDate)}`
                : `${money(sub.payment.amount)} · ${PAYMENT_METHOD_LABELS[sub.payment.method]} · ${formatCivilDate(sub.payment.paidOn)}`
            }
            onConfirm={(reason) => void confirmVoid(reason)}
            submitting={voiding}
            error={voidError}
          />
        ) : null}
        {detail?.attachment && sub?.kind === 'viewer' ? (
          <SignedFileViewerDialog
            key={subKey}
            open
            onOpenChange={(next) => !next && setSub(null)}
            onCloseAutoFocus={focusAfterSub}
            name={detail.attachment.name}
            description={title}
            image={isImageReceipt(detail.attachment.mimeType)}
            loadUrl={loadUrl}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PaymentRow({ payment, canVoid, onVoid }: { payment: ExpensePayment; canVoid: boolean; onVoid: () => void }) {
  const amount = formatCurrency(payment.amount, payment.currency);
  const day = formatCivilDate(payment.paidOn);
  const voided = payment.voidedAt !== null;
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('text-sm text-ink tabular-nums', voided && 'text-muted line-through')}>
          {day} · {PAYMENT_METHOD_LABELS[payment.method]} · <span className="font-medium">{amount}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {payment.cashSessionId ? (
            <Link
              href={cashSessionHref(payment.cashSessionId)}
              className="inline-flex min-h-11 items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-0"
            >
              <Wallet aria-hidden className="size-3.5" />
              {expenseDetailCopy.fromCash} · {expenseDetailCopy.fromCashLink}
            </Link>
          ) : null}
          <span>{expenseDetailCopy.paymentBy(payment.createdByName ?? expenseDetailCopy.someone)}</span>
        </span>
        {voided ? (
          <span className="text-xs text-ink">
            {expenseDetailCopy.voided(payment.voidedByName ?? expenseDetailCopy.someone, payment.voidReason ?? '')}
          </span>
        ) : null}
      </div>
      {canVoid ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onVoid}
          aria-label={expenseDetailCopy.voidPaymentLabel(amount, day)}
          className="self-start max-sm:min-h-11 sm:self-center"
        >
          {expenseDetailCopy.voidPayment}
        </Button>
      ) : null}
    </li>
  );
}
