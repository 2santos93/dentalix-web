'use client';
import * as React from 'react';
import { lazy, Suspense, useState } from 'react';
import {
  AppointmentForm,
  type AppointmentFormBase,
  type AppointmentFormExtension,
} from '@/components/appointments/appointment-form';
import type { CreatedAppointmentSeries, SeriesPreviewInput } from '@/lib/appointments/appointment-series-api';
import { parseRecurrence, type RecurrenceDraft, type RecurrenceErrors } from '@/lib/appointments/series-limits';
import type { SedeClock } from '@/lib/locations/sede-clock';
import { Checkbox } from '@/components/ui/checkbox';

// La vista previa solo se descarga al pedir «Ver fechas»; los campos, al marcar «Repetir».
const AppointmentRepeatFields = lazy(() =>
  import('./appointment-repeat-fields').then((m) => ({ default: m.AppointmentRepeatFields })),
);
const SeriesPreviewStep = lazy(() =>
  import('./series-preview-step').then((m) => ({ default: m.SeriesPreviewStep })),
);

export const agendaNewAppointmentCopy = {
  repeatLabel: 'Repetir',
  repeatHint: 'Agenda la misma cita cada pocas semanas (p. ej. controles de ortodoncia).',
  repeatSubmit: 'Ver fechas',
  loading: 'Cargando…',
};

const copy = agendaNewAppointmentCopy;

type Props = Omit<React.ComponentProps<typeof AppointmentForm>, 'extension' | 'planItemIds'> & {
  onSeriesCreated: (result: CreatedAppointmentSeries) => void;
};

/**
 * DX-562 (D7): la «Nueva cita» de la agenda = `AppointmentForm` + «Repetir».
 * La serie vive aquí y no en el formulario, que comparten otros cinco flujos y
 * el shell (búsqueda por llamada): así no crece para nadie más. Con «Repetir»,
 * el envío del formulario (ya validada la cita base) pasa a «Ver fechas» y la
 * vista previa ocupa el diálogo hasta crear la serie o volver.
 */
export function AgendaNewAppointmentForm({ onSeriesCreated, ...formProps }: Props) {
  const [repeat, setRepeat] = useState(false);
  const [draft, setDraft] = useState<RecurrenceDraft>({ intervalWeeks: '1', endMode: 'count', count: '4', until: '' });
  const [errors, setErrors] = useState<RecurrenceErrors>({});
  const [firstDay, setFirstDay] = useState<string | undefined>(formProps.defaultDate);
  const [preview, setPreview] = useState<{ request: SeriesPreviewInput; clock: SedeClock } | null>(null);

  function handleBase(base: AppointmentFormBase, { date, clock }: { date: string; clock: SedeClock }) {
    setFirstDay(date);
    const parsed = parseRecurrence(draft, date);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      document
        .getElementById(
          parsed.errors.interval
            ? 'appointment-repeat-interval'
            : parsed.errors.count
              ? 'appointment-repeat-count'
              : 'appointment-repeat-until',
        )
        ?.focus();
      return;
    }
    setPreview({ request: { ...base, ...parsed.value }, clock });
  }

  const extension: AppointmentFormExtension = {
    active: repeat,
    submitLabel: copy.repeatSubmit,
    onSubmitBase: handleBase,
    fields: (
      <div className="flex flex-col gap-3">
        <Checkbox
          id="appointment-repeat"
          checked={repeat}
          onChange={(e) => {
            setRepeat(e.target.checked);
            setErrors({});
          }}
          label={copy.repeatLabel}
          description={copy.repeatHint}
        />
        {repeat ? (
          <Suspense fallback={<p role="status" className="text-sm text-muted">{copy.loading}</p>}>
            <AppointmentRepeatFields
              draft={draft}
              onChange={(next) => {
                setDraft(next);
                setErrors({});
              }}
              errors={errors}
              firstDay={firstDay}
            />
          </Suspense>
        ) : null}
      </div>
    ),
    step:
      repeat && preview ? (
        <Suspense fallback={<p role="status" className="py-6 text-sm text-muted">{copy.loading}</p>}>
          <SeriesPreviewStep
            token={formProps.token}
            locationId={formProps.locationId}
            request={preview.request}
            clock={preview.clock}
            onBack={() => setPreview(null)}
            onCreated={onSeriesCreated}
          />
        </Suspense>
      ) : null,
  };

  return <AppointmentForm {...formProps} extension={extension} />;
}
