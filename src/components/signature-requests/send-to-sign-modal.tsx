'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createSignatureRequest,
  getSignatureRequestOptions,
  type SignatureRequestCreated,
  type SignatureRequestOptions,
} from '@/lib/signature-requests/signature-requests-api';
import { PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';
import { actorRoleLabel } from '@/lib/audit/audit-labels';
import { formatCivilDate } from '@/lib/format/date';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import type { SedeClock } from '@/lib/locations/sede-clock';
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
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Enviar a firmar',
  description: (selfSigns: boolean) =>
    `Quien firma (el paciente o su responsable) recibe un enlace por email, lo abre con un código de 6 dígitos, lee el documento y firma con el dedo. ${
      selfSigns ? 'Después lo firmas tú en la app.' : 'Después lo firma en la app el profesional que elijas.'
    }`,
  optionsError: 'No pudimos preparar el envío.',
  templateLabel: 'Consentimiento',
  templatePlaceholder: 'Elige una plantilla',
  templateRequired: 'Elige el consentimiento que quieres enviar.',
  noTemplates: 'No hay plantillas activas. Un administrador puede crearlas en Ajustes › Consentimientos.',
  alreadyComplete: (when: string) =>
    `Este paciente ya firmó este consentimiento el ${when} y está completo. Puedes enviarlo de nuevo si hace falta.`,
  professionalLabel: 'Profesional que firmará',
  professionalHint: 'Es quien nombra el texto y quien firma después en la app.',
  professionalPlaceholder: 'Elige el profesional',
  professionalRequired: 'Elige el profesional que firmará después en la app.',
  professionalOption: (p: SignatureRequestOptions['professionals'][number]) =>
    `${p.fullName} · ${actorRoleLabel(p.role)}`,
  planLabel: 'Plan de tratamiento (opcional)',
  planNone: 'Sin plan asociado',
  planHint: 'Los procedimientos del plan aparecen en el apartado de tratamiento del documento.',
  noPlans: 'Este paciente no tiene planes de tratamiento.',
  noPlanWarning: 'Sin plan, el documento dirá «No especificado» en el tratamiento.',
  planOption: (plan: SignatureRequestOptions['plans'][number]) =>
    [plan.optionLabel, PLAN_STATUS_LABELS[plan.status], formatCivilDate(plan.createdAt)].filter(Boolean).join(' · '),
  recipientHeading: 'Destinatario',
  channel: 'Por correo electrónico',
  toPatient: (to: string, name: string) => `${to} · firma ${name} (paciente)`,
  toGuardian: (to: string, name: string) => `${to} · firma ${name}, su responsable (la persona es menor de edad)`,
  expiry: 'El enlace caduca a las 72 horas y sirve una sola vez.',
  cancel: 'Cancelar',
  send: 'Enviar enlace',
  sendMissing: 'Para enviar, elige el consentimiento y el profesional que firmará.',
  sendBlocked: (reason: string) => `No se puede enviar: ${reason}`,
  sendError: 'No pudimos enviar el enlace. Intenta de nuevo.',
};

interface SendToSignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Quien envía: si es el profesional elegido, la descripción le habla a él. */
  userId: string | null;
  /** Reloj de la sede de la pantalla (la fecha de «ya lo firmó»). */
  clock: SedeClock | null;
  /** Recibe la solicitud recién creada (el modal ya se cerró). */
  onSent: (created: SignatureRequestCreated) => void;
}

/**
 * «Enviar a firmar» (DX-243): plantilla, profesional que firmará, plan
 * opcional y a quién va (el paciente o, si es menor, su responsable; el email
 * enmascarado). Todo sale de `…/options`, también para recepción (planes
 * incluidos). Lo que se envía es exactamente el texto de la vista previa en
 * pantalla, resuelto y congelado por la API. Avisa, sin bloquear, si la
 * plantilla ya está completa para el paciente o si sin plan el tratamiento
 * dirá «No especificado». Si el paciente no puede recibirlo (sin email, menor
 * sin responsable, baja de envíos) el modal dice por qué y no deja enviar; si
 * falta un campo, lo dice junto a él. El padre lo monta con una `key` nueva en
 * cada apertura.
 */
