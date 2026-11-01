'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getCurrencyTexts, saveCurrencyTexts } from '@/lib/exchange/currency-texts-api';
import { listCurrencies, type Currency } from '@/lib/reference/currencies-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import { CURRENCY_TEXT_MAX, isCurrencyText } from '@/lib/format/currency-text';
import { setClinicCurrencyTexts } from '@/lib/format/clinic-currency-texts';
import { formatCurrency } from '@/lib/format/currency';
import { moneyWithCode } from '@/lib/format/sede-number';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { fieldErrorId } from '@/components/shared/form-field';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingRow, SettingRows, SettingsSection } from '@/components/settings/settings-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';

/** Importe de ejemplo de la vista previa. */
const SAMPLE = 1234.5;

export const currencyTextsCopy = {
  heading: 'Texto de cada moneda',
  support:
    'Los importes llevan el código de su moneda («1.234,50 USD»). Si en tu clínica una moneda se escribe de otra forma, pon aquí su texto: ocupa el lugar del código, en la posición que da el formato de la sede.',
  usedBy: (names: string[]) => `Moneda de ${names.join(', ')}.`,
  added: 'Añadida aquí.',
  textLabel: (code: string) => `Texto de ${code}`,
  preview: (text: string) => `Así se verá: ${text}`,
  invalid: `De 1 a ${CURRENCY_TEXT_MAX} caracteres, en una línea.`,
  addLabel: 'Otra moneda',
  addPlaceholder: 'Elige una moneda',
  add: 'Añadir',
  applies: 'Se aplica al momento en pantallas, impresos y mensajes. Los recibos ya emitidos conservan el texto con el que salieron.',
  saved: 'Texto de las monedas guardado.',
  saveAria: 'Guardar el texto de las monedas',
  loadError: 'No pudimos cargar las monedas de la clínica.',
  saveError: 'No pudimos guardar el texto de las monedas. Intenta de nuevo.',
  loading: 'Cargando',
  forbiddenTitle: 'Solo administración cambia cómo se escribe cada moneda.',
  forbiddenHint: 'Los importes se pintan con el texto que fije administración o, sin él, con el código de la moneda.',
};

const copy = currencyTextsCopy;

/** Código → texto tal como se escribe (sin vacíos). */
type Texts = Record<string, string>;

const sameTexts = (a: Texts, b: Texts): boolean => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

interface Loaded {
  saved: Texts;
  locations: ClinicLocation[];
  currencies: Currency[];
}

/**
 * DX-517, Ajustes › Monedas: el texto propio de cada moneda de la clínica
 * (solo ADMIN). Una fila por moneda que usan sus sedes o que ya tiene texto;
 * otra moneda se añade con «Otra moneda». Vacío = el código ISO. Un solo
 * guardado (la barra «Cambios sin guardar»); al guardar, toda la pestaña
 * pinta ya con el texto nuevo.
 */
