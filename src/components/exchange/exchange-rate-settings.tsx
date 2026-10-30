'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { ArrowLeftRight, Lock, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getExchangeRateSettings,
  listManualExchangeRates,
  parseRateInput,
  registerManualExchangeRate,
  saveExchangeRateSettings,
  type ExchangeRateSource,
  type ManualExchangeRate,
} from '@/lib/exchange/exchange-settings-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { EmptyState } from '@/components/shared/empty-state';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { CurrencySelect } from '@/components/shared/currency-select';
import { SectionError } from '@/components/errors/section-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const exchangeRateCopy = {
  sourceHeading: 'De dónde sale la tasa',
  sourceLabels: { AUTOMATIC: 'Automática', MANUAL: 'Manual' } satisfies Record<ExchangeRateSource, string>,
  sourceHints: {
    AUTOMATIC: 'La tasa del día la da un proveedor de tasas de cambio. Es la opción con la que empieza toda clínica.',
    MANUAL:
      'La clínica registra cada día la tasa de cada moneda. Un día sin tasa registrada, los abonos en esa moneda quedan sin tasa: no se usa la de otro día.',
  } satisfies Record<ExchangeRateSource, string>,
  change: 'Cambiar',
  sourceDialogTitle: 'Cambiar de dónde sale la tasa',
  sourceDialogDescription:
    'Se aplica desde ya a los saldos y totales de todas las sedes. Los abonos ya cobrados no cambian. El cambio queda en la auditoría.',
  sourceLegend: 'Fuente de la tasa',
  save: 'Guardar',
  sourceSaved: 'Fuente de la tasa guardada.',
  sourceSaveError: 'No pudimos guardar la fuente de la tasa. Intenta de nuevo.',
  ratesHeading: 'Tasas manuales',
  ratesHint: 'Unidades de cada moneda por 1 USD, por día. Una tasa registrada no se puede cambiar.',
  ratesAutomaticNote:
    'Con la fuente automática estas tasas no se usan. Puedes dejar la de hoy registrada antes de cambiar a manual.',
  register: 'Registrar tasa',
  emptyTitle: 'Aún no hay tasas manuales',
  emptyDescription: 'Registra la tasa del día de cada moneda en la que cobra la clínica.',
  colDate: 'Fecha',
  colCurrency: 'Moneda',
  colRate: 'Tasa por 1 USD',
  colAuthor: 'Registrada por',
  unknownAuthor: 'Usuario no disponible',
  noFormat: '—',
  rateSaved: (currency: string) => `Tasa de ${currency} registrada.`,
  loadError: 'No pudimos cargar la tasa de cambio de la clínica.',
  forbiddenTitle: 'Solo administración ve y cambia la tasa de cambio.',
  forbiddenHint: 'Los saldos y totales en otra moneda se convierten con la tasa que fije administración.',
  loading: 'Cargando',
};

export const rateFormCopy = {
  title: 'Registrar tasa',
  description: 'Una tasa registrada no se puede cambiar: revisa el día, la moneda y el valor antes de guardar.',
  date: 'Fecha',
  currency: 'Moneda',
  currencyPlaceholder: 'Elige una moneda',
  rate: 'Tasa por 1 USD',
  rateHint: 'Cuántas unidades de la moneda equivalen a 1 USD, con hasta 8 decimales. Por ejemplo, 36,5.',
  ratePlaceholder: 'Por ejemplo, 36,5',
  submit: 'Registrar tasa',
  dateMissing: 'Elige el día de la tasa.',
  dateFuture: 'Ese día aún no ha llegado en la sede.',
  currencyMissing: 'Elige la moneda.',
  genericError: 'No pudimos registrar la tasa. Intenta de nuevo.',
};

const copy = exchangeRateCopy;
/** El rango que acepta la API. */
const DATE_MIN = '2000-01-01';

interface LoadedState {
  source: ExchangeRateSource;
  rates: ManualExchangeRate[];
}

/** Mismo orden que la API: día más reciente primero y, dentro del día, por moneda. */
function sortRates(rates: ManualExchangeRate[]): ManualExchangeRate[] {
  return [...rates].sort((a, b) =>
    a.date === b.date ? a.currency.localeCompare(b.currency) : b.date.localeCompare(a.date),
  );
}

/**
 * Ajustes › Tasa de cambio (DX-374): de dónde sale la tasa del día de la
 * clínica (proveedor o manual) y las tasas manuales registradas. Solo ADMIN:
 * al resto se le enseña el estado bloqueado sin llamar a la API. Cambiar la
 * fuente y registrar una tasa van en modales.
 */
