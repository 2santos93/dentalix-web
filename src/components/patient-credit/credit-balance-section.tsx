'use client';
import { useState } from 'react';
import { ArrowRightLeft, Undo2 } from 'lucide-react';
import type { AccountStatement } from '@/lib/account-statement/account-statement-api';
import type { CreditRefund } from '@/lib/patient-credit/patient-credit-api';
import { formatCurrency } from '@/lib/format/currency';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  creditSources,
  referencePayments,
  transferTargets,
  type CreditSource,
} from './credit-balance';
import { CreditTransferModal } from './credit-transfer-modal';
import { CreditRefundModal } from './credit-refund-modal';

const copy = {
  heading: 'Saldo a favor',
  hint: 'Lo abonado de más o a un plan cancelado o rechazado. Se aplica a otro plan del paciente o se devuelve con comprobante.',
  inFavor: 'a favor',
  transfer: 'Aplicar a otro plan',
  refund: 'Devolver',
  actionSuffix: (plan: string) => ` · ${plan}`,
};

interface CreditBalanceSectionProps {
  token: string;
  statement: AccountStatement;
  planName: (planId: string) => string;
  /** ADMIN y recepción (con tope): las acciones; el resto solo ve la cifra. */
  canAct: boolean;
  /** Tras un traspaso (aviso) o una devolución (su comprobante). */
  onTransferred: (notice: string) => void;
  onRefunded: (refund: CreditRefund) => void;
}

/**
 * Zona «Saldo a favor» del estado de cuenta (DX-253): una fila por plan con
 * saldo negativo, con «Aplicar a otro plan» y «Devolver». Nada si no hay.
 */
export function CreditBalanceSection({
  token,
  statement,
  planName,
  canAct,
  onTransferred,
  onRefunded,
}: CreditBalanceSectionProps) {
  const sources = creditSources(statement);
  const [action, setAction] = useState<{ kind: 'transfer' | 'refund'; source: CreditSource } | null>(null);
  if (sources.length === 0) return null;

  return (
    <section aria-labelledby="credit-balance-heading" className="flex flex-col gap-3" data-testid="credit-balance">
      <div>
        <h3 id="credit-balance-heading" className="text-base font-semibold text-ink">
          {copy.heading}
        </h3>
        <p className="mt-1 max-w-prose text-sm text-muted">{copy.hint}</p>
      </div>
      <Card className="divide-y divide-hairline p-0 shadow-none">
        {sources.map((source) => {
          const name = planName(source.planId);
          return (
            <div
              key={source.planId}
              data-testid="credit-row"
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="min-w-0">
                <p className="break-words font-medium text-ink">{name}</p>
                <p className="text-sm tabular-nums text-success-text">
                  {formatCurrency(source.credit, source.currency)} {copy.inFavor}
                </p>
              </div>
              {canAct ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => setAction({ kind: 'transfer', source })}
                  >
                    <ArrowRightLeft aria-hidden />
                    {copy.transfer}
                    <span className="sr-only">{copy.actionSuffix(name)}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setAction({ kind: 'refund', source })}
                  >
                    <Undo2 aria-hidden />
                    {copy.refund}
                    <span className="sr-only">{copy.actionSuffix(name)}</span>
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </Card>

      {action?.kind === 'transfer' ? (
        <CreditTransferModal
          open
          onOpenChange={(open) => !open && setAction(null)}
          token={token}
          source={action.source}
          targets={transferTargets(statement, action.source)}
          planName={planName}
          onDone={(notice) => {
            setAction(null);
            onTransferred(notice);
          }}
        />
      ) : null}
      {action?.kind === 'refund' ? (
        <CreditRefundModal
          open
          onOpenChange={(open) => !open && setAction(null)}
          token={token}
          source={action.source}
          payments={referencePayments(statement, action.source.planId)}
          planName={planName}
          onDone={(refund) => {
            setAction(null);
            onRefunded(refund);
          }}
        />
      ) : null}
    </section>
  );
}
