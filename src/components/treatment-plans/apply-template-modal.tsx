'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeMoney } from '@/lib/format/sede-number';
import { isFdiToothNumber } from '@/lib/odontogram/fdi';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import { SURFACE_LABELS, SURFACE_ORDER } from '@/lib/odontogram/surface-labels';
import {
  applyTemplate,
  listPlanTemplates,
  previewApplyTemplate,
  type PlanTemplate,
  type TemplateApplication,
  type TemplateLineChoice,
  type TemplatePreview,
  type TemplatePreviewLine,
} from '@/lib/treatment-plans/plan-templates-api';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { SectionError } from '@/components/errors/section-error';
import { ToothPicker } from '@/components/odontogram/tooth-picker';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const applyTemplateCopy = {
  title: 'Añadir desde plantilla',
  description: 'Añade al plan los procedimientos de una plantilla, con el precio vigente de este paciente.',
  template: 'Plantilla',
  chooseTemplate: 'Elige una plantilla',
  templatesLoading: 'Cargando las plantillas…',
  templatesError: 'No pudimos cargar las plantillas de plan.',
  noTemplates: 'No hay plantillas de plan activas. Administración las crea en Ajustes › Plantillas de plan.',
  previewLoading: 'Calculando la vista previa…',
  previewError: 'No pudimos calcular la vista previa de la plantilla.',
  linesLabel: 'Procedimientos que se añadirán',
  quantity: (n: number) => `× ${n}`,
  visit: (n: number, label: string | null) => (label ? `Visita ${n} · ${label}` : `Visita ${n}`),
  unitPrice: (amount: string) => `${amount} c/u`,
  skipped: 'Desactivado en el catálogo, no se añadirá',
  priceMissing: 'Sin precio en la lista vigente',
  rateMissing: 'Falta la tasa de cambio de hoy para convertir su precio',
  total: 'Total',
  itemCount: (n: number) => (n === 1 ? '1 procedimiento' : `${n} procedimientos`),
  perLineTooth: 'Un diente distinto por procedimiento',
  perLineToothHint: 'Si lo dejas vacío, usa el diente común.',
  lineTooth: (name: string) => `Diente de ${name}`,
  surfaces: (name: string) => `Superficies de ${name} (opcional)`,
  submit: 'Añadir al plan',
  hintChoose: 'Elige una plantilla.',
  hintTooth: 'Elige el diente de cada procedimiento.',
  hintPrice: 'Hay procedimientos sin precio: añade el precio en la lista o en el catálogo.',
  hintNothing: 'Ningún procedimiento de la plantilla está activo en el catálogo.',
  lineFailed: 'Revisa este procedimiento: es el del aviso de arriba.',
  genericError: 'No pudimos añadir los procedimientos. Intenta de nuevo.',
};

const copy = applyTemplateCopy;

type Surfaces = Partial<Record<ToothSurface, boolean>>;

interface ApplyTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  plan: Pick<TreatmentPlan, 'id' | 'currency'>;
  /** Formato de la sede (los demás importes del plan); `null` mientras carga («—»). */
  fmt: RegionalFormat | null;
  /** Tras aplicar: el padre recarga el plan y avisa. */
  onApplied: (result: TemplateApplication) => void;
}

function lineName(line: TemplatePreviewLine): string {
  return line.catalogItemLabel;
}

/**
 * «Añadir desde plantilla» (DX-559). Elige una plantilla activa, pide a la API
 * la vista previa (precio vigente del paciente en la moneda del plan, visita de
 * destino tras la última del plan, líneas omitidas y sin precio) y aplica con
 * un diente común o uno por línea y, donde la plantilla lo pide, superficies.
 * Todo entra o nada: un error de la API se enseña tal cual y, si nombra una
 * línea, se marca esa línea. El padre lo monta con una `key` por apertura.
 */
