'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Currency } from '@/lib/reference/currencies-api';
import type { HourCycle } from '@/lib/format/regional-format';
import {
  browserLocales,
  HOUR_CYCLE_LABELS,
  hourCycleExamples,
  regionalPreview,
  type RegionalSettingsErrors,
  type RegionalSettingsField,
  type RegionalSettingsValues,
} from '@/lib/locations/regional-settings';
import { countryName } from '@/lib/locations/countries';
import { countryTimeZones, timeZoneInCountry } from '@/lib/locations/country-regional';
import {
  localeChoices,
  localeName,
  searchRegionalOptions,
  timeZoneChoices,
  timeZoneLabel,
  type RegionalOption,
} from '@/lib/locations/regional-options';
import type { CountryField, RegionalSource } from '@/lib/locations/use-regional-draft';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { CountryCombobox, type CountryComboboxCopy } from '@/components/shared/country-combobox';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const regionalSettingsFieldsCopy = {
  country: 'País',
  countryHint: 'Al elegirlo te proponemos su moneda, su zona horaria y su formato. Puedes cambiarlos.',
  currency: 'Moneda',
  currencyPlaceholder: 'Elige la moneda',
  currencyHint: 'La de los cobros y presupuestos nuevos de la sede. Lo ya registrado conserva su moneda.',
  timeZone: 'Zona horaria',
  timeZonePlaceholder: 'Busca una ciudad, un país o un desfase (UTC−4)',
  timeZoneHint: 'Decide el «hoy» de la caja, la agenda y los informes.',
  timeZoneOutsideCountry: (country: string) => `No es una zona de ${country}: las suyas salen primero en la lista.`,
  locale: 'Formato regional',
  localePlaceholder: 'Busca un idioma o un país',
  localeHint: 'Cómo se escriben fechas y números. La interfaz sigue en español.',
  hourCycle: 'Reloj',
  hourCycleHint: 'Cómo se escriben las horas en la agenda, los documentos y los recordatorios.',
  suggested: 'Sugerido por tu navegador.',
  suggestedByCountry: 'Sugerido por el país.',
  suggestedByFormat: 'Sugerido por el formato regional.',
  preview: (sample: string) => `Vista previa: ${sample}`,
  proposal: {
    currency: (country: string, value: string) => `En ${country} se usa ${value}.`,
    timeZone: (country: string, value: string) => `Zona de ${country}: ${value}.`,
    locale: (country: string, value: string) => `Formato de ${country}: ${value}.`,
  },
  useProposal: {
    currency: (value: string) => `Usar ${value}`,
    timeZone: 'Usar esta zona',
    locale: 'Usar este formato',
  },
};

const copy = regionalSettingsFieldsCopy;

const timeZoneComboboxCopy: CountryComboboxCopy = {
  placeholder: copy.timeZonePlaceholder,
  noMatch: 'Ninguna zona coincide.',
  list: 'Zonas horarias',
  results: (n: number) => (n === 1 ? '1 zona' : `${n} zonas`),
};

const localeComboboxCopy: CountryComboboxCopy = {
  placeholder: copy.localePlaceholder,
  noMatch: 'Ningún formato coincide.',
  list: 'Formatos regionales',
  results: (n: number) => (n === 1 ? '1 formato' : `${n} formatos`),
};

const HOUR_CYCLES: readonly HourCycle[] = ['h12', 'h23'];

