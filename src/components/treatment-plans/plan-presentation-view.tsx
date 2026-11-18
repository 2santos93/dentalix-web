'use client';
import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Columns2, FileX, Lock, Printer, X } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import type { ClinicRole } from '@/lib/me/me-api';
import { canAcceptPlan, getPlanQuote, isPlanAcceptable, type PlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { getPlan, listPlans, type TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { optionGroupOf } from '@/lib/treatment-plans/plan-options';
import {
  PRESENTATION_MODE_LABELS,
  PRESENTATION_MODES,
  modeShowsMoney,
  planTabHref,
  presentationFromQuote,
  type PresentationMode,
} from '@/lib/treatment-plans/plan-presentation';
import {
  scenarioLine,
  simulateInstallments,
  type InstallmentSimulation,
  type InstallmentTerms,
} from '@/lib/treatment-plans/installment-simulation';
import { documentFormat, documentTexts } from '@/lib/format/document-format';
import { convertWithRate, paymentRateCopy, ratePairLabel } from '@/lib/payments/payment-rate';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { locationCurrency } from '@/lib/locations/location-settings';
import { usePrintDocumentTitle } from '@/lib/print/use-print-document-title';
import { useExchangeRates } from '@/components/payments/use-exchange-rates';
import { ratePreviewCopy } from '@/components/payments/payment-rate-preview';
import { CurrencySelect } from '@/components/shared/currency-select';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { FieldError } from '@/components/errors/field-error';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PlanPresentationVisits, type PresentationSecondTotal } from './plan-presentation-visits';
import { secondCurrencyOf } from './quote-second-currency';

export const planPresentationCopy = {
  toolbar: 'Acciones de la presentación',
  close: 'Cerrar',
  closeHint: 'Volver a la ficha del paciente',
  viewLabel: 'Vista',
  print: 'Imprimir',
  alternatives: 'Ver alternativas',
  hideAlternatives: 'Ocultar alternativas',
  title: 'Plan de tratamiento',
  documentTitle: (name: string) => `Plan de tratamiento · ${name}`,
  subtitle: (patient: string, clinic: string) => `${patient} · ${clinic}`,
  professional: (name: string) => `Profesional: ${name}`,
  option: (label: string) => `Opción: ${label}`,
  loading: 'Preparando la presentación…',
  loadError: 'No pudimos cargar el plan.',
  notFoundTitle: 'No encontramos este plan.',
  notFoundHint: 'Puede que el enlace no sea de esta clínica o de este paciente.',
  forbiddenTitle: 'Tu rol no tiene acceso a este plan.',
  forbiddenHint: 'Pide a la administración de la clínica que revise tu rol.',
  modeHint: {
    completa: 'Visitas, dientes e importes.',
    clinica: 'Lo que se hará en cada visita, sin importes.',
    economica: 'Importes por visita, sin dientes.',
  } satisfies Record<PresentationMode, string>,
  // Segunda moneda orientativa (patrón DX-376).
  secondCurrency: 'Segunda moneda',
  secondNone: 'Sin segunda moneda',
  secondLoading: 'Consultando la tasa de hoy…',
  secondMissing: (currency: string) => `No hay tasa de ${currency} para hoy: se presenta sin la segunda moneda.`,
  secondTotal: (currency: string) => `Total orientativo (${currency})`,
  secondNote: (pair: string, source: string, date: string, currency: string) =>
    `Tasa de hoy: ${pair} (${source}, ${date}). El importe en ${currency} es orientativo y se calcula con la tasa del día del pago.`,
  // Cuotas (las de «Financiar», DX-041).
  financingHeading: 'Opciones de pago',
  financingOption: (n: number) => `Opción ${n}`,
  financingNote: 'Sin intereses. El plan de cuotas se fija al aceptar el presupuesto.',
  financingError: 'No pudimos calcular las cuotas: se presenta sin ellas.',
  // Alternativas A/B.
  alternativesHeading: 'Alternativas del plan',
  unnamed: 'Opción sin nombre',
  current: 'La que estás viendo',
  total: 'Total',
  items: (n: number) => (n === 1 ? '1 procedimiento' : `${n} procedimientos`),
  choose: 'Elegir esta opción',
  chooseLabel: (label: string) => `Elegir ${label}`,
  alternativesError: 'No pudimos cargar las alternativas.',
  mixedCurrencies: 'Las opciones están en monedas distintas: compara cada total en su moneda.',
};

const copy = planPresentationCopy;

interface PlanPresentationViewProps {
  token: string;
  role: ClinicRole | null;
  patientId: string;
  planId: string;
  mode: PresentationMode;
  onModeChange: (mode: PresentationMode) => void;
  /** «Cerrar» y Escape: la ficha en la pestaña del plan. */
  closeHref: string;
  /** El rol lee el plan clínico (las alternativas); sin él solo se presenta este. */
  canReadPlan: boolean;
  /** En `false` no se pide nada y se muestra el aviso de acceso. */
  allowed?: boolean;
  /** Las cuotas de «Financiar» (`?cuotas=`): se vuelven a simular, nada se guarda. */
  financing?: InstallmentTerms[] | null;
}

interface Alternative {
  plan: TreatmentPlan;
  simulation: InstallmentSimulation | null;
}

/**
 * DX-560 · «Presentar» el plan al paciente, a pantalla completa y sin el
 * shell: las visitas con su odontograma compacto, en tres vistas (Completa,
 * Clínica sin importes, Económica sin dientes), la segunda moneda orientativa
 * con la tasa de hoy, las cuotas simuladas y las alternativas lado a lado.
 * Lee `GET …/quote` (no emite el presupuesto ni fija su validez). Escape y
 * «Cerrar» vuelven a la ficha; «Imprimir» saca una hoja con la vista elegida.
 */
export function PlanPresentationView({
  token,
  role,
  patientId,
  planId,
  mode,
  onModeChange,
  closeHref,
  canReadPlan,
  allowed = true,
  financing = null,
}: PlanPresentationViewProps) {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deniedByApi, setDeniedByApi] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [group, setGroup] = useState<TreatmentPlan[]>([]);
  const [optionLabel, setOptionLabel] = useState<string | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);
  const [alternativesError, setAlternativesError] = useState(false);
  const [alternativesKey, setAlternativesKey] = useState(0);
  const [paymentOptions, setPaymentOptions] = useState<InstallmentSimulation | null>(null);
  const [financingFailed, setFinancingFailed] = useState(false);
  const forbidden = !allowed || deniedByApi;

  // El presupuesto (GET, sin emitirlo) y, si el rol lee planes, el grupo de opciones.
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      try {
        const [res, plans] = await Promise.all([
          getPlanQuote(token, patientId, planId),
          canReadPlan ? listPlans(token, patientId).catch(() => [] as TreatmentPlan[]) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        // La URL nombra al paciente: un plan de otro no se presenta bajo su ficha.
        if (res.patientId !== patientId) {
          setNotFound(true);
          setError(copy.loadError);
          return;
        }
        const current = plans.find((p) => p.id === planId);
        setGroup(current ? optionGroupOf(plans, current) : []);
        setOptionLabel(current?.optionGroupId ? (current.optionLabel ?? null) : null);
        setQuote(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setDeniedByApi(err instanceof ApiError && err.status === 403);
        setNotFound(err instanceof ApiError && err.status === 404);
        setError(copy.loadError);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, planId, allowed, canReadPlan, reloadKey]);

  // Las cuotas de «Financiar», otra vez simuladas (nada viaja con importes).
  const financingKey = financing && financing.length > 0 ? JSON.stringify(financing) : null;
  useEffect(() => {
    if (!allowed || !financingKey) return;
    let cancelled = false;
    simulateInstallments(token, planId, JSON.parse(financingKey) as InstallmentTerms[])
      .then((res) => {
        if (!cancelled) setPaymentOptions(res);
      })
      .catch(() => {
        if (!cancelled) setFinancingFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, planId, financingKey, allowed]);

  // Las alternativas, al abrirlas: el total de cada una (y sus cuotas con los mismos términos).
  const groupKey = group.map((p) => `${p.id}:${p.updatedAt}`).join('|');
  useEffect(() => {
    if (!showAlternatives || group.length < 2) return;
    let cancelled = false;
    const terms = financingKey ? (JSON.parse(financingKey) as InstallmentTerms[]) : null;
    Promise.all(
      group.map(async (option): Promise<Alternative> => {
        const plan = await getPlan(token, option.id);
        const simulation =
          terms && isPlanAcceptable(plan)
            ? await simulateInstallments(token, option.id, terms).catch(() => null)
            : null;
        return { plan, simulation };
      }),
    )
      .then((rows) => {
        if (!cancelled) setAlternatives(rows);
      })
      .catch(() => {
        if (!cancelled) setAlternativesError(true);
      });
    return () => {
      cancelled = true;
    };
    // `group` se resume en `groupKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAlternatives, groupKey, financingKey, token, alternativesKey]);

  // Foco al título al abrir (la pantalla entera es nueva).
  useEffect(() => {
    if (quote && !focused.current) {
      focused.current = true;
      titleRef.current?.focus();
    }
  }, [quote]);

  // Escape vuelve a la ficha, como «Cerrar».
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('select, [role="dialog"], [role="listbox"]')) return;
      router.push(closeHref);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, closeHref]);

  const format = useMemo(() => (quote ? documentFormat(quote.regional) : null), [quote]);
  const doc = documentTexts(format);
  const model = useMemo(() => (quote ? presentationFromQuote(quote) : null), [quote]);

  // Segunda moneda: la de la sede del presupuesto si no es la del plan, o la que se elija.
  const locations = useLocationsState(token);
  const sedeCurrency =
    quote && locations.status === 'ready'
      ? locationCurrency(locations.locations.find((l) => l.id === quote.location.id))
      : null;
  const defaultSecond = quote && sedeCurrency && sedeCurrency !== quote.currency ? sedeCurrency : '';
  const [chosenSecond, setChosenSecond] = useState<string | null>(null);
  const second = chosenSecond ?? defaultSecond;
  const showMoney = modeShowsMoney(mode);
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : '';
  const rates = useExchangeRates(
    token,
    today,
    second !== '' && quote !== null && showMoney,
    quote && second ? [quote.currency, second] : [],
  );
  const secondResult = quote && second && showMoney ? secondCurrencyOf(rates, quote.currency, second, today) : null;
  const secondTotal: PresentationSecondTotal | null =
    quote && model && secondResult && 'value' in secondResult
      ? {
          label: copy.secondTotal(secondResult.value.currency),
          amount: doc.amount(convertWithRate(model.total, secondResult.value), secondResult.value.currency),
          note: copy.secondNote(
            ratePairLabel(quote.currency, secondResult.value, doc.amount),
            paymentRateCopy.source[secondResult.value.source],
            doc.civilDate(secondResult.value.date),
            secondResult.value.currency,
          ),
        }
      : null;

  usePrintDocumentTitle(copy.title, quote ? copy.documentTitle(quote.patient.name) : null);

  const hasAlternatives = group.length > 1;
  const mayAccept = canAcceptPlan(role);
  const modeOptions = PRESENTATION_MODES.map((value) => ({
    value,
    label: PRESENTATION_MODE_LABELS[value],
    buttonProps: { 'data-testid': `presentation-mode-${value}` },
  }));

  return (
    <div className="presentation-print-page flex min-h-dvh flex-1 flex-col bg-canvas print:min-h-0 print:bg-white">
      <div
        role="toolbar"
        aria-label={copy.toolbar}
        className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border bg-surface px-4 py-3 lg:flex-row lg:items-center lg:justify-between print:hidden"
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild variant="ghost" className="justify-start self-start">
            <Link href={closeHref} title={copy.closeHint}>
              <X aria-hidden />
              {copy.close}
            </Link>
          </Button>
          <SegmentedControl
            aria-label={copy.viewLabel}
            value={mode}
            onValueChange={onModeChange}
            options={modeOptions}
            fullWidthOnMobile
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {quote && showMoney ? (
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <label htmlFor="presentation-second-currency" className="text-sm text-ink">
                {copy.secondCurrency}
              </label>
              <CurrencySelect
                id="presentation-second-currency"
                token={token}
                value={second}
                onChange={setChosenSecond}
                exclude={[quote.currency]}
                noneLabel={copy.secondNone}
                className="sm:w-56"
              />
            </div>
          ) : null}
          {hasAlternatives && showMoney ? (
            <Button
              type="button"
              variant="secondary"
              aria-expanded={showAlternatives}
              aria-controls="presentation-alternatives"
              onClick={() => setShowAlternatives((v) => !v)}
            >
              <Columns2 aria-hidden />
              {showAlternatives ? copy.hideAlternatives : copy.alternatives}
            </Button>
          ) : null}
          <Button type="button" onClick={() => window.print()} disabled={!quote || format === null}>
            <Printer aria-hidden />
            {copy.print}
          </Button>
        </div>
      </div>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:py-8 print:p-0">
        {quote && model ? (
          <article
            className="presentation-print-root mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6"
            data-testid="plan-presentation"
          >
            <header className="flex min-w-0 flex-col gap-1">
              <h1 ref={titleRef} tabIndex={-1} className="t-display text-ink outline-none">
                {copy.title}
              </h1>
              <p className="t-body break-words text-muted">
                {copy.subtitle(quote.patient.name, quote.clinicName)}
                {optionLabel ? ` · ${copy.option(optionLabel)}` : ''}
              </p>
              {quote.professionalName ? (
                <p className="t-caption break-words text-muted">{copy.professional(quote.professionalName)}</p>
              ) : null}
              <p className="t-caption text-muted print:hidden">{copy.modeHint[mode]}</p>
            </header>

            {showMoney && second ? (
              <div role="status" aria-live="polite" className="text-sm text-ink print:hidden">
                {zone.status === 'error' ? (
                  <SedeConfigError kind="timeZone" variant="note" onRetry={zone.retry} />
                ) : rates.status === 'loading' || (rates.status === 'idle' && !today) ? (
                  <p className="text-muted">{copy.secondLoading}</p>
                ) : rates.status === 'error' || rates.status === 'unavailable' ? (
                  <FieldError
                    label={ratePreviewCopy.error}
                    onRetry={rates.retry}
                    retryLabel={ratePreviewCopy.retry}
                    className="w-full sm:w-auto"
                  />
                ) : secondResult && 'missing' in secondResult ? (
                  <p>{copy.secondMissing(secondResult.missing)}</p>
                ) : null}
              </div>
            ) : null}

            <PlanPresentationVisits
              model={model}
              mode={mode}
              money={(amount) => doc.amount(amount, quote.currency)}
              secondTotal={secondTotal}
            />

            {showMoney && financingKey ? (
              <section
                aria-labelledby="presentation-financing"
                data-testid="presentation-financing"
                className="flex min-w-0 flex-col gap-2 break-inside-avoid"
              >
                <h2 id="presentation-financing" className="t-title text-ink">
                  {copy.financingHeading}
                </h2>
                {financingFailed ? (
                  <p className="text-sm text-muted">{copy.financingError}</p>
                ) : !paymentOptions ? (
                  <Skeleton className="h-12 w-full" />
                ) : (
                  <>
                    <ul className="flex flex-col gap-1 text-sm text-ink">
                      {paymentOptions.scenarios.map((scenario, index) => (
                        <li key={index} className="tabular-nums break-words">
                          <span className="font-medium">{copy.financingOption(index + 1)}:</span>{' '}
                          {scenarioLine(scenario, paymentOptions.currency, doc) ?? '—'}
                        </li>
                      ))}
                    </ul>
                    <p className="t-caption text-muted">{copy.financingNote}</p>
                  </>
                )}
              </section>
            ) : null}

            {hasAlternatives && showMoney && showAlternatives ? (
              <section
                id="presentation-alternatives"
                aria-labelledby="presentation-alternatives-title"
                className="flex min-w-0 flex-col gap-3 print:hidden"
              >
                <h2 id="presentation-alternatives-title" className="t-title text-ink">
                  {copy.alternativesHeading}
                </h2>
                {alternativesError ? (
                  <SectionError
                    description={copy.alternativesError}
                    onRetry={() => {
                      setAlternativesError(false);
                      setAlternatives(null);
                      setAlternativesKey((k) => k + 1);
                    }}
                  />
                ) : !alternatives ? (
                  <div role="status" className="grid gap-3 sm:grid-cols-2">
                    <span className="sr-only">{copy.loading}</span>
                    {group.map((o) => (
                      <Skeleton key={o.id} className="h-32 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <>
                    <ul
                      data-testid="presentation-alternatives"
                      className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3"
                    >
                      {alternatives.map(({ plan, simulation }) => {
                        const label = plan.optionLabel ?? copy.unnamed;
                        const isCurrent = plan.id === planId;
                        const choosable = mayAccept && isPlanAcceptable(plan);
                        return (
                          <li
                            key={plan.id}
                            aria-label={label}
                            aria-current={isCurrent ? true : undefined}
                            className={cn('flex min-w-0 flex-col gap-2 bg-surface p-4', isCurrent && 'bg-surface-sunken')}
                          >
                            <span className="min-w-0 break-words font-medium text-ink">{label}</span>
                            <dl className="flex items-baseline justify-between gap-3 text-sm">
                              <dt className="t-label text-muted">{copy.total}</dt>
                              <dd className="text-base font-semibold text-ink tabular-nums">
                                {doc.amount(plan.total ?? 0, plan.currency)}
                              </dd>
                            </dl>
                            <p className="text-sm text-muted tabular-nums">{copy.items(plan.items?.length ?? 0)}</p>
                            {simulation ? (
                              <ul className="flex flex-col gap-0.5 text-xs text-muted">
                                {simulation.scenarios.map((scenario, index) => (
                                  <li key={index} className="break-words tabular-nums">
                                    {copy.financingOption(index + 1)}: {scenarioLine(scenario, simulation.currency, doc) ?? '—'}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {isCurrent ? <p className="t-label text-muted">{copy.current}</p> : null}
                            {choosable ? (
                              <Button asChild variant={isCurrent ? 'default' : 'secondary'} size="sm" className="self-start">
                                <Link href={planTabHref(patientId, plan.id, { accept: true })} aria-label={copy.chooseLabel(label)}>
                                  {copy.choose}
                                </Link>
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    {new Set(alternatives.map((a) => a.plan.currency)).size > 1 ? (
                      <p className="text-sm text-muted">{copy.mixedCurrencies}</p>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}
          </article>
        ) : forbidden ? (
          <div className="mx-auto max-w-xl py-8">
            <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
          </div>
        ) : notFound ? (
          <div className="mx-auto max-w-xl py-8">
            <EmptyState role="status" icon={<FileX aria-hidden />} title={copy.notFoundTitle} description={copy.notFoundHint} />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-xl py-8">
            <SectionError
              description={error}
              onRetry={() => {
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            />
          </div>
        ) : (
          <p role="status" className="py-8 text-center text-sm text-muted">
            {copy.loading}
          </p>
        )}
      </main>
    </div>
  );
}
