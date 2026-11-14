'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  announceRecallChanged,
  createDefaultPatientRecall,
  isRecallAlreadySet,
  listRecallTypes,
  type RecallType,
  type SetPatientRecallResult,
} from '@/lib/recall/recall-api';
import { monthsLabel } from '@/lib/recall/recall-offer';
import { recallTypeOptions } from '@/lib/recall/recall-types';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';

export const recallDefaultCopy = {
  title: (name: string) => `Programar recall de ${name}`,
  description:
    'Se programa con el intervalo del tipo (Ajustes › Recall), contando desde su última visita atendida. Otro intervalo lo fija el clínico desde la ficha.',
  type: 'Tipo de recall',
  typeOption: (name: string, months: number) => `${name} · cada ${monthsLabel(months)}`,
  typesError: 'Tipos no disponibles',
  noTypes: 'La clínica no tiene tipos de recall activos. Actívalos en Ajustes › Recall.',
  submit: 'Programar recall',
  saveError: 'No pudimos programar el recall. Intenta de nuevo.',
  // En esta lista no hay recalls activos: el 409 es uno desactivado, y reactivarlo es del clínico.
  alreadySet: (type: string) => `Ya tiene un recall de ${type} desactivado. Reactívalo desde la ficha.`,
  openRecord: 'Abrir ficha',
};
const copy = recallDefaultCopy;

/**
 * DX-015-bis (D17 → D15): «Programar recall» desde «Sin recall configurado».
 * Elige un tipo activo y crea su recall con el intervalo por defecto del tipo
 * (también recepción). Un 409 (ya tiene uno de ese tipo, desactivado) deja el
 * diálogo abierto con el motivo y «Abrir ficha», donde el clínico lo reactiva.
 */
export function RecallDefaultDialog({
  token,
  patient,
  onOpenChange,
  onSaved,
}: {
  token: string;
  patient: { id: string; name: string };
  onOpenChange: (open: boolean) => void;
  onSaved: (result: SetPatientRecallResult, typeName: string) => void;
}) {
  const [types, setTypes] = useState<RecallType[] | null>(null);
  const [typesFailed, setTypesFailed] = useState(false);
  const [typesKey, setTypesKey] = useState(0);
  const [typeId, setTypeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listRecallTypes(token).then(
      (list) => {
        if (cancelled) return;
        setTypes(list);
        setTypesFailed(false);
        setTypeId((current) => current || (recallTypeOptions(list).find((o) => o.active)?.ref ?? ''));
      },
      () => {
        if (!cancelled) setTypesFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, typesKey]);

  const options = types ? recallTypeOptions(types).filter((o) => o.active) : [];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const type = options.find((o) => o.ref === typeId);
    if (!type) return;
    setSubmitting(true);
    setError(null);
    setConflict(null);
    try {
      const result = await createDefaultPatientRecall(token, patient.id, type.ref);
      announceRecallChanged(patient.id);
      onSaved(result, type.name);
      onOpenChange(false);
    } catch (err) {
      if (isRecallAlreadySet(err)) {
        setConflict(copy.alreadySet(type.name));
      } else {
        setError(apiErrorMessage(err, { fallback: copy.saveError }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open
      onOpenChange={onOpenChange}
      title={copy.title(patient.name)}
      description={copy.description}
      onSubmit={(e) => void submit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={!options.some((o) => o.ref === typeId)}
      error={error}
    >
      <FormField htmlFor="rd-type" label={copy.type}>
        {typesFailed ? (
          <FieldError
            label={copy.typesError}
            retryId="rd-type"
            className="h-10"
            onRetry={() => {
              setTypesFailed(false);
              setTypesKey((k) => k + 1);
            }}
          />
        ) : types === null ? (
          <Skeleton className="h-10 w-full" />
        ) : options.length === 0 ? (
          <p className="text-sm text-muted">{copy.noTypes}</p>
        ) : (
          <NativeSelect
            id="rd-type"
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setConflict(null);
            }}
          >
            {options.map((o) => (
              <option key={o.ref} value={o.ref}>
                {o.defaultIntervalMonths ? copy.typeOption(o.name, o.defaultIntervalMonths) : o.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {conflict ? (
        <div className="flex flex-col items-start gap-1">
          <InlineError>{conflict}</InlineError>
          <Link
            href={`/patients/${patient.id}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary-text underline-offset-4 hover:underline sm:min-h-6"
          >
            {copy.openRecord}
          </Link>
        </div>
      ) : null}
    </FormModal>
  );
}
