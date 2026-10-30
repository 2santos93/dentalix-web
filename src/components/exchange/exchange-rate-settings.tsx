'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { ArrowLeftRight, Info, Lock, Plus, TriangleAlert } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  correctManualExchangeRate,
  getExchangeRateSettings,
  listManualExchangeRates,
  parseRateInput,
  registerManualExchangeRate,
  saveExchangeRateSettings,
  type ExchangeRateSettings,
  type ExchangeRateSource,
  type ManualExchangeRate,
} from '@/lib/exchange/exchange-settings-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { getRateBacklogDay, type RateBacklogDay } from '@/lib/payments/rate-backlog-api';
import { cn } from '@/lib/utils';
import { sedeCivilDate } from '@/lib/format/sede-number';
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
      'Desde el día en que se elige, la clínica registra cada día la tasa de cada moneda. Un día sin tasa registrada, los abonos en esa moneda quedan sin tasa: no se usa la de otro día. Los días anteriores siguen con la tasa automática; si un abono de un día anterior se quedó sin ella, la tasa manual que registres para ese día le sirve de respaldo.',
  } satisfies Record<ExchangeRateSource, string>,
  /** Con la fecha en el formato de la sede; sin formato, sin fecha (R11). */
  manualSince: (date: string | null) => (date ? `Manual desde el ${date}` : 'Manual'),
  change: 'Cambiar',
  sourceDialogTitle: 'Cambiar de dónde sale la tasa',
  sourceDialogDescription:
    'Con la manual, la tasa registrada rige desde hoy. Cada abono conserva la tasa con la que se registró, así que cambiar de fuente no mueve ningún saldo ya calculado. Los abonos que siguen sin tasa la toman en cuanto haya tasa de su día: con la manual, también los de un día anterior al cambio, con la tasa que registres para ese día como respaldo. El cambio queda en la auditoría.',
  sourceLegend: 'Fuente de la tasa',
  save: 'Guardar',
  sourceSaved: 'Fuente de la tasa guardada.',
  sourceSaveError: 'No pudimos guardar la fuente de la tasa. Intenta de nuevo.',
  ratesHeading: 'Tasas manuales',
  ratesHint: (base: string) =>
    `Unidades de cada moneda por 1 ${base}, por día. Se usan desde el día en que la clínica pasó a manual; la de un día anterior sirve de respaldo a los abonos de ese día que sigan sin tasa. Una tasa se puede corregir hasta que algún abono la use.`,
  ratesAutomaticNote:
    'Con la fuente automática estas tasas no se usan. Puedes dejar la de hoy registrada antes de cambiar a manual.',
  register: 'Registrar tasa',
  emptyTitle: 'Aún no hay tasas manuales',
  emptyDescription: 'Registra la tasa del día de cada moneda en la que cobra la clínica.',
  colDate: 'Fecha',
  colCurrency: 'Moneda',
  colRate: (base: string) => `Tasa por 1 ${base}`,
  colAuthor: 'Registrada por',
  colActions: 'Acciones',
  // DX-375: una tasa que ya congeló algún abono no se cambia.
  inUse: 'Usada en abonos',
  inUseHelp: 'Ya la usa al menos un abono: no se puede cambiar.',
  correct: 'Corregir',
  /** Lo que completa «Corregir» para lectores de pantalla. */
  correctContext: (currency: string, date: string) => ` la tasa de ${currency} del ${date}`,
  /** Nombre accesible: empieza por el texto visible (WCAG 2.5.3). */
  correctFor: (currency: string, date: string) =>
    `${exchangeRateCopy.correct}${exchangeRateCopy.correctContext(currency, date)}`,
  rateCorrected: (currency: string) => `Tasa de ${currency} corregida.`,
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
  description:
    'Revisa el día, la moneda y el valor antes de guardar: en cuanto un abono use la tasa, ya no se podrá corregir.',
  date: 'Fecha',
  currency: 'Moneda',
  currencyPlaceholder: 'Elige una moneda',
  rate: (base: string) => `Tasa por 1 ${base}`,
  rateHint: (base: string) => `Cuántas unidades de la moneda equivalen a 1 ${base}, con hasta 8 decimales. Por ejemplo, 36,5.`,
  ratePlaceholder: 'Por ejemplo, 36,5',
  submit: 'Registrar tasa',
  dateMissing: 'Elige el día de la tasa.',
  dateFuture: 'Ese día aún no ha llegado en la sede.',
  currencyMissing: 'Elige la moneda.',
  genericError: 'No pudimos registrar la tasa. Intenta de nuevo.',
  // DX-402: con la fuente automática ninguna tasa manual se usa.
  automaticNote:
    'Con la fuente automática esta tasa no se usa. Si pasas a manual, la de un día anterior servirá de respaldo a los abonos de ese día que sigan sin tasa.',
  // DX-402: un día anterior a «manual desde»: la tasa solo sirve de respaldo
  // a los abonos de ese día que siguen sin tasa (y sin tasa del proveedor).
  backup: {
    heading: (since: string) => `Este día es anterior a «manual desde» (${since}).`,
    pickCurrency:
      'Su tasa solo sirve de respaldo a los abonos de ese día que sigan sin tasa. Elige la moneda para ver a cuántos se aplicará.',
    checking: 'Comprobando los abonos sin tasa de ese día…',
    applies: (count: number, currency: string) =>
      count === 1
        ? `Servirá de respaldo al abono sin tasa de ese día que necesita la tasa de ${currency}: el saldo lo contará en un minuto. No cambia ninguna tasa ya congelada.`
        : `Servirá de respaldo a los ${count} abonos sin tasa de ese día que necesitan la tasa de ${currency}: el saldo los contará en un minuto. No cambia ninguna tasa ya congelada.`,
    none: (currency: string) =>
      `No hay abonos sin tasa de ese día que necesiten la tasa de ${currency}, así que ahora no se usará. Solo serviría de respaldo a un abono de ese día que se quedara sin tasa.`,
    // Entre dos monedas no USD la de respaldo necesita las dos tasas del día.
    otherMissing: (count: number, currencies: string[]) =>
      count === 1
        ? `Otro abono sin tasa de ese día necesita además la tasa de ${currencies.join(', ')}: le servirá cuando registres también esa.`
        : `Otros ${count} abonos sin tasa de ese día necesitan además la tasa de ${currencies.join(', ')}: les servirá cuando registres también esa.`,
    onlyOther: (count: number, currency: string, currencies: string[]) =>
      count === 1
        ? `El abono sin tasa de ese día que necesita la tasa de ${currency} necesita además la de ${currencies.join(', ')}: esta no se usará hasta que registres también esa.`
        : `Los ${count} abonos sin tasa de ese día que necesitan la tasa de ${currency} necesitan además la de ${currencies.join(', ')}: esta no se usará hasta que registres también esa.`,
    provider: 'Ese día ya tiene la tasa del proveedor: los abonos de ese día usan esa, así que esta no se usará.',
    unknown:
      'Su tasa solo sirve de respaldo a los abonos de ese día que sigan sin tasa, si el proveedor no tiene la de ese día.',
  },
};

