'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { intervalLabel } from '@/lib/recall/presentation';
import {
  getPatientRecalls,
  listRecallTypes,
  type PatientRecall,
  type RecallType,
} from '@/lib/recall/recall-api';
import {
  evolutionRecallMonths,
  monthOptions,
  type EvolutionRecallDraft,
} from '@/lib/recall/recall-offer';
import { recallTypeOptions } from '@/lib/recall/recall-types';
import { cn } from '@/lib/utils';
import { FieldError } from '@/components/errors/field-error';
import { FormField } from '@/components/shared/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';

export const evolutionRecallCopy = {
  heading: 'Recall',
  unchanged: 'Sin cambios',
  summary: (type: string, months: number) => `${type} · ${intervalLabel(months).toLowerCase()}`,
  type: 'Tipo de recall',
  months: 'Vuelve',
  typesError: 'Tipos no disponibles',
  noTypes: 'La clínica no tiene tipos de recall activos.',
  hintNew: 'El paciente no tiene este recall: se crea contando desde la fecha de esta evolución.',
  hintExisting: (months: number) =>
    `Ya lo tiene (${intervalLabel(months).toLowerCase()}): solo cambia el intervalo; la fecha desde la que cuenta se conserva.`,
  hintInactive: 'Lo tiene inactivo: se reactiva con este intervalo.',
};
const copy = evolutionRecallCopy;

/**
 * DX-015-bis (D18): la sección plegable «Recall» de «Nueva evolución». Cerrada
 * y con «Sin cambios» por defecto: solo viaja `recall` si se elige un tipo.
 * Al abrirla se leen los tipos activos y los recalls del paciente, para
 * prellenar los meses con el intervalo que ya tenga de ese tipo o, si no, con
 * el por defecto del tipo.
 */
export function EvolutionRecallFields({
  token,
  patientId,
  value,
  onChange,
  error,
}: {
  token: string;
  patientId: string;
  value: EvolutionRecallDraft;
  onChange: (next: EvolutionRecallDraft) => void;
  error?: string | null;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<RecallType[] | null>(null);
  const [typesFailed, setTypesFailed] = useState(false);
  const [typesKey, setTypesKey] = useState(0);
  // Sin los recalls del paciente se prellena con el intervalo del tipo.
  const [recalls, setRecalls] = useState<PatientRecall[] | null>(null);
  // Hasta que se sabe si tiene recalls no se elige tipo: los meses saldrían del tipo y no del suyo.
  const [recallsSettled, setRecallsSettled] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listRecallTypes(token).then(
      (list) => {
        if (cancelled) return;
        setTypes(list);
        setTypesFailed(false);
      },
      () => {
        if (!cancelled) setTypesFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, token, typesKey]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPatientRecalls(token, patientId).then(
      (data) => {
        if (cancelled) return;
        setRecalls(data.recalls);
        setRecallsSettled(true);
      },
      () => {
        // Sin sus recalls, el intervalo por defecto del tipo.
        if (!cancelled) setRecallsSettled(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId]);

  const options = types
    ? recallTypeOptions(types).filter((o) => o.active && o.id !== null && o.defaultIntervalMonths !== null)
    : [];
  const selected = options.find((o) => o.id === value.recallTypeId) ?? null;
  const existing = selected ? (recalls?.find((r) => r.recallTypeId === selected.id) ?? null) : null;
  const summary =
    value.enabled && selected && value.intervalMonths !== null
      ? copy.summary(selected.name, value.intervalMonths)
      : copy.unchanged;

  function selectType(id: string) {
    const type = options.find((o) => o.id === id);
    if (!type || type.id === null || type.defaultIntervalMonths === null) {
      onChange({ enabled: false, recallTypeId: null, intervalMonths: null });
      return;
    }
    onChange({
      enabled: true,
      recallTypeId: type.id,
      intervalMonths: evolutionRecallMonths({ id: type.id, defaultIntervalMonths: type.defaultIntervalMonths }, recalls),
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border" data-testid="evolution-recall">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm"
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-ink">{copy.heading}</span>
          <span className="text-muted">{summary}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 text-muted transition-transform motion-reduce:transition-none', open && 'rotate-180')}
        />
      </button>
      <div id={panelId} hidden={!open} className="px-3 pb-3">
        {open ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              htmlFor="evo-recall-type"
              label={copy.type}
              error={error}
              hint={
                selected
                  ? existing
                    ? existing.active
                      ? copy.hintExisting(existing.intervalMonths)
                      : copy.hintInactive
                    : copy.hintNew
                  : undefined
              }
            >
              {typesFailed ? (
                <FieldError
                  label={copy.typesError}
                  retryId="evo-recall-type"
                  className="h-10"
                  onRetry={() => {
                    setTypesFailed(false);
                    setTypesKey((k) => k + 1);
                  }}
                />
              ) : types === null || !recallsSettled ? (
                <Skeleton className="h-10 w-full" />
              ) : options.length === 0 ? (
                <p className="text-sm text-muted">{copy.noTypes}</p>
              ) : (
                <NativeSelect
                  id="evo-recall-type"
                  value={value.enabled && value.recallTypeId ? value.recallTypeId : ''}
                  aria-invalid={error ? true : undefined}
                  onChange={(e) => selectType(e.target.value)}
                >
                  <option value="">{copy.unchanged}</option>
                  {options.map((o) => (
                    <option key={o.ref} value={o.ref}>
                      {o.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField htmlFor="evo-recall-months" label={copy.months}>
              <NativeSelect
                id="evo-recall-months"
                value={value.enabled && value.intervalMonths !== null ? value.intervalMonths : ''}
                disabled={!value.enabled}
                onChange={(e) => onChange({ ...value, intervalMonths: Number(e.target.value) })}
              >
                {!value.enabled ? <option value="">{copy.unchanged}</option> : null}
                {monthOptions(value.intervalMonths).map((m) => (
                  <option key={m} value={m}>
                    {intervalLabel(m)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
        ) : null}
      </div>
    </section>
  );
}
