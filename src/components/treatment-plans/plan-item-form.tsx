'use client';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeMoney } from '@/lib/format/sede-number';
import { isFdiToothNumber } from '@/lib/odontogram/fdi';
import type { DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import { SURFACE_LABELS, SURFACE_ORDER } from '@/lib/odontogram/surface-labels';
import {
  NO_DISCOUNT_ALLOWED_NOTICE,
  PRICE_BELOW_CATALOG_NOTICE,
  capFor,
  effectiveDiscount,
  exceedsCap,
  needsReason,
  noDiscountAllowed,
  priceBelowCatalogCapMessage,
  roleCapMessage,
  type DiscountRules,
} from '@/lib/discounts/discount-rules';
import type { ClinicRole } from '@/lib/me/me-api';
import {
  addItem,
  type AddTreatmentPlanItemInput,
  type TreatmentPlan,
} from '@/lib/treatment-plans/treatment-plans-api';
import { usePriceQuote } from '@/lib/treatment-plans/use-price-quote';
import { formatListPrice, sedeListPriceFormat } from '@/lib/treatment-plans/list-price';
import {
  DiscountReasonFields,
  EMPTY_REASON,
  reasonPayload,
  validateDiscountReason,
  type DiscountReasonValue,
} from '@/components/discounts/discount-reason-fields';
import { CatalogPicker } from '@/components/odontogram/catalog-picker';
import { ToothPicker } from '@/components/odontogram/tooth-picker';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SectionHeader } from '@/components/ui/section-header';
import { Textarea } from '@/components/ui/textarea';
import { PriceQuoteLine } from './price-quote-line';
import { copy, emptySurfacesState, optionalAmount, unreadableReason } from './treatment-plans-tab-copy';

interface PlanItemFormProps {
  token: string;
  patientId: string;
  /** El plan (con detalle) al que se agrega el ítem; su moneda es la del precio. */
  plan: TreatmentPlan;
  /** Procedimientos ACTIVOS del catálogo (el selector solo ofrece estos). */
  catalogItems: DentalCatalogItem[];
  /** Todo el catálogo por id (precio de catálogo de respaldo). */
  catalogById: Map<string, DentalCatalogItem>;
  /** DX-204: política de descuentos para avisar antes de enviar; `null` = decide la API. */
  discountRules: DiscountRules | null;
  role: ClinicRole | null;
  /** DX-489: formato de la sede, el de los demás importes del plan; `null` mientras carga («—»). */
  fmt: RegionalFormat | null;
  /** Tras agregar: refresca el plan y el saldo (y se espera antes de reactivar el botón). */
  onAdded: () => Promise<unknown>;
  /** D2: ¿«Agregar ítem» es LA primaria de la vista? Si no, secundario. */
  submitPrimary?: boolean;
}

/**
 * «Agregar ítem» de la pestaña del plan. Vive en su propio componente con su
 * estado: la pestaña lo monta con `key={plan.id}`, así que cambiar de plan
 * empieza un formulario limpio (antes lo reseteaba la pestaña campo a campo).
 */
