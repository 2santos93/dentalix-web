'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { parseDecimalInput, parseMoneyInput } from '@/lib/format/money';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import {
  applyCatalogPriceChange,
  IDEMPOTENCY_KEY_REUSED,
  PRICE_CHANGE_PREVIEW_STALE,
  PRICE_CHANGE_ROUNDING_UNITS,
  previewCatalogPriceChange,
  type AppliedCatalogPriceChange,
  type CatalogPriceChangeInput,
  type CatalogPriceChangeLine,
  type CatalogPriceChangePreview,
  type CatalogPriceChangeSkip,
  type CatalogPriceChangeSkipReason,
  type PriceChangeRoundingUnit,
} from '@/lib/catalog/price-changes-api';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { statusLabel, statusTone, TONE_CLASSES } from '@/lib/status/tones';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { FieldError } from '@/components/errors/field-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Wizard } from '@/components/ui/wizard';
import { cn } from '@/lib/utils';

type Direction = 'UP' | 'DOWN';
type Mode = 'PERCENT' | 'AMOUNT';
type KindFilter = 'ALL' | 'PROCEDURE' | 'DIAGNOSIS';
type Rounding = 'NONE' | `${(typeof PRICE_CHANGE_ROUNDING_UNITS)[number]}`;

export const priceChangeCopy = {
  title: 'Actualizar precios',
  description:
    'Sube o baja en bloque el precio por defecto de los procedimientos del catálogo. Los planes y presupuestos ya creados conservan su precio.',
  steps: { criteria: 'Filtros y cambio', preview: 'Vista previa', confirm: 'Confirmar' },
  // Paso 1
  categoryLabel: 'Categoría',
  categoryAll: 'Todas las categorías',
  categoriesLoading: 'Cargando categorías…',
  categoriesError: 'Categorías no disponibles',
  kindLabel: 'Tipo',
  kindAll: 'Todos los tipos',
  kindProcedure: 'Procedimientos',
  kindDiagnosis: 'Diagnósticos',
  activeOnly: 'Solo ítems activos',
  priceBelowLabel: 'Solo si el precio es menor que',
  priceBelowHint: 'Opcional. Los ítems sin precio no entran.',
  directionLabel: 'Cambio',
  up: 'Subir',
  down: 'Bajar',
  modeLabel: 'Cómo',
  percent: 'Porcentaje',
  amount: 'Importe fijo',
  percentLabel: 'Porcentaje (%)',
  amountLabel: 'Importe',
  roundingLabel: 'Redondeo',
  roundingNone: 'Sin redondeo (céntimos)',
  roundingTo: (unit: string) => `Al ${unit} más cercano`,
  roundingHint: 'Al múltiplo más cercano en la moneda del catálogo. Nunca baja de 0.',
  minIncrementLabel: 'Subida mínima',
  minIncrementHint: 'Opcional. Si el cambio sube menos que esto, sube esto (redondeado hacia arriba).',
  valueRequired: 'Escribe cuánto cambia el precio.',
  percentInvalid: 'Escribe un porcentaje mayor que 0, con hasta 2 decimales.',
  percentTooHigh: 'Un porcentaje de bajada no puede pasar de 100.',
  percentMax: 'El porcentaje no puede pasar de 1.000.',
  // Paso 2
  loading: 'Calculando la vista previa…',
  loadError: 'No pudimos calcular la vista previa.',
  emptyTitle: 'Ningún ítem cumple el filtro',
  emptyDescription: 'Cambia la categoría, el tipo o el precio máximo y vuelve a intentarlo.',
  nothingTitle: 'Ningún precio cambia',
  nothingDescription: 'Los ítems que cumplen el filtro quedarían igual: revisa el cambio o el redondeo.',
  changeFilters: 'Cambiar los filtros',
  linesLabel: 'Precios que cambian',
  item: 'Prestación',
  before: 'Anterior',
  after: 'Nuevo',
  difference: 'Diferencia',
  mobileBefore: (amount: string) => `Anterior ${amount}`,
  mobileAfter: (amount: string) => `Nuevo ${amount}`,
  skippedHeading: 'No cambian',
  skippedReason: {
    NO_PRICE: 'No tiene precio por defecto.',
    UNCHANGED: 'Con este redondeo queda igual.',
    OUT_OF_RANGE: 'El precio nuevo pasaría del máximo permitido.',
  } satisfies Record<CatalogPriceChangeSkipReason, string>,
  totalsLabel: 'Totales',
  totalBefore: 'Total anterior',
  totalAfter: 'Total nuevo',
  // Paso 3
  confirmLabel: 'Resumen de la actualización',
  confirmItems: 'Precios',
  confirmCount: (n: number) => (n === 1 ? '1 precio' : `${n} precios`),
  confirmTotal: 'Total',
  confirmTotalChange: (before: string, after: string) => `${before} → ${after}`,
  frozenNote:
    'Los planes y presupuestos ya creados conservan su precio. Los ítems que se agreguen desde ahora tomarán el precio nuevo.',
  back: 'Volver a la vista previa',
  next: 'Ver vista previa',
  continue: 'Continuar',
  submit: (n: number) => (n === 1 ? 'Aplicar 1 precio' : `Aplicar ${n} precios`),
  retry: 'Reintentar',
  reloadPreview: 'Ver la vista previa de nuevo',
  success: (n: number) => (n === 1 ? '1 precio actualizado' : `${n} precios actualizados`),
  genericError: 'No pudimos aplicar los precios. Intenta de nuevo.',
};

