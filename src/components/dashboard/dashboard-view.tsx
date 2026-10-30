'use client';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getDashboard, type Dashboard } from '@/lib/dashboard/dashboard-api';
import { addOneDayIso } from '@/lib/dashboard/date-range';
import { presetRange } from '@/lib/payments/cash-period';
import { readyTimeZone, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { RegionalReviewNotice } from '@/components/locations/regional-review-notice';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { activeSedeCurrency, hasActiveLocationWithoutCurrency } from '@/lib/locations/location-settings';
import { listStaff } from '@/lib/appointments/staff-api';
import { zoneCityLabel } from '@/lib/format/date';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { DateRangePicker } from '@/components/ui/date-picker';
import { FormField } from '@/components/shared/form-field';
import { AsyncSection } from '@/components/shared/async-section';
import { CurrencySelect } from '@/components/shared/currency-select';
import { InlineError } from '@/components/errors/inline-error';
import { DashboardSkeleton, LowStock, PeriodSummary, UpcomingAppointments } from './dashboard-sections';

// Copy as constants (i18n-ready, es-first) — matches
// treatment-plans-tab.tsx / agenda-view.tsx convention until next-intl
// wiring lands.
const copy = {
  periodLabel: 'Periodo',
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  currencyLabel: 'Moneda',
  currencyPlaceholder: 'Elige una moneda',
  // GLOBAL-G1 §5: en «Todas las sedes» con monedas distintas no hay una
  // moneda que suponer; se pide en el selector.
  chooseCurrency: 'Tus sedes usan monedas distintas: elige en «Moneda» en cuál ver los ingresos.',
  loading: 'Cargando panel…',
  forbidden: 'No tienes acceso a este panel.',
  genericError: 'No pudimos cargar el panel.',
  rangeInvalid: 'La fecha "Hasta" debe ser igual o posterior a la fecha "Desde".',
  // DX-097: los días del período son los del calendario de la sede.
  zoneNote: (timeZone: string) => `Días en hora de ${zoneCityLabel(timeZone)}.`,
};

interface DashboardViewProps {
  token: string;
}

/**
 * `'use client'` view for the `/dashboard` page — owner/admin-only read-only
 * summary. Owns its own from/to/currency controls (defaulting to the
 * current month..today and to the currency of the active location, or the
 * clinic's common one on «Todas las sedes»; never a fixed currency) and re-fetches `getDashboard` whenever any of
 * them change, mirroring `AgendaView`'s selector-driven refetch shape (day +
 * provider there, date range + currency here). Unlike `AgendaView` /
 * `TreatmentPlansTab` there is no "refresh in place while keeping stale data
 * mounted" state here — every filter change is a genuinely new query (a
 * different period/currency), so it's rendered as a fresh loading skeleton,
 * not a background refresh over the previous period's numbers.
 *
 * The "Moneda" control is a `CurrencySelect` (reference-data currencies)
 * instead of a free-text input — that input could produce an invalid ISO 4217
 * code and crash `Intl.NumberFormat` with a `RangeError` (all money now
 * renders through the crash-safe `formatCurrency`). "Desde"/"Hasta" also get a
 * client-side range guard (IMP-11): if `from > to` the request is never fired
 * and a friendly message is shown instead, mirroring `appointment-form.tsx`'s
 * `validationEndAfterStart`.
 */
export function DashboardView({ token }: DashboardViewProps) {
  // DX-097: por defecto, del 1 del mes a hoy EN LA SEDE (su zona IANA, de la
  // API), no en el navegador. Hasta saber la zona no hay período ni consulta;
  // sin zona de la sede, `SedeConfigError` (nunca otra zona).
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  // DX-378: la hora de las próximas citas, con el reloj de la sede (como la agenda y «En clínica»).
  const fmt = readyFormat(useSedeFormat(token));
  const defaults = useMemo(
    () =>
      timeZone
        ? { from: presetRange('month', timeZone).from, to: presetRange('today', timeZone).to }
        : null,
    [timeZone],
  );
  const [fromInput, setFrom] = useState<string | null>(null);
  const [toInput, setTo] = useState<string | null>(null);
  const from = fromInput ?? defaults?.from ?? '';
  const to = toInput ?? defaults?.to ?? '';
  // GLOBAL-G1: la moneda del panel es la de la sede activa (en «Todas», la
  // común de la clínica) hasta que se elija otra. Sin ella no hay consulta:
  // una sede sin moneda muestra `SedeConfigError`; monedas distintas, el
  // selector vacío para elegir.
  const locations = useLocationsState(token);
  const sedeCurrency =
    locations.status === 'ready' ? activeSedeCurrency(locations.locations, locations.activeLocationId) : null;
  const [currencyChoice, setCurrency] = useState('');
  const currency = currencyChoice || sedeCurrency?.currency || '';
  // Sin moneda por un dato que falta (lista sin cargar, sede sin configurar) es
  // un error con reintento; con monedas distintas, solo hay que elegir.
  const currencyUnknown =
    locations.status === 'error' ||
    (locations.status === 'ready' &&
      sedeCurrency?.currency === null &&
      (sedeCurrency.scope === 'sede' || hasActiveLocationWithoutCurrency(locations.locations)));

  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // El nombre del paciente viene joinado en cada cita
  // (`patientFirstName`/`patientLastName`). Antes se resolvía con un mapa
  // armado desde `GET /patients?pageSize=100`, que la API acota en 100: a
  // partir del paciente 101 la tarjeta mostraba el UUID crudo.
  // `staffNames` sí se mantiene: el endpoint de personal no está acotado así.
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await listStaff(token);
        if (cancelled) return;
        setStaffNames(Object.fromEntries(data.map((s) => [s.userId, s.fullName])));
      } catch {
        /* best-effort, see comment above */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // IMP-11: client-side range guard — if the user picks a "Desde" after
  // "Hasta", show a friendly message (mirrors `appointment-form.tsx`'s
  // `validationEndAfterStart`) instead of firing a request the backend would
  // just reject/return nothing useful for.
  const rangeInvalid = from !== '' && to !== '' && from > to;

  useEffect(() => {
    if (!token || !from || !to || !currency) return;
    // `rangeInvalid` is derived straight from `from`/`to` at render time (see
    // above), so the guard message below already renders ahead of
    // `loading`/`error`/`data` in the JSX regardless of what they hold here —
    // no need to reset them, which would just be a same-render synchronous
    // `setState` this effect doesn't otherwise need.
    if (rangeInvalid) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // `to` is the user's inclusive selection (what the "Hasta" input
        // shows); the backend's incomes/payments-totals query is half-open
        // `[from, to)`, so extend it by one day here — sending the raw value
        // would silently exclude payments made on the selected end date itself.
        const result = await getDashboard(token, { from, to: addOneDayIso(to), currency });
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setError(copy.forbidden);
        } else {
          setError(apiErrorMessage(err, copy.genericError));
        }
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, from, to, currency, reloadKey, rangeInvalid]);

  return (
    <div className="flex flex-col gap-8">
      {/* Aviso D5 (G1 §7): solo ADMIN, hasta confirmar cada sede activa. */}
      <RegionalReviewNotice token={token} />
      {/* Barra de filtros en línea (sin tarjeta): periodo + moneda, y la nota de
          alcance a la derecha. En móvil cada control ocupa la fila. */}
      <div className="flex flex-col gap-y-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-3">
        <FormField htmlFor="dashboard-period" label={copy.periodLabel} className="w-full sm:w-auto">
          <DateRangePicker
            id="dashboard-period"
            value={from && to ? { from, to } : null}
            onChange={(range) => {
              // Un extremo a medio escribir deja el periodo vacío: no hay consulta hasta completarlo.
              setFrom(range?.from ?? '');
              setTo(range?.to ?? '');
            }}
            presets
            startLabel={copy.fromLabel}
            endLabel={copy.toLabel}
            isInvalid={rangeInvalid}
            aria-describedby={rangeInvalid ? 'dashboard-range-error' : undefined}
          />
        </FormField>
        <FormField htmlFor="dashboard-currency" label={copy.currencyLabel} className="w-full sm:w-56">
          <CurrencySelect
            id="dashboard-currency"
            token={token}
            value={currency}
            onChange={setCurrency}
            placeholder={currency ? undefined : copy.currencyPlaceholder}
          />
        </FormField>
        {timeZone ? (
          <p
            className="text-sm text-muted sm:ml-auto sm:flex sm:min-h-10 sm:items-center"
            data-testid="dashboard-zone-note"
            title={timeZone}
          >
            {copy.zoneNote(timeZone)}
          </p>
        ) : null}
      </div>

      {rangeInvalid ? (
        <InlineError id="dashboard-range-error">{copy.rangeInvalid}</InlineError>
      ) : zone.status === 'error' && (!from || !to) ? (
        <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />
      ) : !currency && currencyUnknown ? (
        <SedeConfigError kind="currency" onRetry={locations.retry} />
      ) : !currency && sedeCurrency?.scope === 'clinic' ? (
        <p role="status" className="text-sm text-muted">
          {copy.chooseCurrency}
        </p>
      ) : (
        <AsyncSection
          loading={loading}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          skeleton={<DashboardSkeleton label={copy.loading} />}
        >
          {data ? (
            <div className="flex flex-col gap-8">
              <PeriodSummary
                incomes={data.incomes}
                patientCount={data.patientCount}
                from={from}
                to={to}
                fmt={fmt}
              />
              {/* 12 columnas en escritorio ancho: citas (7) + bajo stock (5); una columna debajo. */}
              <div className="grid items-start gap-8 xl:grid-cols-12 xl:gap-6">
                <div className="xl:col-span-7">
                  <UpcomingAppointments
                    appointments={data.upcomingAppointments}
                    staffNames={staffNames}
                    timeZone={timeZone}
                    fmt={fmt}
                  />
                </div>
                <div className="xl:col-span-5">
                  <LowStock lowStockItems={data.lowStockItems} fmt={fmt} />
                </div>
              </div>
            </div>
          ) : null}
        </AsyncSection>
      )}
    </div>
  );
}
