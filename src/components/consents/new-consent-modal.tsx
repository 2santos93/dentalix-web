'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listConsentTemplates,
  previewPatientConsent,
  signPatientConsent,
  type ConsentPreview,
  type ConsentSignerType,
  type ConsentTemplate,
  type PatientConsent,
} from '@/lib/consents/consents-api';
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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/shared/form-field';
import { SignaturePad } from '@/components/shared/signature-pad';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Nuevo consentimiento',
  steps: ['Plantilla', 'Vista previa', 'Firmas'] as const,
  stepOf: (n: number, total: number) => `Paso ${n} de ${total}`,
  stepsLabel: 'Pasos',
  chooseDescription: 'Elige la plantilla y, si aplica, el plan de tratamiento.',
  previewDescription: 'Lee el documento con el paciente antes de firmar.',
  signDescription: 'El paciente (o su tutor) y el profesional firman en la pantalla.',
  templateLabel: 'Plantilla',
  templatePlaceholder: 'Elige una plantilla',
  templatesError: 'Plantillas no disponibles',
  noTemplates:
    'No hay plantillas activas. Un administrador puede crearlas en Ajustes › Consentimientos.',
  planLabel: 'Plan de tratamiento (opcional)',
  planNone: 'Sin plan asociado',
  planHint: 'Rellena {{tratamiento}} con los procedimientos del plan.',
  plansError: 'Planes no disponibles',
  planOption: (plan: TreatmentPlan) =>
    `${PLAN_STATUS_LABELS[plan.status]} · ${formatCivilDate(plan.createdAt)}`,
  previewRegion: 'Texto del consentimiento',
  previewError: 'No pudimos preparar la vista previa.',
  signerLegend: '¿Quién firma?',
  signerPatient: 'El paciente',
  signerGuardian: 'Un tutor o representante',
  guardianName: 'Nombre del tutor',
  guardianDocument: 'Documento del tutor',
  patientSignature: 'Firma del paciente',
  guardianSignature: 'Firma del tutor',
  professionalSignature: (name: string) => `Firma del profesional · ${name}`,
  signatureHint: 'Firma con el dedo, el lápiz o el ratón.',
  immutableNote: 'Al firmar, el documento queda guardado tal cual y no se puede editar ni borrar.',
  cancel: 'Cancelar',
  back: 'Atrás',
  next: 'Continuar',
  sign: 'Firmar',
  genericSignError: 'No pudimos guardar el consentimiento. Intenta de nuevo.',
};

type Step = 0 | 1 | 2;

interface NewConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Recibe el consentimiento recién firmado (el modal ya se cerró). */
  onSigned: (consent: PatientConsent) => void;
}

/**
 * «Nuevo consentimiento» (DX-006) en tres pasos dentro del modal: plantilla
 * (+ plan opcional) → vista previa con las variables ya resueltas por la API →
 * firmas. Desde la ficha son cuatro acciones: abrir, continuar, continuar,
 * firmar. «Firmar» queda deshabilitado mientras falte una firma (o los datos
 * del tutor); la API vuelve a exigirlo (400).
 *
 * Lo que se firma es exactamente lo que se previsualizó: la firma manda la
 * versión de la plantilla de la vista previa y, si alguien la editó entretanto,
 * la API responde 409 y el modal vuelve a la vista previa con el texto nuevo.
 *
 * El padre lo monta con una `key` nueva en cada apertura, así que el estado
 * (incluidas las firmas) nunca sobrevive de un paciente a otro.
 */
