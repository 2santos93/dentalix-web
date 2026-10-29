'use client';
import { useEffect, useState } from 'react';
import type { Currency } from '@/lib/reference/currencies-api';
import type { HourCycle } from '@/lib/format/regional-format';
import {
  browserLocales,
  HOUR_CYCLE_LABELS,
  hourCycleExamples,
  regionalPreview,
  timeZoneOptions,
  unique,
  type RegionalSettingsErrors,
  type RegionalSettingsField,
  type RegionalSettingsValues,
} from '@/lib/locations/regional-settings';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { CountryCombobox } from '@/components/shared/country-combobox';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const regionalSettingsFieldsCopy = {
  country: 'País',
  countryHint: 'País donde está la sede. No cambia la moneda, la zona ni el formato.',
  currency: 'Moneda',
  currencyPlaceholder: 'Elige la moneda',
  timeZone: 'Zona horaria',
  timeZonePlaceholder: 'Escribe una región o ciudad y elígela de la lista',
  timeZoneHint: 'Decide el «hoy» de la caja, la agenda y los informes.',
  locale: 'Formato regional',
  localePlaceholder: 'Código BCP 47 (idioma-región)',
  localeHint: 'Cómo se escriben fechas y números. La interfaz sigue en español.',
  hourCycle: 'Reloj',
  hourCycleHint: 'Cómo se escriben las horas en la agenda, los documentos y los recordatorios.',
  suggested: 'Sugerido por tu navegador.',
  preview: (sample: string) => `Vista previa: ${sample}`,
};

const copy = regionalSettingsFieldsCopy;

const HOUR_CYCLES: readonly HourCycle[] = ['h12', 'h23'];

/** Sugerencias del navegador: `null` = no hay (el campo empieza vacío o con el valor guardado). */
export interface RegionalSuggestions {
  /** Solo de una región explícita del idioma del navegador (`es-VE` → `VE`; DX-312 P1). */
  country: string | null;
  timeZone: string | null;
  locale: string | null;
  hourCycle: HourCycle | null;
}

type RegionalSettingsFieldsProps = RegionalCurrencySource & {
  /** Prefijo de los `id` (`${idPrefix}-country`…): quien lo monta enfoca el primer campo con error. */
  idPrefix: string;
  values: RegionalSettingsValues;
  onChange: <F extends RegionalSettingsField>(field: F, value: RegionalSettingsValues[F]) => void;
  errors: RegionalSettingsErrors;
  /**
   * Sugerencias del navegador (alta, registro y los campos vacíos de una sede
   * por configurar). Se ven y se editan; mientras el campo conserva la
   * sugerencia lleva la marca «Sugerido por tu navegador».
   */
  suggestions?: RegionalSuggestions;
  /** Una columna siempre (el registro vive en un panel estrecho); por defecto, dos desde `sm`. */
  stacked?: boolean;
};

/**
 * Monedas: con sesión, `GET /currencies` con el token; sin sesión (registro),
 * quien las carga (`listPublicCurrencies`).
 */
type RegionalCurrencySource =
  | { token: string; currencyLoader?: undefined }
  | { currencyLoader: () => Promise<Currency[]>; token?: undefined };

/** `id` del control de un campo regional. */
export function regionalFieldId(idPrefix: string, field: RegionalSettingsField): string {
  return `${idPrefix}-${field}`;
}

/**
 * País, moneda, zona horaria, formato regional y reloj de una sede (G1, spec
 * §6.2 y §6.7; G1-B §9). Lo comparten el modal de sede y el registro. País y
 * la moneda empieza vacía y nunca se sugiere; el país solo se sugiere desde una
 * región explícita del navegador (DX-312 P1) y elegirlo no toca ningún otro
 * campo (R2, R10). El reloj se elige entre 12 h y 24 h, cada opción con su
 * ejemplo en vivo con el formato y la zona elegidos.
 */