export function CurrencyTextsForm({ token, allowed }: { token: string; allowed: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    Promise.all([getCurrencyTexts(token), listLocations(token), listCurrencies(token)])
      .then(([texts, locations, currencies]) => {
        if (cancelled) return;
        setLoaded({
          saved: Object.fromEntries(texts.entries.map((e) => [e.currency, e.text])),
          locations,
          currencies,
        });
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, allowed, reloadKey]);

  if (!allowed) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />;
  }

  return (
    <SettingsSection title={copy.heading} description={copy.support}>
      {loadError ? (
        <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !loaded ? (
        <div role="status" aria-label={copy.loading} className="rounded-xl border border-border bg-surface p-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      ) : (
        <CurrencyTextsFields
          token={token}
          loaded={loaded}
          onSaved={(saved) => setLoaded({ ...loaded, saved })}
        />
      )}
    </SettingsSection>
  );
}

function CurrencyTextsFields({
  token,
  loaded,
  onSaved,
}: {
  token: string;
  loaded: Loaded;
  onSaved: (saved: Texts) => void;
}) {
  const router = useRouter();
  const { draft, setDraft, dirty, discard, commit } = useSettingsDraft<Texts>(loaded.saved, sameTexts);
  const [added, setAdded] = useState<string[]>([]);
  const [toAdd, setToAdd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formId = 'currency-texts-form';

  // Las sedes que usan cada moneda, y el formato con el que se ve el ejemplo.
  const sedesByCurrency = useMemo(() => {
    const map = new Map<string, ClinicLocation[]>();
    for (const location of loaded.locations) {
      if (!location.currency) continue;
      map.set(location.currency, [...(map.get(location.currency) ?? []), location]);
    }
    return map;
  }, [loaded.locations]);
  const names = useMemo(() => new Map(loaded.currencies.map((c) => [c.code, c.name])), [loaded.currencies]);

  const rows = useMemo(() => {
    const codes = new Set<string>([...sedesByCurrency.keys(), ...Object.keys(loaded.saved), ...added]);
    return [...codes].sort();
  }, [sedesByCurrency, loaded.saved, added]);
  const addable = loaded.currencies.filter((c) => !rows.includes(c.code));

  function formatFor(code: string): RegionalFormat | null {
    for (const location of sedesByCurrency.get(code) ?? []) {
      const fmt = locationRegionalFormat(location);
      if (fmt) return fmt;
    }
    for (const location of loaded.locations) {
      const fmt = locationRegionalFormat(location);
      if (fmt) return fmt;
    }
    return null;
  }

  function preview(code: string): string {
    const text = (draft[code] ?? '').trim();
    const texts = isCurrencyText(text) ? { [code]: text } : {};
    const fmt = formatFor(code);
    return fmt ? moneyWithCode(SAMPLE, code, fmt, texts) : formatCurrency(SAMPLE, code, undefined, texts);
  }

  function setText(code: string, value: string) {
    const next = { ...draft };
    const clean = value.replace(/[\r\n]+/g, ' ');
    if (clean === '') delete next[code];
    else next[code] = clean;
    setDraft(next);
    if (fieldErrors[code]) {
      const rest = { ...fieldErrors };
      delete rest[code];
      setFieldErrors(rest);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const entries = Object.entries(draft)
      .map(([currency, text]) => ({ currency, text: text.trim() }))
      .filter((entry) => entry.text !== '');
    const invalid = Object.fromEntries(entries.filter((entry) => !isCurrencyText(entry.text)).map((entry) => [entry.currency, copy.invalid]));
    setFieldErrors(invalid);
    if (Object.keys(invalid).length > 0) return;
    setSaving(true);
    try {
      const res = await saveCurrencyTexts(token, entries);
      const saved = Object.fromEntries(res.entries.map((entry) => [entry.currency, entry.text]));
      // Toda la pestaña pinta ya con el texto nuevo; el layout lo vuelve a leer con la marca.
      setClinicCurrencyTexts(saved);
      onSaved(saved);
      commit(saved);
      router.refresh();
      toast.success(copy.saved);
    } catch (err) {
      const message = apiErrorMessage(err, copy.saveError);
      const code = err instanceof ApiError && err.status === 400 ? rows.find((c) => message.includes(c)) : undefined;
      if (code) setFieldErrors({ [code]: message });
      else setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <SettingRows>
        {rows.map((code) => {
          const inputId = `currency-text-${code}`;
          const previewId = `${inputId}-preview`;
          const fieldError = fieldErrors[code] ?? null;
          const sedes = sedesByCurrency.get(code) ?? [];
          const name = names.get(code);
          return (
            <SettingRow
              key={code}
              labelId={`${inputId}-label`}
              label={name ? `${code} · ${name}` : code}
              description={sedes.length > 0 ? copy.usedBy(sedes.map((s) => s.name)) : copy.added}
            >
              <div className="flex w-full flex-col gap-1 sm:w-56">
                <Input
                  id={inputId}
                  autoComplete="off"
                  aria-label={copy.textLabel(code)}
                  placeholder={code}
                  value={draft[code] ?? ''}
                  disabled={saving}
                  onChange={(e) => setText(code, e.target.value)}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? `${fieldErrorId(inputId)} ${previewId}` : previewId}
                  className="max-sm:min-h-11"
                />
                <p id={previewId} className="t-data text-sm text-muted">
                  {copy.preview(preview(code))}
                </p>
                {fieldError ? <InlineError id={fieldErrorId(inputId)}>{fieldError}</InlineError> : null}
              </div>
            </SettingRow>
          );
        })}
      </SettingRows>
      {addable.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:w-72">
            {copy.addLabel}
            <NativeSelect value={toAdd} onChange={(e) => setToAdd(e.target.value)} disabled={saving}>
              <option value="">{copy.addPlaceholder}</option>
              {addable.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button
            type="button"
            variant="secondary"
            className="max-sm:min-h-11 max-sm:w-full"
            disabled={saving || toAdd === ''}
            onClick={() => {
              setAdded((prev) => [...prev, toAdd]);
              setToAdd('');
            }}
          >
            {copy.add}
          </Button>
        </div>
      ) : null}
      <p className="text-sm text-muted">{copy.applies}</p>
      <SaveBar
        dirty={dirty}
        saving={saving}
        form={formId}
        error={error}
        saveAriaLabel={copy.saveAria}
        onDiscard={() => {
          discard();
          setError(null);
          setFieldErrors({});
        }}
      />
    </form>
  );
}
