'use client';
import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startOfYear } from '@internationalized/date';
import type { CalendarDate } from '@internationalized/date';
import { apiErrorMessage } from '@/lib/api/error-message';
import { todayDate, type IsoRange } from '@/lib/dates/iso';
import { useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import {
  CLINICAL_RECORD_COPY_SECTIONS,
  DELIVERED_TO_MAX,
  clinicalRecordCopyPrintHref,
  generateClinicalRecordCopy,
  type ClinicalRecordCopySection,
  type ClinicalRecordCopySummary,
} from '@/lib/patients/clinical-record-copies-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { DateRangePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

// Copy as constants (i18n-ready).
export const clinicalRecordCopyCopy = {
  action: 'Copia de la historia clínica',
  title: 'Copia de la historia clínica',
  description:
    'Elige el período y lo que incluye. Solo sale lo registrado en esas fechas; la generación queda registrada en la ficha.',
  preparing: 'Preparando el formulario…',
  period: 'Período',
  periodHint: 'Ambos días incluidos, en la hora de la sede.',
  sections: 'Secciones',
  all: 'Todas las secciones',
  deliveredTo: 'Entregado a (opcional)',
  deliveredToHint: 'Por ejemplo, el propio paciente o un familiar. Solo queda en la ficha.',
  submit: 'Generar e imprimir',
  missingPeriod: 'Elige el primer y el último día del período.',
  periodOrder: '«Desde» tiene que ser anterior o igual a «Hasta».',
  futureStart: 'El período no puede empezar después de hoy.',
  outOfBounds: 'Las fechas del período tienen que estar entre el 01/01/2000 y el 31/12/2100.',
  noSections: 'Elige al menos una sección.',
  deliveredToTooLong: `Escribe como mucho ${DELIVERED_TO_MAX} caracteres.`,
  saveError: 'No se pudo generar la copia.',
};

const copy = clinicalRecordCopyCopy;

/** Qué le falta al período, o `null` (las reglas de la API, para decirlas junto al campo). */
export function copyPeriodError(range: IsoRange | null, today: string): string | null {
  if (!range) return copy.missingPeriod;
  if (range.from < '2000-01-01' || range.to > '2100-12-31') return copy.outOfBounds;
  if (range.from > range.to) return copy.periodOrder;
  if (range.from > today) return copy.futureStart;
  return null;
}

interface ClinicalRecordCopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Tras generarla (antes de abrir la vista imprimible). */
  onGenerated?: (copy: ClinicalRecordCopySummary) => void;
}

/**
 * DX-456: el diálogo de la copia de la historia clínica. Período (por defecto
 * del 1 de enero de este año a hoy, en la sede), secciones (todas marcadas) y
 * «Entregado a» opcional. Al generar abre la vista imprimible de esa copia.
 */
export function ClinicalRecordCopyDialog({ open, onOpenChange, token, patientId, onGenerated }: ClinicalRecordCopyDialogProps) {
  const zone = useSedeTimeZone(token);
  if (open && zone.status !== 'ready') {
    return (
      <FormModal
        open={open}
        onOpenChange={onOpenChange}
        title={copy.title}
        description={copy.description}
        onSubmit={(e) => e.preventDefault()}
        hideSubmit
      >
        {zone.status === 'loading' ? (
          <p role="status" className="py-6 text-sm text-muted">
            {copy.preparing}
          </p>
        ) : (
          <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />
        )}
      </FormModal>
    );
  }
  if (!open || zone.status !== 'ready') return null;
  return (
    <CopyForm
      onOpenChange={onOpenChange}
      token={token}
      patientId={patientId}
      today={todayDate(zone.timeZone)}
      onGenerated={onGenerated}
    />
  );
}

function CopyForm({
  onOpenChange,
  token,
  patientId,
  today,
  onGenerated,
}: Omit<ClinicalRecordCopyDialogProps, 'open'> & { today: CalendarDate }) {
  const router = useRouter();
  const ids = React.useId();
  const periodId = `${ids}-period`;
  const sectionsId = `${ids}-sections`;
  const deliveredId = `${ids}-delivered`;
  const [range, setRange] = useState<IsoRange | null>(() => ({
    from: startOfYear(today).toString(),
    to: today.toString(),
  }));
  const [sections, setSections] = useState<ClinicalRecordCopySection[]>(() =>
    CLINICAL_RECORD_COPY_SECTIONS.map((s) => s.id),
  );
  const [deliveredTo, setDeliveredTo] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const periodError = copyPeriodError(range, today.toString());
  const sectionsError = sections.length === 0 ? copy.noSections : null;
  const deliveredError = deliveredTo.trim().length > DELIVERED_TO_MAX ? copy.deliveredToTooLong : null;
  const show = (message: string | null) => (attempted ? message : null);
  const allChecked = sections.length === CLINICAL_RECORD_COPY_SECTIONS.length;

  function toggle(id: ClinicalRecordCopySection, checked: boolean) {
    setSections((prev) =>
      CLINICAL_RECORD_COPY_SECTIONS.map((s) => s.id).filter((s) => (s === id ? checked : prev.includes(s))),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (periodError || sectionsError || deliveredError || !range) return;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await generateClinicalRecordCopy(token, patientId, {
        from: range.from,
        to: range.to,
        sections,
        deliveredTo,
      });
      onGenerated?.(created);
      onOpenChange(false);
      router.push(clinicalRecordCopyPrintHref(patientId, created.id));
    } catch (err) {
      setSaveError(apiErrorMessage(err, { fallback: copy.saveError }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      open
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      title={copy.title}
      description={copy.description}
      onSubmit={(e) => void submit(e)}
      submitLabel={copy.submit}
      submitting={saving}
      error={saveError}
      ownValidation
      touchTargets
    >
      <FormField htmlFor={periodId} label={copy.period} hint={copy.periodHint} error={show(periodError)}>
        <DateRangePicker
          id={periodId}
          value={range}
          onChange={setRange}
          presets
          aria-invalid={show(periodError) ? true : undefined}
        />
      </FormField>

      <fieldset
        id={sectionsId}
        className="flex min-w-0 flex-col gap-2"
        aria-invalid={show(sectionsError) ? true : undefined}
        aria-describedby={show(sectionsError) ? fieldErrorId(sectionsId) : undefined}
      >
        <legend className="t-label mb-1 text-ink">{copy.sections}</legend>
        <Checkbox
          label={copy.all}
          checked={allChecked}
          indeterminate={!allChecked && sections.length > 0}
          onChange={(e) =>
            setSections(e.currentTarget.checked ? CLINICAL_RECORD_COPY_SECTIONS.map((s) => s.id) : [])
          }
        />
        <div className="grid grid-cols-1 gap-2 pl-6 sm:grid-cols-2">
          {CLINICAL_RECORD_COPY_SECTIONS.map((s) => (
            <Checkbox
              key={s.id}
              label={s.label}
              checked={sections.includes(s.id)}
              onChange={(e) => toggle(s.id, e.currentTarget.checked)}
            />
          ))}
        </div>
        {show(sectionsError) ? <InlineError id={fieldErrorId(sectionsId)}>{sectionsError}</InlineError> : null}
      </fieldset>

      <FormField htmlFor={deliveredId} label={copy.deliveredTo} hint={copy.deliveredToHint} error={show(deliveredError)}>
        <Input
          id={deliveredId}
          value={deliveredTo}
          maxLength={DELIVERED_TO_MAX}
          autoComplete="off"
          onChange={(e) => setDeliveredTo(e.currentTarget.value.replace(/[\r\n]+/g, ' '))}
        />
      </FormField>
    </FormModal>
  );
}
