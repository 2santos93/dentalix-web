'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import {
  listPatientSources,
  REFERRED_BY_NAME_MAX,
  type AcquisitionDraft,
  type PatientSource,
  type PatientSourceKind,
} from '@/lib/patients/patient-sources-api';
import { FieldError } from '@/components/errors/field-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { PatientSearchField } from './patient-search-field';

export const acquisitionFieldsCopy = {
  source: '¿Cómo nos conoció? (opcional)',
  sourceHint: 'Para saber qué canales traen pacientes. Las opciones se cambian en Ajustes › Origen de pacientes.',
  none: 'Sin indicar',
  inactive: '(desactivada)',
  loadError: 'Opciones no disponibles',
  referrer: 'Paciente que lo recomendó (opcional)',
  professional: 'Nombre del profesional (opcional)',
  professionalHint: 'Quién lo derivó: odontólogo, médico u otro profesional de fuera de la clínica.',
  professionalPlaceholder: 'Dra. Carmen Rodríguez',
  nameTooLong: `Escribe como mucho ${REFERRED_BY_NAME_MAX} caracteres.`,
};

export interface PatientSourcesState {
  /** null mientras carga (o si falló). */
  items: PatientSource[] | null;
  failed: boolean;
  reload: () => void;
}

/**
 * DX-172: el catálogo «¿Cómo nos conoció?» de la clínica, activas y
 * desactivadas (el formulario ofrece las activas y, al editar, la que ya
 * tiene el paciente aunque se desactivara). Lo lee todo el personal.
 */
export function usePatientSources(token: string | null | undefined, enabled = true): PatientSourcesState {
  const [items, setItems] = useState<PatientSource[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!token || !enabled) return;
    let alive = true;
    Promise.resolve()
      .then(() => listPatientSources(token, true))
      .then(
        (loaded) => {
          if (!alive) return;
          setItems(loaded);
          setFailed(false);
        },
        () => {
          if (alive) setFailed(true);
        },
      );
    return () => {
      alive = false;
    };
  }, [token, enabled, reloadKey]);
  const reload = React.useCallback(() => {
    setFailed(false);
    setReloadKey((k) => k + 1);
  }, []);
  return { items, failed, reload };
}

/** El tipo de la fuente elegida (null sin fuente o sin catálogo). */
export function sourceKindOf(sources: PatientSourcesState, sourceId: string | null): PatientSourceKind | null {
  if (!sourceId) return null;
  return sources.items?.find((s) => s.id === sourceId)?.kind ?? null;
}

interface AcquisitionFieldsProps {
  idPrefix: string;
  token: string;
  sources: PatientSourcesState;
  value: AcquisitionDraft;
  onChange: (next: AcquisitionDraft) => void;
  /** La fuente guardada del paciente (al editar): se ofrece aunque esté desactivada. */
  storedSourceId?: string | null;
  /** El paciente que se edita: no se ofrece como su propio referente. */
  patientId?: string;
  nameError?: string | null;
  nameRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

/**
 * «¿Cómo nos conoció?» (DX-172) en el alta y la edición del paciente: el
 * selector de la fuente y, según su tipo, el buscador del paciente que lo
 * recomendó (PATIENT) o el nombre del profesional que lo derivó
 * (EXTERNAL_PROFESSIONAL). Todo opcional.
 */
export function AcquisitionFields({
  idPrefix,
  token,
  sources,
  value,
  onChange,
  storedSourceId = null,
  patientId,
  nameError,
  nameRef,
  className,
}: AcquisitionFieldsProps) {
  const c = acquisitionFieldsCopy;
  const sourceId = `${idPrefix}-source`;
  const referrerId = `${idPrefix}-referrer`;
  const nameId = `${idPrefix}-referred-name`;
  const options = (sources.items ?? []).filter((s) => s.isActive || s.id === storedSourceId);
  const kind = sourceKindOf(sources, value.sourceId);

  return (
    <div className={className ?? 'flex flex-col gap-5'}>
      <FormField htmlFor={sourceId} label={c.source} hint={c.sourceHint}>
        {sources.failed ? (
          <FieldError retryId={sourceId} label={c.loadError} onRetry={sources.reload} className="h-10 w-full" />
        ) : (
          <NativeSelect
            id={sourceId}
            name="sourceId"
            value={value.sourceId ?? ''}
            disabled={sources.items === null}
            onChange={(e) => onChange({ ...value, sourceId: e.target.value || null })}
          >
            <option value="">{c.none}</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.isActive ? s.name : `${s.name} ${c.inactive}`}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {kind === 'PATIENT' ? (
        <PatientSearchField
          id={referrerId}
          label={c.referrer}
          token={token}
          value={value.referredBy}
          excludeId={patientId}
          onChange={(referredBy) => onChange({ ...value, referredBy })}
        />
      ) : null}
      {kind === 'EXTERNAL_PROFESSIONAL' ? (
        <FormField htmlFor={nameId} label={c.professional} hint={c.professionalHint} error={nameError}>
          <Input
            ref={nameRef}
            id={nameId}
            name="referredByName"
            autoComplete="off"
            value={value.referredByName}
            placeholder={c.professionalPlaceholder}
            onChange={(e) => onChange({ ...value, referredByName: e.target.value })}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? fieldErrorId(nameId) : undefined}
          />
        </FormField>
      ) : null}
    </div>
  );
}
