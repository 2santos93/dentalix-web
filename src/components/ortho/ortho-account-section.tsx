'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { acceptOrthoFee, getOrthoAccount, type OrthoCaseAccount } from '@/lib/ortho/ortho-billing';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SectionError } from '@/components/errors/section-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Skeleton } from '@/components/ui/skeleton';

// El formulario del honorario llega en su propio trozo, al abrirlo.
const OrthoFeeDialog = dynamic(() => import('./ortho-fee-dialog').then((m) => m.OrthoFeeDialog), { ssr: false });

export const orthoAccountCopy = {
  heading: 'Cuenta del caso',
  loading: 'Cargando la cuenta del caso',
  loadError: 'No pudimos cargar la cuenta del caso.',
  noFee: 'Este caso todavía no tiene honorario.',
  noFeeHint: 'Pon el total y su reparto: inicial, importe por control y retiro.',
  noFeeReadOnly: 'El honorario lo ponen odontología y administración.',
  setFee: 'Poner honorario',
  editFee: 'Editar honorario',
  acceptFee: 'Aceptar honorario',
  pending: 'Honorario sin aceptar: todavía no hay nada que cobrar.',
  pendingHint: 'Al aceptarlo, la inicial, cada control y el retiro pasan al plan de tratamiento para cobrarlos.',
  total: 'Honorario',
  split: 'Reparto',
  splitValue: (initial: string, visits: number, perVisit: string, retention: string) =>
    `Inicial ${initial} · ${visits} controles de ${perVisit} · retiro ${retention}`,
  billed: 'Realizado',
  billedHint: (charged: number, count: number) => `${charged} de ${count} controles cobrados`,
  paid: 'Pagado',
  balance: 'Saldo',
  ahead: (amount: string) => `${amount} pagado por adelantado`,
  remaining: 'Por realizar',
  overdue: (amount: string, days: number) => `Saldo vencido · ${amount} · desde hace ${days} días`,
  upToDate: 'Al día',
  threshold: (days: number) => `Vence lo realizado y sin pagar de más de ${days} días.`,
  removed: (n: number) =>
    n === 1
      ? 'Un cargo del caso se retiró del plan y no cuenta en esta cuenta.'
      : `${n} cargos del caso se retiraron del plan y no cuentan en esta cuenta.`,
  paymentPlan: 'Se cobra con cuotas',
  paymentPlanText: (count: number, amount: string) =>
    `El plan ya tenía un plan de cuotas (${count} cuotas, ${amount}): no se crearon cargos por control. El saldo vencido lo marcan las cuotas.`,
  openPlan: 'Ver el plan de tratamiento',
  confirmTitle: 'Aceptar el honorario',
  confirmBody:
    'Se crean en el plan de tratamiento ligado (o en uno nuevo «Ortodoncia») la cuota inicial, ya realizada, un ítem por control y el retiro. Después el honorario ya no se edita.',
  confirm: 'Aceptar honorario',
  confirming: 'Aceptando…',
  acceptError: 'No pudimos aceptar el honorario. Intenta de nuevo.',
};
const copy = orthoAccountCopy;

function planHref(patientId: string): string {
  return `/patients/${encodeURIComponent(patientId)}?tab=treatment-plans`;
}

/**
 * Las cifras de la cuenta (DX-285), de solo lectura: la usan la pestaña del
 * caso y la vista de recepción. El dinero, con el formato y la moneda de la
 * sede del caso.
 */
export function OrthoAccountFigures({ account, stamp }: { account: OrthoCaseAccount; stamp: SedePainters }) {
  const currency = account.currency ?? account.fee?.currency ?? null;
  const money = (amount: number | null | undefined) =>
    currency && amount !== null && amount !== undefined ? stamp.money(amount, currency, account.locationId) : '—';
  const fee = account.fee;
  if (!fee) return null;
  return (
    <div className="flex flex-col gap-3">
      {account.billing === 'PLAN_ITEMS' ? (
        <div className="flex flex-wrap items-center gap-2">
          {account.hasOverdue ? (
            <Badge variant="danger" data-testid="ortho-account-overdue" className="tabular-nums">
              <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {copy.overdue(money(account.overdue), account.overdueAgeDays)}
              </span>
            </Badge>
          ) : (
            <Badge variant="success">
              <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
              {copy.upToDate}
            </Badge>
          )}
        </div>
      ) : null}
      <DescriptionList columns={3}>
        <DescriptionItem label={copy.total} numeric>
          {money(fee.total)}
        </DescriptionItem>
        {account.billing === 'PLAN_ITEMS' ? (
          <>
            <DescriptionItem label={copy.billed} numeric>
              <span className="flex flex-col">
                <span>{money(account.billed)}</span>
                <span className="t-caption text-muted">{copy.billedHint(account.visitsCharged, fee.visitCount)}</span>
              </span>
            </DescriptionItem>
            <DescriptionItem label={copy.paid} numeric>
              {money(account.paid)}
            </DescriptionItem>
            <DescriptionItem label={copy.balance} numeric>
              {account.balance !== null && account.balance < 0
                ? copy.ahead(money(-account.balance))
                : money(account.balance)}
            </DescriptionItem>
            <DescriptionItem label={copy.remaining} numeric>
              {money(account.remaining)}
            </DescriptionItem>
          </>
        ) : null}
        <DescriptionItem label={copy.split} wide>
          <span className="t-data [overflow-wrap:anywhere]">
            {copy.splitValue(money(fee.initial), fee.visitCount, money(fee.perVisit), money(fee.retention))}
          </span>
        </DescriptionItem>
      </DescriptionList>
      {account.billing === 'PLAN_ITEMS' ? (
        <p className="t-caption text-muted">{copy.threshold(account.overdueDays)}</p>
      ) : null}
      {account.removedCharges > 0 ? (
        <p className="text-sm text-warning-text">{copy.removed(account.removedCharges)}</p>
      ) : null}
      {account.billing === 'PAYMENT_PLAN' && account.paymentPlan ? (
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <p className="t-label text-ink">{copy.paymentPlan}</p>
          <p className="text-muted">
            {copy.paymentPlanText(
              account.paymentPlan.installmentsCount,
              stamp.money(account.paymentPlan.totalToFinance, account.paymentPlan.currency, account.locationId),
            )}
          </p>
        </div>
      ) : null}
      {account.billing === 'PENDING' ? <p className="text-sm text-muted">{copy.pending}</p> : null}
    </div>
  );
}