// DX-375: corregir una tasa que ningún abono usó.
export const correctRateCopy = {
  title: (currency: string, date: string) => `Corregir la tasa de ${currency} del ${date}`,
  description:
    'Solo se puede corregir mientras ningún abono la use. Los abonos que la usen después se convierten con la tasa corregida. Queda en la auditoría.',
  submit: 'Guardar tasa',
  genericError: 'No pudimos corregir la tasa. Intenta de nuevo.',
};

const copy = exchangeRateCopy;
/** El rango que acepta la API. */
const DATE_MIN = '2000-01-01';

interface LoadedState extends ExchangeRateSettings {
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
  const [correcting, setCorrecting] = useState<{
    rate: ManualExchangeRate;
    key: number;
  } | null>(null);
  const [correctOpen, setCorrectOpen] = useState(false);
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
        setState({ ...settings, rates });
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
                {state.source === 'MANUAL'
                  ? copy.manualSince(state.manualSince && fmt ? fmt.civilDate(state.manualSince) : null)
                  : copy.sourceLabels[state.source]}
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
            <p className="text-sm text-muted">{copy.ratesHint(state.baseCurrency)}</p>
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
                  <TableHead className="text-right">{copy.colRate(state.baseCurrency)}</TableHead>
                  <TableHead>{copy.colAuthor}</TableHead>
                  <TableHead>
                    <span className="sr-only">{copy.colActions}</span>
                  </TableHead>
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
                    <TableCell className="text-right text-ink tabular-nums" data-label={copy.colRate(state.baseCurrency)}>
                      {rateText(rate.rate, fmt)}
                    </TableCell>
                    <TableCell className="text-muted max-sm:text-right" data-label={copy.colAuthor}>
                      {rate.createdBy.fullName ?? copy.unknownAuthor}
                    </TableCell>
                    {/* Sin `data-label`: en la tarjeta móvil la acción se lee sola. */}
                    <TableCell className="text-right">
                      {rate.inUse ? (
                        <Badge variant="muted" title={copy.inUseHelp}>
                          {copy.inUse}
                          <span className="sr-only">: {copy.inUseHelp}</span>
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="max-sm:min-h-11"
                          onClick={() => {
                            setNotice('');
                            setCorrecting((prev) => ({
                              rate,
                              key: (prev?.key ?? 0) + 1,
                            }));
                            setCorrectOpen(true);
                          }}
                        >
                          {copy.correct}
                          <span className="sr-only">
                            {copy.correctContext(rate.currency, sedeCivilDate(rate.date, fmt))}
                          </span>
                        </Button>
                      )}
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
          key={`source-${sourceKey}`}
          open={sourceOpen}
          onOpenChange={setSourceOpen}
          token={token}
          current={state.source}
          onSaved={(saved) => {
            setState((prev) => (prev ? { ...prev, ...saved } : prev));
            setNotice(copy.sourceSaved);
          }}
        />
      ) : null}
      {rateKey !== null ? (
        <RateFormModal
          key={`rate-${rateKey}`}
          open={rateOpen}
          onOpenChange={setRateOpen}
          token={token}
          baseCurrency={state.baseCurrency}
          source={state.source}
          manualSince={state.manualSince}
          onSaved={(rate) => {
            setState((prev) => (prev ? { ...prev, rates: sortRates([rate, ...prev.rates]) } : prev));
            setNotice(copy.rateSaved(rate.currency));
          }}
        />
      ) : null}
      {correcting ? (
        <CorrectRateModal
          key={`correct-${correcting.key}`}
          open={correctOpen}
          onOpenChange={setCorrectOpen}
          token={token}
          baseCurrency={state.baseCurrency}
          rate={correcting.rate}
          dateLabel={sedeCivilDate(correcting.rate.date, fmt)}
          onSaved={(saved) => {
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    rates: prev.rates.map((r) => (r.id === saved.id ? saved : r)),
                  }
                : prev,
            );
            setNotice(copy.rateCorrected(saved.currency));
          }}
          onInUse={(id) =>
            setState((prev) =>
              prev ? { ...prev, rates: prev.rates.map((r) => (r.id === id ? { ...r, inUse: true } : r)) } : prev,
            )
          }
        />
      ) : null}
    </div>
  );
}

