'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Link2, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { useSessionLocations } from '@/lib/session/session-store';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { isValidPeriod, PERIOD_PRESETS, periodFor, type PeriodPresetKey } from '@/lib/reports/period-presets';
import { isCivilDate } from '@/lib/reports/chair-occupancy-api';
import {
  getPatientLinks,
  hasSends,
  PATIENT_LINK_LABELS,
  type PatientLinkMetrics,
  type PatientLinksFilters,
  type PatientLinksReport,
} from '@/lib/reports/patient-links-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { InlineError } from '@/components/errors/inline-error';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';

export const patientLinksCopy = {
  scope: 'Qué enlaces que mandas al paciente se abren y se completan, por tipo y sede',
  period: 'Enviados en',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede',
  locationAll: 'Todas tus sedes',
  inactive: '(desactivada)',
  restricted: 'Solo incluye tus sedes.',
  periodLine: (from: string, to: string) =>
    from === to ? `Enlaces enviados el ${from}` : `Enlaces enviados del ${from} al ${to}`,
  noValue: '—',
  allLocations: 'Todas tus sedes',
  tableLabel: (scope: string) => `Uso de los enlaces del paciente: ${scope}`,
  columns: {
    link: 'Enlace',
    sent: 'Enviados',
    opened: 'Abiertos',
    completed: 'Completados',
    expired: 'Caducados sin abrir',
    median: 'Mediana hasta completar',
  },
  countRate: (count: string, rate: string) => `${count} · ${rate}`,
  hours: (value: string) => `${value} h`,
  mobileSent: (count: number, n: string) => (count === 1 ? '1 enviado' : `${n} enviados`),
  mobileOpened: (v: string) => `Abiertos ${v}`,
  mobileCompleted: (v: string) => `Completados ${v}`,
  mobileExpired: (v: string) => `Caducados sin abrir ${v}`,
  mobileMedian: (v: string) => `Mediana ${v}`,
  legend:
    '«—»: la confirmación de cita no registra si el paciente abrió el enlace (solo su respuesta); las indicaciones postoperatorias no tienen paso de completar (abrirlas es leerlas); y sin enlaces enviados no hay porcentaje.',
  howTitle: 'Cómo se calcula',
  howFormula: 'Cada porcentaje es sobre los enlaces enviados en el período.',
  howItems: [
    'Cuentan los enlaces ENVIADOS en las fechas elegidas (el día de la sede del enlace). Abiertos, completados y caducados son de esos mismos enlaces, tal como están hoy.',
    'Abierto: el paciente abrió la página del enlace. Completar cuenta como abrir. En la anamnesis, la apertura se registra al ver el cuestionario; en la firma, al pedir el código.',
    'Completado: anamnesis enviada, consentimiento firmado, presupuesto aceptado, o cita respondida (confirmar, cancelar o «llámenme»).',
    'Caducado sin abrir: pasó su fecha de caducidad sin que el paciente lo abriera. Un enlace anulado o reemplazado por otro no cuenta: no caducó.',
    'Mediana hasta completar: la mitad de los enlaces completados lo hizo en menos horas que esta, desde el envío.',
    'Sede: la del enlace; en la confirmación de cita, la de la cita. Las indicaciones impresas no son un enlace y no cuentan. Sin nombres, teléfonos ni emails de pacientes.',
  ],
  loadError: 'No pudimos cargar el uso de los enlaces del paciente.',
  badRequest: 'El período no es válido: elige fechas de hasta 366 días con «Desde» anterior o igual a «Hasta».',
  forbiddenTitle: 'Tu rol no tiene acceso al uso de los enlaces del paciente.',
  forbiddenHint: 'Es para la administración de la clínica.',
  empty: 'Sin enlaces enviados',
  emptyHint:
    'En este período no se envió ningún enlace al paciente desde tus sedes. Prueba con otro período o sede.',
};

const PRESET_PARAM = 'periodo';
const DEFAULT_PRESET: PeriodPresetKey = 'this_month';

function isPreset(value: string | null): value is PeriodPresetKey {
  return PERIOD_PRESETS.some((p) => p.key === value);
}

type Row = PatientLinkMetrics & { key: string; label: string };

function countWithRate(count: number | null, rate: number | null, fmt: RegionalFormat): string {
  const c = patientLinksCopy;
  if (count === null) return c.noValue;
  const n = fmt.number(count);
  return rate === null ? n : c.countRate(n, fmt.percent(rate, 1));
}

function medianText(hours: number | null, fmt: RegionalFormat): string | null {
  return hours === null ? null : patientLinksCopy.hours(fmt.number(hours, { min: 1, max: 1 }));
}

