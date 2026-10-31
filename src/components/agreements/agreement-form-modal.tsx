'use client';
import * as React from 'react';
import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createAgreement,
  updateAgreement,
  type Agreement,
  type AgreementKind,
} from '@/lib/agreements/agreements-api';
import type { Payer } from '@/lib/payers/payers-api';
import type { PriceList } from '@/lib/price-lists/price-lists-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { moneyInputText, parseDecimalInput } from '@/lib/format/money';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { AGREEMENT_KIND_LABELS } from './agreement-labels';

const copy = {
  createTitle: 'Nuevo convenio',
  editTitle: 'Editar convenio',
  description:
    'Un convenio liga un pagador con un descuento porcentual o con una lista de precios. Se asigna al paciente desde su ficha.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Seguros Horizonte −15 %',
  payer: 'Pagador',
  choosePayer: 'Elige un pagador',
  kind: 'Tipo',
  percent: 'Descuento general (%)',
  percentHint: 'Entre 0 y 100, hasta 2 decimales. Se aplica a todos los procedimientos.',
  byCategory: 'Descuento por categoría',
  byCategoryHint: 'Opcional. En su categoría, este porcentaje sustituye al general.',
  category: 'Categoría',
  chooseCategory: 'Elige una categoría',
  categoryPercent: 'Porcentaje',
  addCategory: 'Añadir categoría',
  removeCategory: (n: number) => `Quitar la categoría ${n}`,
  noCategories: 'El catálogo todavía no tiene categorías.',
  priceList: 'Lista de precios',
  choosePriceList: 'Elige una lista',
  priceListHint: 'Solo listas activas. Los procedimientos sin precio en la lista usan el del catálogo.',
  location: 'Sede',
  wholeClinic: 'Toda la clínica',
  validFrom: 'Vigente desde',
  validTo: 'Vigente hasta',
  validityHint: 'Opcional. Sin fechas, el convenio no vence.',
  active: 'Convenio activo',
  activeHint: 'Un convenio inactivo no fija precios, pero conserva sus asignaciones.',
  create: 'Crear convenio',
  save: 'Guardar cambios',
  invalidName: 'El nombre debe tener entre 2 y 120 caracteres.',
  payerRequired: 'Elige el pagador del convenio.',
  percentRequired: 'Indica el porcentaje del convenio.',
  percentRange: 'El porcentaje debe estar entre 0 y 100.',
  priceListRequired: 'Indica la lista de precios del convenio.',
  categoryRequired: 'Elige la categoría de cada fila.',
  categoryRepeated: (c: string) => `La categoría «${c}» está repetida.`,
  dateRange: 'La fecha de fin no puede ser anterior a la de inicio.',
  genericError: 'No pudimos guardar el convenio. Intenta de nuevo.',
};

const KINDS = Object.keys(AGREEMENT_KIND_LABELS) as AgreementKind[];
/** Tope de la API: categorías distintas por convenio. */
const MAX_CATEGORY_ROWS = 50;

interface CategoryRow {
  key: number;
  category: string;
  percent: string;
}

type FieldErrors = Partial<
  Record<'name' | 'payer' | 'percent' | 'categories' | 'priceList' | 'dates', string>
>;

interface AgreementFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sin convenio: alta. Con convenio: edición. */
  agreement: Agreement | null;
  token: string;
  /** Pagadores activos. */
  payers: Payer[];
  /** Listas de precios activas. */
  priceLists: PriceList[];
  /** Categorías distintas del catálogo. */
  categories: string[];
  locations: ClinicLocation[];
  onSaved: (saved: Agreement) => void;
}

/**
 * Alta y edición de un convenio (DX-105). Valida en el cliente con los mismos
 * mensajes que la API (que repite las reglas). El padre lo monta con una `key`
 * por apertura para resembrar el estado.
 */
