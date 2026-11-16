'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createOrthoCase,
  ORTHO_TECHNIQUE_LABELS,
  ORTHO_TECHNIQUES,
  type OrthoCase,
  type OrthoTechnique,
} from '@/lib/ortho/ortho-api';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { DateField } from '@/components/ui/date-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SedeConfigError } from '@/components/locations/sede-config-error';

export const orthoCaseDialogCopy = {
  title: 'Crear caso de ortodoncia',
  description:
    'La planificación del tratamiento. El responsable eres tú; la sede, la activa. El progreso se calcula con los controles que registres.',
  technique: 'Técnica',
  startDate: 'Fecha de inicio',
  months: 'Duración estimada (meses)',
  visits: 'Controles previstos',
  interval: 'Días entre controles',
  intervalHint: 'Si pasan 15 días más sin control, el paciente sale como «Atrasado».',
  bondedOn: 'Fecha de cementado (opcional)',
  submit: 'Crear caso',
  genericError: 'No pudimos crear el caso. Intenta de nuevo.',
  invalidNumbers: 'Escribe la duración, los controles y los días entre controles con números enteros.',
};
const copy = orthoCaseDialogCopy;

const whole = (text: string): number | null => (/^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null);

/** «Crear caso» de la pestaña de ortodoncia (DX-190). Los topes los valida la API (400 en español). */
export function OrthoCaseDialog({
  open,
  onOpenChange,
  token,
  patientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  onCreated: (created: OrthoCase) => void;
}) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : null;
  const [technique, setTechnique] = useState<OrthoTechnique>('METAL_BRACKETS');
  const [picked, setPicked] = useState<string | null>(null);
  const startDate = picked ?? today ?? '';
  const [months, setMonths] = useState('24');
  const [visits, setVisits] = useState('24');
  const [interval, setIntervalDays] = useState('30');
  const [bondedOn, setBondedOn] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const estimatedMonths = whole(months);
    const plannedVisits = whole(visits);
    const visitIntervalDays = whole(interval);
    if (estimatedMonths === null || plannedVisits === null || visitIntervalDays === null) {
      setError(copy.invalidNumbers);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createOrthoCase(token, patientId, {
        technique,
        startDate,
        estimatedMonths,
        plannedVisits,
        visitIntervalDays,
        bondedOn: bondedOn ?? undefined,
      });
      onOpenChange(false);
      onCreated(created);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={startDate === ''}
      error={error}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <FormField htmlFor={id('technique')} label={copy.technique} className="sm:col-span-2">
          <NativeSelect
            id={id('technique')}
            value={technique}
            onChange={(e) => setTechnique(e.target.value as OrthoTechnique)}
          >
            {ORTHO_TECHNIQUES.map((t) => (
              <option key={t} value={t}>
                {ORTHO_TECHNIQUE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor={id('start')} label={copy.startDate}>
          {zone.status === 'error' ? (
            <SedeConfigError kind="timeZone" variant="field" retryId={id('start')} onRetry={zone.retry} />
          ) : (
            <DateField
              id={id('start')}
              max={today ?? undefined}
              required
              disabled={today === null}
              value={startDate || null}
              onChange={(value) => setPicked(value ?? '')}
            />
          )}
        </FormField>
        <FormField htmlFor={id('bonded')} label={copy.bondedOn}>
          <DateField
            id={id('bonded')}
            max={today ?? undefined}
            disabled={today === null}
            value={bondedOn}
            onChange={(value) => setBondedOn(value)}
          />
        </FormField>
        <FormField htmlFor={id('months')} label={copy.months}>
          <Input
            id={id('months')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            required
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="t-data"
          />
        </FormField>
        <FormField htmlFor={id('visits')} label={copy.visits}>
          <Input
            id={id('visits')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            required
            value={visits}
            onChange={(e) => setVisits(e.target.value)}
            className="t-data"
          />
        </FormField>
        <FormField htmlFor={id('interval')} label={copy.interval} hint={copy.intervalHint} className="sm:col-span-2">
          <Input
            id={id('interval')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            required
            value={interval}
            onChange={(e) => setIntervalDays(e.target.value)}
            className="t-data sm:max-w-40"
          />
        </FormField>
      </div>
    </FormModal>
  );
}
