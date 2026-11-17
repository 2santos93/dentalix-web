'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Banknote, Download, FileX, Printer, Send } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  COMMISSIONS_HREF,
  COMMISSION_BASIS_LABELS,
  COMMISSION_RELEASE_LABELS,
  canManageCommissions,
  commissionPdfFallbackName,
  commissionSettlementPrintHref,
  fetchCommissionReceiptPdf,
  fetchCommissionSettlementPdf,
  getCommissionSettlement,
  payableCurrencies,
  percentText,
  type CommissionPayment,
  type CommissionReceiptLink,
  type CommissionSettlement,
} from '@/lib/commissions/commissions-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { saveBlob } from '@/lib/files/save-blob';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { StatusBadge } from '@/components/ui/status-badge';
import { CommissionPayDialog } from './commission-pay-dialog';
import {
  CommissionPaymentTotals,
  CommissionPaymentsSection,
  CommissionReceiptRequestDialog,
  CommissionVoidPaymentDialog,
} from './commission-payments';
import { CommissionSendDialog } from './commission-send-dialog';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { SectionError } from '@/components/errors/section-error';
import { SectionSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { CommissionLines, CommissionTotals } from './commission-lines';

export const commissionSettlementViewCopy = {
  title: (name: string) => `Liquidación de ${name}`,
  titleLoading: 'Liquidación de honorarios',
  description: 'Congelada al cerrarse: no cambia nunca. Lo que se anule después sale como ajuste en la siguiente.',
  back: 'Honorarios',
  print: 'Imprimir',
  pay: 'Registrar pago',
  pdf: 'Descargar PDF',
  send: 'Enviar',
  paymentStatus: 'Estado de pago',
  paid: 'Pago registrado: queda como gasto de la sede.',
  voided: 'Pago anulado: sus líneas vuelven a pendientes.',
  pdfError: 'No pudimos descargar el PDF.',
  receiptError: 'No pudimos descargar el recibo.',
  period: 'Período',
  rule: 'Regla',
  categories: 'Por categoría',
  closedAt: 'Cerrada',
  closedBy: 'Cerró',
  lock: 'Cierre contable',
  lockValue: (day: string) => `Cerrado hasta el ${day}`,
  periodValue: (from: string, to: string) => `${from} – ${to}`,
  ruleValue: (percent: string, basis: string, release: string) => `${percent} de ${basis}, ${release}`,
  loadError: 'No pudimos cargar la liquidación.',
  notFound: 'No encontramos esta liquidación.',
  notFoundHint: 'Puede que no sea tuya o que el enlace no sea de esta clínica.',
};

const copy = commissionSettlementViewCopy;

/** Una liquidación cerrada (DX-018): cabecera, totales por moneda, detalle e «Imprimir». */
export function CommissionSettlementView({ token, id }: { token: string; id: string }) {
  const [data, setData] = useState<CommissionSettlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const isAdmin = canManageCommissions(getTokenRole(token));
  const [payOpen, setPayOpen] = useState(false);
  const [payKey, setPayKey] = useState(0);
  const [sendOpen, setSendOpen] = useState(false);
  const [voiding, setVoiding] = useState<CommissionPayment | null>(null);
  const [requesting, setRequesting] = useState<CommissionPayment | null>(null);
  const [receiptLink, setReceiptLink] = useState<CommissionReceiptLink | null>(null);
  const [downloading, setDownloading] = useState(false);
  const stamp = useSedeStamp(token, [
    ...(data?.lines.map((l) => l.locationId) ?? []),
    ...(data?.payments.map((p) => p.location.id) ?? []),
  ]);

  /** Tras pagar o anular: la liquidación vuelve a pedirse (estado, pendientes y pagos). */
  function refresh() {
    setReloadKey((k) => k + 1);
  }

  async function downloadPdf(settlement: CommissionSettlement) {
    setDownloading(true);
    try {
      const { blob, fileName } = await fetchCommissionSettlementPdf(token, settlement.id);
      saveBlob(blob, fileName ?? commissionPdfFallbackName('settlement', settlement.id));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.pdfError), { onRetry: () => void downloadPdf(settlement) });
    } finally {
      setDownloading(false);
    }
  }

  async function downloadReceipt(payment: CommissionPayment) {
    try {
      const { blob, fileName } = await fetchCommissionReceiptPdf(token, payment.id);
      saveBlob(blob, fileName ?? commissionPdfFallbackName('receipt', payment.id));
    } catch (err) {
      notifyError(apiErrorMessage(err, copy.receiptError), { onRetry: () => void downloadReceipt(payment) });
    }
  }

  useEffect(() => {
    let cancelled = false;
    getCommissionSettlement(token, id)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setNotFound(err instanceof ApiError && (err.status === 404 || err.status === 400));
        setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, id, reloadKey]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={data ? copy.title(data.professional.name) : copy.titleLoading}
        description={copy.description}
        back={{ href: COMMISSIONS_HREF, label: copy.back }}
        actions={
          data ? (
            // Cuatro acciones: en el móvil bajan a otra fila en vez de salirse de la pantalla.
            <div className="flex flex-wrap gap-2">
              {isAdmin && payableCurrencies(data.payment).length > 0 ? (
                <Button
                  type="button"
                  onClick={() => {
                    setPayKey((k) => k + 1);
                    setPayOpen(true);
                  }}
                >
                  <Banknote aria-hidden />
                  {copy.pay}
                </Button>
              ) : null}
              {isAdmin ? (
                <>
                  <Button type="button" variant="secondary" loading={downloading} onClick={() => void downloadPdf(data)}>
                    <Download aria-hidden />
                    {copy.pdf}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSendOpen(true)}>
                    <Send aria-hidden />
                    {copy.send}
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.open(commissionSettlementPrintHref(data.id), '_blank', 'noopener')}
              >
                <Printer aria-hidden />
                {copy.print}
              </Button>
            </div>
          ) : undefined
        }
      />
      {data ? (
        <div className="flex flex-col gap-8">
          <SedeStampNote stamp={stamp} />
          <DescriptionList columns={3}>
            <DescriptionItem label={copy.paymentStatus}>
              <StatusBadge kind="commissionPayment" status={data.payment.status} />
            </DescriptionItem>
            <DescriptionItem label={copy.period} numeric>
              {copy.periodValue(stamp.civilDate(data.period.from), stamp.civilDate(data.period.to))}
            </DescriptionItem>
            <DescriptionItem label={copy.rule}>
              {copy.ruleValue(
                percentText(data.percent),
                COMMISSION_BASIS_LABELS[data.basis].toLowerCase(),
                COMMISSION_RELEASE_LABELS[data.releaseMode].toLowerCase(),
              )}
            </DescriptionItem>
            {data.categoryPercents.length > 0 ? (
              <DescriptionItem label={copy.categories}>
                {data.categoryPercents.map((c) => `${c.category}: ${percentText(c.percent)}`).join(' · ')}
              </DescriptionItem>
            ) : null}
            <DescriptionItem label={copy.closedAt} numeric>
              {stamp.dateTime(data.closedAt)}
            </DescriptionItem>
            <DescriptionItem label={copy.closedBy}>{data.closedBy.name ?? '—'}</DescriptionItem>
            <DescriptionItem label={copy.lock} numeric>
              {copy.lockValue(stamp.civilDate(data.lockDateAfter))}
            </DescriptionItem>
          </DescriptionList>
          <CommissionTotals totals={data.totals} stamp={stamp} />
          <CommissionPaymentTotals currencies={data.payment.currencies} stamp={stamp} />
          <CommissionPaymentsSection
            payments={data.payments}
            stamp={stamp}
            actions={
              isAdmin
                ? {
                    onRequestReceipt: setRequesting,
                    onDownloadReceipt: (p) => void downloadReceipt(p),
                    onVoid: setVoiding,
                  }
                : null
            }
          />
          <CommissionLines lines={data.lines} stamp={stamp} showPayment />
        </div>
      ) : notFound ? (
        <EmptyState role="status" icon={<FileX aria-hidden />} title={copy.notFound} description={copy.notFoundHint} />
      ) : error ? (
        <SectionError
          description={error}
          onRetry={() => {
            setError(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : (
        <SectionSkeleton />
      )}

      {data && isAdmin ? (
        <>
          <CommissionPayDialog
            key={`pay-${payKey}`}
            token={token}
            settlement={data}
            open={payOpen}
            onOpenChange={setPayOpen}
            onPaid={() => {
              setPayOpen(false);
              notifySuccess(copy.paid);
              refresh();
            }}
          />
          <CommissionSendDialog
            settlement={data}
            stamp={stamp}
            receiptLink={receiptLink}
            open={sendOpen}
            onOpenChange={setSendOpen}
          />
          {voiding ? (
            <CommissionVoidPaymentDialog
              key={`void-${voiding.id}`}
              token={token}
              payment={voiding}
              subject={`${stamp.money(voiding.amount, voiding.currency, voiding.location.id)} · ${stamp.civilDate(voiding.paidOn)} · ${PAYMENT_METHOD_LABELS[voiding.method]} · ${voiding.location.name}`}
              open
              onOpenChange={(open) => {
                if (!open) setVoiding(null);
              }}
              onVoided={() => {
                setVoiding(null);
                notifySuccess(copy.voided);
                refresh();
              }}
            />
          ) : null}
          {requesting ? (
            <CommissionReceiptRequestDialog
              key={`receipt-${requesting.id}`}
              token={token}
              payment={requesting}
              professionalName={data.professional.name}
              email={data.professionalEmail}
              stamp={stamp}
              open
              onOpenChange={(open) => {
                if (!open) {
                  setRequesting(null);
                  refresh();
                }
              }}
              onCreated={setReceiptLink}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
