'use client';
import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicRole } from '@/lib/me/me-api';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { referenceRateMissingText, referenceRateText } from '@/lib/discounts/reference-rate';
import { statusLabel, statusTone, TONE_CLASSES } from '@/lib/status/tones';
import type { TreatmentPlan, TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import {
  applyRepricing,
  hasSomethingToApply,
  IDEMPOTENCY_KEY_REUSED,
  previewRepricing,
  REPRICE_PREVIEW_STALE,
  type AppliedRepricing,
  type RepricingLine,
  type RepricingPreview,
  type RepricingSkip,
  type RepricingSkipReason,
} from '@/lib/treatment-plans/plan-repricing-api';
import { FormModal } from '@/components/shared/form-modal';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Skeleton } from '@/components/ui/skeleton';
import { Wizard } from '@/components/ui/wizard';
import { cn } from '@/lib/utils';

export const repricePlanCopy = {
  title: 'Actualizar precios',
  description: 'Compara los precios del presupuesto con los vigentes y elige qué procedimientos actualizar.',
  steps: { preview: 'Vista previa', confirm: 'Confirmar' },
  loading: 'Calculando los precios vigentes…',
  refreshing: 'Calculando la vista previa…',
  loadError: 'No pudimos calcular los precios vigentes.',
  blockedTitle: 'No se pueden actualizar los precios',
  linesLabel: 'Procedimientos a actualizar',
  procedure: 'Procedimiento',
  before: 'Precio actual',
  after: 'Precio vigente',
  difference: 'Diferencia',
  mobileBefore: (amount: string) => `Actual ${amount}`,
  mobileAfter: (amount: string) => `Vigente ${amount}`,
  tooth: (n: string) => `Diente ${n}`,
  select: (name: string) => `Actualizar ${name}`,
  skippedHeading: 'No se actualizan',
  skippedReason: {
    NOT_PROPOSED: 'Ya está aceptado o realizado: conserva su precio.',
    CANCELLATION_FEE: 'Es un cargo por inasistencia: conserva su importe.',
    NO_CURRENT_PRICE: 'No tiene precio vigente en el catálogo: conserva su precio.',
  } satisfies Record<Exclude<RepricingSkipReason, 'NO_RATE'>, string>,
  totalsLabel: 'Totales del plan',
  totalBefore: 'Total actual',
  totalAfter: 'Total actualizado',
  converted: (rate: string) => `Convertido con la ${rate}.`,
  renewed: (date: string) => `La validez se renueva hasta el ${date}.`,
  next: 'Continuar',
  submit: 'Actualizar precios',
  back: 'Volver a la vista previa',
  retry: 'Reintentar',
  hintEmpty: 'Elige al menos un procedimiento.',
  hintNoLines: 'Ningún procedimiento propuesto tiene precio vigente: no hay nada que actualizar.',
  hintUpToDate: 'Los precios ya están al día: no hay nada que actualizar.',
  confirmLabel: 'Resumen de la actualización',
  confirmCount: (n: number) => (n === 1 ? '1 procedimiento' : `${n} procedimientos`),
  confirmItems: 'Procedimientos',
  confirmTotal: 'Total',
  confirmTotalChange: (before: string, after: string) => `${before} → ${after}`,
  confirmValidity: 'Validez',
  validityKept: 'Se conserva la anterior',
  validityNone: 'Sin validez guardada',
  success: 'Precios actualizados',
  genericError: 'No pudimos actualizar los precios. Intenta de nuevo.',
};

/** Un UUID por apertura (`Idempotency-Key`); `crypto.randomUUID` solo existe en contextos seguros. */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

/** Tiempo sin tocar casillas antes de volver a pedir la vista previa. */
export const REPRICE_SELECTION_DEBOUNCE_MS = 300;

/** Toda la lista: la vista previa y el aplicar van sin `itemIds`. */
const ALL = 'all';

function selectionKeyOf(selected: ReadonlySet<string>, lines: readonly RepricingLine[]): string {
  if (lines.every((line) => selected.has(line.itemId))) return ALL;
  return [...selected].sort().join(',');
}

/** Un error del que no se sale reintentando lo mismo (el plan no admite el cambio). */
function isFinalClientError(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
}

interface LoadError {
  message: string;
  retryable: boolean;
}

