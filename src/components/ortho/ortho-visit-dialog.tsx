'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  ORTHO_ELASTIC_TYPE_LABELS,
  ORTHO_ELASTIC_TYPES,
  ORTHO_ELASTIC_WEAR_LABELS,
  ORTHO_ELASTIC_WEARS,
  ORTHO_HYGIENE_LABELS,
  ORTHO_INCIDENT_LABELS,
  ORTHO_INCIDENTS,
  ORTHO_WIRE_MATERIAL_LABELS,
  ORTHO_WIRE_MATERIALS,
  registerOrthoVisit,
  type OrthoElasticType,
  type OrthoElasticWear,
  type OrthoIncident,
  type OrthoVisit,
  type OrthoWire,
  type OrthoWireMaterial,
} from '@/lib/ortho/ortho-api';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { addCivilDays as addDaysIso } from '@/lib/time/wall-clock';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { DateField } from '@/components/ui/date-field';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { SedeConfigError } from '@/components/locations/sede-config-error';

export const orthoVisitDialogCopy = {
  title: 'Registrar control',
  description:
    'Queda como una evolución de la historia clínica y no se edita: si algo está mal, se corrige con una adenda.',
  fromAppointment: 'Se registra en la cita de hoy y con su fecha.',
  entryDate: 'Fecha del control',
  upper: 'Arco superior',
  lower: 'Arco inferior',
  material: 'Material',
  gauge: 'Calibre',
  noWire: 'Sin cambio',
  previous: (label: string) => `Anterior: ${label}.`,
  elastics: 'Elásticos',
  elasticsNone: 'Sin elásticos',
  wear: 'Uso',
  wearNone: 'Sin indicar',
  incidents: 'Incidencias',
  hygiene: 'Índice de higiene',
  hygieneNone: 'Sin valorar',
  appliance: 'Aparatología añadida o retirada (opcional)',
  note: 'Nota (opcional)',
  next: 'Próximo control propuesto (opcional)',
  nextHint: (days: number) => `Por defecto, en ${days} días.`,
  submit: 'Guardar control',
  genericError: 'No pudimos guardar el control. Intenta de nuevo.',
};
const copy = orthoVisitDialogCopy;

interface WireState {
  material: OrthoWireMaterial | '';
  gauge: string;
}

const wireFrom = (wire: OrthoWire | null | undefined): WireState => ({
  material: wire?.material ?? '',
  gauge: wire?.gauge ?? '',
});

function wireInput(state: WireState): OrthoWire | undefined {
  return state.material && state.gauge ? { material: state.material, gauge: state.gauge } : undefined;
}

/**
 * «Registrar control» (DX-190): rellena por defecto el arco de cada arcada del
 * control anterior y propone el próximo en el intervalo del caso. Desde la
 * cita (`appointmentId`) la fecha es la de la cita y no se pide.
 */