/** Un UUID por vista previa (`Idempotency-Key`); `crypto.randomUUID` solo existe en contextos seguros. */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

/**
 * Tras «Continuar», el submit del paso 3 no responde hasta pasado este tiempo:
 * es el MISMO botón del pie, y un doble clic aplicaría sin ver la confirmación.
 */
export const PRICE_CHANGE_CONFIRM_ARM_MS = 400;

/** Un error del que no se sale reintentando lo mismo. */
function isFinalClientError(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
}

interface CriteriaErrors {
  value?: string;
  priceBelow?: string;
  minIncrement?: string;
}

interface PriceChangeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Moneda del catálogo (la de los precios por defecto); `null` si no se sabe. */
  currency: string | null;
  stamp: SedePainters;
  /** Tras aplicar (o repetir lo ya aplicado): el padre recarga el catálogo. */
  onApplied: (result: AppliedCatalogPriceChange) => void;
}

/**
 * «Actualizar precios» del catálogo (DX-205), solo ADMIN: tres pasos.
 * 1. Filtros (categoría, tipo, solo activos, «precio menor que») y cambio
 *    (subir/bajar, % o importe fijo, redondeo, subida mínima).
 * 2. Vista previa de la API: anterior / nuevo / diferencia, los que no
 *    cambian y por qué, y los totales. En el teléfono, tarjetas (`DataList`).
 * 3. Confirmar: aplica con la huella de la vista previa y una Idempotency-Key
 *    por vista previa. Nada se calcula aquí: los precios los da la API, que
 *    usa la misma función en la vista previa y al aplicar.
 */