export function AgreementFormModal({
  open,
  onOpenChange,
  agreement,
  token,
  payers,
  priceLists,
  categories,
  locations,
  onSaved,
}: AgreementFormModalProps) {
  const editing = agreement !== null;
  const nextKey = useRef(Object.keys(agreement?.percentByCategory ?? {}).length);
  const [name, setName] = useState(agreement?.name ?? '');
  const [payerId, setPayerId] = useState(agreement?.payer.id ?? '');
  const [kind, setKind] = useState<AgreementKind>(agreement?.kind ?? 'PERCENT_DISCOUNT');
  const [percent, setPercent] = useState(
    agreement?.percent == null ? '' : moneyInputText(agreement.percent),
  );
  const [rows, setRows] = useState<CategoryRow[]>(() =>
    Object.entries(agreement?.percentByCategory ?? {}).map(([category, value], index) => ({
      key: index,
      category,
      percent: moneyInputText(value),
    })),
  );
  const [priceListId, setPriceListId] = useState(agreement?.priceList?.id ?? '');
  const [locationId, setLocationId] = useState(agreement?.locationId ?? '');
  const [validFrom, setValidFrom] = useState(agreement?.validFrom ?? '');
  const [validTo, setValidTo] = useState(agreement?.validTo ?? '');
  const [active, setActive] = useState(agreement?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  // El pagador, la lista o la sede ya elegidos siguen apareciendo aunque se
  // hayan desactivado después: si no, el selector mostraría otra cosa.
  const payerOptions =
    agreement && !payers.some((p) => p.id === agreement.payer.id)
      ? [...payers, { id: agreement.payer.id, name: agreement.payer.name }]
      : payers;
  const priceListOptions =
    agreement?.priceList && !priceLists.some((l) => l.id === agreement.priceList?.id)
      ? [...priceLists, agreement.priceList]
      : priceLists;
  const locationOptions = locations.filter((l) => l.isActive || l.id === agreement?.locationId);

  function categoryChoices(current: string): string[] {
    const taken = new Set(rows.map((r) => r.category));
    const known = categories.includes(current) || current === '' ? categories : [...categories, current];
    return known.filter((c) => c === current || !taken.has(c));
  }

  function updateRow(key: number, patch: Partial<CategoryRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setErrors((prev) => ({ ...prev, categories: undefined }));
  }

  /** `null` si el texto no es un porcentaje válido; el mensaje va aparte. */
  function readPercent(text: string): { value: number } | { message: string } {
    const parsed = parseDecimalInput(text, 2);
    if (!parsed.ok) return { message: parsed.message };
    if (parsed.value < 0 || parsed.value > 100) return { message: copy.percentRange };
    return { value: parsed.value };
  }

  function validate(): { errors: FieldErrors; percent?: number; byCategory?: Record<string, number> } {
    const found: FieldErrors = {};
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2 || trimmed.length > 120) found.name = copy.invalidName;
    if (payerId === '') found.payer = copy.payerRequired;
    if (validFrom !== '' && validTo !== '' && validTo < validFrom) found.dates = copy.dateRange;

    let general: number | undefined;
    let byCategory: Record<string, number> | undefined;
    if (kind === 'PERCENT_DISCOUNT') {
      if (percent.trim() === '') found.percent = copy.percentRequired;
      else {
        const read = readPercent(percent);
        if ('message' in read) found.percent = read.message;
        else general = read.value;
      }
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.category === '') {
          found.categories = copy.categoryRequired;
          break;
        }
        if (Object.prototype.hasOwnProperty.call(map, row.category)) {
          found.categories = copy.categoryRepeated(row.category);
          break;
        }
        const read = row.percent.trim() === '' ? { message: copy.percentRequired } : readPercent(row.percent);
        if ('message' in read) {
          found.categories = `${row.category}: ${read.message}`;
          break;
        }
        map[row.category] = read.value;
      }
      if (rows.length > 0 && found.categories === undefined) byCategory = map;
    } else if (priceListId === '') {
      found.priceList = copy.priceListRequired;
    }
    return { errors: found, percent: general, byCategory };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const result = validate();
    setErrors(result.errors);
    if (Object.keys(result.errors).length > 0) return;

    const trimmed = name.trim().replace(/\s+/g, ' ');
    const isPercent = kind === 'PERCENT_DISCOUNT';
    setSubmitting(true);
    try {
      const saved = editing
        ? await updateAgreement(token, agreement.id, {
            name: trimmed,
            payerId,
            kind,
            percent: isPercent ? result.percent : null,
            percentByCategory: isPercent ? (result.byCategory ?? null) : null,
            priceListId: isPercent ? null : priceListId,
            locationId: locationId === '' ? null : locationId,
            validFrom: validFrom === '' ? null : validFrom,
            validTo: validTo === '' ? null : validTo,
            active,
          })
        : await createAgreement(token, {
            name: trimmed,
            payerId,
            kind,
            ...(isPercent && result.percent !== undefined ? { percent: result.percent } : {}),
            ...(isPercent && result.byCategory ? { percentByCategory: result.byCategory } : {}),
            ...(!isPercent ? { priceListId } : {}),
            ...(locationId === '' ? {} : { locationId }),
            ...(validFrom === '' ? {} : { validFrom }),
            ...(validTo === '' ? {} : { validTo }),
          });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const canAddRow = rows.length < Math.min(MAX_CATEGORY_ROWS, categories.length);

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
      size="lg"
      touchTargets
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="agreement-name" label={copy.name} error={errors.name}>
          <Input
            id="agreement-name"
            value={name}
            maxLength={120}
            placeholder={copy.namePlaceholder}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? fieldErrorId('agreement-name') : undefined}
            required
          />
        </FormField>
        <FormField htmlFor="agreement-payer" label={copy.payer} error={errors.payer}>
          <NativeSelect
            id="agreement-payer"
            value={payerId}
            onChange={(e) => {
              setPayerId(e.target.value);
              setErrors((prev) => ({ ...prev, payer: undefined }));
            }}
            aria-invalid={errors.payer ? true : undefined}
            aria-describedby={errors.payer ? fieldErrorId('agreement-payer') : undefined}
          >
            <option value="">{copy.choosePayer}</option>
            {payerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <FormField htmlFor="agreement-kind" label={copy.kind}>
        <NativeSelect
          id="agreement-kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as AgreementKind);
            setErrors({});
          }}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {AGREEMENT_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      {kind === 'PERCENT_DISCOUNT' ? (
        <>
          <FormField
            htmlFor="agreement-percent"
            label={copy.percent}
            hint={copy.percentHint}
            error={errors.percent}
          >
            <Input
              id="agreement-percent"
              inputMode="decimal"
              autoComplete="off"
              value={percent}
              placeholder="15"
              onChange={(e) => {
                setPercent(e.target.value);
                setErrors((prev) => ({ ...prev, percent: undefined }));
              }}
              aria-invalid={errors.percent ? true : undefined}
              aria-describedby={errors.percent ? fieldErrorId('agreement-percent') : undefined}
              className="sm:max-w-40"
            />
          </FormField>

          <fieldset className="flex flex-col gap-3">
            <legend className="t-label text-ink">{copy.byCategory}</legend>
            <p className="t-caption text-muted">{copy.byCategoryHint}</p>
            {rows.map((row, index) => (
              <div key={row.key} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor={`agreement-cat-${row.key}`} className="t-caption text-muted">
                    {copy.category} {index + 1}
                  </label>
                  <NativeSelect
                    id={`agreement-cat-${row.key}`}
                    value={row.category}
                    onChange={(e) => updateRow(row.key, { category: e.target.value })}
                  >
                    <option value="">{copy.chooseCategory}</option>
                    {categoryChoices(row.category).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1 sm:w-32">
                  <label htmlFor={`agreement-cat-pct-${row.key}`} className="t-caption text-muted">
                    {copy.categoryPercent} {index + 1}
                  </label>
                  <Input
                    id={`agreement-cat-pct-${row.key}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.percent}
                    placeholder="20"
                    onChange={(e) => updateRow(row.key, { percent: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="max-sm:w-full"
                  aria-label={copy.removeCategory(index + 1)}
                  onClick={() => {
                    setRows((prev) => prev.filter((r) => r.key !== row.key));
                    setErrors((prev) => ({ ...prev, categories: undefined }));
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            {errors.categories ? (
              <InlineError id={fieldErrorId('agreement-categories')} className="text-xs">
                {errors.categories}
              </InlineError>
            ) : null}
            {categories.length === 0 ? (
              <p className="t-caption text-muted">{copy.noCategories}</p>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                disabled={!canAddRow}
                onClick={() =>
                  setRows((prev) => [...prev, { key: nextKey.current++, category: '', percent: '' }])
                }
              >
                <Plus aria-hidden />
                {copy.addCategory}
              </Button>
            )}
          </fieldset>
        </>
      ) : (
        <FormField
          htmlFor="agreement-price-list"
          label={copy.priceList}
          hint={copy.priceListHint}
          error={errors.priceList}
        >
          <NativeSelect
            id="agreement-price-list"
            value={priceListId}
            onChange={(e) => {
              setPriceListId(e.target.value);
              setErrors((prev) => ({ ...prev, priceList: undefined }));
            }}
            aria-invalid={errors.priceList ? true : undefined}
            aria-describedby={errors.priceList ? fieldErrorId('agreement-price-list') : undefined}
          >
            <option value="">{copy.choosePriceList}</option>
            {priceListOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.currency})
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}

      <FormField htmlFor="agreement-location" label={copy.location}>
        <NativeSelect
          id="agreement-location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">{copy.wholeClinic}</option>
          {locationOptions.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="agreement-valid-from" label={copy.validFrom} hint={copy.validityHint}>
          <DatePicker
            id="agreement-valid-from"
            value={validFrom === '' ? null : validFrom}
            max={validTo === '' ? undefined : validTo}
            onChange={(next) => {
              setValidFrom(next ?? '');
              setErrors((prev) => ({ ...prev, dates: undefined }));
            }}
          />
        </FormField>
        <FormField htmlFor="agreement-valid-to" label={copy.validTo} error={errors.dates}>
          <DatePicker
            id="agreement-valid-to"
            value={validTo === '' ? null : validTo}
            min={validFrom === '' ? undefined : validFrom}
            onChange={(next) => {
              setValidTo(next ?? '');
              setErrors((prev) => ({ ...prev, dates: undefined }));
            }}
            aria-invalid={errors.dates ? true : undefined}
            aria-describedby={errors.dates ? fieldErrorId('agreement-valid-to') : undefined}
          />
        </FormField>
      </div>

      {editing ? (
        <Checkbox
          id="agreement-active"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          label={copy.active}
          description={copy.activeHint}
        />
      ) : null}
    </FormModal>
  );
}