export function OrthoVisitDialog({
  open,
  onOpenChange,
  token,
  patientId,
  caseId,
  wireGauges,
  previousUpper,
  previousLower,
  intervalDays,
  appointmentId,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  caseId: string;
  /** Calibres de la lista de la clínica. */
  wireGauges: readonly string[];
  previousUpper: OrthoWire | null;
  previousLower: OrthoWire | null;
  intervalDays: number;
  appointmentId?: string | null;
  onRegistered: (visit: OrthoVisit) => void;
}) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : null;
  const [picked, setPicked] = useState<string | null>(null);
  const entryDate = picked ?? today ?? '';
  const [upper, setUpper] = useState<WireState>(wireFrom(previousUpper));
  const [lower, setLower] = useState<WireState>(wireFrom(previousLower));
  const [elasticsType, setElasticsType] = useState<OrthoElasticType | ''>('');
  const [elasticsWear, setElasticsWear] = useState<OrthoElasticWear | ''>('');
  const [incidents, setIncidents] = useState<OrthoIncident[]>([]);
  const [hygiene, setHygiene] = useState('');
  const [appliance, setAppliance] = useState('');
  const [note, setNote] = useState('');
  const [nextPicked, setNextPicked] = useState<string | null | undefined>(undefined);
  const base = appointmentId ? today : entryDate || null;
  const proposedNext = base ? addDaysIso(base, intervalDays) : null;
  const next = nextPicked === undefined ? proposedNext : nextPicked;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const visit = await registerOrthoVisit(token, patientId, caseId, {
        ...(appointmentId ? { appointmentId } : { entryDate }),
        upperWire: wireInput(upper),
        lowerWire: wireInput(lower),
        elasticsType: elasticsType || undefined,
        elasticsWear: elasticsType && elasticsWear ? elasticsWear : undefined,
        incidents,
        hygieneIndex: hygiene ? Number(hygiene) : undefined,
        applianceChanges: appliance.trim() || undefined,
        note: note.trim() || undefined,
        nextVisitProposedOn: next ?? undefined,
      });
      onOpenChange(false);
      onRegistered(visit);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  function wireFields(
    key: 'upper' | 'lower',
    state: WireState,
    set: (next: WireState) => void,
    previous: OrthoWire | null,
  ) {
    const label = key === 'upper' ? copy.upper : copy.lower;
    // Un calibre de un control anterior que ya no está en la lista se sigue ofreciendo.
    const gauges = state.gauge && !wireGauges.includes(state.gauge) ? [state.gauge, ...wireGauges] : wireGauges;
    return (
      <fieldset className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-2">
        <legend className="t-label mb-2 text-ink">{label}</legend>
        <FormField htmlFor={id(`${key}-material`)} label={copy.material}>
          <NativeSelect
            id={id(`${key}-material`)}
            value={state.material}
            onChange={(e) => {
              const material = e.target.value as OrthoWireMaterial | '';
              set({ material, gauge: material ? state.gauge : '' });
            }}
          >
            <option value="">{copy.noWire}</option>
            {ORTHO_WIRE_MATERIALS.map((m) => (
              <option key={m} value={m}>
                {ORTHO_WIRE_MATERIAL_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          htmlFor={id(`${key}-gauge`)}
          label={copy.gauge}
          hint={previous ? copy.previous(`${ORTHO_WIRE_MATERIAL_LABELS[previous.material]} ${previous.gauge}`) : undefined}
        >
          <NativeSelect
            id={id(`${key}-gauge`)}
            value={state.gauge}
            disabled={!state.material}
            required={Boolean(state.material)}
            onChange={(e) => set({ ...state, gauge: e.target.value })}
            className="t-data"
          >
            <option value="">—</option>
            {gauges.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </fieldset>
    );
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={appointmentId ? `${copy.description} ${copy.fromAppointment}` : copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={!appointmentId && entryDate === ''}
      error={error}
      size="lg"
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {appointmentId ? null : (
          <FormField htmlFor={id('date')} label={copy.entryDate}>
            {zone.status === 'error' ? (
              <SedeConfigError kind="timeZone" variant="field" retryId={id('date')} onRetry={zone.retry} />
            ) : (
              <DateField
                id={id('date')}
                max={today ?? undefined}
                required
                disabled={today === null}
                value={entryDate || null}
                onChange={(value) => setPicked(value ?? '')}
              />
            )}
          </FormField>
        )}
        <FormField htmlFor={id('hygiene')} label={copy.hygiene}>
          <NativeSelect id={id('hygiene')} value={hygiene} onChange={(e) => setHygiene(e.target.value)}>
            <option value="">{copy.hygieneNone}</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={String(n)}>
                {ORTHO_HYGIENE_LABELS[n]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {wireFields('upper', upper, setUpper, previousUpper)}
        {wireFields('lower', lower, setLower, previousLower)}
        <FormField htmlFor={id('elastics')} label={copy.elastics}>
          <NativeSelect
            id={id('elastics')}
            value={elasticsType}
            onChange={(e) => setElasticsType(e.target.value as OrthoElasticType | '')}
          >
            <option value="">{copy.elasticsNone}</option>
            {ORTHO_ELASTIC_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORTHO_ELASTIC_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor={id('wear')} label={copy.wear}>
          <NativeSelect
            id={id('wear')}
            value={elasticsWear}
            disabled={!elasticsType}
            onChange={(e) => setElasticsWear(e.target.value as OrthoElasticWear | '')}
          >
            <option value="">{copy.wearNone}</option>
            {ORTHO_ELASTIC_WEARS.map((w) => (
              <option key={w} value={w}>
                {ORTHO_ELASTIC_WEAR_LABELS[w]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <fieldset className="flex min-w-0 flex-col gap-2 sm:col-span-2">
          <legend className="t-label mb-1 text-ink">{copy.incidents}</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {ORTHO_INCIDENTS.map((incident) => (
              <Checkbox
                key={incident}
                label={ORTHO_INCIDENT_LABELS[incident]}
                checked={incidents.includes(incident)}
                onChange={(e) =>
                  setIncidents((prev) =>
                    e.target.checked ? [...prev, incident] : prev.filter((i) => i !== incident),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <FormField htmlFor={id('appliance')} label={copy.appliance} className="sm:col-span-2">
          <Input
            id={id('appliance')}
            autoComplete="off"
            maxLength={500}
            value={appliance}
            onChange={(e) => setAppliance(e.target.value)}
          />
        </FormField>
        <FormField htmlFor={id('note')} label={copy.note} className="sm:col-span-2">
          <Textarea id={id('note')} rows={2} autoGrow maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <FormField htmlFor={id('next')} label={copy.next} hint={copy.nextHint(intervalDays)}>
          <DatePicker
            id={id('next')}
            min={base ? addDaysIso(base, 1) : undefined}
            value={next}
            onChange={(value) => setNextPicked(value)}
          />
        </FormField>
      </div>
    </FormModal>
  );
}