export function ApplyTemplateModal({ open, onOpenChange, token, plan, fmt, onApplied }: ApplyTemplateModalProps) {
  const ids = useId();
  const [templates, setTemplates] = useState<PlanTemplate[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatesReload, setTemplatesReload] = useState(0);
  const [templateId, setTemplateId] = useState('');
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewReload, setPreviewReload] = useState(0);
  const [tooth, setTooth] = useState('');
  const [perLine, setPerLine] = useState(false);
  const [lineTeeth, setLineTeeth] = useState<Record<string, string>>({});
  const [surfaces, setSurfaces] = useState<Record<string, Surfaces>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorLineId, setErrorLineId] = useState<string | null>(null);
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listPlanTemplates(tokenRef.current)
      .then((list) => {
        if (cancelled) return;
        setTemplates([...list].sort((a, b) => a.name.localeCompare(b.name, 'es')));
        setTemplatesError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setTemplatesError(apiErrorMessage(err, copy.templatesError));
      });
    return () => {
      cancelled = true;
    };
  }, [open, templatesReload]);

  useEffect(() => {
    if (!open || !templateId) return;
    let cancelled = false;
    previewApplyTemplate(tokenRef.current, plan.id, templateId)
      .then((res) => {
        if (cancelled) return;
        setPreview(res);
        setPreviewError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setPreviewError(apiErrorMessage(err, copy.previewError));
      });
    return () => {
      cancelled = true;
    };
  }, [open, plan.id, templateId, previewReload]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    setPreview(null);
    setPreviewError(null);
    setLineTeeth({});
    setSurfaces({});
    setError(null);
    setErrorLineId(null);
  }

  const money = (amount: number) => sedeMoney(amount, preview?.currency ?? plan.currency, fmt);
  const applicable = (preview?.lines ?? []).filter((l) => !l.skipped);
  const commonTooth = tooth.trim();
  const toothOf = (line: TemplatePreviewLine) => {
    const own = perLine ? (lineTeeth[line.lineId] ?? '').trim() : '';
    return own || commonTooth;
  };
  const missingTooth = applicable.some((l) => !isFdiToothNumber(toothOf(l)));
  const missingPrice = applicable.some((l) => l.priceMissing);
  const hint = !templateId
    ? copy.hintChoose
    : !preview
      ? null
      : applicable.length === 0
        ? copy.hintNothing
        : missingPrice
          ? copy.hintPrice
          : missingTooth
            ? copy.hintTooth
            : null;
  const canSubmit = Boolean(preview) && applicable.length > 0 && !missingPrice && !missingTooth;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!preview || !canSubmit) return;
    setError(null);
    setErrorLineId(null);
    const lines: TemplateLineChoice[] = [];
    for (const l of applicable) {
      const own = perLine ? (lineTeeth[l.lineId] ?? '').trim() : '';
      const chosen = l.asksSurfaces ? SURFACE_ORDER.filter((s) => surfaces[l.lineId]?.[s]) : [];
      if (!own && chosen.length === 0) continue;
      lines.push({
        lineId: l.lineId,
        ...(own ? { toothNumber: own } : {}),
        ...(chosen.length ? { surfaces: chosen } : {}),
      });
    }
    setSubmitting(true);
    try {
      const result = await applyTemplate(token, plan.id, {
        templateId: preview.templateId,
        ...(commonTooth ? { toothNumber: commonTooth } : {}),
        ...(lines.length ? { lines } : {}),
      });
      onApplied(result);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
      if (err instanceof ApiError && err.lineId) setErrorLineId(err.lineId);
    } finally {
      setSubmitting(false);
    }
  }

  const noTemplates = templates !== null && templates.length === 0;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={!canSubmit}
      submitBusy={Boolean(templateId) && !preview && !previewError}
      submitHint={hint}
      hideSubmit={Boolean(templatesError) || noTemplates}
      error={error}
      size="lg"
    >
      {templatesError ? (
        <SectionError
          description={templatesError}
          onRetry={() => {
            setTemplatesError(null);
            setTemplatesReload((k) => k + 1);
          }}
        />
      ) : templates === null ? (
        <Skeleton className="h-10 w-full" aria-label={copy.templatesLoading} />
      ) : noTemplates ? (
        <p role="status" className="text-sm text-muted">
          {copy.noTemplates}
        </p>
      ) : (
        <FormField htmlFor={`${ids}-template`} label={copy.template}>
          <NativeSelect
            id={`${ids}-template`}
            value={templateId}
            onChange={(e) => chooseTemplate(e.target.value)}
          >
            <option value="">{copy.chooseTemplate}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}

      {templateId && previewError ? (
        <SectionError
          description={previewError}
          onRetry={() => {
            setPreviewError(null);
            setPreviewReload((k) => k + 1);
          }}
        />
      ) : templateId && !preview ? (
        <div className="flex flex-col gap-2" role="status" aria-label={copy.previewLoading}>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : preview ? (
        <>
          {applicable.length > 0 ? (
            <ToothPicker inputId={`${ids}-tooth`} value={tooth} onChange={setTooth} />
          ) : null}
          {applicable.length > 1 ? (
            <Checkbox
              id={`${ids}-per-line`}
              label={copy.perLineTooth}
              description={perLine ? copy.perLineToothHint : undefined}
              checked={perLine}
              onChange={(e) => setPerLine(e.target.checked)}
            />
          ) : null}

          <section aria-labelledby={`${ids}-lines`} className="flex flex-col gap-2">
            <h3 id={`${ids}-lines`} className="text-sm font-semibold text-ink">
              {copy.linesLabel}
            </h3>
            <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
              {preview.lines.map((line) => {
                const name = lineName(line);
                const base = `${ids}-${line.lineId}`;
                const marked = errorLineId === line.lineId;
                const issue = line.skipped
                  ? copy.skipped
                  : line.priceMissing
                    ? line.priceIssue === 'RATE_MISSING'
                      ? copy.rateMissing
                      : copy.priceMissing
                    : null;
                return (
                  <li
                    key={line.lineId}
                    aria-label={name}
                    className={cn(
                      'flex min-w-0 flex-col gap-2 px-3 py-2.5',
                      line.skipped && 'text-muted',
                      marked && 'bg-danger-subtle',
                    )}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className={cn('text-sm font-medium', line.skipped ? 'text-muted line-through' : 'text-ink')}>
                          {name}
                          <span className="ml-1.5 font-normal text-muted tabular-nums">{copy.quantity(line.quantity)}</span>
                        </span>
                        <span className="text-xs text-muted">
                          {line.targetVisit !== null ? copy.visit(line.targetVisit, line.visitLabel) : line.catalogItemCode}
                        </span>
                        {issue ? (
                          <Badge variant={line.skipped ? 'neutral' : 'warning'} className="self-start">
                            {issue}
                          </Badge>
                        ) : null}
                      </div>
                      {line.lineTotal !== null && line.unitPrice !== null ? (
                        <div className="flex shrink-0 flex-col items-end text-right tabular-nums">
                          <span className="text-sm font-medium text-ink">{money(line.lineTotal)}</span>
                          {line.quantity > 1 ? (
                            <span className="text-xs text-muted">{copy.unitPrice(money(line.unitPrice))}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {!line.skipped && perLine ? (
                      <FormField htmlFor={`${base}-tooth`} label={copy.lineTooth(name)} className="max-w-48">
                        <Input
                          id={`${base}-tooth`}
                          inputMode="numeric"
                          maxLength={2}
                          placeholder={commonTooth || undefined}
                          value={lineTeeth[line.lineId] ?? ''}
                          onChange={(e) => setLineTeeth((prev) => ({ ...prev, [line.lineId]: e.target.value }))}
                          className="tabular-nums"
                        />
                      </FormField>
                    ) : null}
                    {!line.skipped && line.asksSurfaces ? (
                      <fieldset className="flex flex-col gap-1.5">
                        <legend className="t-label text-muted">{copy.surfaces(name)}</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {SURFACE_ORDER.map((surface) => (
                            <Checkbox
                              key={surface}
                              id={`${base}-surface-${surface}`}
                              label={SURFACE_LABELS[surface]}
                              checked={Boolean(surfaces[line.lineId]?.[surface])}
                              onChange={(e) =>
                                setSurfaces((prev) => ({
                                  ...prev,
                                  [line.lineId]: { ...prev[line.lineId], [surface]: e.target.checked },
                                }))
                              }
                            />
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                    {/* El banner del modal ya anuncia el error; aquí solo se señala la línea. */}
                    {marked ? <p className="text-xs font-medium text-danger-text">{copy.lineFailed}</p> : null}
                  </li>
                );
              })}
            </ul>
            <div className="flex items-baseline justify-between gap-3 px-3 pt-1">
              <span className="text-sm text-muted">{copy.itemCount(preview.itemCount)}</span>
              <span className="text-sm font-semibold text-ink tabular-nums">
                {copy.total} {money(preview.total)}
              </span>
            </div>
          </section>
        </>
      ) : null}
    </FormModal>
  );
}