export function NewConsentModal({
  open,
  onOpenChange,
  token,
  patientId,
  onSigned,
}: NewConsentModalProps) {
  const [step, setStep] = useState<Step>(0);

  const [templates, setTemplates] = useState<ConsentTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [templatesKey, setTemplatesKey] = useState(0);
  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null);
  const [plansFailed, setPlansFailed] = useState(false);
  const [plansKey, setPlansKey] = useState(0);
  const [templateId, setTemplateId] = useState('');
  const [planId, setPlanId] = useState('');

  const [preview, setPreview] = useState<ConsentPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const [signerType, setSignerType] = useState<ConsentSignerType>('PATIENT');
  const [guardianName, setGuardianName] = useState('');
  const [guardianDocument, setGuardianDocument] = useState('');
  const [patientSignature, setPatientSignature] = useState<string | null>(null);
  const [professionalSignature, setProfessionalSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listConsentTemplates(token, { active: true })
      .then((data) => {
        if (cancelled) return;
        setTemplates(data);
        setTemplatesFailed(false);
      })
      .catch(() => {
        if (!cancelled) setTemplatesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, templatesKey]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, token, patientId, plansKey]);

  useEffect(() => {
    if (step !== 1 || !templateId) return;
    let cancelled = false;
    previewPatientConsent(token, patientId, {
      templateId,
      treatmentPlanId: planId || undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        setPreviewError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreviewError(apiErrorMessage(err, copy.previewError));
      });
    return () => {
      cancelled = true;
    };
  }, [step, token, patientId, templateId, planId, previewKey]);

  function goToPreview() {
    setPreview(null);
    setPreviewError(null);
    setPreviewKey((k) => k + 1);
    setStep(1);
  }

  const guardianOk =
    signerType === 'PATIENT' || (guardianName.trim() !== '' && guardianDocument.trim() !== '');
  const canSign = !!preview && !!patientSignature && !!professionalSignature && guardianOk;

  async function sign() {
    if (!preview || !patientSignature || !professionalSignature) return;
    setSubmitting(true);
    setError(null);
    try {
      const consent = await signPatientConsent(token, patientId, {
        templateId: preview.templateId,
        templateVersion: preview.templateVersion,
        ...(planId ? { treatmentPlanId: planId } : {}),
        signerType,
        ...(signerType === 'GUARDIAN'
          ? { guardianName: guardianName.trim(), guardianDocument: guardianDocument.trim() }
          : {}),
        patientSignature,
        professionalSignature,
      });
      onOpenChange(false);
      onSigned(consent);
    } catch (err) {
      const message = apiErrorMessage(err, copy.genericSignError);
      setError(message);
      // La plantilla cambió: el paciente tiene que leer el texto nuevo.
      if (err instanceof ApiError && err.status === 409) {
        setPatientSignature(null);
        setProfessionalSignature(null);
        goToPreview();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 0) {
      if (templateId) goToPreview();
      return;
    }
    if (step === 1) {
      if (preview) {
        setError(null);
        setStep(2);
      }
      return;
    }
    void sign();
  }

  const primaryLabel = step === 2 ? copy.sign : copy.next;
  const primaryDisabled =
    step === 0 ? !templateId : step === 1 ? !preview : !canSign;
  const description = [copy.chooseDescription, copy.previewDescription, copy.signDescription][step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-ink">{copy.stepOf(step + 1, 3)}</span> ·{' '}
            {description}
          </DialogDescription>
          <ol aria-label={copy.stepsLabel} className="mt-1 flex gap-2 text-xs">
            {copy.steps.map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? 'step' : undefined}
                className={cn(
                  'flex-1 border-t-2 pt-1',
                  index <= step ? 'border-primary text-ink' : 'border-border text-muted',
                )}
              >
                {label}
              </li>
            ))}
          </ol>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          {error ? <InlineError variant="summary">{error}</InlineError> : null}

          {step === 0 ? (
            <>
              <FormField htmlFor="consent-template" label={copy.templateLabel}>
                {templatesFailed ? (
                  <FieldError
                    label={copy.templatesError}
                    onRetry={() => setTemplatesKey((k) => k + 1)}
                    className="h-10 w-full"
                  />
                ) : templates === null ? (
                  <Skeleton className="h-10 w-full" />
                ) : templates.length === 0 ? (
                  <p role="status" className="text-sm text-muted">
                    {copy.noTemplates}
                  </p>
                ) : (
                  <select
                    id="consent-template"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className={cn(fieldClass, 'h-10')}
                    required
                  >
                    <option value="" disabled>
                      {copy.templatePlaceholder}
                    </option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField htmlFor="consent-plan" label={copy.planLabel} hint={copy.planHint}>
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
                    id="consent-plan"
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
            </>
          ) : null}

          {step === 1 ? (
            previewError ? (
              <SectionError
                description={previewError}
                onRetry={() => {
                  setPreviewError(null);
                  setPreviewKey((k) => k + 1);
                }}
              />
            ) : preview ? (
              <section
                aria-label={copy.previewRegion}
                tabIndex={0}
                className="max-h-[50dvh] overflow-y-auto rounded-lg border border-border bg-white p-4 text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <h3 className="text-base font-semibold">{preview.title}</h3>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{preview.body}</p>
              </section>
            ) : (
              <div role="status" aria-label="Cargando vista previa" className="flex flex-col gap-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-24 w-full" />
              </div>
            )
          ) : null}

          {step === 2 && preview ? (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">{copy.signerLegend}</legend>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                  {(
                    [
                      ['PATIENT', copy.signerPatient],
                      ['GUARDIAN', copy.signerGuardian],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex min-h-11 items-center gap-2 text-sm text-ink sm:min-h-0"
                    >
                      <input
                        type="radio"
                        name="signerType"
                        value={value}
                        checked={signerType === value}
                        onChange={() => {
                          // Quien firma cambió: la firma ya trazada era de otra persona.
                          setSignerType(value);
                          setPatientSignature(null);
                        }}
                        className="size-4 accent-[var(--color-primary)]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {signerType === 'GUARDIAN' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField htmlFor="guardian-name" label={copy.guardianName}>
                    <Input
                      id="guardian-name"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      maxLength={200}
                      autoComplete="off"
                      required
                    />
                  </FormField>
                  <FormField htmlFor="guardian-document" label={copy.guardianDocument}>
                    <Input
                      id="guardian-document"
                      value={guardianDocument}
                      onChange={(e) => setGuardianDocument(e.target.value)}
                      maxLength={60}
                      autoComplete="off"
                      required
                    />
                  </FormField>
                </div>
              ) : null}
              <SignaturePad
                key={signerType}
                label={signerType === 'GUARDIAN' ? copy.guardianSignature : copy.patientSignature}
                hint={copy.signatureHint}
                onChange={setPatientSignature}
                disabled={submitting}
              />
              <SignaturePad
                label={copy.professionalSignature(preview.professionalName)}
                hint={copy.signatureHint}
                onChange={setProfessionalSignature}
                disabled={submitting}
              />
              <p className="text-xs text-muted">{copy.immutableNote}</p>
            </>
          ) : null}

          <DialogFooter>
            {step === 0 ? (
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={submitting}>
                  {copy.cancel}
                </Button>
              </DialogClose>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => {
                  setError(null);
                  // Las firmas se descartan al salir del paso: el lienzo se
                  // desmonta y una firma invisible nunca debe poder enviarse.
                  setPatientSignature(null);
                  setProfessionalSignature(null);
                  setStep((s) => (s - 1) as Step);
                }}
              >
                {copy.back}
              </Button>
            )}
            <Button type="submit" loading={submitting} disabled={primaryDisabled}>
              {primaryLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
