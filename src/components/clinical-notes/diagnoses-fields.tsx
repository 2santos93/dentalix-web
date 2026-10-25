'use client';
import * as React from 'react';
import { useId } from 'react';
import { Info, Plus, X } from 'lucide-react';
import type { DiagnosesDraft, DiagnosisRowDraft } from '@/lib/clinical-notes/diagnoses-draft';
import { MAX_RELATED_DIAGNOSES } from '@/lib/patients/clinical-api';
import { Icd10Combobox } from './icd10-combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';

export const diagnosesFieldsCopy = {
  legend: 'Diagnóstico (CIE-10)',
  principal: 'Diagnóstico principal (CIE-10)',
  related: (n: number) => `Diagnóstico relacionado ${n}`,
  tooth: 'Diente (FDI)',
  toothOf: (label: string) => ` · ${label}`,
  toothPlaceholder: 'Opcional',
  noPrincipal:
    'Opcional: puedes guardar la evolución sin diagnóstico.',
  addRelated: 'Añadir relacionado',
  maxRelated: `Como máximo ${MAX_RELATED_DIAGNOSES} relacionados.`,
  remove: (n: number) => `Quitar el diagnóstico relacionado ${n}`,
  immutable: 'Se guardan con la evolución y no se pueden cambiar después.',
};

const copy = diagnosesFieldsCopy;

interface DiagnosesFieldsProps {
  token: string;
  value: DiagnosesDraft;
  onChange: (next: DiagnosesDraft) => void;
  error?: string | null;
}

/**
 * «Diagnóstico (CIE-10)» de «Nueva evolución» (DX-212): el principal, hasta
 * tres relacionados y el diente FDI de cada uno (opcional). Sin principal se
 * puede guardar: es un aviso, no un bloqueo.
 */
export function DiagnosesFields({ token, value, onChange, error }: DiagnosesFieldsProps) {
  const baseId = useId();
  const errorId = `${baseId}-error`;

  function setPrincipal(row: DiagnosisRowDraft) {
    onChange({ ...value, principal: row });
  }

  function setRelated(key: number, row: DiagnosisRowDraft) {
    onChange({
      ...value,
      related: value.related.map((r) => (r.key === key ? { ...r, ...row } : r)),
    });
  }

  function addRelated() {
    const key = Math.max(0, ...value.related.map((r) => r.key)) + 1;
    onChange({ ...value, related: [...value.related, { key, code: null, tooth: '' }] });
  }

  function removeRelated(key: number) {
    onChange({ ...value, related: value.related.filter((r) => r.key !== key) });
  }

  const full = value.related.length >= MAX_RELATED_DIAGNOSES;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 text-sm font-medium text-ink">{copy.legend}</legend>

      <DiagnosisRow
        id={`${baseId}-principal`}
        token={token}
        label={copy.principal}
        row={value.principal}
        onChange={setPrincipal}
      />
      {value.principal.code ? null : (
        <p className="-mt-1 flex items-start gap-1.5 text-xs text-muted">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{copy.noPrincipal}</span>
        </p>
      )}

      {value.related.map((row, index) => (
        <DiagnosisRow
          key={row.key}
          id={`${baseId}-related-${row.key}`}
          token={token}
          label={copy.related(index + 1)}
          row={row}
          onChange={(next) => setRelated(row.key, next)}
          onRemove={() => removeRelated(row.key)}
          removeLabel={copy.remove(index + 1)}
        />
      ))}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addRelated}
          disabled={full || !value.principal.code}
        >
          <Plus aria-hidden />
          {copy.addRelated}
        </Button>
        <span className="text-xs text-muted">{full ? copy.maxRelated : copy.immutable}</span>
      </div>

      {error ? (
        <InlineError id={errorId} className="text-xs">
          {error}
        </InlineError>
      ) : null}
    </fieldset>
  );
}

function DiagnosisRow({
  id,
  token,
  label,
  row,
  onChange,
  onRemove,
  removeLabel,
}: {
  id: string;
  token: string;
  label: string;
  row: DiagnosisRowDraft;
  onChange: (row: DiagnosisRowDraft) => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const toothId = `${id}-tooth`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Icd10Combobox
          id={id}
          token={token}
          value={row.code}
          onChange={(code) => onChange({ ...row, code })}
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex w-28 flex-col gap-1.5">
          <Label htmlFor={toothId}>
            {copy.tooth}
            <span className="sr-only">{copy.toothOf(label)}</span>
          </Label>
          <Input
            id={toothId}
            inputMode="numeric"
            maxLength={2}
            placeholder={copy.toothPlaceholder}
            value={row.tooth}
            onChange={(e) => onChange({ ...row, tooth: e.target.value })}
            className="tabular-nums"
          />
        </div>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={removeLabel}
            title={removeLabel}
            onClick={onRemove}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
