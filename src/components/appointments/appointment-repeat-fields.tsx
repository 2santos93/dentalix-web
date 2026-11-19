'use client';
import * as React from 'react';
import {
  SERIES_COUNT_MAX,
  SERIES_COUNT_MIN,
  SERIES_INTERVAL_MAX,
  SERIES_INTERVAL_MIN,
  type RecurrenceDraft,
  type RecurrenceErrors,
} from '@/lib/appointments/series-limits';
import { fieldLabelId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';

export const repeatFieldsCopy = {
  intervalLabel: 'Cada (semanas)',
  intervalHint: `De ${SERIES_INTERVAL_MIN} a ${SERIES_INTERVAL_MAX} semanas.`,
  endModeLegend: 'Hasta cuándo',
  endModeCount: 'Un número de veces',
  endModeUntil: 'Hasta una fecha',
  countLabel: 'Veces (incluida esta)',
  countHint: `De ${SERIES_COUNT_MIN} a ${SERIES_COUNT_MAX} citas.`,
  untilLabel: 'Hasta el',
};

const copy = repeatFieldsCopy;

/**
 * DX-562: los campos de «Repetir» del formulario de cita: cada N semanas y
 * «N veces» u «Hasta [fecha]». Controlado por `AppointmentForm`, que valida al
 * enviar (`parseRecurrence`); los topes no van como `min`/`max` nativos para
 * que el error sea el nuestro, junto al campo. Se carga bajo demanda.
 */
export function AppointmentRepeatFields({
  draft,
  onChange,
  errors,
  firstDay,
}: {
  draft: RecurrenceDraft;
  onChange: (next: RecurrenceDraft) => void;
  errors: RecurrenceErrors;
  /** Día civil de la primera cita (o hoy en la sede): el mínimo de «Hasta el». */
  firstDay?: string;
}) {
  const set = (patch: Partial<RecurrenceDraft>) => onChange({ ...draft, ...patch });
  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-sunken p-3 sm:p-4"
      data-testid="appointment-repeat-panel"
    >
      <div className="flex flex-col gap-1 sm:max-w-48">
        <Label htmlFor="appointment-repeat-interval">{copy.intervalLabel}</Label>
        <Input
          id="appointment-repeat-interval"
          type="number"
          inputMode="numeric"
          value={draft.intervalWeeks}
          aria-invalid={errors.interval ? true : undefined}
          aria-describedby={errors.interval ? 'appointment-repeat-interval-error' : 'appointment-repeat-interval-hint'}
          onChange={(e) => set({ intervalWeeks: e.target.value })}
        />
        {errors.interval ? (
          <InlineError id="appointment-repeat-interval-error">{errors.interval}</InlineError>
        ) : (
          <p id="appointment-repeat-interval-hint" className="text-xs text-muted">
            {copy.intervalHint}
          </p>
        )}
      </div>
      <RadioGroup
        id="appointment-repeat-end"
        legend={copy.endModeLegend}
        value={draft.endMode}
        onValueChange={(v) => set({ endMode: v === 'until' ? 'until' : 'count' })}
        optionsClassName="flex flex-col gap-2 sm:flex-row sm:gap-6"
      >
        <RadioOption id="appointment-repeat-end-count" value="count" label={copy.endModeCount} />
        <RadioOption id="appointment-repeat-end-until" value="until" label={copy.endModeUntil} />
      </RadioGroup>
      {draft.endMode === 'count' ? (
        <div className="flex flex-col gap-1 sm:max-w-48">
          <Label htmlFor="appointment-repeat-count">{copy.countLabel}</Label>
          <Input
            id="appointment-repeat-count"
            type="number"
            inputMode="numeric"
            value={draft.count}
            aria-invalid={errors.count ? true : undefined}
            aria-describedby={errors.count ? 'appointment-repeat-count-error' : 'appointment-repeat-count-hint'}
            onChange={(e) => set({ count: e.target.value })}
          />
          {errors.count ? (
            <InlineError id="appointment-repeat-count-error">{errors.count}</InlineError>
          ) : (
            <p id="appointment-repeat-count-hint" className="text-xs text-muted">
              {copy.countHint}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1 sm:max-w-64">
          <label
            id={fieldLabelId('appointment-repeat-until')}
            htmlFor="appointment-repeat-until"
            className="text-sm font-medium text-ink"
          >
            {copy.untilLabel}
          </label>
          <DatePicker
            id="appointment-repeat-until"
            min={firstDay}
            value={draft.until || null}
            isInvalid={errors.until ? true : undefined}
            aria-describedby={errors.until ? 'appointment-repeat-until-error' : undefined}
            onChange={(next) => set({ until: next ?? '' })}
          />
          {errors.until ? <InlineError id="appointment-repeat-until-error">{errors.until}</InlineError> : null}
        </div>
      )}
    </div>
  );
}
