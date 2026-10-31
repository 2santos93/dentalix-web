'use client';
import { useState } from 'react';
import { ArrowRightLeft, Undo2 } from 'lucide-react';
import type { AccountStatement } from '@/lib/account-statement/account-statement-api';
import type { CreditRefund } from '@/lib/patient-credit/patient-credit-api';
import { formatCurrency } from '@/lib/format/currency';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SectionHeader } from '@/components/ui/section-header';
import { afterMenuCloses } from '@/components/patients/after-menu-closes';
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
  colPlan: 'Plan',
  colCredit: 'Saldo a favor',
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

  const columns: DataListColumn<CreditSource>[] = [
    {
      id: 'plan',
      header: copy.colPlan,
      mobile: 'primary',
      cell: (source) => <span className="break-words font-medium text-ink">{planName(source.planId)}</span>,
    },
    {
      id: 'credit',
      header: copy.colCredit,
      numeric: true,
      mobile: 'trailing',
      cell: (source) => (
        <span data-testid="credit-row" className="t-data whitespace-nowrap text-ink">
          {formatCurrency(source.credit, source.currency)} <span className="text-muted">{copy.inFavor}</span>
        </span>
      ),
      // En el teléfono solo la cifra: «a favor» ya lo dice el título, y así el plan no se corta.
      mobileCell: (source) => (
        <span data-testid="credit-row" className="t-data whitespace-nowrap text-ink">
          {formatCurrency(source.credit, source.currency)}
        </span>
      ),
    },
  ];

  return (
    <section aria-labelledby="credit-balance-heading" className="flex flex-col gap-3" data-testid="credit-balance">
      <SectionHeader as="h3" titleId="credit-balance-heading" title={copy.heading} description={copy.hint} />
      {/* B7: una fila por plan con saldo; «Aplicar a otro plan» y «Devolver» en el «⋯». */}
      <DataList
        label={copy.heading}
        rows={sources}
        columns={columns}
        getRowKey={(source) => source.planId}
        getRowLabel={(source) => planName(source.planId)}
        rowActions={
          canAct
            ? (source) => [
                {
                  label: copy.transfer,
                  icon: <ArrowRightLeft aria-hidden />,
                  onSelect: () => afterMenuCloses(() => setAction({ kind: 'transfer', source })),
                },
                {
                  label: copy.refund,
                  icon: <Undo2 aria-hidden />,
                  onSelect: () => afterMenuCloses(() => setAction({ kind: 'refund', source })),
                },
              ]
            : undefined
        }
      />

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