function columnsFor(fmt: RegionalFormat): DataListColumn<Row>[] {
  const c = patientLinksCopy;
  /** En la tarjeta, «—» no se pinta: la línea se omite (DESIGN → Tables). */
  const meta = (label: (v: string) => string, count: number | null, rate: number | null) =>
    count === null ? null : label(countWithRate(count, rate, fmt));
  return [
    {
      id: 'link',
      header: c.columns.link,
      mobile: 'primary',
      cell: (r) => r.label,
      mobileCell: (r) => r.label,
    },
    {
      id: 'sent',
      header: c.columns.sent,
      numeric: true,
      mobile: 'trailing',
      cell: (r) => fmt.number(r.sent),
      mobileCell: (r) => c.mobileSent(r.sent, fmt.number(r.sent)),
    },
    {
      id: 'opened',
      header: c.columns.opened,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap">{countWithRate(r.opened, r.openedRate, fmt)}</span>,
      mobileCell: (r) => meta(c.mobileOpened, r.opened, r.openedRate),
    },
    {
      id: 'completed',
      header: c.columns.completed,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap">{countWithRate(r.completed, r.completedRate, fmt)}</span>,
      mobileCell: (r) => meta(c.mobileCompleted, r.completed, r.completedRate),
    },
    {
      id: 'expired',
      header: c.columns.expired,
      numeric: true,
      cell: (r) => (
        <span className="whitespace-nowrap">{countWithRate(r.expiredUnopened, r.expiredUnopenedRate, fmt)}</span>
      ),
      mobileCell: (r) => meta(c.mobileExpired, r.expiredUnopened, r.expiredUnopenedRate),
    },
    {
      id: 'median',
      header: c.columns.median,
      numeric: true,
      cell: (r) => <span className="whitespace-nowrap">{medianText(r.medianHoursToComplete, fmt) ?? c.noValue}</span>,
      mobileCell: (r) => {
        const text = medianText(r.medianHoursToComplete, fmt);
        return text === null ? null : c.mobileMedian(text);
      },
    },
  ];
}

function LinksSection({ title, rows, fmt }: { title: string; rows: PatientLinkMetrics[]; fmt: RegionalFormat }) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} data-testid="patient-links-section" className="flex min-w-0 flex-col gap-2">
      <h3 id={headingId} className="t-label text-ink">
        {title}
      </h3>
      <DataList
        label={patientLinksCopy.tableLabel(title)}
        rows={rows.map((r) => ({ ...r, key: r.linkType, label: PATIENT_LINK_LABELS[r.linkType] }))}
        columns={columnsFor(fmt)}
        getRowKey={(r) => r.key}
      />
    </section>
  );
}

