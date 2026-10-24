'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listAgreements, type Agreement } from '@/lib/agreements/agreements-api';
import { listCoverages, type PatientCoverage } from '@/lib/patients/coverages-api';
import {
  assignPatientAgreement,
  type PatientAgreement,
} from '@/lib/patients/patient-agreement-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/errors/inline-error';
import type { ClinicRole } from '@/lib/me/me-api';
import { agreementEligibility } from '@/lib/patients/agreement-eligibility';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const agreementDialogCopy = {
  assignTitle: 'Asignar convenio',
  changeTitle: 'Cambiar convenio',
  description:
    'El presupuesto de este paciente saldrá con el precio pactado en el convenio. El anterior queda en el historial.',
  agreement: 'Convenio',
  agreementPlaceholder: 'Elige un convenio',
  agreementRequired: 'Elige un convenio.',
  coverage: 'Cobertura vinculada',
  coverageNone: '— Sin cobertura vinculada —',
  coverageHint: 'Solo las coberturas vigentes del paciente con el mismo pagador que el convenio.',
  coverageRequired: 'Cobertura del pagador',
  coveragePlaceholder: 'Elige una cobertura',
  coverageRequiredHint:
    'Obligatoria: el convenio solo se aplica con una cobertura vigente del paciente con este pagador.',
  coverageMissing: 'Elige la cobertura del paciente con este pagador.',
  coveragesLoading: 'Cargando coberturas…',
  validFrom: 'Vigente desde',
  validTo: 'Vigente hasta',
  validToHint: 'Déjala vacía si no tiene fecha de fin.',
  rangeInvalid: 'La fecha de fin no puede ser anterior a la de inicio.',
  notes: 'Notas',
  loadError: 'No pudimos cargar los convenios del paciente.',
  saveError: 'No pudimos guardar el convenio.',
  assign: 'Asignar',
};
const copy = agreementDialogCopy;

interface Draft {
  agreementId: string;
  coverageId: string;
  validFrom: string;
  validTo: string;
  notes: string;
}

function draftFrom(current: PatientAgreement | null): Draft {
  return {
    agreementId: current?.agreement.id ?? '',
    coverageId: current?.coverageId ?? '',
    validFrom: current?.validFrom ?? '',
    validTo: current?.validTo ?? '',
    notes: current?.notes ?? '',
  };
}

interface AgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** El convenio asignado ahora (cambiar) o null (asignar). */
  current: PatientAgreement | null;
  onSaved: (saved: PatientAgreement) => void;
  /** Rol de la sesión: decide si se ofrece un convenio interno (SEC-047). */
  role: ClinicRole | null;
}

/**
 * Asignar o cambiar el convenio del paciente (DX-105). Solo ofrece convenios
 * activos (y el actual aunque esté inactivo) y, de las coberturas del paciente,
 * las del pagador del convenio elegido. Los errores de la API salen en el
 * banner del modal, que sigue abierto.
 *
 * SEC-047: un convenio de pagador externo exige elegir una cobertura vigente
 * del paciente con ese pagador (si solo hay una, va elegida); sin ninguna, el
 * modal explica por qué no se puede y no deja guardar. Un convenio interno
 * (pagador OTRO) solo lo asigna ADMIN, con la cobertura opcional.
 */
