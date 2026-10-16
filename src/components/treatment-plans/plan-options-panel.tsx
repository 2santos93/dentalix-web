'use client';
import * as React from 'react';
import { useState } from 'react';
import { CopyPlus, Presentation, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import type { ClinicRole } from '@/lib/me/me-api';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { presentPlan } from '@/lib/treatment-plans/plan-options-api';
import {
  canCreateAlternative,
  canPresentPlan,
  canRejectThisPlan,
  nextOptionLabel,
  REJECTION_REASON_LABELS,
} from '@/lib/treatment-plans/plan-options';
import { formatDate } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';
import { RejectPlanModal } from './reject-plan-modal';
import { CreateAlternativeModal } from './create-alternative-modal';
import { PlanOptionsComparison } from './plan-options-comparison';

const copy = {
  present: 'Presentar al paciente',
  presenting: 'Presentando…',
  reject: 'Marcar rechazado',
  createAlternative: 'Crear alternativa',
  presentedOn: (date: string) => `Presentado al paciente el ${date}`,
  rejectedOn: (date: string, reason: string) => `Rechazado el ${date} · ${reason}`,
  presentError: 'No pudimos presentar el plan. Intenta de nuevo.',
  rejectSubject: (label: string | null) => label ?? 'Este plan',
};

interface PlanOptionsPanelProps {
  token: string;
  /** El detalle del plan abierto (con `items`). */
  plan: TreatmentPlan;
  /** Las opciones de su grupo (él incluido), de `listPlans`; [] si es suelto. */
  group: TreatmentPlan[];
  role: ClinicRole | null;
  /** Tras presentar, rechazar o crear una alternativa: el padre recarga. */
  onChanged: () => Promise<void>;
  onSelectPlan: (planId: string) => void;
}

/**
 * El plan como OPCIÓN que se le presenta al paciente (DX-040): presentar,
 * marcar rechazado (con motivo), crear otra alternativa y comparar las
 * opciones del grupo lado a lado. Lo que el rol no puede hacer no se pinta; la
 * API vuelve a comprobarlo.
 */
export function PlanOptionsPanel({
  token,
  plan,
  group,
  role,
  onChanged,
  onSelectPlan,
}: PlanOptionsPanelProps) {
  const [presenting, setPresenting] = useState(false);
  const [presentError, setPresentError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [creating, setCreating] = useState(false);

  const mayPresent = canPresentPlan(plan, role);
  const mayReject = canRejectThisPlan(plan, role);
  // Recepción no ve este tab; para el resto de roles clínicos, crear una
  // alternativa es preparar el plan (la API: CLINICAL_ROLES).
  const mayBranch = role !== null && role !== 'RECEPTION' && canCreateAlternative(plan, group);

  async function handlePresent() {
    setPresenting(true);
    setPresentError(null);
    try {
      await presentPlan(token, plan.id);
      await onChanged();
    } catch (err) {
      setPresentError(err instanceof ApiError ? err.message : copy.presentError);
    } finally {
      setPresenting(false);
    }
  }

  const reason = plan.rejectionReason ? REJECTION_REASON_LABELS[plan.rejectionReason] : null;

  return (
    <div className="flex flex-col gap-4">
      {plan.status === 'PRESENTED' && plan.presentedAt ? (
        <p className="text-sm text-muted tabular-nums">{copy.presentedOn(formatDate(plan.presentedAt))}</p>
      ) : null}
      {plan.status === 'REJECTED' && plan.rejectedAt && reason ? (
        <div className="text-sm">
          <p className="font-medium text-ink tabular-nums">
            {copy.rejectedOn(formatDate(plan.rejectedAt), reason)}
          </p>
          {plan.rejectionNote ? <p className="text-muted">{plan.rejectionNote}</p> : null}
        </div>
      ) : null}

      {mayPresent || mayReject || mayBranch ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {mayPresent ? (
            <Button type="button" variant="outline" onClick={handlePresent} loading={presenting}>
              <Presentation aria-hidden />
              {presenting ? copy.presenting : copy.present}
            </Button>
          ) : null}
          {mayReject ? (
            <Button type="button" variant="outline" onClick={() => setRejecting(true)}>
              <XCircle aria-hidden />
              {copy.reject}
            </Button>
          ) : null}
          {mayBranch ? (
            <Button type="button" variant="outline" onClick={() => setCreating(true)}>
              <CopyPlus aria-hidden />
              {copy.createAlternative}
            </Button>
          ) : null}
        </div>
      ) : null}
      {presentError ? <InlineError>{presentError}</InlineError> : null}

      {group.length >= 2 ? (
        <PlanOptionsComparison
          token={token}
          options={group}
          currentPlanId={plan.id}
          onSelect={onSelectPlan}
        />
      ) : null}

      {mayReject ? (
        <RejectPlanModal
          key={`reject-${plan.id}-${rejecting}`}
          open={rejecting}
          onOpenChange={setRejecting}
          token={token}
          planId={plan.id}
          subject={copy.rejectSubject(plan.optionLabel)}
          onRejected={() => {
            setRejecting(false);
            void onChanged();
          }}
        />
      ) : null}
      {mayBranch ? (
        <CreateAlternativeModal
          key={`alternative-${plan.id}-${creating}`}
          open={creating}
          onOpenChange={setCreating}
          token={token}
          planId={plan.id}
          suggestedLabel={nextOptionLabel(group.length)}
          onCreated={(created) => {
            setCreating(false);
            void onChanged().then(() => onSelectPlan(created.id));
          }}
        />
      ) : null}
    </div>
  );
}