interface CorrectRateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  baseCurrency: string;
  rate: ManualExchangeRate;
  /** El día de la tasa en el formato de la sede. */
  dateLabel: string;
  onSaved: (rate: ManualExchangeRate) => void;
  /** Un abono la usó entretanto (409): la lista deja de ofrecer corregirla. */
  onInUse: (id: string) => void;
}

/**
 * DX-375: corrige el valor de una tasa que ningún abono usó; el día y la
 * moneda no cambian (van en el título). Si un abono la usó entretanto, el 409
 * de la API va arriba del modal. El padre lo monta con una `key` por apertura.
 */
function CorrectRateModal({
  open,
  onOpenChange,
  token,
  baseCurrency,
  rate,
  dateLabel,
  onSaved,
  onInUse,
}: CorrectRateModalProps) {
  const [text, setText] = useState(() => String(rate.rate).replace('.', ','));
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputId = `${RATE_FORM_ID}-correct`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const parsed = parseRateInput(text);
    if (!parsed.ok) {
      setError(parsed.error);
      document.getElementById(inputId)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const saved = await correctManualExchangeRate(token, rate.id, parsed.value);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err, correctRateCopy.genericError);
      if (err instanceof ApiError && err.status === 400 && err.field === 'rate') {
        setError(message);
        document.getElementById(inputId)?.focus();
        return;
      }
      if (err instanceof ApiError && err.status === 409 && err.code === 'MANUAL_EXCHANGE_RATE_IN_USE') {
        onInUse(rate.id);
      }
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={correctRateCopy.title(rate.currency, dateLabel)}
      description={correctRateCopy.description}
      onSubmit={handleSubmit}
      submitLabel={correctRateCopy.submit}
      submitting={submitting}
      error={formError}
    >
      <FormField
        htmlFor={inputId}
        label={rateFormCopy.rate(baseCurrency)}
        error={error ?? undefined}
        hint={rateFormCopy.rateHint(baseCurrency)}
        hintId={`${inputId}-hint`}
      >
        <Input
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          aria-required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? fieldErrorId(inputId) : `${inputId}-hint`}
          className="max-sm:min-h-11 tabular-nums"
        />
      </FormField>
    </FormModal>
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
  onSaved: (saved: ExchangeRateSettings) => void;
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
      onSaved(saved);
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
  /** Moneda base de las tasas (la da la API): no se ofrece y nombra la tasa. */
  baseCurrency: string;
  /** Fuente de la clínica y desde qué día rige la manual (DX-402). */
  source: ExchangeRateSource;
  manualSince: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  onSaved: (rate: ManualExchangeRate) => void;
}