export function AgreementDialog({
  open,
  onOpenChange,
  token,
  patientId,
  current,
  onSaved,
  role,
}: AgreementDialogProps) {
  const ids = useId();
  const editing = current !== null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(current));
  const [agreements, setAgreements] = useState<Agreement[] | null>(null);
  const [coverages, setCoverages] = useState<PatientCoverage[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{
    agreement?: string;
    coverage?: string;
    range?: string;
  }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAgreements(token), listCoverages(token, patientId)])
      .then(([list, covs]) => {
        if (cancelled) return;
        setAgreements(list);
        setCoverages(covs);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAgreements([]);
        setSaveError(apiErrorMessage(err, { fallback: copy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId]);

  // Convenios activos y, al cambiar, el actual aunque ya esté inactivo.
  const options: {
    id: string;
    name: string;
    payer: PatientAgreement['agreement']['payer'];
  }[] = (agreements ?? [])
    .filter((a) => a.active || a.id === current?.agreement.id)
    .map((a) => ({ id: a.id, name: a.name, payer: a.payer }));
  if (current && !options.some((o) => o.id === current.agreement.id)) {
    options.unshift({
      id: current.agreement.id,
      name: current.agreement.name,
      payer: current.agreement.payer,
    });
  }
  const chosen = options.find((o) => o.id === draft.agreementId);
  // Convenios y coberturas llegan juntos: hasta entonces no se decide nada
  // (B4: ni un bloqueo falso mientras carga).
  const loading = agreements === null;
  const eligibility = chosen && !loading ? agreementEligibility(chosen, coverages, role) : null;
  const notice = eligibility?.kind === 'optional-coverage' ? eligibility.notice : null;
  const coverageOptions =
    eligibility && eligibility.kind !== 'blocked' ? eligibility.coverages : [];
  const blockedReason = eligibility?.kind === 'blocked' ? eligibility.reason : null;
  const coverageRequired = eligibility?.kind === 'needs-coverage';
  // La elegida solo vale si sigue entre las ofrecidas (vigente y del pagador);
  // con una sola cobertura posible en un convenio de pagador, va elegida.
  const selectedCoverage = coverageOptions.some((c) => c.id === draft.coverageId)
    ? draft.coverageId
    : coverageRequired && coverageOptions.length === 1
      ? coverageOptions[0].id
      : '';

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setFieldErrors({});
  }

  function chooseAgreement(agreementId: string) {
    const next = options.find((o) => o.id === agreementId);
    setDraft((d) => ({
      ...d,
      agreementId,
      // La cobertura vinculada solo vale para el pagador del convenio.
      coverageId: coverages.some(
        (c) => c.id === d.coverageId && next && c.payer.id === next.payer.id,
      )
        ? d.coverageId
        : '',
    }));
    setFieldErrors({});
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.agreementId) {
      setFieldErrors({ agreement: copy.agreementRequired });
      return;
    }
    if (blockedReason) return;
    if (coverageRequired && !selectedCoverage) {
      setFieldErrors({ coverage: copy.coverageMissing });
      return;
    }
    if (draft.validFrom && draft.validTo && draft.validTo < draft.validFrom) {
      setFieldErrors({ range: copy.rangeInvalid });
      return;
    }
    setSaving(true);
    setSaveError(null);
    const notes = draft.notes.trim();
    try {
      const saved = await assignPatientAgreement(token, patientId, {
        agreementId: draft.agreementId,
        coverageId: selectedCoverage || null,
        validFrom: draft.validFrom || null,
        validTo: draft.validTo || null,
        notes: notes || null,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err, { fallback: copy.saveError }));
    } finally {
      setSaving(false);
    }
  }

  const agreementId = `${ids}-agreement`;
  const coverageId = `${ids}-coverage`;
  const toId = `${ids}-to`;
  const reasonId = `${ids}-blocked`;

  return (
    <FormModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      title={editing ? copy.changeTitle : copy.assignTitle}
      description={copy.description}
      onSubmit={(e) => void submit(e)}
      submitLabel={editing ? undefined : copy.assign}
      submitting={saving}
      submitDisabled={loading || blockedReason !== null}
      error={saveError}
    >
      <FormField htmlFor={agreementId} label={copy.agreement} error={fieldErrors.agreement}>
        <select
          id={agreementId}
          value={draft.agreementId}
          disabled={agreements === null}
          onChange={(e) => chooseAgreement(e.target.value)}
          aria-invalid={fieldErrors.agreement ? true : undefined}
          aria-describedby={
            fieldErrors.agreement ? fieldErrorId(agreementId) : blockedReason ? reasonId : undefined
          }
          className={cn(fieldClass, 'h-10')}
        >
          <option value="">{copy.agreementPlaceholder}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.payer.name}
            </option>
          ))}
        </select>
      </FormField>

      {loading ? (
        <FormField htmlFor={coverageId} label={copy.coverage}>
          <select id={coverageId} disabled value="" className={cn(fieldClass, 'h-10')}>
            <option value="">{copy.coveragesLoading}</option>
          </select>
        </FormField>
      ) : blockedReason ? (
        <InlineError id={reasonId} variant="summary">
          {blockedReason}
        </InlineError>
      ) : (
        <FormField
          htmlFor={coverageId}
          label={coverageRequired ? copy.coverageRequired : copy.coverage}
          hint={notice ?? (coverageRequired ? copy.coverageRequiredHint : copy.coverageHint)}
          error={fieldErrors.coverage}
        >
          <select
            id={coverageId}
            value={selectedCoverage}
            aria-required={coverageRequired || undefined}
            onChange={(e) => set('coverageId', e.target.value)}
            aria-invalid={fieldErrors.coverage ? true : undefined}
            aria-describedby={fieldErrors.coverage ? fieldErrorId(coverageId) : undefined}
            className={cn(fieldClass, 'h-10')}
          >
            <option value="">
              {coverageRequired ? copy.coveragePlaceholder : copy.coverageNone}
            </option>
            {coverageOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.payer.name, c.planName].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField htmlFor={`${ids}-from`} label={copy.validFrom}>
          <Input
            id={`${ids}-from`}
            type="date"
            value={draft.validFrom}
            onChange={(e) => set('validFrom', e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <FormField
          htmlFor={toId}
          label={copy.validTo}
          hint={copy.validToHint}
          error={fieldErrors.range}
        >
          <Input
            id={toId}
            type="date"
            value={draft.validTo}
            onChange={(e) => set('validTo', e.target.value)}
            aria-invalid={fieldErrors.range ? true : undefined}
            aria-describedby={fieldErrors.range ? fieldErrorId(toId) : undefined}
            className="tabular-nums"
          />
        </FormField>
      </div>

      <FormField htmlFor={`${ids}-notes`} label={copy.notes}>
        <textarea
          id={`${ids}-notes`}
          value={draft.notes}
          maxLength={500}
          rows={3}
          onChange={(e) => set('notes', e.target.value)}
          className={fieldClass}
        />
      </FormField>
    </FormModal>
  );
}