interface RepricePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** El detalle del plan (con `items`): de ahí salen los nombres de cada línea. */
  plan: TreatmentPlan;
  role: ClinicRole | null;
  /** El nombre del procedimiento de un ítem (el catálogo lo tiene la pestaña). */
  procedureOf: (item: TreatmentPlanItem) => string;
  /** El pintor de la pantalla (su dueño pinta el aviso de la sede, una vez). */
  stamp: SedePainters;
  /** Tras aplicar (o repetir lo ya aplicado): el padre recarga el plan. */
  onRepriced: (result: AppliedRepricing) => void;
}

/**
 * «Actualizar precios» (DX-379 B): asistente de dos pasos. La vista previa
 * compara cada ítem propuesto con su precio vigente (y dice cuáles no se tocan
 * y por qué); las casillas eligen cuáles se actualizan y cada cambio vuelve a
 * pedir la vista previa con esos `itemIds`. Confirmar aplica con la huella de
 * la vista previa y una Idempotency-Key por apertura del modal.
 */
export function RepricePlanModal({
  open,
  onOpenChange,
  token,
  patientId,
  plan,
  role,
  procedureOf,
  stamp,
  onRepriced,
}: RepricePlanModalProps) {
  const [step, setStep] = useState<0 | 1>(0);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  // Ya se mandó un «aplicar» con esta clave: volver atrás estrena otra.
  const attemptedRef = useRef(false);
  const [base, setBase] = useState<RepricingPreview | null>(null);
  const [current, setCurrent] = useState<{ key: string; preview: RepricingPreview } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  // 409 REPRICE_PREVIEW_STALE: aplicar lo mismo no sirve; solo volver a una vista previa nueva.
  const [stale, setStale] = useState(false);

  const locationId = plan.presentedLocationId;
  const itemsById = useMemo(() => new Map((plan.items ?? []).map((item) => [item.id, item])), [plan.items]);

  // La vista previa entera (sin `itemIds`): la lista de líneas de las casillas.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    previewRepricing(token, patientId, plan.id)
      .then((res) => {
        if (cancelled) return;
        setBase(res);
        setCurrent({ key: ALL, preview: res });
        setLoadError(null);
        // Al volver a la vista previa se conserva lo elegido (lo que siga en la lista).
        setSelected((prev) => {
          const ids = res.lines.map((line) => line.itemId);
          return new Set(prev === null ? ids : ids.filter((id) => prev.has(id)));
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError({
          message: apiErrorMessage(err, repricePlanCopy.loadError),
          retryable: !isFinalClientError(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, plan.id, reloadKey]);

  const selectionKey = base && selected ? selectionKeyOf(selected, base.lines) : null;

  // Cada cambio de selección vuelve a pedir la vista previa (con espera).
  useEffect(() => {
    if (!open || !base || !selected || selectionKey === null) return;
    if (selected.size === 0 || current?.key === selectionKey) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      previewRepricing(token, patientId, plan.id, selectionKey === ALL ? undefined : [...selected].sort())
        .then((res) => {
          if (cancelled) return;
          setCurrent({ key: selectionKey, preview: res });
          setRefreshError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) setRefreshError(apiErrorMessage(err, repricePlanCopy.loadError));
        });
    }, REPRICE_SELECTION_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `current` y `selected` se leen al dispararse; la clave de selección decide cuándo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, base, selectionKey, refreshKey, token, patientId, plan.id]);

  function reset() {
    setStep(0);
    setIdempotencyKey(newIdempotencyKey());
    attemptedRef.current = false;
    setBase(null);
    setCurrent(null);
    setSelected(null);
    setLoadError(null);
    setRefreshError(null);
    setSubmitError(null);
    setBlocked(false);
    setStale(false);
  }

  function handleOpenChange(next: boolean) {
    // Cada apertura empieza en limpio, con su propia clave.
    if (!next) reset();
    onOpenChange(next);
  }

  /** Vuelve al paso 1 con una vista previa nueva (y una clave nueva si ya se intentó aplicar). */
  function backToPreview({ reload }: { reload: boolean }) {
    if (attemptedRef.current) {
      setIdempotencyKey(newIdempotencyKey());
      attemptedRef.current = false;
    }
    setStep(0);
    setSubmitError(null);
    setBlocked(false);
    setStale(false);
    if (reload) {
      setBase(null);
      setCurrent(null);
      setReloadKey((k) => k + 1);
    }
  }

  const fresh = current && current.key === selectionKey ? current.preview : null;
  const refreshing = base !== null && selected !== null && selected.size > 0 && fresh === null && !refreshError;
  const ready = fresh !== null && selected !== null && selected.size > 0 && hasSomethingToApply(fresh);

  let hint: string | null = null;
  if (base && selected) {
    if (base.lines.length === 0) hint = repricePlanCopy.hintNoLines;
    else if (selected.size === 0) hint = repricePlanCopy.hintEmpty;
    else if (refreshing) hint = repricePlanCopy.refreshing;
    else if (fresh && !hasSomethingToApply(fresh)) hint = repricePlanCopy.hintUpToDate;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !fresh) return;
    if (step === 0) {
      setStep(1);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    attemptedRef.current = true;
    try {
      const result = await applyRepricing(
        token,
        patientId,
        plan.id,
        {
          previewHash: fresh.previewHash,
          ...(current?.key === ALL ? {} : { itemIds: [...(selected ?? [])].sort() }),
        },
        idempotencyKey,
      );
      // `replayed: true` es lo ya aplicado con esta clave: también es éxito.
      toast.success(repricePlanCopy.success);
      onRepriced(result);
      handleOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err, repricePlanCopy.genericError);
      if (err instanceof ApiError && err.code === IDEMPOTENCY_KEY_REUSED) {
        // La clave ya sirvió para otra petición: otra clave y otra vista previa.
        backToPreview({ reload: true });
        setSubmitError(message);
      } else if (err instanceof ApiError && err.status === 409 && err.code === REPRICE_PREVIEW_STALE) {
        // Cambió un precio o la tasa: se ofrece volver a una vista previa nueva.
        setStale(true);
        setSubmitError(message);
      } else {
        setSubmitError(message);
        // Estado del plan, abonos, topes de descuento…: reintentar lo mismo no sirve.
        setBlocked(isFinalClientError(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title={repricePlanCopy.title}
      description={repricePlanCopy.description}
      onSubmit={handleSubmit}
      submitLabel={step === 0 ? repricePlanCopy.next : repricePlanCopy.submit}
      submitting={submitting}
      submitDisabled={!ready || blocked || stale}
      submitBusy={refreshing}
      submitHint={step === 0 && base ? hint : undefined}
      hideSubmit={loadError !== null}
      error={submitError}
      errorRetry={
        step === 0 && refreshError
          ? { label: repricePlanCopy.retry, onRetry: () => setRefreshKey((k) => k + 1) }
          : null
      }
      size="lg"
    >
      {loadError ? (
        <SectionError
          title={loadError.retryable ? undefined : repricePlanCopy.blockedTitle}
          description={loadError.message}
          onRetry={
            loadError.retryable
              ? () => {
                  setLoadError(null);
                  setReloadKey((k) => k + 1);
                }
              : undefined
          }
        />
      ) : !base || !selected ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{repricePlanCopy.loading}</span>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : (
        <Wizard
          steps={[
            { key: 'preview', label: repricePlanCopy.steps.preview },
            { key: 'confirm', label: repricePlanCopy.steps.confirm },
          ]}
          current={step}
          onStepChange={(i) => {
            if (i === 0 && step === 1) backToPreview({ reload: false });
            else if (i === 1 && ready) setStep(1);
          }}
        >
          {step === 0 ? (
            <PreviewStep
              base={base}
              preview={fresh ?? current?.preview ?? base}
              fresh={fresh !== null}
              selected={selected}
              onToggle={(itemId, checked) => {
                setRefreshError(null);
                setSelected((prev) => {
                  const next = new Set(prev ?? []);
                  if (checked) next.add(itemId);
                  else next.delete(itemId);
                  return next;
                });
              }}
              itemsById={itemsById}
              procedureOf={procedureOf}
              role={role}
              stamp={stamp}
              locationId={locationId}
              planCurrency={plan.currency}
            />
          ) : fresh ? (
            <ConfirmStep
              preview={fresh}
              count={fresh.lines.length}
              stamp={stamp}
              locationId={locationId}
              onBack={() => backToPreview({ reload: stale })}
              disabled={submitting}
            />
          ) : null}
        </Wizard>
      )}
    </FormModal>
  );
}

function itemName(
  itemId: string,
  itemsById: ReadonlyMap<string, TreatmentPlanItem>,
  procedureOf: (item: TreatmentPlanItem) => string,
): string {
  const item = itemsById.get(itemId);
  return item ? procedureOf(item) : repricePlanCopy.procedure;
}

/**
 * La diferencia en palabras del mapa de tonos («Sube USD 20,00», «Baja USD 10,00», «Sin
 * cambio»): el color nunca es la única pista, y un signo junto al código («+USD») no se lee.
 */
function DifferenceText({ amount, money }: { amount: number; money: (value: number) => string }) {
  const direction = amount > 0 ? 'UP' : amount < 0 ? 'DOWN' : 'SAME';
  return (
    <span className={cn('font-medium tabular-nums', TONE_CLASSES[statusTone('priceChange', direction)].text)}>
      {direction === 'SAME'
        ? statusLabel('priceChange', direction)
        : `${statusLabel('priceChange', direction)} ${money(Math.abs(amount))}`}
    </span>
  );
}

function ValidityLine({
  preview,
  stamp,
  locationId,
}: {
  preview: RepricingPreview;
  stamp: SedePainters;
  locationId: string | null;
}) {
  if (preview.validityRenewed && preview.validity) {
    return (
      <p className="text-sm text-ink tabular-nums" data-testid="reprice-validity">
        {repricePlanCopy.renewed(stamp.civilDate(preview.validity.validUntil, locationId))}
      </p>
    );
  }
  if (preview.validityNote) {
    // Un aviso, no un error: la selección parcial es válida, solo no renueva.
    return <Callout tone="warning">{preview.validityNote}</Callout>;
  }
  return null;
}

interface PreviewStepProps {
  base: RepricingPreview;
  preview: RepricingPreview;
  selected: ReadonlySet<string>;
  onToggle: (itemId: string, checked: boolean) => void;
  itemsById: ReadonlyMap<string, TreatmentPlanItem>;
  procedureOf: (item: TreatmentPlanItem) => string;
  role: ClinicRole | null;
  stamp: SedePainters;
  locationId: string | null;
  planCurrency: string;
  /** La vista previa es la de la selección actual (no una anterior mientras se recalcula). */
  fresh: boolean;
}

function PreviewStep({
  base,
  preview,
  selected,
  onToggle,
  itemsById,
  procedureOf,
  role,
  stamp,
  locationId,
  planCurrency,
  fresh,
}: PreviewStepProps) {
  const money = (amount: number) => stamp.money(amount, preview.currency, locationId);
  // Los números de una línea elegida salen de la vista previa al día; los de una sin elegir, de la entera.
  const lineOf = (row: RepricingLine) => preview.lines.find((l) => l.itemId === row.itemId) ?? row;
  const name = (row: { itemId: string }) => itemName(row.itemId, itemsById, procedureOf);
  const rate = preview.rate ?? base.rate;

  const columns: DataListColumn<RepricingLine>[] = [
    {
      id: 'procedure',
      header: repricePlanCopy.procedure,
      mobile: 'primary',
      cell: (row) => (
        <span className="block min-w-0 break-words">
          <span className="block text-ink">{name(row)}</span>
          {row.toothNumber ? (
            <span className="block t-caption text-muted tabular-nums">{repricePlanCopy.tooth(row.toothNumber)}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'before',
      header: repricePlanCopy.before,
      numeric: true,
      cell: (row) => money(lineOf(row).before.total),
      mobileCell: (row) => repricePlanCopy.mobileBefore(money(lineOf(row).before.total)),
    },
    {
      id: 'after',
      header: repricePlanCopy.after,
      numeric: true,
      cell: (row) => money(lineOf(row).after.total),
      mobileCell: (row) => repricePlanCopy.mobileAfter(money(lineOf(row).after.total)),
    },
    {
      id: 'difference',
      header: repricePlanCopy.difference,
      numeric: true,
      mobile: 'trailing',
      cell: (row) => <DifferenceText amount={lineOf(row).difference} money={money} />,
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {base.lines.length > 0 ? (
        <DataList
          label={repricePlanCopy.linesLabel}
          rows={base.lines}
          columns={columns}
          getRowKey={(row) => row.itemId}
          leading={(row) => (
            <Checkbox
              aria-label={repricePlanCopy.select(name(row))}
              checked={selected.has(row.itemId)}
              onChange={(e) => onToggle(row.itemId, e.target.checked)}
            />
          )}
        />
      ) : null}

      {base.skipped.length > 0 ? (
        <section aria-labelledby="reprice-skipped-heading" className="flex flex-col gap-2">
          <h3 id="reprice-skipped-heading" className="t-label text-ink">
            {repricePlanCopy.skippedHeading}
          </h3>
          <ul className="divide-y divide-border-subtle rounded-lg border border-border text-sm">
            {base.skipped.map((skip) => (
              <li key={skip.itemId} className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
                <span className="break-words text-ink">
                  {name(skip)}
                  {skip.toothNumber ? (
                    <span className="text-muted tabular-nums"> · {repricePlanCopy.tooth(skip.toothNumber)}</span>
                  ) : null}
                </span>
                <span className="break-words text-muted">{skipReasonText(skip, planCurrency, role)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {base.lines.length > 0 ? (
        <section aria-label={repricePlanCopy.totalsLabel} className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <DescriptionList columns={3}>
            <DescriptionItem label={repricePlanCopy.totalBefore} numeric>
              {money(preview.totals.before)}
            </DescriptionItem>
            <DescriptionItem label={repricePlanCopy.totalAfter} numeric>
              {money(preview.totals.after)}
            </DescriptionItem>
            <DescriptionItem label={repricePlanCopy.difference} numeric>
              <DifferenceText amount={preview.totals.difference} money={money} />
            </DescriptionItem>
          </DescriptionList>
          {rate ? (
            <p className="t-caption text-muted tabular-nums">
              {repricePlanCopy.converted(referenceRateText(rate, rate.currency, preview.currency, stamp.fmtOf(locationId)))}
            </p>
          ) : null}
        </section>
      ) : null}

      {fresh ? <ValidityLine preview={preview} stamp={stamp} locationId={locationId} /> : null}
    </div>
  );
}

function skipReasonText(skip: RepricingSkip, planCurrency: string, role: ClinicRole | null): string {
  if (skip.reason === 'NO_RATE') return referenceRateMissingText(skip.currency ?? '', planCurrency, role);
  return repricePlanCopy.skippedReason[skip.reason];
}

function ConfirmStep({
  preview,
  count,
  stamp,
  locationId,
  onBack,
  disabled,
}: {
  preview: RepricingPreview;
  count: number;
  stamp: SedePainters;
  locationId: string | null;
  onBack: () => void;
  disabled: boolean;
}) {
  const money = (amount: number) => stamp.money(amount, preview.currency, locationId);
  const validity =
    preview.validityRenewed && preview.validity
      ? repricePlanCopy.renewed(stamp.civilDate(preview.validity.validUntil, locationId))
      : preview.validity
        ? repricePlanCopy.validityKept
        : repricePlanCopy.validityNone;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-label={repricePlanCopy.confirmLabel} className="rounded-lg border border-border p-4">
        <DescriptionList columns={1} layout="inline">
          <DescriptionItem label={repricePlanCopy.confirmItems} numeric>
            {repricePlanCopy.confirmCount(count)}
          </DescriptionItem>
          <DescriptionItem label={repricePlanCopy.confirmTotal} numeric>
            {repricePlanCopy.confirmTotalChange(money(preview.totals.before), money(preview.totals.after))}
          </DescriptionItem>
          <DescriptionItem label={repricePlanCopy.difference} numeric>
            <DifferenceText amount={preview.totals.difference} money={money} />
          </DescriptionItem>
          <DescriptionItem label={repricePlanCopy.confirmValidity}>{validity}</DescriptionItem>
        </DescriptionList>
      </section>
      {preview.validityNote ? <Callout tone="warning">{preview.validityNote}</Callout> : null}
      <div>
        <Button type="button" variant="secondary" onClick={onBack} disabled={disabled}>
          {repricePlanCopy.back}
        </Button>
      </div>
    </div>
  );
}