/**
 * Alta de una tasa manual. La fecha por defecto es hoy en la zona de la sede
 * y no admite días futuros (la API vuelve a comprobarlo); la moneda sale de la
 * lista de monedas sin la moneda base, que da la API. Un 400 con `field` va
 * junto a su campo; el 409 (ya hay una tasa ese día) arriba del modal. El padre lo monta
 * con una `key` por apertura. DX-402: con la fuente manual y un día anterior a
 * «manual desde», dice a cuántos abonos sin tasa de ese día servirá de
 * respaldo o que no se usará; con la automática, que no se usa.
 */
export function RateFormModal({
  open,
  onOpenChange,
  token,
  baseCurrency,
  source,
  manualSince,
  onSaved,
}: RateFormModalProps) {
  const timeZone = readyTimeZone(useSedeTimeZone(token));
  const fmt = readyFormat(useSedeFormat(token));
  const today = timeZone ? sedeToday(timeZone) : null;
  const [date, setDate] = useState<string | null>(null);
  const [currency, setCurrency] = useState('');
  const [rate, setRate] = useState('');
  const [errors, setErrors] = useState<RateErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Hasta que se sabe la zona de la sede, el día por defecto es «hoy» allí.
  const dateValue = date ?? today ?? '';
  const backupSince =
    source === 'MANUAL' && manualSince && dateValue !== '' && dateValue < manualSince ? manualSince : null;

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
          max={today ?? undefined}
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
          exclude={[baseCurrency]}
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
        label={rateFormCopy.rate(baseCurrency)}
        error={errors.rate}
        hint={rateFormCopy.rateHint(baseCurrency)}
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
      {source === 'AUTOMATIC' ? <p className="text-sm text-muted">{rateFormCopy.automaticNote}</p> : null}
      {backupSince ? (
        <BackupRateNotice
          token={token}
          date={dateValue}
          currency={currency}
          sinceLabel={sedeCivilDate(backupSince, fmt)}
        />
      ) : null}
    </FormModal>
  );
}

type BackupPreview =
  | { status: 'loading' }
  | { status: 'ready'; day: RateBacklogDay }
  | { status: 'error' };

/**
 * DX-402: la tasa de un día anterior a «manual desde» solo sirve de respaldo a
 * los abonos de ese día que siguen sin tasa (y sin tasa del proveedor). Dice
 * a cuántos se aplicará o que no se usará. Es una indicación, no un error:
 * si no se puede comprobar, explica la regla sin prometer nada (sin toast:
 * el formulario sigue sirviendo igual). `role="status"`: el lector la anuncia
 * al cambiar el día o la moneda, sin interrumpir.
 */
function BackupRateNotice({
  token,
  date,
  currency,
  sinceLabel,
}: {
  token: string;
  date: string;
  currency: string;
  sinceLabel: string;
}) {
  const copy = rateFormCopy.backup;
  const [preview, setPreview] = useState<{ key: string; value: BackupPreview } | null>(null);
  const key = `${date}|${currency}`;

  useEffect(() => {
    if (currency === '') return;
    let cancelled = false;
    getRateBacklogDay(token, date, currency)
      .then((day) => {
        if (!cancelled) setPreview({ key: `${date}|${currency}`, value: { status: 'ready', day } });
      })
      .catch(() => {
        if (!cancelled) setPreview({ key: `${date}|${currency}`, value: { status: 'error' } });
      });
    return () => {
      cancelled = true;
    };
  }, [token, date, currency]);

  const current: BackupPreview = preview?.key === key ? preview.value : { status: 'loading' };
  let text: string;
  let unused = false;
  if (currency === '') text = copy.pickCurrency;
  else if (current.status === 'loading') text = copy.checking;
  else if (current.status === 'error') text = copy.unknown;
  else if (current.day.providerRateSaved) {
    text = copy.provider;
    unused = true;
  } else {
    const { count, otherRatesMissing: other } = current.day;
    const others = other.count > 0 ? other : null;
    if (count > 0) {
      text = copy.applies(count, currency);
      if (others) text = `${text} ${copy.otherMissing(others.count, others.currencies)}`;
    } else {
      text = others ? copy.onlyOther(others.count, currency, others.currencies) : copy.none(currency);
      unused = true;
    }
  }

  return (
    <div
      role="status"
      data-testid="manual-rate-backup-notice"
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-ink',
        unused ? 'border-warning/30 bg-warning/10' : 'border-border bg-surface-2',
      )}
    >
      {unused ? (
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      ) : (
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
      )}
      <div className="min-w-0">
        <p className="font-medium">{copy.heading(sinceLabel)}</p>
        <p>{text}</p>
      </div>
    </div>
  );
}
