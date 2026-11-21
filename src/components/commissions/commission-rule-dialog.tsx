'use client';
import * as React from 'react';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { parseDecimalInput } from '@/lib/format/money';
import {
  COMMISSION_BASIS_LABELS,
  COMMISSION_LIMITS,
  COMMISSION_RELEASE_LABELS,
  saveCommissionRule,
  type CommissionBasis,
  type CommissionReleaseMode,
  type ProfessionalCommissionRule,
} from '@/lib/commissions/commissions-api';
import { InlineError } from '@/components/errors/inline-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';

export const commissionRuleDialogCopy = {
  title: (name: string) => `Honorarios de ${name}`,
  description:
    'Cómo se calcula lo que cobra este profesional. Los cambios valen para las liquidaciones que se cierren a partir de ahora; las cerradas guardan su regla.',
  basis: '¿Sobre qué se calcula?',
  basisHint: {
    COLLECTED: 'Lo que el paciente ya pagó de los procedimientos que realizó (los abonos imputados a cada ítem).',
    PRODUCED: 'El precio, con su descuento, de los procedimientos que realizó, se hayan cobrado o no.',
  } satisfies Record<CommissionBasis, string>,
  release: '¿Cuándo se libera?',
  releaseHint: {
    PER_ITEM: 'Cada procedimiento al realizarse (y, si es sobre lo cobrado, al cobrarse).',
    PER_PLAN: 'Solo cuando el plan de tratamiento está completo y pagado del todo.',
  } satisfies Record<CommissionReleaseMode, string>,
  percent: 'Porcentaje general',
  percentHint: 'De 0 a 100, con hasta 2 decimales. Por ejemplo, 35.',
  percentError: 'Escribe un porcentaje de 0 a 100 con hasta 2 decimales.',
  categories: 'Porcentaje por categoría',
  categoriesHint: 'Opcional: un porcentaje distinto para una categoría del catálogo. El resto usa el general.',
  category: 'Categoría',
  categoryPercent: (n: number) => `Porcentaje de la categoría ${n}`,
  categoryRequired: 'Elige la categoría.',
  categoryDuplicated: 'Esta categoría ya está en la regla.',
  addCategory: 'Añadir categoría',
  removeCategory: (name: string) => `Quitar ${name || 'la categoría'}`,
  noCategories: 'El catálogo aún no tiene categorías.',
  deductions: 'Descuentos antes del porcentaje',
  labCost: 'Descontar el costo de laboratorio',
  labCostHint:
    'Resta de la base lo que cobra el laboratorio por el trabajo (el costo de sus órdenes de laboratorio). Un costo en otra moneda que la del plan no se convierte: se avisa y no se descuenta.',
  labCostUnavailable: 'Aún no disponible en esta clínica.',
  cardFee: 'Descontar la comisión de la pasarela de pago',
  cardFeeHint:
    'Resta de cada abono el porcentaje que la pasarela cobra a la clínica por ese medio de pago (Ajustes › Medios de pago).',
  cardFeeProduced: 'Solo con «lo cobrado»: sobre lo producido no hay abono del que descontarla.',
  cardFeeUnavailable: 'Aún no disponible en esta clínica.',
  active: 'Regla activa',
  activeHint: 'Desactivada, no se pueden cerrar liquidaciones de este profesional.',
  save: 'Guardar regla',
  saveError: 'No pudimos guardar la regla. Intenta de nuevo.',
};

const copy = commissionRuleDialogCopy;

interface CategoryDraft {
  key: number;
  category: string;
  percent: string;
}

/** Texto de un % guardado para el campo («12,5»). */
function percentFieldText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

function parsePercent(text: string): number | null {
  const parsed = parseDecimalInput(text, 2);
  if (!parsed.ok) return null;
  return parsed.value >= COMMISSION_LIMITS.percentMin && parsed.value <= COMMISSION_LIMITS.percentMax
    ? parsed.value
    : null;
}

interface CommissionRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  row: ProfessionalCommissionRule;
  /** Categorías del catálogo de la clínica. */
  categories: readonly string[];
  deductionsAvailable: { labCost: boolean; cardFee: boolean };
  onSaved: (row: ProfessionalCommissionRule) => void;
}

