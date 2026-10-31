'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createSignatureRequest,
  getSignatureRequestOptions,
  type SignatureRequestCreated,
  type SignatureRequestOptions,
} from '@/lib/signature-requests/signature-requests-api';
import { listPlans, type TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';
import { formatCivilDate } from '@/lib/format/date';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Enviar a firmar',
  description:
    'El paciente recibe un enlace por email; lo abre con un código de 6 dígitos, lee el documento y firma con el dedo. Después lo firmas tú en la app.',
  optionsError: 'No pudimos preparar el envío.',
  templateLabel: 'Consentimiento',
  templatePlaceholder: 'Elige una plantilla',
  noTemplates:
    'No hay plantillas activas. Un administrador puede crearlas en Ajustes › Consentimientos.',
  professionalLabel: 'Profesional que firmará',
  professionalHint: 'Es quien nombra el texto y quien firma después en la app.',
  professionalPlaceholder: 'Elige el profesional',
  planLabel: 'Plan de tratamiento (opcional)',
  planNone: 'Sin plan asociado',
  planHint: 'Rellena {{tratamiento}} con los procedimientos del plan.',
  plansError: 'Planes no disponibles',
  planOption: (plan: TreatmentPlan) =>
    `${PLAN_STATUS_LABELS[plan.status]} · ${formatCivilDate(plan.createdAt)}`,
  recipientHeading: 'Destinatario',
  channel: 'Por correo electrónico',
  toPatient: (to: string, name: string) => `${to} · firma ${name} (paciente)`,
  toGuardian: (to: string, name: string) =>
    `${to} · firma ${name}, su responsable (el paciente es menor de edad)`,
  expiry: 'El enlace caduca a las 72 horas y sirve una sola vez.',
  cancel: 'Cancelar',
  send: 'Enviar enlace',
  sendError: 'No pudimos enviar el enlace. Intenta de nuevo.',
};

interface SendToSignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Roles clínicos: pueden asociar un plan (recepción no lee los planes). */
  canPickPlan: boolean;
  /** Recibe la solicitud recién creada (el modal ya se cerró). */
  onSent: (created: SignatureRequestCreated) => void;
}

/**
 * «Enviar a firmar» (DX-243): plantilla, profesional que firmará, plan
 * opcional y a quién va (el paciente o, si es menor, su responsable; el email
 * enmascarado). Lo que se envía es exactamente el texto de la vista previa en
 * pantalla, resuelto y congelado por la API. Si el paciente no puede recibirlo
 * (sin email, menor sin responsable, baja de envíos) el modal dice por qué y
 * no deja enviar. El padre lo monta con una `key` nueva en cada apertura.
 */
export function SendToSignModal({
  open,
  onOpenChange,
  token,
  patientId,
  canPickPlan,
  onSent,
}: SendToSignModalProps) {
  const [options, setOptions] = useState<SignatureRequestOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsKey, setOptionsKey] = useState(0);
  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null);
  const [plansFailed, setPlansFailed] = useState(false);
  const [plansKey, setPlansKey] = useState(0);
  const [templateId, setTemplateId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [planId, setPlanId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSignatureRequestOptions(token, patientId)
      .then((data) => {
        if (cancelled) return;
        setOptions(data);
        setOptionsError(null);
        setProfessionalId((current) => current || data.defaultProfessionalId || '');
      })
      .catch((err: unknown) => {
        if (!cancelled) setOptionsError(apiErrorMessage(err, copy.optionsError));
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, optionsKey]);

  useEffect(() => {
    if (!open || !canPickPlan) return;
    let cancelled = false;
    listPlans(token, patientId)
      .then((data) => {
        if (cancelled) return;
        setPlans(data.filter((p) => p.status !== 'CANCELLED'));
        setPlansFailed(false);
      })
      .catch(() => {
        if (!cancelled) setPlansFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, canPickPlan, token, patientId, plansKey]);

  const recipient = options?.recipient;
  const canSend = !!options && !!recipient?.allowed && !!templateId && !!professionalId;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSend) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createSignatureRequest(token, patientId, {
        type: 'CONSENT',
        channel: 'EMAIL',
        templateId,
        professionalId,
        ...(planId ? { treatmentPlanId: planId } : {}),
      });
      onOpenChange(false);
      onSent(created);
    } catch (err) {
      setError(apiErrorMessage(err, copy.sendError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {optionsError ? (
          <SectionError
            description={optionsError}
            onRetry={() => {
              setOptionsError(null);
              setOptionsKey((k) => k + 1);
            }}
          />
        ) : !options ? (
          <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="flex min-w-0 flex-col gap-4">
            {error ? <InlineError variant="summary">{error}</InlineError> : null}

            <FormField htmlFor="sign-template" label={copy.templateLabel}>
              {options.templates.length === 0 ? (
                <p role="status" className="text-sm text-muted">
                  {copy.noTemplates}
                </p>
              ) : (
                <select
                  id="sign-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className={cn(fieldClass, 'h-10')}
                  required
                >
                  <option value="" disabled>
                    {copy.templatePlaceholder}
                  </option>
                  {options.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField htmlFor="sign-professional" label={copy.professionalLabel} hint={copy.professionalHint}>
              <select
                id="sign-professional"
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                className={cn(fieldClass, 'h-10')}
                required
              >
                <option value="" disabled>
                  {copy.professionalPlaceholder}
                </option>
                {options.professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </FormField>

            {canPickPlan ? (
              <FormField htmlFor="sign-plan" label={copy.planLabel} hint={copy.planHint}>
                {plansFailed ? (
                  <FieldError
                    label={copy.plansError}
                    onRetry={() => setPlansKey((k) => k + 1)}
                    className="h-10 w-full"
                  />
                ) : plans === null ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <select
                    id="sign-plan"
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className={cn(fieldClass, 'h-10')}
                  >
                    <option value="">{copy.planNone}</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {copy.planOption(p)}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            ) : null}

            <section aria-label={copy.recipientHeading} className="flex flex-col gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
              <p className="flex items-center gap-2 font-medium text-ink">
                <Mail aria-hidden className="size-4 text-muted" />
                {copy.channel}
              </p>
              {recipient?.allowed && recipient.destinationMasked && recipient.signerName ? (
                <>
                  <p className="break-words text-ink">
                    {recipient.signerType === 'GUARDIAN'
                      ? copy.toGuardian(recipient.destinationMasked, recipient.signerName)
                      : copy.toPatient(recipient.destinationMasked, recipient.signerName)}
                  </p>
                  <p className="text-xs text-muted">{copy.expiry}</p>
                </>
              ) : (
                <p role="alert" className="text-warning">
                  {recipient?.reason}
                </p>
              )}
            </section>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={submitting}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button type="submit" loading={submitting} disabled={!canSend}>
                {copy.send}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