function HowItIsCalculated() {
  const c = patientLinksCopy;
  return (
    <div className="-mx-2 max-w-[80ch] self-start" data-testid="patient-links-how">
      <Disclosure summary={c.howTitle} meta={c.howFormula}>
        <div className="flex flex-col gap-2 text-sm text-muted">
          <p className="font-medium text-ink">{c.howFormula}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {c.howItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </Disclosure>
    </div>
  );
}

/** Las tablas: con una sola sede, la suya; con varias, el total y cada sede. */
function sectionsOf(report: PatientLinksReport): { key: string; title: string; rows: PatientLinkMetrics[] }[] {
  if (report.locations.length === 1) {
    const [only] = report.locations;
    return [{ key: only.locationId, title: only.locationName, rows: only.rows }];
  }
  return [
    { key: 'total', title: patientLinksCopy.allLocations, rows: report.totals },
    ...report.locations.map((l) => ({ key: l.locationId, title: l.locationName, rows: l.rows })),
  ];
}

/**
 * «Enlaces del paciente» (DX-424), pestaña de Reportes para la administración:
 * de los enlaces que la clínica mandó al paciente en el período (anamnesis,
 * firma de consentimiento, aceptación de presupuesto, confirmación de cita e
 * indicaciones postoperatorias), cuántos se abrieron, se completaron o
 * caducaron sin abrirse, con la mediana de horas hasta completarlos. Solo
 * lectura. Período y sede en la URL (`?periodo=`, `?desde=`, `?hasta=`,
 * `?sede=`) junto a la pestaña; a 390 px cada tipo es una tarjeta.
 */
export function PatientLinksView({ token }: { token: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const today = timeZone ? sedeToday(timeZone) : null;
  const ids = React.useId();
  const periodErrorId = `${ids}-period-error`;
  const requestLocations = useSessionLocations(token);

  const presetParam = searchParams.get(PRESET_PARAM);
  const preset: PeriodPresetKey = isPreset(presetParam) ? presetParam : DEFAULT_PRESET;
  const fromParam = searchParams.get('desde');
  const toParam = searchParams.get('hasta');
  const locationId = searchParams.get('sede') ?? '';
  const customPeriod =
    isCivilDate(fromParam) && isCivilDate(toParam)
      ? { from: fromParam, to: toParam }
      : today
        ? periodFor(DEFAULT_PRESET, today)
        : null;
  const period = preset === 'custom' ? customPeriod : today ? periodFor(preset, today) : null;
  const invalidPeriod = preset === 'custom' && period !== null && !isValidPeriod(period);

  const [locations, setLocations] = useState<{ id: string; name: string; isActive: boolean }[] | null>(null);
  const [data, setData] = useState<PatientLinksReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const filters: PatientLinksFilters | null =
    period && !invalidPeriod ? { ...period, ...(locationId ? { locationId } : {}) } : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  // Opciones de sede: si fallan, el filtro sigue con «Todas tus sedes».
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    requestLocations()
      .then((list) => {
        if (!cancelled) setLocations(list.map((l) => ({ id: l.id, name: l.name, isActive: l.isActive })));
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations]);

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as PatientLinksFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getPatientLinks(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId);
        setLoadError(
          apiErrorMessage(err, { fallback: patientLinksCopy.loadError, byStatus: { 400: patientLinksCopy.badRequest } }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, reloadKey]);

  /** Reescribe filtros en la URL sin navegar (conserva `?tab=`). */
  function setParams(values: Partial<Record<'periodo' | 'desde' | 'hasta' | 'sede', string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function choosePreset(next: PeriodPresetKey) {
    // Al pasar a «Personalizado» se parte de las fechas que se veían.
    if (next === 'custom' && period) setParams({ periodo: next, desde: period.from, hasta: period.to });
    else setParams({ periodo: next === DEFAULT_PRESET ? '' : next, desde: '', hasta: '' });
  }

  if (forbidden) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={patientLinksCopy.forbiddenTitle}
        description={patientLinksCopy.forbiddenHint}
      />
    );
  }

  const c = patientLinksCopy;
  const showLoading = !invalidPeriod && (loading || !filters);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Link2 aria-hidden className="size-4 shrink-0" />
        <span>{c.scope}</span>
      </p>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <FormField htmlFor={`${ids}-period`} label={c.period} className="sm:w-48">
          <NativeSelect
            id={`${ids}-period`}
            value={preset}
            onChange={(e) => choosePreset(e.target.value as PeriodPresetKey)}
          >
            {PERIOD_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {preset === 'custom' && period ? (
          <FormField htmlFor={`${ids}-dates`} label={c.dates} className="sm:w-72">
            <DateRangePicker
              id={`${ids}-dates`}
              value={period}
              onChange={(range) => {
                if (range) setParams({ periodo: 'custom', desde: range.from, hasta: range.to });
              }}
              startLabel={c.from}
              endLabel={c.to}
              isInvalid={invalidPeriod}
              aria-describedby={invalidPeriod ? periodErrorId : undefined}
            />
          </FormField>
        ) : null}
        <FormField htmlFor={`${ids}-location`} label={c.location} className="min-w-0 sm:w-48">
          <NativeSelect
            id={`${ids}-location`}
            value={locationId}
            onChange={(e) => setParams({ sede: e.target.value })}
            disabled={!locations}
          >
            <option value="">{c.locationAll}</option>
            {locations?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.isActive ? l.name : `${l.name} ${c.inactive}`}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      {invalidPeriod ? <InlineError id={periodErrorId}>{c.badRequest}</InlineError> : null}

      {data && fmt && !invalidPeriod && !showLoading && !loadError ? (
        <p className="text-sm text-muted tabular-nums">
          {c.periodLine(fmt.civilDate(data.from.slice(0, 10)), fmt.civilDate(data.to.slice(0, 10)))}
        </p>
      ) : null}

      {data?.restrictedToLocations && !showLoading && !loadError ? (
        <Callout tone="info" role="note" data-testid="patient-links-restricted" className="max-w-[80ch] self-start py-2">
          {c.restricted}
        </Callout>
      ) : null}

      <HowItIsCalculated />

      {invalidPeriod ? null : zone.status === 'error' && !period ? (
        <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />
      ) : sedeFormat.status === 'error' ? (
        <SedeConfigError
          kind="locale"
          description={sedeFormat.message}
          onRetry={sedeFormat.retry}
          locationId={sedeFormat.locationId}
        />
      ) : (
        <AsyncSection
          loading={showLoading || sedeFormat.status === 'loading'}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={!data || !hasSends(data)}
          emptyTitle={c.empty}
          emptyDescription={c.emptyHint}
          skeleton={<TableSkeleton rows={5} />}
        >
          {fmt && data ? (
            <div className="flex min-w-0 flex-col gap-6">
              {sectionsOf(data).map((s) => (
                <LinksSection key={s.key} title={s.title} rows={s.rows} fmt={fmt} />
              ))}
              <p className="max-w-[80ch] text-sm text-muted" data-testid="patient-links-legend">
                {c.legend}
              </p>
            </div>
          ) : null}
        </AsyncSection>
      )}
    </div>
  );
}
