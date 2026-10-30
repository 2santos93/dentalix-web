'use client';
import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { CircleCheck, PenLine, Printer } from 'lucide-react';
import type { ClinicRole } from '@/lib/me/me-api';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import {
  canAcceptPlan,
  canPrintPlanQuote,
  isPlanAcceptable,
  planQuotePrintHref,
  SIGNABLE_PLAN_STATUSES,
  type PlanQuote,
} from '@/lib/treatment-plans/plan-quote-api';
import { formatDateTime } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { AcceptPlanModal } from './accept-plan-modal';

const copy = {
  print: 'Imprimir presupuesto',
  newTab: '(se abre en otra pestaña)',
  accept: 'Aceptar con firma',
  acceptedBy: (name: string, when: string) => `Aceptado y firmado por ${name} el ${when}`,
  locked: 'Sus procedimientos y precios ya no se pueden cambiar.',
  needsItems: 'Agrega procedimientos para poder aceptarlo con firma.',
};

interface PlanQuoteActionsProps {
  token: string;
  patientId: string;
  /** El detalle del plan (con `items` y `acceptance`). */
  plan: TreatmentPlan;
  role: ClinicRole | null;
  /** Tras firmar: el padre recarga el plan (estado, ítems congelados, saldo). */
  onAccepted: (quote: PlanQuote) => void;
}

/**
 * El presupuesto del plan (DX-012): «Imprimir presupuesto» abre la vista A4 en
 * otra pestaña; «Aceptar con firma» abre el modal con el lienzo. Un plan ya
 * firmado lo dice («Aceptado y firmado por … el …») y no se vuelve a firmar.
 */
export function PlanQuoteActions({ token, patientId, plan, role, onAccepted }: PlanQuoteActionsProps) {
  const [accepting, setAccepting] = useState(false);
  const acceptance = plan.acceptance ?? null;
  const mayAccept = canAcceptPlan(role);
  const acceptable = mayAccept && isPlanAcceptable(plan);
  const needsItems =
    mayAccept &&
    !acceptance &&
    SIGNABLE_PLAN_STATUSES.includes(plan.status) &&
    (plan.items?.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-3">
      {acceptance ? (
        <div role="status" className="flex items-start gap-2 text-sm">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success-text" />
          <p>
            <span className="font-medium text-ink tabular-nums">
              {copy.acceptedBy(acceptance.signerName, formatDateTime(acceptance.acceptedAt))}
            </span>
            <span className="block text-muted">{copy.locked}</span>
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {canPrintPlanQuote(role) ? (
          <Button asChild variant="outline">
            <Link href={planQuotePrintHref(patientId, plan.id)} target="_blank" rel="noopener">
              <Printer aria-hidden />
              {copy.print}
              <span className="sr-only">{copy.newTab}</span>
            </Link>
          </Button>
        ) : null}
        {acceptable ? (
          <Button type="button" onClick={() => setAccepting(true)}>
            <PenLine aria-hidden />
            {copy.accept}
          </Button>
        ) : null}
        {needsItems ? <p className="text-sm text-muted">{copy.needsItems}</p> : null}
      </div>

      {acceptable ? (
        <AcceptPlanModal
          open={accepting}
          onOpenChange={setAccepting}
          token={token}
          patientId={patientId}
          planId={plan.id}
          onAccepted={onAccepted}
        />
      ) : null}
    </div>
  );
}