type RegionalSettingsFieldsProps = RegionalCurrencySource & {
  /** Prefijo de los `id` (`${idPrefix}-country`…): quien lo monta enfoca el primer campo con error. */
  idPrefix: string;
  values: RegionalSettingsValues;
  onChange: <F extends RegionalSettingsField>(field: F, value: RegionalSettingsValues[F]) => void;
  errors: RegionalSettingsErrors;
  /**
   * Campos que llevan una sugerencia sin tocar y de dónde sale
   * (`useRegionalDraft`): mientras la conservan llevan la marca «Sugerido por
   * tu navegador» / «Sugerido por el país».
   */
  sources?: Partial<Record<RegionalSettingsField, RegionalSource>>;
  /** Lo que propone el país para un campo que no lo sigue; se ofrece con «Usar …». */
  proposals?: Partial<Record<CountryField, string>>;
  onAcceptProposal?: (field: CountryField) => void;
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

function withSource(source: RegionalSource | undefined, hint: string): string {
  if (source === 'browser') return `${copy.suggested} ${hint}`;
  if (source === 'country') return `${copy.suggestedByCountry} ${hint}`;
  if (source === 'format') return `${copy.suggestedByFormat} ${hint}`;
  return hint;
}

/**
 * País, moneda, zona horaria, formato regional y reloj de una sede (G1, spec
 * §6.2 y §6.7; G1-B §9; R1 2026-10-31). Lo comparten el modal de sede y el
 * registro; el estado y las sugerencias los lleva `useRegionalDraft`. Zona y
 * formato se eligen en un combobox con nombres legibles («(UTC+9) Tokio —
 * Japón», «Japonés (Japón) — 12,345.67 · 2026/10/31»); se guarda el
 * id IANA y la etiqueta BCP 47. El reloj se elige entre 12 h y 24 h, cada
 * opción con su ejemplo en vivo con el formato y la zona elegidos.
 */
export function RegionalSettingsFields({
  idPrefix,
  values,
  onChange,
  errors,
  token,
  currencyLoader,
  sources = {},
  proposals = {},
  onAcceptProposal,
  stacked = false,
}: RegionalSettingsFieldsProps) {
  // Un instante fijo por apertura: la vista previa, los desfases y los
  // ejemplos del reloj cambian con lo elegido, no con el paso del tiempo.
  const [previewAt] = useState(() => new Date());
  // Los idiomas del navegador se leen tras montar: el registro se pinta
  // también en el servidor, cuyo `navigator` no es el del navegador.
  const [languages, setLanguages] = useState<string[]>([]);
  useEffect(() => {
    function hydrate() {
      setLanguages(browserLocales());
    }
    hydrate();
  }, []);
  const id = (field: RegionalSettingsField) => regionalFieldId(idPrefix, field);
  const invalid = (field: RegionalSettingsField) => (errors[field] ? true : undefined);
  const describedBy = (field: RegionalSettingsField, hintId?: string) =>
    errors[field] ? fieldErrorId(id(field)) : hintId;

  const zoneOptions = useMemo(
    () => timeZoneChoices(values.country, [values.timeZone, proposals.timeZone], previewAt),
    [values.country, values.timeZone, proposals.timeZone, previewAt],
  );
  const localeOptions = useMemo(
    () => localeChoices(values.country, [values.locale, proposals.locale], languages, previewAt),
    [values.country, values.locale, proposals.locale, languages, previewAt],
  );
  const preview = regionalPreview(values.locale, values.timeZone, values.hourCycle, previewAt);
  const examples = hourCycleExamples(values.locale, values.timeZone, previewAt);
  const hourCycleHintId = `${id('hourCycle')}-hint`;
  const country = countryName(values.country || null);
  const zoneOutside =
    Boolean(country) &&
    values.timeZone.trim() !== '' &&
    countryTimeZones(values.country).length > 0 &&
    !timeZoneInCountry(values.timeZone, values.country);

  function proposalRow(field: 'currency' | 'timeZone' | 'locale', shown: string) {
    const value = proposals[field];
    if (!value || !country || !onAcceptProposal) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted" data-proposal={field}>
        <span>{copy.proposal[field](country, shown)}</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => {
            onAcceptProposal(field);
            // El reloj va con el formato: si el país también lo propone, se aplica con él.
            if (field === 'locale' && proposals.hourCycle) onAcceptProposal('hourCycle');
          }}
        >
          {field === 'currency' ? copy.useProposal.currency(value) : copy.useProposal[field]}
        </Button>
      </div>
    );
  }

  return (
    <div className={stacked ? 'flex flex-col gap-4' : 'grid gap-4 sm:grid-cols-2'}>
      <FormField
        htmlFor={id('country')}
        label={copy.country}
        error={errors.country}
        hint={withSource(sources.country, copy.countryHint)}
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

      <FormField
        htmlFor={id('currency')}
        label={copy.currency}
        error={errors.currency}
        hint={withSource(sources.currency, copy.currencyHint)}
        hintId={`${id('currency')}-hint`}
      >
        <CurrencySelect
          id={id('currency')}
          {...(currencyLoader ? { loader: currencyLoader } : { token: token as string })}
          value={values.currency}
          onChange={(code) => onChange('currency', code)}
          placeholder={copy.currencyPlaceholder}
          invalid={Boolean(errors.currency)}
          required
          ariaDescribedBy={describedBy('currency', `${id('currency')}-hint`)}
        />
        {proposalRow('currency', proposals.currency ?? '')}
      </FormField>

      <FormField
        htmlFor={id('timeZone')}
        label={copy.timeZone}
        error={errors.timeZone}
        hint={
          zoneOutside && country
            ? `${copy.timeZoneOutsideCountry(country)} ${copy.timeZoneHint}`
            : withSource(sources.timeZone, copy.timeZoneHint)
        }
        hintId={`${id('timeZone')}-hint`}
      >
        <CountryCombobox<RegionalOption>
          id={id('timeZone')}
          value={values.timeZone.trim()}
          onChange={(code) => onChange('timeZone', code)}
          invalid={invalid('timeZone')}
          required
          ariaDescribedBy={describedBy('timeZone', `${id('timeZone')}-hint`)}
          options={zoneOptions}
          search={(query) => searchRegionalOptions(zoneOptions, query)}
          copy={timeZoneComboboxCopy}
        />
        {proposalRow('timeZone', proposals.timeZone ? timeZoneLabel(proposals.timeZone, previewAt) : '')}
      </FormField>

      <FormField
        htmlFor={id('locale')}
        label={copy.locale}
        error={errors.locale}
        hint={withSource(sources.locale, copy.localeHint)}
        hintId={`${id('locale')}-hint`}
      >
        <CountryCombobox<RegionalOption>
          id={id('locale')}
          value={values.locale.trim()}
          onChange={(code) => onChange('locale', code)}
          invalid={invalid('locale')}
          required
          ariaDescribedBy={describedBy('locale', `${id('locale')}-hint ${id('locale')}-preview`)}
          options={localeOptions}
          search={(query) => searchRegionalOptions(localeOptions, query)}
          copy={localeComboboxCopy}
        />
        {proposalRow('locale', proposals.locale ? localeName(proposals.locale) : '')}
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
            {withSource(sources.hourCycle, copy.hourCycleHint)}
          </p>
        )}
      </fieldset>
    </div>
  );
}
