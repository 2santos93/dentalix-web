'use client';
import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { isCivilDate } from '@/lib/reports/chair-occupancy-api';
import {
  isWithinMonths,
  PERIOD_PRESETS,
  periodFor,
  PRODUCTION_MAX_PERIOD_MONTHS,
  type PeriodPresetKey,
} from '@/lib/reports/period-presets';
import type { ProfessionalReportFilters } from '@/lib/reports/professional-reports-api';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { FormField } from '@/components/shared/form-field';

export const professionalFiltersCopy = {
  period: 'Período',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede',
  locationAll: 'Todas tus sedes',
  professional: 'Profesional',
  professionalAll: 'Todo el equipo',
  inactive: '(desactivada)',
  badRequest: 'El período no es válido: «Desde» no puede ser posterior a «Hasta» y caben como mucho 24 meses.',
};

const isPreset = (value: string | null): value is PeriodPresetKey =>
  PERIOD_PRESETS.some((p) => p.key === value);

type Param = 'periodo' | 'desde' | 'hasta' | 'sede' | 'profesional';

/**
 * Filtros de «Profesionales» e «Inasistencias» (DX-304) en la URL, como
 * «Previsión» (`?periodo=`, `?desde=`, `?hasta=`, `?sede=`, `?profesional=`):
 * un enlace copiado abre lo mismo y la pestaña los conserva al recargar.
 * Período de hasta 24 meses (el tope de la API), en días de la sede.
 */
export function useProfessionalReportFilters(token: string, own: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : null;

  const presetParam = searchParams.get('periodo');
  const preset: PeriodPresetKey = isPreset(presetParam) ? presetParam : 'this_month';
  const fromParam = searchParams.get('desde');
  const toParam = searchParams.get('hasta');
  const locationId = searchParams.get('sede') ?? '';
  const professionalParam = searchParams.get('profesional') ?? '';
  const customPeriod =
    isCivilDate(fromParam) && isCivilDate(toParam)
      ? { from: fromParam, to: toParam }
      : today
        ? periodFor('this_month', today)
        : null;
  const period = preset === 'custom' ? customPeriod : today ? periodFor(preset, today) : null;
  const invalidPeriod = preset === 'custom' && period !== null && !isWithinMonths(period, PRODUCTION_MAX_PERIOD_MONTHS);
  // Con «solo lo tuyo» la API ya acota a quien consulta: el filtro ni se ve ni se manda.
  const professionalId = own ? '' : professionalParam;
  const filters: ProfessionalReportFilters | null =
    period && !invalidPeriod
      ? { ...period, ...(locationId ? { locationId } : {}), ...(professionalId ? { professionalId } : {}) }
      : null;

  /** Reescribe filtros en la URL sin navegar (conserva `?tab=`). */
  function setParams(values: Partial<Record<Param, string>>) {
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
    else setParams({ periodo: next === 'this_month' ? '' : next, desde: '', hasta: '' });
  }

  return {
    zone,
    preset,
    period,
    invalidPeriod,
    locationId,
    professionalParam,
    filters,
    filterKey: filters ? JSON.stringify(filters) : null,
    setParams,
    choosePreset,
  };
}

export type ProfessionalReportFilterState = ReturnType<typeof useProfessionalReportFilters>;

/** La barra: período (y fechas), sede y, si se ve toda la clínica, profesional. */
export function ProfessionalReportFilterBar({
  state,
  own,
  options,
  periodErrorId,
}: {
  state: ProfessionalReportFilterState;
  own: boolean;
  options:
    | {
        locations: { id: string; name: string; isActive: boolean }[];
        professionals: { userId: string; fullName: string }[];
      }
    | undefined;
  periodErrorId: string;
}) {
  const ids = React.useId();
  const c = professionalFiltersCopy;
  const { preset, period, invalidPeriod } = state;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <FormField htmlFor={`${ids}-period`} label={c.period} className="sm:w-48">
        <NativeSelect
          id={`${ids}-period`}
          value={preset}
          onChange={(e) => state.choosePreset(e.target.value as PeriodPresetKey)}
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
              if (range) state.setParams({ periodo: 'custom', desde: range.from, hasta: range.to });
            }}
            startLabel={c.from}
            endLabel={c.to}
            isInvalid={invalidPeriod}
            aria-describedby={invalidPeriod ? periodErrorId : undefined}
          />
        </FormField>
      ) : null}
      <FormField htmlFor={`${ids}-location`} label={c.location} className="min-w-0 sm:w-52">
        <NativeSelect
          id={`${ids}-location`}
          value={state.locationId}
          onChange={(e) => state.setParams({ sede: e.target.value })}
          disabled={!options}
        >
          <option value="">{c.locationAll}</option>
          {options?.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.isActive ? l.name : `${l.name} ${c.inactive}`}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {own ? null : (
        <FormField htmlFor={`${ids}-professional`} label={c.professional} className="min-w-0 sm:w-56">
          <NativeSelect
            id={`${ids}-professional`}
            value={state.professionalParam}
            onChange={(e) => state.setParams({ profesional: e.target.value })}
            disabled={!options}
          >
            <option value="">{c.professionalAll}</option>
            {options?.professionals.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.fullName}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
    </div>
  );
}
