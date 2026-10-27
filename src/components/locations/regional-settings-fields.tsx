'use client';
import { useState } from 'react';
import type { Currency } from '@/lib/reference/currencies-api';
import { COUNTRY_LABELS, type ClinicCountry } from '@/lib/prescriptions/prescriptions-api';
import {
  browserLocales,
  regionalPreview,
  timeZoneOptions,
  type RegionalSettingsErrors,
  type RegionalSettingsField,
  type RegionalSettingsValues,
} from '@/lib/locations/regional-settings';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const regionalSettingsFieldsCopy = {
  country: 'País',
  countryPlaceholder: 'Elige el país',
  countryHint: 'Decide los campos legales de la receta. No cambia la moneda, la zona ni el formato.',
  currency: 'Moneda',
  currencyPlaceholder: 'Elige la moneda',
  timeZone: 'Zona horaria',
  timeZonePlaceholder: 'Escribe para buscar una zona IANA',
  timeZoneHint: 'Decide el «hoy» de la caja, la agenda y los informes.',
  locale: 'Formato regional',
  localePlaceholder: 'Código BCP 47 (idioma-región)',
  localeHint: 'Cómo se escriben fechas y números. La interfaz sigue en español.',
  suggested: 'Sugerido por tu navegador.',
  preview: (sample: string) => `Vista previa: ${sample}`,
};

const copy = regionalSettingsFieldsCopy;

const COUNTRIES = Object.keys(COUNTRY_LABELS) as ClinicCountry[];

interface RegionalSettingsFieldsProps {
  /** Prefijo de los `id` (`${idPrefix}-country`…): quien lo monta enfoca el primer campo con error. */
  idPrefix: string;
  values: RegionalSettingsValues;
  onChange: <F extends RegionalSettingsField>(field: F, value: RegionalSettingsValues[F]) => void;
  errors: RegionalSettingsErrors;
  /** Con sesión, la lista de monedas sale de `GET /currencies`. */
  token?: string;
  /** Sin sesión (registro): quien carga las monedas (`listPublicCurrencies`). */
  currencyLoader?: () => Promise<Currency[]>;
  /**
   * Sugerencias del navegador (solo en el alta). Se ven y se editan; mientras
   * el campo conserva la sugerencia lleva la marca «Sugerido por tu navegador».
   */
  suggestions?: { timeZone: string | null; locale: string | null };
}

/** `id` del control de un campo regional. */
export function regionalFieldId(idPrefix: string, field: RegionalSettingsField): string {
  return `${idPrefix}-${field}`;
}

/**
 * País, moneda, zona horaria y formato regional de una sede (G1, spec §6.2 y
 * §6.7). Lo comparten el modal de sede y el registro. País y moneda empiezan
 * vacíos y nunca se sugieren; elegir país no toca ningún otro campo (R2, R10).
 */
export function RegionalSettingsFields({
  idPrefix,
  values,
  onChange,
  errors,
  token,
  currencyLoader,
  suggestions,
}: RegionalSettingsFieldsProps) {
  // Un instante fijo por apertura: la vista previa cambia con el formato y la
  // zona, no con el reloj.
  const [previewAt] = useState(() => new Date());
  const [localeOptions] = useState(browserLocales);
  const id = (field: RegionalSettingsField) => regionalFieldId(idPrefix, field);
  const invalid = (field: RegionalSettingsField) => (errors[field] ? true : undefined);
  const describedBy = (field: RegionalSettingsField, hintId?: string) =>
    errors[field] ? fieldErrorId(id(field)) : hintId;

  const zones = timeZoneOptions([values.timeZone.trim(), suggestions?.timeZone]);
  const locales = [
    ...new Set(
      [values.locale.trim(), suggestions?.locale, ...localeOptions].filter((l): l is string => Boolean(l)),
    ),
  ];
  const preview = regionalPreview(values.locale, values.timeZone, previewAt);
  const zoneSuggested = Boolean(suggestions?.timeZone) && values.timeZone === suggestions?.timeZone;
  const localeSuggested = Boolean(suggestions?.locale) && values.locale === suggestions?.locale;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField htmlFor={id('country')} label={copy.country} error={errors.country} hint={copy.countryHint} hintId={`${id('country')}-hint`}>
        <select
          id={id('country')}
          value={values.country}
          onChange={(e) => onChange('country', e.target.value as ClinicCountry | '')}
          aria-required
          aria-invalid={invalid('country')}
          aria-describedby={describedBy('country', `${id('country')}-hint`)}
          className={cn(fieldClass, 'h-10')}
        >
          <option value="" disabled>
            {copy.countryPlaceholder}
          </option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {COUNTRY_LABELS[c]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField htmlFor={id('currency')} label={copy.currency} error={errors.currency}>
        <CurrencySelect
          id={id('currency')}
          token={token}
          loader={currencyLoader}
          value={values.currency}
          onChange={(code) => onChange('currency', code)}
          placeholder={copy.currencyPlaceholder}
          invalid={Boolean(errors.currency)}
          required
          ariaDescribedBy={errors.currency ? fieldErrorId(id('currency')) : undefined}
        />
      </FormField>

      <FormField
        htmlFor={id('timeZone')}
        label={copy.timeZone}
        error={errors.timeZone}
        hint={zoneSuggested ? `${copy.suggested} ${copy.timeZoneHint}` : copy.timeZoneHint}
        hintId={`${id('timeZone')}-hint`}
      >
        <Input
          id={id('timeZone')}
          type="text"
          list={`${id('timeZone')}-options`}
          autoComplete="off"
          spellCheck={false}
          value={values.timeZone}
          placeholder={copy.timeZonePlaceholder}
          onChange={(e) => onChange('timeZone', e.target.value)}
          aria-required
          aria-invalid={invalid('timeZone')}
          aria-describedby={describedBy('timeZone', `${id('timeZone')}-hint`)}
        />
        <datalist id={`${id('timeZone')}-options`}>
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </FormField>

      <FormField
        htmlFor={id('locale')}
        label={copy.locale}
        error={errors.locale}
        hint={localeSuggested ? `${copy.suggested} ${copy.localeHint}` : copy.localeHint}
        hintId={`${id('locale')}-hint`}
      >
        <Input
          id={id('locale')}
          type="text"
          list={`${id('locale')}-options`}
          autoComplete="off"
          spellCheck={false}
          value={values.locale}
          placeholder={copy.localePlaceholder}
          onChange={(e) => onChange('locale', e.target.value)}
          aria-required
          aria-invalid={invalid('locale')}
          aria-describedby={describedBy('locale', `${id('locale')}-hint`)}
        />
        <datalist id={`${id('locale')}-options`}>
          {locales.map((locale) => (
            <option key={locale} value={locale} />
          ))}
        </datalist>
      </FormField>

      {/* Siempre montada: una región `aria-live` que aparece no se anuncia. */}
      <p aria-live="polite" className="text-sm tabular-nums text-muted empty:hidden sm:col-span-2">
        {preview ? copy.preview(preview) : null}
      </p>
    </div>
  );
}
