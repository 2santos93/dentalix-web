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
import { RELATIONSHIPS, RELATIONSHIP_LABELS, type ResponsibleRelationship } from '@/lib/patients/responsible-parties-api';
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
import { Callout } from '@/components/ui/callout';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';

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
  // DX-060: la API rellena el tratamiento con una frase neutra (nunca «No especificado»).
  noPlanWarning:
    'Sin plan, el documento dirá «el tratamiento indicado por el profesional en la consulta» en lugar de los procedimientos.',
  // DX-354b: el día de creación (un instante) en la zona y el formato de la sede de la pantalla; sin ella, «—».
  planOption: (plan: SignatureRequestOptions['plans'][number], clock: SedeClock | null) =>
    [
      plan.optionLabel,
      PLAN_STATUS_LABELS[plan.status],
      clock ? clock.fmt.date(new Date(plan.createdAt), clock.timeZone) : NO_SEDE_FORMAT,
    ]
      .filter(Boolean)
      .join(' · '),
  recipientHeading: 'Destinatario',
  channel: 'Por correo electrónico',
  toPatient: (to: string, name: string) => `${to} · firma ${name} (paciente)`,
  toGuardian: (to: string, name: string) => `${to} · firma ${name}, su responsable (la persona es menor de edad)`,
  expiry: 'El enlace caduca a las 72 horas y sirve una sola vez.',
  // DX-060-bis: con un tutor, el documento enviado abre con la misma cláusula que en la clínica.
  guardianHeading: 'Quién firma en nombre del paciente',
  guardianPrefilled: 'Precargado del responsable de la ficha: corrígelo si hace falta.',
  guardianName: 'Nombre del tutor',
  guardianDocument: 'Documento del tutor',
  guardianRelationship: 'Relación con el paciente',
  guardianRelationshipPlaceholder: 'Elige la relación',
  guardianClauseHint: 'El documento dirá quién firma en nombre del paciente y su relación con él.',
  guardianNameRequired: 'Escribe el nombre del tutor.',
  guardianDocumentRequired: 'Escribe el documento del tutor: el documento lo nombra.',
  guardianRelationshipRequired: 'Elige la relación del tutor con el paciente.',
  cancel: 'Cancelar',
  send: 'Enviar enlace',
  sendMissing: 'Para enviar, elige el consentimiento y el profesional que firmará.',
  sendMissingGuardian: 'Para enviar, completa el nombre, el documento y la relación del tutor.',
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
 * dirá una frase neutra en vez de los procedimientos (DX-060). Si firma el
 * responsable de un menor, pide su nombre, documento y relación (precargados
 * de la ficha): el texto enviado abre con la cláusula de representación, como
 * en la clínica (DX-060-bis). Si el paciente no puede recibirlo (sin email, menor
 * sin responsable, baja de envíos) el modal dice por qué y no deja enviar; si
 * falta un campo, lo dice junto a él. El padre lo monta con una `key` nueva en
 * cada apertura.
 */
