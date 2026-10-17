'use client';
import * as React from 'react';
import Link from 'next/link';
import type { AgingRow } from '@/lib/receivables/receivables-api';
import {
  AgeCell,
  BucketList,
  DebtCell,
  DebtorActions,
  LastPayment,
  NextInstallment,
  debtorCopy,
  statementHref,
} from './debtor-parts';

/**
 * Un deudor en el teléfono (bajo `sm`): nombre y antigüedad arriba, lo que debe
 * y sus tramos legibles en el medio, último abono y próxima cuota, y los
 * botones —«Llamar», «WhatsApp», «Estado de cuenta»— abajo, a 44px y a lo ancho
 * de la tarjeta: al alcance del pulgar y sin scroll lateral.
 */
export function DebtorCard({ row, clinicName }: { row: AgingRow; clinicName: string | null }) {
  const nameId = React.useId();
  return (
    <article
      aria-labelledby={nameId}
      data-testid="debtor-card"
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <header className="flex min-w-0 flex-col gap-1.5">
        <h3 id={nameId} className="min-w-0 break-words font-medium text-ink">
          <Link
            href={statementHref(row.patient.id)}
            className="underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {row.patient.fullName}
          </Link>
        </h3>
        <AgeCell row={row} />
      </header>

      {/* Total arriba y tramos debajo, a lo ancho: lado a lado, con importes
          de millones y «Más de 90 días», no caben en 390 px. */}
      <div className="flex min-w-0 flex-col gap-2 border-t border-hairline pt-3">
        <DebtCell currencies={row.currencies} />
        <BucketList currencies={row.currencies} className="min-w-0" />
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-hairline pt-3 text-sm">
        <div className="min-w-0">
          <dt className="t-label text-muted">{debtorCopy.lastPayment}</dt>
          <dd>
            <LastPayment row={row} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="t-label text-muted">{debtorCopy.nextInstallment}</dt>
          <dd>
            <NextInstallment row={row} />
          </dd>
        </div>
      </dl>

      <DebtorActions row={row} clinicName={clinicName} stretch />
    </article>
  );
}