/**
 * Bloque «Cuenta del caso» de la pestaña Ortodoncia (DX-285): honorario,
 * realizado, pagado, saldo y saldo vencido. Poner, editar y aceptar el
 * honorario, solo odontología y ADMIN (la API lo vuelve a comprobar).
 */
export function OrthoAccountSection({
  token,
  patientId,
  caseId,
  plannedVisits,
  canWrite,
  closed,
  stamp,
  reloadKey = 0,
}: {
  token: string;
  patientId: string;
  caseId: string;
  plannedVisits: number;
  canWrite: boolean;
  /** Caso finalizado o abandonado: el honorario ya no se toca. */
  closed: boolean;
  stamp: SedePainters;
  /** Cambia cuando la pestaña registra un control o cambia el estado. */
  reloadKey?: number;
}) {
  const [account, setAccount] = useState<OrthoCaseAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localKey, setLocalKey] = useState(0);
  const [dialog, setDialog] = useState<'fee' | 'accept' | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrthoAccount(token, patientId, caseId)
      .then((data) => {
        if (cancelled) return;
        setAccount(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, caseId, reloadKey, localKey]);

  async function accept() {
    setAccepting(true);
    setAcceptError(null);
    try {
      setAccount(await acceptOrthoFee(token, patientId, caseId));
      setDialog(null);
    } catch (err) {
      setAcceptError(apiErrorMessage(err, copy.acceptError));
    } finally {
      setAccepting(false);
    }
  }

  const editable = canWrite && !closed && account !== null && account.billing !== 'PLAN_ITEMS' && account.billing !== 'PAYMENT_PLAN';
  const currency = account?.currency ?? null;

  return (
    <section aria-labelledby="ortho-account" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="ortho-account" className="t-title flex items-center gap-2 text-ink">
          <Wallet aria-hidden className="size-4 text-muted" />
          {copy.heading}
        </h4>
        {editable ? (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {currency ? (
              <Button type="button" variant="secondary" onClick={() => setDialog('fee')} className="flex-1 sm:flex-none">
                {account?.fee ? copy.editFee : copy.setFee}
              </Button>
            ) : null}
            {account?.billing === 'PENDING' ? (
              <Button type="button" onClick={() => setDialog('accept')} className="flex-1 sm:flex-none">
                {copy.acceptFee}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <SectionError title={copy.loadError} description={error} onRetry={() => setLocalKey((k) => k + 1)} />
      ) : account === null ? (
        <div role="status" aria-label={copy.loading}>
          <Skeleton className="h-20 w-full" />
        </div>
      ) : account.fee === null ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-ink">{copy.noFee}</p>
          <p className="text-muted">{canWrite ? copy.noFeeHint : copy.noFeeReadOnly}</p>
        </div>
      ) : (
        <>
          <OrthoAccountFigures account={account} stamp={stamp} />
          {account.billing === 'PENDING' && canWrite ? <p className="t-caption text-muted">{copy.pendingHint}</p> : null}
          {canWrite && account.treatmentPlanId && account.billing !== 'PENDING' ? (
            <Link href={planHref(patientId)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              {copy.openPlan}
            </Link>
          ) : null}
        </>
      )}

      {dialog === 'fee' && account && currency ? (
        <OrthoFeeDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          token={token}
          patientId={patientId}
          caseId={caseId}
          fee={account.fee}
          plannedVisits={plannedVisits}
          currency={currency}
          money={(amount, code) => stamp.money(amount, code, account.locationId)}
          onSaved={setAccount}
        />
      ) : null}
      <ConfirmDialog
        open={dialog === 'accept'}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setAcceptError(null);
          }
        }}
        title={copy.confirmTitle}
        description={copy.confirmBody}
        confirmLabel={copy.confirm}
        confirmingLabel={copy.confirming}
        confirming={accepting}
        destructive={false}
        error={acceptError}
        onConfirm={() => void accept()}
      />
    </section>
  );
}