export function SendToSignModal({ open, onOpenChange, token, patientId, userId, clock, onSent }: SendToSignModalProps) {
  const ids = useId();
  const templateRef = useRef<HTMLSelectElement>(null);
  const professionalRef = useRef<HTMLSelectElement>(null);
  const guardianNameRef = useRef<HTMLInputElement>(null);
  const guardianDocumentRef = useRef<HTMLInputElement>(null);
  const guardianRelationshipRef = useRef<HTMLSelectElement>(null);
  const [options, setOptions] = useState<SignatureRequestOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsKey, setOptionsKey] = useState(0);
  const [templateId, setTemplateId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [planId, setPlanId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianDocument, setGuardianDocument] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState<ResponsibleRelationship | ''>('');
  const [fieldErrors, setFieldErrors] = useState<{
    template?: string;
    professional?: string;
    guardianName?: string;
    guardianDocument?: string;
    guardianRelationship?: string;
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
        // DX-060-bis: el tutor, precargado del responsable que recibirá el enlace.
        if (data.recipient.signerType === 'GUARDIAN') {
          setGuardianName((v) => v || data.recipient.signerName || '');
          setGuardianDocument((v) => v || data.recipient.signerDocument || '');
          setGuardianRelationship((v) => v || data.recipient.signerRelationship || '');
        }
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
  const guardian = !!recipient?.allowed && recipient.signerType === 'GUARDIAN';
  const guardianMissing =
    guardian && (guardianName.trim() === '' || guardianDocument.trim() === '' || guardianRelationship === '');
  const sendHintId = `${ids}-send-hint`;
  const sendHint = blocked
    ? copy.sendBlocked(recipient?.reason ?? '')
    : !templateId || !professionalId
      ? copy.sendMissing
      : guardianMissing
        ? copy.sendMissingGuardian
        : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!options || blocked) return;
    const next: typeof fieldErrors = {};
    if (!templateId) next.template = copy.templateRequired;
    if (!professionalId) next.professional = copy.professionalRequired;
    if (guardian) {
      if (!guardianName.trim()) next.guardianName = copy.guardianNameRequired;
      if (!guardianDocument.trim()) next.guardianDocument = copy.guardianDocumentRequired;
      if (!guardianRelationship) next.guardianRelationship = copy.guardianRelationshipRequired;
    }
    setFieldErrors(next);
    const firstInvalid = next.template
      ? templateRef
      : next.professional
        ? professionalRef
        : next.guardianName
          ? guardianNameRef
          : next.guardianDocument
            ? guardianDocumentRef
            : next.guardianRelationship
              ? guardianRelationshipRef
              : null;
    if (firstInvalid) {
      firstInvalid.current?.focus();
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
        ...(guardian && guardianRelationship
          ? {
              guardianName: guardianName.trim(),
              guardianDocument: guardianDocument.trim(),
              guardianRelationship,
            }
          : {}),
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
                <NativeSelect
                  ref={templateRef}
                  id="sign-template"
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    setFieldErrors((x) => ({ ...x, template: undefined }));
                  }}
                  aria-invalid={fieldErrors.template ? true : undefined}
                  aria-describedby={fieldErrors.template ? fieldErrorId('sign-template') : undefined}
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
                </NativeSelect>
              )}
            </FormField>
            {template?.lastCompletedAt ? (
              <Callout tone="warning" role="status" className="py-2">
                {copy.alreadyComplete(
                  clock
                    ? clock.fmt.longDate(new Date(template.lastCompletedAt), clock.timeZone, { weekday: false })
                    : NO_SEDE_FORMAT,
                )}
              </Callout>
            ) : null}

            <FormField
              htmlFor="sign-professional"
              label={copy.professionalLabel}
              hint={copy.professionalHint}
              error={fieldErrors.professional}
            >
              <NativeSelect
                ref={professionalRef}
                id="sign-professional"
                value={professionalId}
                onChange={(e) => {
                  setProfessionalId(e.target.value);
                  setFieldErrors((x) => ({ ...x, professional: undefined }));
                }}
                aria-invalid={fieldErrors.professional ? true : undefined}
                aria-describedby={fieldErrors.professional ? fieldErrorId('sign-professional') : undefined}
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
              </NativeSelect>
            </FormField>

            <FormField
              htmlFor="sign-plan"
              label={copy.planLabel}
              hint={options.plans.length === 0 ? copy.noPlans : copy.planHint}
            >
              <NativeSelect
                id="sign-plan"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                <option value="">{copy.planNone}</option>
                {options.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {copy.planOption(p, clock)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {template?.usesTreatment && !planId ? (
              <Callout tone="warning" role="status" className="py-2">
                {copy.noPlanWarning}
              </Callout>
            ) : null}

            {/* B7: destino en una franja hundida; si no se puede enviar, el motivo es un aviso (Callout). */}
            <section aria-label={copy.recipientHeading} className="text-sm">
              {recipient?.allowed && recipient.destinationMasked && recipient.signerName ? (
                <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-sunken px-3 py-2">
                  <p className="flex items-center gap-2 font-medium text-ink">
                    <Mail aria-hidden className="size-4 text-muted" />
                    {copy.channel}
                  </p>
                  <p className="break-words text-ink">
                    {recipient.signerType === 'GUARDIAN'
                      ? copy.toGuardian(recipient.destinationMasked, recipient.signerName)
                      : copy.toPatient(recipient.destinationMasked, recipient.signerName)}
                  </p>
                  <p className="t-caption">{copy.expiry}</p>
                </div>
              ) : (
                <Callout tone="warning" role="alert" icon={Mail} title={copy.channel}>
                  {recipient?.reason}
                </Callout>
              )}
            </section>

            {guardian ? (
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-1 text-sm font-medium text-ink">{copy.guardianHeading}</legend>
                <p className="text-xs text-muted">{copy.guardianPrefilled}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField htmlFor="sign-guardian-name" label={copy.guardianName} error={fieldErrors.guardianName}>
                    <Input
                      ref={guardianNameRef}
                      id="sign-guardian-name"
                      value={guardianName}
                      onChange={(e) => {
                        setGuardianName(e.target.value);
                        setFieldErrors((x) => ({ ...x, guardianName: undefined }));
                      }}
                      aria-invalid={fieldErrors.guardianName ? true : undefined}
                      aria-describedby={fieldErrors.guardianName ? fieldErrorId('sign-guardian-name') : undefined}
                      maxLength={200}
                      autoComplete="off"
                      required
                    />
                  </FormField>
                  <FormField
                    htmlFor="sign-guardian-document"
                    label={copy.guardianDocument}
                    error={fieldErrors.guardianDocument}
                  >
                    <Input
                      ref={guardianDocumentRef}
                      id="sign-guardian-document"
                      value={guardianDocument}
                      onChange={(e) => {
                        setGuardianDocument(e.target.value);
                        setFieldErrors((x) => ({ ...x, guardianDocument: undefined }));
                      }}
                      aria-invalid={fieldErrors.guardianDocument ? true : undefined}
                      aria-describedby={
                        fieldErrors.guardianDocument ? fieldErrorId('sign-guardian-document') : undefined
                      }
                      maxLength={60}
                      autoComplete="off"
                      required
                    />
                  </FormField>
                  <FormField
                    htmlFor="sign-guardian-relationship"
                    label={copy.guardianRelationship}
                    hint={copy.guardianClauseHint}
                    error={fieldErrors.guardianRelationship}
                    className="sm:col-span-2"
                  >
                    <NativeSelect
                      ref={guardianRelationshipRef}
                      id="sign-guardian-relationship"
                      value={guardianRelationship}
                      onChange={(e) => {
                        setGuardianRelationship(e.target.value as ResponsibleRelationship);
                        setFieldErrors((x) => ({ ...x, guardianRelationship: undefined }));
                      }}
                      aria-invalid={fieldErrors.guardianRelationship ? true : undefined}
                      aria-describedby={
                        fieldErrors.guardianRelationship ? fieldErrorId('sign-guardian-relationship') : undefined
                      }
                      required
                    >
                      <option value="" disabled>
                        {copy.guardianRelationshipPlaceholder}
                      </option>
                      {RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {RELATIONSHIP_LABELS[r]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                </div>
              </fieldset>
            ) : null}

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