export function SendToSignModal({ open, onOpenChange, token, patientId, userId, clock, onSent }: SendToSignModalProps) {
  const ids = useId();
  const templateRef = useRef<HTMLSelectElement>(null);
  const professionalRef = useRef<HTMLSelectElement>(null);
  const [options, setOptions] = useState<SignatureRequestOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsKey, setOptionsKey] = useState(0);
  const [templateId, setTemplateId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [planId, setPlanId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    template?: string;
    professional?: string;
  }>({});
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

  const recipient = options?.recipient;
  const blocked = !!options && !recipient?.allowed;
  const template = options?.templates.find((t) => t.id === templateId) ?? null;
  const selfSigns = !!userId && professionalId === userId;
  const sendHintId = `${ids}-send-hint`;
  const sendHint = blocked
    ? copy.sendBlocked(recipient?.reason ?? '')
    : !templateId || !professionalId
      ? copy.sendMissing
      : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!options || blocked) return;
    const next: typeof fieldErrors = {};
    if (!templateId) next.template = copy.templateRequired;
    if (!professionalId) next.professional = copy.professionalRequired;
    setFieldErrors(next);
    if (next.template || next.professional) {
      (next.template ? templateRef : professionalRef).current?.focus();
      return;
    }
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
          <DialogDescription>{copy.description(selfSigns)}</DialogDescription>
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
          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex min-w-0 flex-col gap-4">
            {error ? <InlineError variant="summary">{error}</InlineError> : null}

            <FormField htmlFor="sign-template" label={copy.templateLabel} error={fieldErrors.template}>
              {options.templates.length === 0 ? (
                <p role="status" className="text-sm text-muted">
                  {copy.noTemplates}
                </p>
              ) : (
                <select
                  ref={templateRef}
                  id="sign-template"
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    setFieldErrors((x) => ({ ...x, template: undefined }));
                  }}
                  aria-invalid={fieldErrors.template ? true : undefined}
                  aria-describedby={fieldErrors.template ? fieldErrorId('sign-template') : undefined}
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
            {template?.lastCompletedAt ? (
              <p role="status" className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                {copy.alreadyComplete(
                  clock
                    ? clock.fmt.longDate(new Date(template.lastCompletedAt), clock.timeZone, { weekday: false })
                    : NO_SEDE_FORMAT,
                )}
              </p>
            ) : null}

            <FormField
              htmlFor="sign-professional"
              label={copy.professionalLabel}
              hint={copy.professionalHint}
              error={fieldErrors.professional}
            >
              <select
                ref={professionalRef}
                id="sign-professional"
                value={professionalId}
                onChange={(e) => {
                  setProfessionalId(e.target.value);
                  setFieldErrors((x) => ({ ...x, professional: undefined }));
                }}
                aria-invalid={fieldErrors.professional ? true : undefined}
                aria-describedby={fieldErrors.professional ? fieldErrorId('sign-professional') : undefined}
                className={cn(fieldClass, 'h-10')}
                required
              >
                <option value="" disabled>
                  {copy.professionalPlaceholder}
                </option>
                {options.professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {copy.professionalOption(p)}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              htmlFor="sign-plan"
              label={copy.planLabel}
              hint={options.plans.length === 0 ? copy.noPlans : copy.planHint}
            >
              <select
                id="sign-plan"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className={cn(fieldClass, 'h-10')}
              >
                <option value="">{copy.planNone}</option>
                {options.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {copy.planOption(p)}
                  </option>
                ))}
              </select>
            </FormField>
            {template?.usesTreatment && !planId ? (
              <p role="status" className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                {copy.noPlanWarning}
              </p>
            ) : null}

            <section
              aria-label={copy.recipientHeading}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
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

            {sendHint ? (
              <p id={sendHintId} className="text-xs text-muted sm:text-right">
                {sendHint}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={submitting}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                loading={submitting}
                disabled={blocked}
                aria-describedby={sendHint ? sendHintId : undefined}
              >
                {copy.send}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