/**
 * Regla de honorarios de un profesional (DX-018, solo ADMIN): base, cuándo se
 * libera, % general y % por categoría del catálogo. DX-018-bis: descontar el
 * costo de laboratorio y la comisión de la pasarela antes del %. El padre lo
 * monta con una `key` por apertura.
 */
export function CommissionRuleDialog({
  open,
  onOpenChange,
  token,
  row,
  categories,
  deductionsAvailable,
  onSaved,
}: CommissionRuleDialogProps) {
  const rule = row.rule;
  const [basis, setBasis] = useState<CommissionBasis>(rule?.basis ?? 'COLLECTED');
  const [releaseMode, setReleaseMode] = useState<CommissionReleaseMode>(rule?.releaseMode ?? 'PER_ITEM');
  const [percent, setPercent] = useState(percentFieldText(rule?.percent));
  const [active, setActive] = useState(rule?.active ?? true);
  const [deductLabCost, setDeductLabCost] = useState(rule?.deductLabCost ?? false);
  const [deductCardFee, setDeductCardFee] = useState(rule?.deductCardFee ?? false);
  // La pasarela se descuenta de un abono: sobre lo producido no aplica.
  const cardFeeApplies = basis === 'COLLECTED';
  const nextKey = React.useRef(rule?.categories.length ?? 0);
  const [rows, setRows] = useState<CategoryDraft[]>(
    (rule?.categories ?? []).map((c, i) => ({ key: i, category: c.category, percent: percentFieldText(c.percent) })),
  );
  const [errors, setErrors] = useState<{ percent?: string; rows: Record<number, string | undefined> }>({ rows: {} });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Las categorías guardadas que el catálogo ya no tiene siguen elegibles.
  const options = [...new Set([...categories, ...rows.map((r) => r.category).filter(Boolean)])].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' }),
  );

  function addRow() {
    const used = new Set(rows.map((r) => r.category.toLocaleLowerCase('es')));
    const first = options.find((o) => !used.has(o.toLocaleLowerCase('es'))) ?? '';
    const key = nextKey.current++;
    setRows((prev) => [...prev, { key, category: first, percent: '' }]);
  }

  function validate() {
    const found: { percent?: string; rows: Record<number, string | undefined> } = { rows: {} };
    const general = parsePercent(percent);
    if (general === null) found.percent = copy.percentError;
    const seen = new Set<string>();
    const parsedRows: { category: string; percent: number }[] = [];
    for (const r of rows) {
      const category = r.category.trim();
      const value = parsePercent(r.percent);
      const key = category.toLocaleLowerCase('es');
      if (!category) found.rows[r.key] = copy.categoryRequired;
      else if (seen.has(key)) found.rows[r.key] = copy.categoryDuplicated;
      else if (value === null) found.rows[r.key] = copy.percentError;
      else parsedRows.push({ category, percent: value });
      seen.add(key);
    }
    return { found, general, parsedRows };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const { found, general, parsedRows } = validate();
    setErrors(found);
    if (found.percent) {
      document.getElementById('rule-percent')?.focus();
      return;
    }
    const firstRow = rows.find((r) => found.rows[r.key]);
    if (firstRow || general === null) {
      if (firstRow) document.getElementById(`rule-category-${firstRow.key}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const saved = await saveCommissionRule(token, row.professional.userId, {
        basis,
        releaseMode,
        percent: general,
        categories: parsedRows,
        active,
        deductLabCost: deductionsAvailable.labCost && deductLabCost,
        deductCardFee: deductionsAvailable.cardFee && cardFeeApplies && deductCardFee,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title(row.professional.name)}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.save}
      submitting={submitting}
      error={error}
      touchTargets
    >
      <RadioGroup
        id="rule-basis"
        legend={copy.basis}
        value={basis}
        onValueChange={(v) => setBasis(v as CommissionBasis)}
      >
        {(['COLLECTED', 'PRODUCED'] as const).map((b, i) => (
          <RadioOption
            key={b}
            id={i === 0 ? 'rule-basis' : undefined}
            value={b}
            label={COMMISSION_BASIS_LABELS[b]}
            description={copy.basisHint[b]}
          />
        ))}
      </RadioGroup>
      <RadioGroup
        id="rule-release"
        legend={copy.release}
        value={releaseMode}
        onValueChange={(v) => setReleaseMode(v as CommissionReleaseMode)}
      >
        {(['PER_ITEM', 'PER_PLAN'] as const).map((m, i) => (
          <RadioOption
            key={m}
            id={i === 0 ? 'rule-release' : undefined}
            value={m}
            label={COMMISSION_RELEASE_LABELS[m]}
            description={copy.releaseHint[m]}
          />
        ))}
      </RadioGroup>
      <FormField
        htmlFor="rule-percent"
        label={copy.percent}
        hint={copy.percentHint}
        hintId="rule-percent-hint"
        error={errors.percent}
        className="sm:w-56"
      >
        <Input
          id="rule-percent"
          inputMode="decimal"
          value={percent}
          aria-required
          aria-invalid={errors.percent ? true : undefined}
          aria-describedby={errors.percent ? fieldErrorId('rule-percent') : 'rule-percent-hint'}
          onChange={(e) => {
            setPercent(e.target.value);
            if (errors.percent) setErrors((prev) => ({ ...prev, percent: undefined }));
          }}
        />
      </FormField>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-ink">{copy.categories}</legend>
        <p className="text-sm text-muted">{options.length === 0 ? copy.noCategories : copy.categoriesHint}</p>
        {rows.map((r, index) => {
          const rowError = errors.rows[r.key];
          const selectId = `rule-category-${r.key}`;
          return (
            <div key={r.key} className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[1fr_6.5rem_auto] items-end gap-2">
                <FormField htmlFor={selectId} label={copy.category}>
                  <NativeSelect
                    id={selectId}
                    value={r.category}
                    aria-invalid={rowError ? true : undefined}
                    aria-describedby={rowError ? fieldErrorId(selectId) : undefined}
                    onChange={(e) =>
                      setRows((prev) => prev.map((p) => (p.key === r.key ? { ...p, category: e.target.value } : p)))
                    }
                  >
                    {r.category === '' ? <option value="">—</option> : null}
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField htmlFor={`rule-category-percent-${r.key}`} label="%">
                  <Input
                    id={`rule-category-percent-${r.key}`}
                    inputMode="decimal"
                    aria-label={copy.categoryPercent(index + 1)}
                    value={r.percent}
                    aria-invalid={rowError ? true : undefined}
                    onChange={(e) =>
                      setRows((prev) => prev.map((p) => (p.key === r.key ? { ...p, percent: e.target.value } : p)))
                    }
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={copy.removeCategory(r.category)}
                  onClick={() => setRows((prev) => prev.filter((p) => p.key !== r.key))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {rowError ? (
                <InlineError id={fieldErrorId(selectId)}>{rowError}</InlineError>
              ) : null}
            </div>
          );
        })}
        {options.length > 0 && rows.length < COMMISSION_LIMITS.categoriesMax ? (
          <Button type="button" variant="secondary" className="self-start" onClick={addRow}>
            <Plus aria-hidden />
            {copy.addCategory}
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-ink">{copy.deductions}</legend>
        <Switch
          id="rule-lab-cost"
          checked={deductionsAvailable.labCost && deductLabCost}
          disabled={!deductionsAvailable.labCost}
          label={copy.labCost}
          description={deductionsAvailable.labCost ? copy.labCostHint : copy.labCostUnavailable}
          onChange={(e) => setDeductLabCost(e.target.checked)}
        />
        <Switch
          id="rule-card-fee"
          checked={deductionsAvailable.cardFee && cardFeeApplies && deductCardFee}
          disabled={!deductionsAvailable.cardFee || !cardFeeApplies}
          label={copy.cardFee}
          description={
            !deductionsAvailable.cardFee ? copy.cardFeeUnavailable : cardFeeApplies ? copy.cardFeeHint : copy.cardFeeProduced
          }
          onChange={(e) => setDeductCardFee(e.target.checked)}
        />
      </fieldset>

      {rule ? (
        <Switch
          id="rule-active"
          checked={active}
          label={copy.active}
          description={copy.activeHint}
          onChange={(e) => setActive(e.target.checked)}
        />
      ) : null}
    </FormModal>
  );
}