export function RegionalSettingsFields({
  idPrefix,
  values,
  onChange,
  errors,
  token,
  currencyLoader,
  suggestions,
  stacked = false,
}: RegionalSettingsFieldsProps) {
  // Un instante fijo por apertura: la vista previa y los ejemplos del reloj
  // cambian con lo elegido, no con el paso del tiempo.
  const [previewAt] = useState(() => new Date());
  // Las listas del navegador se leen tras montar: el registro se pinta también
  // en el servidor, cuyo `Intl`/`navigator` no son los del navegador, y unas
  // opciones distintas romperían la hidratación.
  const [browserLists, setBrowserLists] = useState<{ zones: string[]; locales: string[] }>({
    zones: [],
    locales: [],
  });
  useEffect(() => {
    function hydrate() {
      setBrowserLists({ zones: timeZoneOptions(), locales: browserLocales() });
    }
    hydrate();
  }, []);
  const id = (field: RegionalSettingsField) => regionalFieldId(idPrefix, field);
  const invalid = (field: RegionalSettingsField) => (errors[field] ? true : undefined);
  const describedBy = (field: RegionalSettingsField, hintId?: string) =>
    errors[field] ? fieldErrorId(id(field)) : hintId;

  const zones = unique([values.timeZone.trim(), suggestions?.timeZone, ...browserLists.zones]);
  const locales = unique([values.locale.trim(), suggestions?.locale, ...browserLists.locales]);
  const preview = regionalPreview(values.locale, values.timeZone, values.hourCycle, previewAt);
  const examples = hourCycleExamples(values.locale, values.timeZone, previewAt);
  const countrySuggested = Boolean(suggestions?.country) && values.country === suggestions?.country;
  const zoneSuggested = Boolean(suggestions?.timeZone) && values.timeZone === suggestions?.timeZone;
  const localeSuggested = Boolean(suggestions?.locale) && values.locale === suggestions?.locale;
  const hourCycleSuggested = Boolean(suggestions?.hourCycle) && values.hourCycle === suggestions?.hourCycle;
  const hourCycleHintId = `${id('hourCycle')}-hint`;

  return (
    <div className={stacked ? 'flex flex-col gap-4' : 'grid gap-4 sm:grid-cols-2'}>
      <FormField
        htmlFor={id('country')}
        label={copy.country}
        error={errors.country}
        hint={countrySuggested ? `${copy.suggested} ${copy.countryHint}` : copy.countryHint}
        hintId={`${id('country')}-hint`}
      >
        <CountryCombobox
          id={id('country')}
          value={values.country}
          onChange={(code) => onChange('country', code)}
          invalid={invalid('country')}
          required
          ariaDescribedBy={describedBy('country', `${id('country')}-hint`)}
        />
      </FormField>

      <FormField htmlFor={id('currency')} label={copy.currency} error={errors.currency}>
        <CurrencySelect
          id={id('currency')}
          {...(currencyLoader ? { loader: currencyLoader } : { token: token as string })}
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
          aria-describedby={describedBy('locale', `${id('locale')}-hint ${id('locale')}-preview`)}
        />
        <datalist id={`${id('locale')}-options`}>
          {locales.map((locale) => (
            <option key={locale} value={locale} />
          ))}
        </datalist>
      </FormField>

      {/* Sin `aria-live` (anunciaría cada tecla): la describe el campo de formato. */}
      <p
        id={`${id('locale')}-preview`}
        className={cn('text-sm tabular-nums text-muted empty:hidden', !stacked && 'sm:col-span-2')}
      >
        {preview ? copy.preview(preview) : null}
      </p>

      <fieldset
        role="radiogroup"
        aria-required
        aria-invalid={invalid('hourCycle')}
        aria-describedby={errors.hourCycle ? fieldErrorId(id('hourCycle')) : hourCycleHintId}
        className={cn('flex min-w-0 flex-col gap-1.5', !stacked && 'sm:col-span-2')}
      >
        <legend className="mb-1.5 text-sm font-medium text-ink">{copy.hourCycle}</legend>
        {/* A dos columnas, las opciones caen bajo las columnas de los campos de arriba. */}
        <div className={cn('grid grid-cols-2 gap-2', !stacked && 'sm:gap-4')}>
          {HOUR_CYCLES.map((cycle, index) => {
            // La primera opción lleva el id del campo: es la que se enfoca si falta el reloj.
            const optionId = index === 0 ? id('hourCycle') : `${id('hourCycle')}-${cycle}`;
            const checked = values.hourCycle === cycle;
            return (
              <label
                key={cycle}
                htmlFor={optionId}
                className={cn(
                  'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border bg-surface px-3 py-2 transition-colors hover:bg-bg',
                  checked ? 'border-primary' : errors.hourCycle ? 'border-danger' : 'border-border',
                )}
              >
                <input
                  id={optionId}
                  type="radio"
                  name={id('hourCycle')}
                  value={cycle}
                  checked={checked}
                  onChange={() => onChange('hourCycle', cycle)}
                  // El nombre es solo «12 h»/«24 h»; el ejemplo lo describe.
                  aria-labelledby={`${optionId}-label`}
                  // El error también en cada opción (no todos los lectores anuncian el del grupo al entrar).
                  aria-describedby={
                    [examples ? `${optionId}-example` : null, errors.hourCycle ? fieldErrorId(id('hourCycle')) : null]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  className="size-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span id={`${optionId}-label`} className="text-sm font-medium text-ink">
                    {HOUR_CYCLE_LABELS[cycle]}
                  </span>
                  {examples ? (
                    <span id={`${optionId}-example`} className="text-xs tabular-nums text-muted">
                      {examples[cycle]}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        {errors.hourCycle ? (
          <InlineError id={fieldErrorId(id('hourCycle'))} className="text-xs">
            {errors.hourCycle}
          </InlineError>
        ) : (
          <p id={hourCycleHintId} className="text-xs text-muted">
            {hourCycleSuggested ? `${copy.suggested} ${copy.hourCycleHint}` : copy.hourCycleHint}
          </p>
        )}
      </fieldset>
    </div>
  );
}
