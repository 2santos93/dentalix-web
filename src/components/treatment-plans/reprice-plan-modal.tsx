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
  IDEMPOTENCY_KEY_REUSED,
  previewRepricing,
  REPRICE_PREVIEW_STALE,
  repricingOutcome,
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
  hintNothing: 'No hay precios que actualizar.',
  hintPartialExpired:
    'Los precios elegidos no cambian y una selección parcial no renueva la validez: marca todos los procedimientos para renovarla.',
  hintRenew: (date: string) => `Los precios no cambian: al confirmar se renueva la validez hasta el ${date}.`,
  submitRenew: 'Renovar la validez con los precios vigentes',
  successRenewed: 'Validez renovada',
  stillExpired: 'El presupuesto sigue vencido.',
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

/**
 * I-1: tras «Continuar», el submit del paso 2 no responde hasta pasado este
 * tiempo. Es el MISMO botón del pie: sin la espera, un doble clic o un doble
 * Enter en «Continuar» aplicaría sin haber visto la confirmación.
 */
export const REPRICE_CONFIRM_ARM_MS = 400;

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
 * la vista previa y una Idempotency-Key por apertura del modal. Un plan
 * vencido sin cambios de precio se puede confirmar para renovar su validez.
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
  // I-1: el submit del paso 2 solo responde tras pintar la confirmación y una pausa.
  const [armed, setArmed] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  // Ya se mandó un «aplicar» con esta clave: volver atrás estrena otra.
  const attemptedRef = useRef(false);
  // M-2: cada apertura tiene su número; lo que llegue de una apertura anterior no pinta nada.
  const openSeqRef = useRef(0);
  // M-3: renovar la sesión no recalcula la vista previa en mitad del asistente.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  const [base, setBase] = useState<RepricingPreview | null>(null);
  const [current, setCurrent] = useState<{ key: string; preview: RepricingPreview } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshError, setRefreshError] = useState<LoadError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  // 409 REPRICE_PREVIEW_STALE: aplicar lo mismo no sirve; solo volver a una vista previa nueva.
  const [stale, setStale] = useState(false);

  const locationId = plan.presentedLocationId;
  const expired = plan.quoteExpired;
  const itemsById = useMemo(() => new Map((plan.items ?? []).map((item) => [item.id, item])), [plan.items]);

  // La vista previa entera (sin `itemIds`): la lista de líneas de las casillas.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    previewRepricing(tokenRef.current, patientId, plan.id)
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
  }, [open, patientId, plan.id, reloadKey]);

  const selectionKey = base && selected ? selectionKeyOf(selected, base.lines) : null;

  // Cada cambio de selección vuelve a pedir la vista previa (con espera).
  useEffect(() => {
    if (!open || !base || !selected || selectionKey === null) return;
    if (selected.size === 0 || current?.key === selectionKey) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      previewRepricing(tokenRef.current, patientId, plan.id, selectionKey === ALL ? undefined : [...selected].sort())
        .then((res) => {
          if (cancelled) return;
          setCurrent({ key: selectionKey, preview: res });
          setRefreshError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setRefreshError({
            message: apiErrorMessage(err, repricePlanCopy.loadError),
            retryable: !isFinalClientError(err),
          });
        });
    }, REPRICE_SELECTION_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `current` y `selected` se leen al dispararse; la clave de selección decide cuándo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, base, selectionKey, refreshKey, patientId, plan.id]);

  // I-1: el paso 2 se arma tras pintarse y una pausa (el segundo clic de un doble clic no aplica).
  useEffect(() => {
    if (step !== 1) return;
    const timer = setTimeout(() => setArmed(true), REPRICE_CONFIRM_ARM_MS);
    return () => {
      clearTimeout(timer);
      setArmed(false);
    };
  }, [step]);

  function reset() {
    openSeqRef.current += 1;
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
    // M-2: mientras se aplica no se cierra (ni X, ni Escape, ni el fondo).
    if (!next && submitting) return;
    // Cada apertura empieza en limpio, con su propia clave.
    if (!next) reset();
    onOpenChange(next);
  }

  /** Vuelve al paso 1 (con una vista previa nueva si `reload`; con otra clave si ya se intentó aplicar). */
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

  function retryRefresh() {
    setRefreshError(null);
    setRefreshKey((k) => k + 1);
  }

  const fresh = current && current.key === selectionKey ? current.preview : null;
  const refreshing = base !== null && selected !== null && selected.size > 0 && fresh === null && !refreshError;
  const outcome = fresh ? repricingOutcome(fresh, { expired }) : null;
  const ready = fresh !== null && selected !== null && selected.size > 0 && outcome !== null && outcome !== 'nothing';

  let hint: string | null = null;
  if (base && selected) {
    if (base.lines.length === 0) hint = repricePlanCopy.hintNoLines;
    else if (selected.size === 0) hint = repricePlanCopy.hintEmpty;
    else if (refreshing) hint = repricePlanCopy.refreshing;
    else if (fresh && outcome === 'nothing') {
      hint = expired && !fresh.validityRenewed ? repricePlanCopy.hintPartialExpired : repricePlanCopy.hintNothing;
    } else if (fresh && outcome === 'renew' && fresh.validity) {
      hint = repricePlanCopy.hintRenew(stamp.civilDate(fresh.validity.validUntil, locationId));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !fresh || submitting) return;
    if (step === 0) {
      setStep(1);
      return;
    }
    if (!armed || stale || blocked) return;
    const seq = openSeqRef.current;
    setSubmitting(true);
    setSubmitError(null);
    attemptedRef.current = true;
    try {
      const result = await applyRepricing(
        tokenRef.current,
        patientId,
        plan.id,
        {
          previewHash: fresh.previewHash,
          ...(current?.key === ALL ? {} : { itemIds: [...(selected ?? [])].sort() }),
        },
        idempotencyKey,
      );
      // `replayed: true` es lo ya aplicado con esta clave: también es éxito.
      toast.success(
        result.lines.some((line) => line.changed) ? repricePlanCopy.success : repricePlanCopy.successRenewed,
      );
      onRepriced(result);
      setSubmitting(false);
      if (seq === openSeqRef.current) {
        reset();
        onOpenChange(false);
      }
      return;
    } catch (err) {
      if (seq !== openSeqRef.current) return;
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
        // Un fallo de red o 5xx se reenvía con la MISMA clave (si ya se aplicó, vuelve `replayed`).
        setBlocked(isFinalClientError(err));
      }
    }
    setSubmitting(false);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title={repricePlanCopy.title}
      description={repricePlanCopy.description}
      onSubmit={handleSubmit}
      submitLabel={
        step === 0 ? repricePlanCopy.next : outcome === 'renew' ? repricePlanCopy.submitRenew : repricePlanCopy.submit
      }
      submitting={submitting}
      submitDisabled={!ready || blocked || stale || (step === 1 && !armed)}
      submitBusy={refreshing}
      submitHint={step === 0 && base ? hint : undefined}
      hideSubmit={loadError !== null}
      lockCloseWhileSubmitting
      // I-2: el fallo de una vista previa con casillas se nombra en el modal (escalón 4) con su reintento.
      error={submitError ?? (step === 0 ? (refreshError?.message ?? null) : null)}
      errorRetry={
        !submitError && step === 0 && refreshError?.retryable
          ? { label: repricePlanCopy.retry, onRetry: retryRefresh }
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
          disabled={submitting}
          onStepChange={(i) => {
            if (submitting) return;
            // M-1: tras STALE, volver por el paso también pide una vista previa nueva.
            if (i === 0 && step === 1) backToPreview({ reload: stale });
            else if (i === 1 && ready) setStep(1);
          }}
        >
          {step === 0 ? (
            <PreviewStep
              base={base}
              preview={fresh ?? current?.preview ?? base}
              fresh={fresh !== null}
              expired={expired}
              selected={selected}
              onToggle={(itemId, checked) => {
                setRefreshError(null);
                setSubmitError(null);
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
              expired={expired}
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

/** El aviso de una vista previa que no renueva; en un plan vencido dice también que sigue vencido. */
function validityNoteText(preview: RepricingPreview, expired: boolean): string | null {
  if (!preview.validityNote) return null;
  return expired ? `${preview.validityNote} ${repricePlanCopy.stillExpired}` : preview.validityNote;
}

function ValidityLine({
  preview,
  expired,
  stamp,
  locationId,
}: {
  preview: RepricingPreview;
  expired: boolean;
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
  const note = validityNoteText(preview, expired);
  // Un aviso, no un error: la selección parcial es válida, solo no renueva.
  return note ? <Callout tone="warning">{note}</Callout> : null;
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
  /** El presupuesto está vencido (`quoteExpired`). */
  expired: boolean;
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
  expired,
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
            // I-4: la caja mide 20 px en táctil; la etiqueta que la envuelve da los 44 px.
            <label
              data-testid="reprice-line-select"
              className="-my-2 -ml-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center"
            >
              <Checkbox
                aria-label={repricePlanCopy.select(name(row))}
                checked={selected.has(row.itemId)}
                onChange={(e) => onToggle(row.itemId, e.target.checked)}
              />
            </label>
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

      {fresh ? <ValidityLine preview={preview} expired={expired} stamp={stamp} locationId={locationId} /> : null}
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
  expired,
  stamp,
  locationId,
  onBack,
  disabled,
}: {
  preview: RepricingPreview;
  count: number;
  expired: boolean;
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
      {validityNoteText(preview, expired) ? <Callout tone="warning">{validityNoteText(preview, expired)}</Callout> : null}
      <div>
        <Button type="button" variant="secondary" onClick={onBack} disabled={disabled}>
          {repricePlanCopy.back}
        </Button>
      </div>
    </div>
  );
}