export function ExchangeRateSettingsView({ token, allowed }: { token: string; allowed: boolean }) {
  const [state, setState] = useState<LoadedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceKey, setSourceKey] = useState<number | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [rateKey, setRateKey] = useState<number | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const fmt = readyFormat(useSedeFormat(token));
  const sourceHeadingId = useId();
  const ratesHeadingId = useId();

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    Promise.all([getExchangeRateSettings(token), listManualExchangeRates(token)])
      .then(([settings, rates]) => {
        if (cancelled) return;
        setState({ source: settings.source, rates });
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoadError(
            apiErrorMessage(err, {
              fallback: copy.loadError,
              byStatus: { 404: copy.loadError },
            }),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [token, allowed, reloadKey]);

  if (!allowed) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }
  if (loadError) {
    return (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!state) {
    return (
      <div role="status" aria-label={copy.loading} className="flex max-w-3xl flex-col gap-4">
        <div className="rounded-xl border border-border bg-surface p-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-4 w-72" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  function openRate() {
    setNotice('');
    setRateKey((k) => (k ?? 0) + 1);
    setRateOpen(true);
  }

  const registerButton = (
    <Button type="button" onClick={openRate} className="max-sm:min-h-11 max-sm:w-full">
      <Plus aria-hidden />
      {copy.register}
    </Button>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <section aria-labelledby={sourceHeadingId} className="flex flex-col gap-3">
        <h2 id={sourceHeadingId} className="text-lg font-semibold text-ink">
          {copy.sourceHeading}
        </h2>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <ArrowLeftRight aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
            <div className="min-w-0">
              <p data-testid="exchange-rate-source" className="font-medium text-ink">
                {copy.sourceLabels[state.source]}
              </p>
              <p className="mt-1 text-sm text-muted">{copy.sourceHints[state.source]}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 max-sm:min-h-11 max-sm:w-full"
            onClick={() => {
              setNotice('');
              setSourceKey((k) => (k ?? 0) + 1);
              setSourceOpen(true);
            }}
          >
            {copy.change}
          </Button>
        </div>
        <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
          {notice}
        </p>
      </section>

      <section aria-labelledby={ratesHeadingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={ratesHeadingId} className="text-lg font-semibold text-ink">
              {copy.ratesHeading}
            </h2>
            <p className="text-sm text-muted">{copy.ratesHint}</p>
            {state.source === 'AUTOMATIC' ? <p className="text-sm text-muted">{copy.ratesAutomaticNote}</p> : null}
          </div>
          {state.rates.length > 0 ? registerButton : null}
        </div>
        {state.rates.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight aria-hidden />}
            title={copy.emptyTitle}
            description={copy.emptyDescription}
            actionClassName="w-full sm:w-auto"
            action={registerButton}
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <Table aria-label={copy.ratesHeading}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{copy.colDate}</TableHead>
                  <TableHead>{copy.colCurrency}</TableHead>
                  <TableHead className="text-right">{copy.colRate}</TableHead>
                  <TableHead>{copy.colAuthor}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rates.map((rate) => (
                  <TableRow key={rate.id} className="sm:h-11">
                    <TableCell className="whitespace-nowrap text-ink tabular-nums" data-label={copy.colDate}>
                      {fmt ? fmt.civilDate(rate.date) : copy.noFormat}
                    </TableCell>
                    <TableCell className="font-medium text-ink max-sm:text-right" data-label={copy.colCurrency}>
                      <Badge variant="muted">{rate.currency}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-ink tabular-nums" data-label={copy.colRate}>
                      {rateText(rate.rate, fmt)}
                    </TableCell>
                    <TableCell className="text-muted max-sm:text-right" data-label={copy.colAuthor}>
                      {rate.createdBy.fullName ?? copy.unknownAuthor}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      {sourceKey !== null ? (
        <SourceModal
          key={sourceKey}
          open={sourceOpen}
          onOpenChange={setSourceOpen}
          token={token}
          current={state.source}
          onSaved={(source) => {
            setState((prev) => (prev ? { ...prev, source } : prev));
            setNotice(copy.sourceSaved);
          }}
        />
      ) : null}
      {rateKey !== null ? (
        <RateFormModal
          key={rateKey}
          open={rateOpen}
          onOpenChange={setRateOpen}
          token={token}
          onSaved={(rate) => {
            setState((prev) => (prev ? { ...prev, rates: sortRates([rate, ...prev.rates]) } : prev));
            setNotice(copy.rateSaved(rate.currency));
          }}
        />
      ) : null}
    </div>
  );
}

/** La tasa con los decimales que tenga (hasta 8), en el formato de la sede; sin formato, «—» (R11). */
function rateText(rate: number, fmt: RegionalFormat | null): string {
  return fmt ? fmt.number(rate, { min: 0, max: 8 }) : copy.noFormat;
}

interface SourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  current: ExchangeRateSource;
  onSaved: (source: ExchangeRateSource) => void;
}

/** Cada apertura parte de la fuente guardada: el padre lo monta con una `key` por apertura. */
function SourceModal({ open, onOpenChange, token, current, onSaved }: SourceModalProps) {
  const [draft, setDraft] = useState<ExchangeRateSource>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = useId();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (draft === current) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveExchangeRateSettings(token, draft);
      onSaved(saved.source);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.sourceSaveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.sourceDialogTitle}
      description={copy.sourceDialogDescription}
      onSubmit={handleSubmit}
      submitLabel={copy.save}
      submitting={saving}
      error={error}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">{copy.sourceLegend}</legend>
        {(['AUTOMATIC', 'MANUAL'] as const).map((source) => {
          const id = `${name}-${source}`;
          return (
            <label
              key={source}
              htmlFor={id}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-3 text-sm has-[:checked]:border-primary"
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={source}
                checked={draft === source}
                onChange={() => setDraft(source)}
                disabled={saving}
                aria-describedby={`${id}-hint`}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-ink">{copy.sourceLabels[source]}</span>
                <span id={`${id}-hint`} className="text-muted">
                  {copy.sourceHints[source]}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </FormModal>
  );
}

type RateField = 'date' | 'currency' | 'rate';
type RateErrors = Partial<Record<RateField, string>>;
const RATE_FIELDS: readonly RateField[] = ['date', 'currency', 'rate'];
const RATE_FORM_ID = 'manual-rate-form';
const rateInputId = (field: RateField) => `${RATE_FORM_ID}-${field}`;

interface RateFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  onSaved: (rate: ManualExchangeRate) => void;
}

/**
 * Alta de una tasa manual. La fecha por defecto es hoy en la zona de la sede
 * y no admite días futuros (la API vuelve a comprobarlo); la moneda sale de la
 * lista de monedas (la base de las tasas la rechaza la API, con su mensaje
 * junto al campo). Un 400 con `field` va junto a su
 * campo; el 409 (ya hay una tasa ese día) arriba del modal. El padre lo monta
 * con una `key` por apertura.
 */
export function RateFormModal({ open, onOpenChange, token, onSaved }: RateFormModalProps) {
  const timeZone = readyTimeZone(useSedeTimeZone(token));
  const today = timeZone ? sedeToday(timeZone) : null;
  const [date, setDate] = useState<string | null>(null);
  const [currency, setCurrency] = useState('');
  const [rate, setRate] = useState('');
  const [errors, setErrors] = useState<RateErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Hasta que se sabe la zona de la sede, el día por defecto es «hoy» allí.
  const dateValue = date ?? today ?? '';

  function clearError(field: RateField) {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): { errors: RateErrors; value: number | null } {
    const found: RateErrors = {};
    if (dateValue === '') found.date = rateFormCopy.dateMissing;
    else if (today && dateValue > today) found.date = rateFormCopy.dateFuture;
    if (currency === '') found.currency = rateFormCopy.currencyMissing;
    const parsed = parseRateInput(rate);
    if (!parsed.ok) found.rate = parsed.error;
    return { errors: found, value: parsed.ok ? parsed.value : null };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { errors: found, value } = validate();
    setErrors(found);
    setFormError(null);
    const first = RATE_FIELDS.find((f) => found[f]);
    if (first || value === null) {
      if (first) document.getElementById(rateInputId(first))?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const saved = await registerManualExchangeRate(token, {
        date: dateValue,
        currency,
        rate: value,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const text = apiErrorMessage(err, rateFormCopy.genericError);
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        err.field &&
        (RATE_FIELDS as readonly string[]).includes(err.field)
      ) {
        const field = err.field as RateField;
        setErrors((prev) => ({ ...prev, [field]: text }));
        document.getElementById(rateInputId(field))?.focus();
        return;
      }
      setFormError(text);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={rateFormCopy.title}
      description={rateFormCopy.description}
      onSubmit={handleSubmit}
      submitLabel={rateFormCopy.submit}
      submitting={submitting}
      error={formError}
    >
      <FormField htmlFor={rateInputId('date')} label={rateFormCopy.date} error={errors.date}>
        <Input
          id={rateInputId('date')}
          type="date"
          value={dateValue}
          min={DATE_MIN}
          onChange={(e) => {
            setDate(e.target.value);
            clearError('date');
          }}
          aria-required
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? fieldErrorId(rateInputId('date')) : undefined}
          className="max-sm:min-h-11"
        />
      </FormField>
      <FormField htmlFor={rateInputId('currency')} label={rateFormCopy.currency} error={errors.currency}>
        <CurrencySelect
          id={rateInputId('currency')}
          token={token}
          value={currency}
          onChange={(code) => {
            setCurrency(code);
            clearError('currency');
          }}
          placeholder={rateFormCopy.currencyPlaceholder}
          invalid={Boolean(errors.currency)}
          required
          ariaDescribedBy={errors.currency ? fieldErrorId(rateInputId('currency')) : undefined}
          className="max-sm:min-h-11"
        />
      </FormField>
      <FormField
        htmlFor={rateInputId('rate')}
        label={rateFormCopy.rate}
        error={errors.rate}
        hint={rateFormCopy.rateHint}
        hintId={`${rateInputId('rate')}-hint`}
      >
        <Input
          id={rateInputId('rate')}
          inputMode="decimal"
          autoComplete="off"
          value={rate}
          placeholder={rateFormCopy.ratePlaceholder}
          onChange={(e) => {
            setRate(e.target.value);
            clearError('rate');
          }}
          aria-required
          aria-invalid={errors.rate ? true : undefined}
          aria-describedby={errors.rate ? fieldErrorId(rateInputId('rate')) : `${rateInputId('rate')}-hint`}
          className="max-sm:min-h-11 tabular-nums"
        />
      </FormField>
    </FormModal>
  );
}