export function PlanItemForm({
  token,
  patientId,
  plan,
  catalogItems,
  catalogById,
  discountRules,
  role,
  fmt,
  onAdded,
  submitPrimary = true,
}: PlanItemFormProps) {
  // Add-item form state.
  const [toothNumber, setToothNumber] = useState('');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [surfaces, setSurfaces] = useState<Record<ToothSurface, boolean>>(emptySurfacesState);
  const [notes, setNotes] = useState('');
  // DX-204: motivo del descuento del ítem nuevo, política de la clínica (para
  // avisar antes; la API la aplica) y la selección de «Descuento %».
  const [addReason, setAddReason] = useState<DiscountReasonValue>(EMPTY_REASON);
  const [addReasonErrors, setAddReasonErrors] = useState<{ reason?: string; note?: string } | null>(null);
  const [addItemSubmitting, setAddItemSubmitting] = useState(false);
  // DX-105: el usuario tocó el precio precargado; solo entonces se envía.
  const [priceEdited, setPriceEdited] = useState(false);
  const [addItemValidationError, setAddItemValidationError] = useState<string | null>(null);
  // DX-241: precio y descuento que no valen, junto a su campo (escalón 4).
  const [itemAmountErrors, setItemAmountErrors] = useState<{ price?: string; discount?: string }>({});
  const [addItemError, setAddItemError] = useState<string | null>(null);

  // DX-105: el precio resuelto de la prestación elegida para ESTE paciente
  // (convenio > lista de la sede > catálogo). Precarga el campo; si falla,
  // vuelve el precio de catálogo y el campo sigue editable.
  const priceQuote = usePriceQuote({
    token,
    patientId,
    catalogItemId,
    currency: plan.currency,
    onSettled: (q) => {
      if (q) {
        setPrice(q.price !== null ? String(q.price) : '');
        if (noDiscountAllowed(q)) setDiscount('');
      } else {
        const fallback = catalogById.get(catalogItemId)?.defaultPrice;
        setPrice(fallback != null ? String(fallback) : '');
      }
      setPriceEdited(false);
    },
  });
  const quoteReady = priceQuote.status === 'ready' ? priceQuote.quote : null;
  // DX-502: la moneda del catálogo la dice la API (la común de TODAS las sedes
  // activas, no solo las del usuario); sin precio resuelto, no se sabe.
  const catalogCurrency = quoteReady?.catalogCurrency ?? null;
  const addPriceLoading = priceQuote.status === 'loading';
  const addNoDiscount = noDiscountAllowed(quoteReady);
  // Referencia de la rebaja (R1): el precio resuelto, no el de catálogo.
  const referencePrice = quoteReady ? quoteReady.price : (catalogById.get(catalogItemId)?.defaultPrice ?? null);

  function handleProcedureChange(nextCatalogItemId: string) {
    setCatalogItemId(nextCatalogItemId);
    // Prefill (not lock) the price with the chosen procedure's default —
    // the field stays editable afterwards.
    // El precio resuelto del paciente llega de `usePriceQuote`; hasta
    // entonces el campo está en espera.
    const item = catalogById.get(nextCatalogItemId);
    setPrice(item?.defaultPrice != null ? String(item.defaultPrice) : '');
    setPriceEdited(false);
  }

  function handleSurfaceChange(surface: ToothSurface, checked: boolean) {
    setSurfaces((prev) => ({ ...prev, [surface]: checked }));
  }

  async function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddItemValidationError(null);
    setItemAmountErrors({});
    setAddItemError(null);

    const tooth = toothNumber.trim();
    if (!isFdiToothNumber(tooth)) {
      setAddItemValidationError(copy.invalidToothNumber);
      return;
    }
    if (!catalogItemId) {
      setAddItemValidationError(copy.selectProcedurePrompt);
      return;
    }

    const selectedSurfaces = SURFACE_ORDER.filter((s) => surfaces[s]);
    const itemCurrency = plan.currency;
    const priceInput = optionalAmount(price, itemCurrency);
    const discountInput = optionalAmount(discount, itemCurrency);
    // Lo que no se entiende dice por qué (la regla común de los importes).
    if (priceInput === null || discountInput === null) {
      setItemAmountErrors({
        price: priceInput === null ? copy.unreadablePrice(unreadableReason(price, itemCurrency)) : undefined,
        discount: discountInput === null ? copy.unreadableDiscount(unreadableReason(discount, itemCurrency)) : undefined,
      });
      return;
    }
    const discountValue = discountInput ?? 0;
    if (priceInput !== undefined && discountValue > priceInput) {
      setItemAmountErrors({ discount: copy.invalidDiscount });
      return;
    }
    // DX-105: una prestación sin descuentos no admite rebajar el precio
    // resuelto ni descontar; se dice aquí, sin llamar a la API.
    if (
      addNoDiscount &&
      (discountValue > 0 || (priceInput !== undefined && referencePrice !== null && priceInput < referencePrice))
    ) {
      setItemAmountErrors({
        [discountValue > 0 ? 'discount' : 'price']: NO_DISCOUNT_ALLOWED_NOTICE,
      });
      return;
    }
    // DX-204: tope del rol y motivo por encima del umbral, avisados aquí; la
    // API los vuelve a aplicar. SEC-041: sobre el descuento EFECTIVO, que
    // suma la rebaja del precio frente al de catálogo.
    setAddReasonErrors(null);
    const catalogPrice = referencePrice;
    const effectivePrice = priceInput ?? catalogPrice;
    const effective =
      effectivePrice !== null ? effectiveDiscount(catalogPrice, effectivePrice, discountValue) : null;
    if (discountRules && role && effective && exceedsCap(discountRules, role, effective.listPrice, effective.total)) {
      const cap = capFor(discountRules, role);
      setAddItemValidationError(
        effective.priceReduction > 0 ? priceBelowCatalogCapMessage(cap) : roleCapMessage(cap),
      );
      return;
    }
    const discounted = (effective?.total ?? discountValue) > 0;
    const reasonRequired =
      discountRules !== null && effective !== null && needsReason(discountRules, effective.listPrice, effective.total);
    const reasonProblems = discounted ? validateDiscountReason(addReason, reasonRequired) : null;
    if (reasonProblems) {
      setAddReasonErrors(reasonProblems);
      return;
    }

    setAddItemSubmitting(true);
    try {
      const input: AddTreatmentPlanItemInput = {
        toothNumber: tooth,
        catalogItemId,
        ...(selectedSurfaces.length ? { surfaces: selectedSurfaces } : {}),
        // DX-105: el precio resuelto lo vuelve a calcular la API; solo se
        // manda lo que el usuario escribió. Un fallo de vista previa tampoco
        // convierte el precio de catálogo precargado en un precio manual.
        ...(priceInput !== undefined && priceEdited ? { price: priceInput } : {}),
        ...(discountValue > 0 ? { discount: discountValue } : {}),
        ...(discounted ? reasonPayload(addReason) : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      await addItem(token, plan.id, input);
      setToothNumber('');
      setCatalogItemId('');
      setPrice('');
      setPriceEdited(false);
      setDiscount('');
      setAddReason(EMPTY_REASON);
      setSurfaces(emptySurfacesState());
      setNotes('');
      // DX-051: un ítem aceptado nuevo recibe los sobrantes del reparto.
      await onAdded();
    } catch (err) {
      // Un 400 (FDI inválido / precio obligatorio si el ítem del catálogo no
      // tiene defaultPrice) llega en inglés: apiErrorMessage lo dice en español.
      setAddItemError(apiErrorMessage(err, copy.genericAddItemError));
    } finally {
      setAddItemSubmitting(false);
    }
  }

  const addCurrency = plan.currency;
  const addDiscountInput = optionalAmount(discount, addCurrency);
  const addPriceInput = optionalAmount(price, addCurrency);
  const addDiscountValue = addDiscountInput ?? 0;
  const addCatalogPrice = referencePrice;
  const addPrice = addPriceInput ?? addCatalogPrice;
  // SEC-041: descuento efectivo = rebaja frente al catálogo + descuento. Con
  // un precio o descuento que no se entiende no hay aviso (el envío lo para).
  const addEffective =
    addPrice !== null && addDiscountInput !== null && addPriceInput !== null
      ? effectiveDiscount(addCatalogPrice, addPrice, addDiscountValue)
      : null;
  const addBelowCatalog = addEffective !== null && addEffective.priceReduction > 0;
  // DX-489: sin lista de precios en la moneda del plan, el precio de
  // referencia es el del catálogo, en su propia moneda: no se resta del plan.
  // B4 (DX-502): hasta que llega el precio resuelto no se sabe la moneda del
  // catálogo: no se pinta ni la rebaja ni la variante «en otra moneda».
  const catalogInOtherCurrency = quoteReady?.source === 'CATALOG' && catalogCurrency !== plan.currency;
  const addDiscounted = addEffective ? addEffective.total > 0 : addDiscountValue > 0;
  const addReasonRequired =
    discountRules !== null &&
    addEffective !== null &&
    needsReason(discountRules, addEffective.listPrice, addEffective.total);

  return (
    <form onSubmit={handleAddItem} aria-label={copy.addItemHeading} className="flex flex-col gap-4">
      <SectionHeader as="h3" title={copy.addItemHeading} />

      {/* El diente se TOCA en el mapa, no se transcribe de
          memoria: es el mismo `OdontogramChart` del tab de al
          lado. El campo de texto sigue ahí dentro del picker
          como segunda vía (más rápido si ya sabes el código, y
          único camino para un temporal, que el mapa no dibuja).
          Y el procedimiento usa el MISMO selector filtrado que
          el odontograma: antes esta era la peor afordancia de
          las dos —un selector nativo sobre el catálogo
          entero, sin filtro— y estaba justo en la vía del
          dinero. */}
      <ToothPicker
        inputId="tp-tooth-number"
        value={toothNumber}
        onChange={setToothNumber}
      />

      <CatalogPicker
        items={catalogItems}
        value={catalogItemId || null}
        onChange={handleProcedureChange}
        idPrefix="tp-procedure"
        legend={copy.procedureLabel}
        // Un ítem de plan sólo puede ser un PROCEDURE, así que la
        // etiqueta de tipo se repetiría en todas las filas sin
        // decir nada.
        showKind={false}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="tp-price" label={copy.priceLabel} error={itemAmountErrors.price}>
          <MoneyInput
            id="tp-price"
            currency={addCurrency}
            value={price}
            disabled={addPriceLoading}
            aria-busy={addPriceLoading || undefined}
            className={addPriceLoading ? 'animate-pulse' : undefined}
            onValueChange={(text) => {
              setPrice(text);
              setPriceEdited(true);
              setItemAmountErrors((errors) => ({ ...errors, price: undefined }));
            }}
            aria-invalid={itemAmountErrors.price ? true : undefined}
            aria-describedby={
              [
                itemAmountErrors.price ? fieldErrorId('tp-price') : null,
                quoteReady && priceQuote.status === 'ready' ? 'tp-price-source' : null,
                addBelowCatalog ? 'tp-price-below-catalog' : null,
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
          {/* DX-105: de dónde sale el precio precargado. */}
          {addPriceLoading ? (
            <p role="status" className="t-caption text-muted">
              {copy.priceQuoteLoading}
            </p>
          ) : priceQuote.status === 'error' ? (
            <FieldError label={copy.priceQuoteError} onRetry={priceQuote.retry} />
          ) : quoteReady ? (
            <PriceQuoteLine
              id="tp-price-source"
              quote={quoteReady}
              listPrice={(value) => formatListPrice(value, catalogCurrency, sedeListPriceFormat(fmt))}
            />
          ) : null}
          {/* SEC-041: aviso, no bloqueo; la API decide con el
              tope del rol. */}
          <p id="tp-price-below-catalog" role="status" className="t-caption text-warning-text">
            {addBelowCatalog && addEffective && addCatalogPrice !== null ? (
              <>
                <span className="block font-medium">{PRICE_BELOW_CATALOG_NOTICE}</span>
                {quoteReady ? (
                  <span className="block">
                    {catalogInOtherCurrency
                      ? copy.priceBelowCatalogOtherCurrency(
                          formatListPrice(addCatalogPrice, catalogCurrency, sedeListPriceFormat(fmt)),
                        )
                      : copy.priceBelowCatalogDetail(
                          sedeMoney(addEffective.priceReduction, plan.currency, fmt),
                          sedeMoney(addCatalogPrice, plan.currency, fmt),
                        )}
                  </span>
                ) : null}
              </>
            ) : null}
          </p>
        </FormField>

        <FormField
          htmlFor="tp-discount"
          label={copy.discountLabel}
          hint={addNoDiscount ? NO_DISCOUNT_ALLOWED_NOTICE : copy.discountHint}
          hintId="tp-discount-hint"
          error={itemAmountErrors.discount}
        >
          <MoneyInput
            id="tp-discount"
            currency={addCurrency}
            disabled={addNoDiscount}
            value={discount}
            onValueChange={(text) => {
              setDiscount(text);
              setItemAmountErrors((errors) => ({ ...errors, discount: undefined }));
            }}
            aria-invalid={itemAmountErrors.discount ? true : undefined}
            aria-describedby={
              [
                itemAmountErrors.discount ? fieldErrorId('tp-discount') : null,
                addNoDiscount && !itemAmountErrors.discount ? 'tp-discount-hint' : null,
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
        </FormField>

        {addDiscounted ? (
          <DiscountReasonFields
            idPrefix="tp-discount"
            value={addReason}
            onChange={setAddReason}
            required={addReasonRequired}
            thresholdPercent={discountRules?.reasonRequiredAbovePercent ?? null}
            errors={addReasonErrors}
          />
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="t-label text-ink">{copy.surfacesLegend}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {SURFACE_ORDER.map((surface) => (
              <Checkbox
                key={surface}
                id={`tp-surface-${surface}`}
                label={SURFACE_LABELS[surface]}
                checked={surfaces[surface]}
                onChange={(e) => handleSurfaceChange(surface, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>
      </div>

      <FormField htmlFor="tp-notes" label={copy.notesLabel}>
        <Textarea
          id="tp-notes"
          rows={2}
          autoGrow
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>

      {addItemValidationError && <InlineError>{addItemValidationError}</InlineError>}
      {addItemError && <InlineError>{addItemError}</InlineError>}

      <Button
        type="submit"
        variant={submitPrimary ? 'default' : 'secondary'}
        disabled={addItemSubmitting || addPriceLoading}
        className="self-start"
      >
        {addItemSubmitting ? copy.addItemSubmitting : copy.addItemSubmit}
      </Button>
    </form>
  );
}
