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
  coverageHint: 'Solo las coberturas del paciente con el mismo pagador que el convenio.',
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
}

/**
 * Asignar o cambiar el convenio del paciente (DX-105). Solo ofrece convenios
 * activos (y el actual aunque esté inactivo) y, de las coberturas del paciente,
 * las del pagador del convenio elegido. Los errores de la API salen en el
 * banner del modal, que sigue abierto.
 */
export function AgreementDialog({
  open,
  onOpenChange,
  token,
  patientId,
  current,
  onSaved,
}: AgreementDialogProps) {
  const ids = useId();
  const editing = current !== null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(current));
  const [agreements, setAgreements] = useState<Agreement[] | null>(null);
  const [coverages, setCoverages] = useState<PatientCoverage[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{ agreement?: string; range?: string }>({});
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
  const options: { id: string; name: string; payerId: string; payerName: string }[] = (
    agreements ?? []
  )
    .filter((a) => a.active || a.id === current?.agreement.id)
    .map((a) => ({ id: a.id, name: a.name, payerId: a.payer.id, payerName: a.payer.name }));
  if (current && !options.some((o) => o.id === current.agreement.id)) {
    options.unshift({
      id: current.agreement.id,
      name: current.agreement.name,
      payerId: current.agreement.payer.id,
      payerName: current.agreement.payer.name,
    });
  }
  const chosen = options.find((o) => o.id === draft.agreementId);
  const coverageOptions = chosen ? coverages.filter((c) => c.payer.id === chosen.payerId) : [];

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
        (c) => c.id === d.coverageId && next && c.payer.id === next.payerId,
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
        coverageId: draft.coverageId || null,
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
      error={saveError}
    >
      <FormField htmlFor={agreementId} label={copy.agreement} error={fieldErrors.agreement}>
        <select
          id={agreementId}
          value={draft.agreementId}
          disabled={agreements === null}
          onChange={(e) => chooseAgreement(e.target.value)}
          aria-invalid={fieldErrors.agreement ? true : undefined}
          aria-describedby={fieldErrors.agreement ? fieldErrorId(agreementId) : undefined}
          className={cn(fieldClass, 'h-10')}
        >
          <option value="">{copy.agreementPlaceholder}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.payerName}
            </option>
          ))}
        </select>
      </FormField>

      <FormField htmlFor={coverageId} label={copy.coverage} hint={copy.coverageHint}>
        <select
          id={coverageId}
          value={draft.coverageId}
          onChange={(e) => set('coverageId', e.target.value)}
          className={cn(fieldClass, 'h-10')}
        >
          <option value="">{copy.coverageNone}</option>
          {coverageOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {[c.payer.name, c.planName].filter(Boolean).join(' · ')}
            </option>
          ))}
        </select>
      </FormField>

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