export function PriceChangeWizard({ open, onOpenChange, token, currency, stamp, onApplied }: PriceChangeWizardProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [armed, setArmed] = useState(false);

  // Paso 1
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [activeOnly, setActiveOnly] = useState(true);
  const [priceBelow, setPriceBelow] = useState('');
  const [direction, setDirection] = useState<Direction>('UP');
  const [mode, setMode] = useState<Mode>('PERCENT');
  const [valueText, setValueText] = useState('');
  const [rounding, setRounding] = useState<Rounding>('NONE');
  const [minIncrement, setMinIncrement] = useState('');
  const [errors, setErrors] = useState<CriteriaErrors>({});
  const [categories, setCategories] = useState<string[] | null>(null);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [categoriesKey, setCategoriesKey] = useState(0);

  // Paso 2
  const [input, setInput] = useState<CatalogPriceChangeInput | null>(null);
  const [preview, setPreview] = useState<CatalogPriceChangePreview | null>(null);
  const [previewError, setPreviewError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // Paso 3
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // Cada apertura tiene su número: lo que llegue de una anterior no pinta nada.
  const openSeqRef = useRef(0);
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Las categorías del catálogo (las que existen, sin repetir) para el filtro.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listCatalogItems(tokenRef.current)
      .then((items) => {
        if (cancelled) return;
        const names = new Map<string, string>();
        for (const item of items) {
          const name = item.category?.trim();
          if (name && !names.has(name.toLocaleLowerCase('es'))) names.set(name.toLocaleLowerCase('es'), name);
        }
        setCategories([...names.values()].sort((a, b) => a.localeCompare(b, 'es')));
        setCategoriesFailed(false);
      })
      .catch(() => {
        if (!cancelled) setCategoriesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, categoriesKey]);

  // La vista previa de los criterios del paso 1 (cada una con su clave nueva).
  useEffect(() => {
    if (!open || input === null) return;
    let cancelled = false;
    previewCatalogPriceChange(tokenRef.current, input)
      .then((res) => {
        if (cancelled) return;
        setPreview(res);
        setPreviewError(null);
        setIdempotencyKey(newIdempotencyKey());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreviewError({
          message: apiErrorMessage(err, priceChangeCopy.loadError),
          retryable: !isFinalClientError(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, input, previewKey]);

  // El paso 3 se arma tras pintarse y una pausa.
  useEffect(() => {
    if (step !== 2) return;
    const timer = setTimeout(() => setArmed(true), PRICE_CHANGE_CONFIRM_ARM_MS);
    return () => {
      clearTimeout(timer);
      setArmed(false);
    };
  }, [step]);

  function reset() {
    openSeqRef.current += 1;
    setStep(0);
    setCategory('');
    setKind('ALL');
    setActiveOnly(true);
    setPriceBelow('');
    setDirection('UP');
    setMode('PERCENT');
    setValueText('');
    setRounding('NONE');
    setMinIncrement('');
    setErrors({});
    setInput(null);
    setPreview(null);
    setPreviewError(null);
    setSubmitError(null);
    setStale(false);
    setBlocked(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next && submitting) return;
    if (!next) reset();
    onOpenChange(next);
  }

  /** Lee el paso 1; con errores, los pinta junto a su campo y devuelve null. */
  function readCriteria(): CatalogPriceChangeInput | null {
    const next: CriteriaErrors = {};
    const money = currency ?? '';
    let value: number | null = null;
    if (valueText.trim() === '') next.value = priceChangeCopy.valueRequired;
    else if (mode === 'PERCENT') {
      const parsed = parseDecimalInput(valueText, 2);
      if (!parsed.ok || parsed.value <= 0) next.value = priceChangeCopy.percentInvalid;
      else if (direction === 'DOWN' && parsed.value > 100) next.value = priceChangeCopy.percentTooHigh;
      else if (parsed.value > 1000) next.value = priceChangeCopy.percentMax;
      else value = parsed.value;
    } else {
      const parsed = parseMoneyInput(valueText, money);
      if (!parsed.ok) next.value = parsed.message;
      else if (parsed.value <= 0) next.value = priceChangeCopy.valueRequired;
      else value = parsed.value;
    }
    let below: number | undefined;
    if (priceBelow.trim() !== '') {
      const parsed = parseMoneyInput(priceBelow, money);
      if (!parsed.ok) next.priceBelow = parsed.message;
      else if (parsed.value > 0) below = parsed.value;
    }
    let min: number | undefined;
    if (direction === 'UP' && minIncrement.trim() !== '') {
      const parsed = parseMoneyInput(minIncrement, money);
      if (!parsed.ok) next.minIncrement = parsed.message;
      else if (parsed.value > 0) min = parsed.value;
    }
    setErrors(next);
    if (value === null || Object.keys(next).length > 0) return null;
    return {
      ...(category ? { category } : {}),
      ...(kind !== 'ALL' ? { kind } : {}),
      activeOnly,
      ...(below !== undefined ? { priceBelow: below } : {}),
      mode,
      value: direction === 'DOWN' ? -value : value,
      ...(rounding !== 'NONE' ? { roundTo: Number(rounding) as PriceChangeRoundingUnit } : {}),
      ...(min !== undefined ? { minIncrement: min } : {}),
    };
  }

  /** Vuelve a pedir la vista previa de los mismos criterios (clave nueva al llegar). */
  function reloadPreview() {
    setPreview(null);
    setPreviewError(null);
    setStale(false);
    setBlocked(false);
    setSubmitError(null);
    setStep(1);
    setPreviewKey((k) => k + 1);
  }

  function backToCriteria() {
    setStep(0);
    setSubmitError(null);
    setStale(false);
    setBlocked(false);
  }

  const lines = preview?.lines ?? [];
  const ready = preview !== null && lines.length > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (step === 0) {
      const criteria = readCriteria();
      if (!criteria) return;
      setPreview(null);
      setPreviewError(null);
      setInput(criteria);
      setPreviewKey((k) => k + 1);
      setStep(1);
      return;
    }
    if (step === 1) {
      if (ready) setStep(2);
      return;
    }
    if (!armed || stale || blocked || !preview || !input) return;
    const seq = openSeqRef.current;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await applyCatalogPriceChange(
        tokenRef.current,
        { ...input, previewHash: preview.previewHash },
        idempotencyKey,
      );
      // `replayed: true` es lo ya aplicado con esta clave: también es éxito.
      toast.success(priceChangeCopy.success(result.itemCount));
      onApplied(result);
      setSubmitting(false);
      if (seq === openSeqRef.current) {
        reset();
        onOpenChange(false);
      }
      return;
    } catch (err) {
      if (seq !== openSeqRef.current) return;
      const message = apiErrorMessage(err, priceChangeCopy.genericError);
      if (err instanceof ApiError && (err.code === PRICE_CHANGE_PREVIEW_STALE || err.code === IDEMPOTENCY_KEY_REUSED)) {
        // El catálogo cambió (o la clave ya sirvió): solo vale una vista previa nueva.
        setStale(true);
        setSubmitError(message);
      } else {
        setSubmitError(message);
        // Un fallo de red o un 5xx se reenvía con la MISMA clave (si ya se aplicó, vuelve `replayed`).
        setBlocked(isFinalClientError(err));
      }
    }
    setSubmitting(false);
  }

  const money = (amount: number) => (currency ? stamp.money(amount, currency) : stamp.fmt ? stamp.fmt.number(amount, { min: 2, max: 2 }) : '—');
  const loadingPreview = step >= 1 && preview === null && previewError === null;

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title={priceChangeCopy.title}
      description={priceChangeCopy.description}
      onSubmit={handleSubmit}
      submitLabel={
        step === 0 ? priceChangeCopy.next : step === 1 ? priceChangeCopy.continue : priceChangeCopy.submit(lines.length)
      }
      submitting={submitting}
      submitDisabled={step === 1 ? !ready : step === 2 ? !ready || stale || blocked || !armed : false}
      submitBusy={loadingPreview}
      hideSubmit={step === 1 && (previewError !== null || (preview !== null && lines.length === 0))}
      lockCloseWhileSubmitting
      error={submitError}
      errorAction={stale ? { label: priceChangeCopy.reloadPreview, onAction: reloadPreview } : null}
      size="lg"
      touchTargets
    >
      <Wizard
        steps={[
          { key: 'criteria', label: priceChangeCopy.steps.criteria },
          { key: 'preview', label: priceChangeCopy.steps.preview },
          { key: 'confirm', label: priceChangeCopy.steps.confirm },
        ]}
        current={step}
        disabled={submitting}
        onStepChange={(i) => {
          if (submitting) return;
          if (i === 0) backToCriteria();
          else if (i === 1 && input !== null) {
            if (stale) reloadPreview();
            else {
              setStep(1);
              setSubmitError(null);
            }
          } else if (i === 2 && ready && step === 1) setStep(2);
        }}
      >
        {step === 0 ? (
          <CriteriaStep
            currency={currency}
            stamp={stamp}
            categories={categories}
            categoriesFailed={categoriesFailed}
            onRetryCategories={() => {
              setCategoriesFailed(false);
              setCategories(null);
              setCategoriesKey((k) => k + 1);
            }}
            category={category}
            onCategory={setCategory}
            kind={kind}
            onKind={setKind}
            activeOnly={activeOnly}
            onActiveOnly={setActiveOnly}
            priceBelow={priceBelow}
            onPriceBelow={(text) => {
              setPriceBelow(text);
              setErrors((e) => ({ ...e, priceBelow: undefined }));
            }}
            direction={direction}
            onDirection={setDirection}
            mode={mode}
            onMode={(next) => {
              setMode(next);
              setErrors((e) => ({ ...e, value: undefined }));
            }}
            valueText={valueText}
            onValue={(text) => {
              setValueText(text);
              setErrors((e) => ({ ...e, value: undefined }));
            }}
            rounding={rounding}
            onRounding={setRounding}
            minIncrement={minIncrement}
            onMinIncrement={(text) => {
              setMinIncrement(text);
              setErrors((e) => ({ ...e, minIncrement: undefined }));
            }}
            errors={errors}
          />
        ) : step === 1 ? (
          previewError ? (
            <SectionError
              description={previewError.message}
              onRetry={previewError.retryable ? reloadPreview : undefined}
              secondaryAction={
                <Button type="button" variant="outline" size="sm" onClick={backToCriteria}>
                  {priceChangeCopy.changeFilters}
                </Button>
              }
            />
          ) : preview === null ? (
            <div role="status" className="flex flex-col gap-2" data-testid="price-change-loading">
              <span className="sr-only">{priceChangeCopy.loading}</span>
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          ) : (
            <PreviewStep preview={preview} money={money} onChangeFilters={backToCriteria} />
          )
        ) : preview ? (
          <ConfirmStep preview={preview} money={money} onBack={() => setStep(1)} disabled={submitting} />
        ) : null}
      </Wizard>
    </FormModal>
  );
}

interface CriteriaStepProps {
  currency: string | null;
  stamp: SedePainters;
  categories: string[] | null;
  categoriesFailed: boolean;
  onRetryCategories: () => void;
  category: string;
  onCategory: (v: string) => void;
  kind: KindFilter;
  onKind: (v: KindFilter) => void;
  activeOnly: boolean;
  onActiveOnly: (v: boolean) => void;
  priceBelow: string;
  onPriceBelow: (v: string) => void;
  direction: Direction;
  onDirection: (v: Direction) => void;
  mode: Mode;
  onMode: (v: Mode) => void;
  valueText: string;
  onValue: (v: string) => void;
  rounding: Rounding;
  onRounding: (v: Rounding) => void;
  minIncrement: string;
  onMinIncrement: (v: string) => void;
  errors: CriteriaErrors;
}

function CriteriaStep(props: CriteriaStepProps) {
  const { currency, stamp, errors } = props;
  // «100 VES»: la unidad en el formato de la sede, con el código de la moneda del catálogo.
  const unitText = (unit: number) => {
    const n = stamp.fmt ? stamp.fmt.number(unit, { min: 0, max: 0 }) : String(unit);
    return currency ? `${n} ${currency}` : n;
  };
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="price-change-category" label={priceChangeCopy.categoryLabel}>
          {props.categoriesFailed ? (
            <FieldError
              label={priceChangeCopy.categoriesError}
              onRetry={props.onRetryCategories}
              retryId="price-change-category"
              className="h-11 sm:h-10"
            />
          ) : props.categories === null ? (
            <p id="price-change-category" role="status" className="flex h-11 items-center text-sm text-muted sm:h-10">
              {priceChangeCopy.categoriesLoading}
            </p>
          ) : (
            <NativeSelect
              id="price-change-category"
              value={props.category}
              onChange={(e) => props.onCategory(e.target.value)}
            >
              <option value="">{priceChangeCopy.categoryAll}</option>
              {props.categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField htmlFor="price-change-kind" label={priceChangeCopy.kindLabel}>
          <NativeSelect
            id="price-change-kind"
            value={props.kind}
            onChange={(e) => props.onKind(e.target.value as KindFilter)}
          >
            <option value="ALL">{priceChangeCopy.kindAll}</option>
            <option value="PROCEDURE">{priceChangeCopy.kindProcedure}</option>
            <option value="DIAGNOSIS">{priceChangeCopy.kindDiagnosis}</option>
          </NativeSelect>
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          htmlFor="price-change-below"
          label={priceChangeCopy.priceBelowLabel}
          hint={priceChangeCopy.priceBelowHint}
          error={errors.priceBelow}
        >
          <MoneyInput
            id="price-change-below"
            money={stamp.money}
            currency={currency ?? ''}
            value={props.priceBelow}
            onValueChange={props.onPriceBelow}
            aria-invalid={errors.priceBelow ? true : undefined}
            aria-describedby={errors.priceBelow ? fieldErrorId('price-change-below') : undefined}
          />
        </FormField>
        <div className="flex items-end pb-1">
          <Checkbox
            id="price-change-active-only"
            checked={props.activeOnly}
            onChange={(e) => props.onActiveOnly(e.target.checked)}
            label={priceChangeCopy.activeOnly}
          />
        </div>
      </div>

      <div className="grid gap-4 border-t border-border-subtle pt-5 sm:grid-cols-2">
        <FormField htmlFor="price-change-direction" label={priceChangeCopy.directionLabel}>
          <SegmentedControl
            id="price-change-direction"
            aria-label={priceChangeCopy.directionLabel}
            value={props.direction}
            onValueChange={props.onDirection}
            options={[
              { value: 'UP', label: priceChangeCopy.up },
              { value: 'DOWN', label: priceChangeCopy.down },
            ]}
            fullWidthOnMobile
          />
        </FormField>
        <FormField htmlFor="price-change-mode" label={priceChangeCopy.modeLabel}>
          <SegmentedControl
            id="price-change-mode"
            aria-label={priceChangeCopy.modeLabel}
            value={props.mode}
            onValueChange={props.onMode}
            options={[
              { value: 'PERCENT', label: priceChangeCopy.percent },
              { value: 'AMOUNT', label: priceChangeCopy.amount },
            ]}
            fullWidthOnMobile
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          htmlFor="price-change-value"
          label={props.mode === 'PERCENT' ? priceChangeCopy.percentLabel : priceChangeCopy.amountLabel}
          error={errors.value}
        >
          {props.mode === 'PERCENT' ? (
            <Input
              id="price-change-value"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={props.valueText}
              onChange={(e) => props.onValue(e.target.value)}
              aria-invalid={errors.value ? true : undefined}
              aria-describedby={errors.value ? fieldErrorId('price-change-value') : undefined}
            />
          ) : (
            <MoneyInput
              id="price-change-value"
              money={stamp.money}
              currency={currency ?? ''}
              value={props.valueText}
              onValueChange={props.onValue}
              aria-invalid={errors.value ? true : undefined}
              aria-describedby={errors.value ? fieldErrorId('price-change-value') : undefined}
            />
          )}
        </FormField>
        <FormField htmlFor="price-change-rounding" label={priceChangeCopy.roundingLabel} hint={priceChangeCopy.roundingHint}>
          <NativeSelect
            id="price-change-rounding"
            value={props.rounding}
            onChange={(e) => props.onRounding(e.target.value as Rounding)}
          >
            <option value="NONE">{priceChangeCopy.roundingNone}</option>
            {PRICE_CHANGE_ROUNDING_UNITS.map((unit) => (
              <option key={unit} value={String(unit)}>
                {priceChangeCopy.roundingTo(unitText(unit))}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {props.direction === 'UP' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            htmlFor="price-change-min"
            label={priceChangeCopy.minIncrementLabel}
            hint={priceChangeCopy.minIncrementHint}
            error={errors.minIncrement}
          >
            <MoneyInput
              id="price-change-min"
              money={stamp.money}
              currency={currency ?? ''}
              value={props.minIncrement}
              onValueChange={props.onMinIncrement}
              aria-invalid={errors.minIncrement ? true : undefined}
              aria-describedby={errors.minIncrement ? fieldErrorId('price-change-min') : undefined}
            />
          </FormField>
        </div>
      ) : null}
    </div>
  );
}

/** «Sube 60,00 VES» / «Baja …» / «Sin cambio»: el color nunca es la única pista. */
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

function itemName(row: { labelEs: string }): string {
  return row.labelEs;
}

function PreviewStep({
  preview,
  money,
  onChangeFilters,
}: {
  preview: CatalogPriceChangePreview;
  money: (amount: number) => string;
  onChangeFilters: () => void;
}) {
  const columns: DataListColumn<CatalogPriceChangeLine>[] = [
    {
      id: 'item',
      header: priceChangeCopy.item,
      mobile: 'primary',
      cell: (row) => (
        <span className="block min-w-0 break-words">
          <span className="block text-ink">{itemName(row)}</span>
          <span className="block t-id text-muted">{row.code}</span>
        </span>
      ),
    },
    {
      id: 'before',
      header: priceChangeCopy.before,
      numeric: true,
      cell: (row) => money(row.before),
      mobileCell: (row) => priceChangeCopy.mobileBefore(money(row.before)),
    },
    {
      id: 'after',
      header: priceChangeCopy.after,
      numeric: true,
      cell: (row) => money(row.after),
      mobileCell: (row) => priceChangeCopy.mobileAfter(money(row.after)),
    },
    {
      id: 'difference',
      header: priceChangeCopy.difference,
      numeric: true,
      mobile: 'trailing',
      cell: (row) => <DifferenceText amount={row.difference} money={money} />,
    },
  ];

  if (preview.lines.length === 0 && preview.skipped.length === 0) {
    return (
      <EmptyState
        title={priceChangeCopy.emptyTitle}
        description={priceChangeCopy.emptyDescription}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onChangeFilters}>
            {priceChangeCopy.changeFilters}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {preview.lines.length > 0 ? (
        <>
          <DataList
            label={priceChangeCopy.linesLabel}
            rows={preview.lines}
            columns={columns}
            getRowKey={(row) => row.itemId}
          />
          <section
            aria-label={priceChangeCopy.totalsLabel}
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <DescriptionList columns={3}>
              <DescriptionItem label={priceChangeCopy.totalBefore} numeric>
                {money(preview.totals.before)}
              </DescriptionItem>
              <DescriptionItem label={priceChangeCopy.totalAfter} numeric>
                {money(preview.totals.after)}
              </DescriptionItem>
              <DescriptionItem label={priceChangeCopy.difference} numeric>
                <DifferenceText amount={preview.totals.difference} money={money} />
              </DescriptionItem>
            </DescriptionList>
          </section>
        </>
      ) : (
        <EmptyState
          title={priceChangeCopy.nothingTitle}
          description={priceChangeCopy.nothingDescription}
          action={
            <Button type="button" variant="outline" size="sm" onClick={onChangeFilters}>
              {priceChangeCopy.changeFilters}
            </Button>
          }
        />
      )}
      {preview.skipped.length > 0 ? <SkippedList skipped={preview.skipped} money={money} /> : null}
    </div>
  );
}

function SkippedList({ skipped, money }: { skipped: CatalogPriceChangeSkip[]; money: (amount: number) => string }) {
  return (
    <section aria-labelledby="price-change-skipped-heading" className="flex flex-col gap-2">
      <h3 id="price-change-skipped-heading" className="t-label text-ink">
        {priceChangeCopy.skippedHeading}
      </h3>
      <ul className="divide-y divide-border-subtle rounded-lg border border-border text-sm">
        {skipped.map((skip) => (
          <li key={skip.itemId} className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
            <span className="break-words text-ink">
              {itemName(skip)}
              <span className="t-id text-muted"> · {skip.code}</span>
              {skip.before != null ? <span className="text-muted tabular-nums"> · {money(skip.before)}</span> : null}
            </span>
            <span className="break-words text-muted">{priceChangeCopy.skippedReason[skip.reason]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConfirmStep({
  preview,
  money,
  onBack,
  disabled,
}: {
  preview: CatalogPriceChangePreview;
  money: (amount: number) => string;
  onBack: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-label={priceChangeCopy.confirmLabel} className="rounded-lg border border-border p-4">
        <DescriptionList columns={1} layout="inline">
          <DescriptionItem label={priceChangeCopy.confirmItems} numeric>
            {priceChangeCopy.confirmCount(preview.lines.length)}
          </DescriptionItem>
          <DescriptionItem label={priceChangeCopy.confirmTotal} numeric>
            {priceChangeCopy.confirmTotalChange(money(preview.totals.before), money(preview.totals.after))}
          </DescriptionItem>
          <DescriptionItem label={priceChangeCopy.difference} numeric>
            <DifferenceText amount={preview.totals.difference} money={money} />
          </DescriptionItem>
        </DescriptionList>
      </section>
      <Callout tone="info">{priceChangeCopy.frozenNote}</Callout>
      <div>
        <Button type="button" variant="secondary" onClick={onBack} disabled={disabled}>
          {priceChangeCopy.back}
        </Button>
      </div>
    </div>
  );
}
