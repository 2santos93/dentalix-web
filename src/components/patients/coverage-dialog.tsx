'use client';
import * as React from 'react';
import { useId, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createCoverage,
  updateCoverage,
  type PatientCoverage,
} from '@/lib/patients/coverages-api';
import {
  memberNumberCopy,
  memberNumberError,
  requiresMemberNumber,
} from '@/lib/patients/member-number';
import type { Payer } from '@/lib/payers/payers-api';
import { payerTypeLabel } from '@/components/payers/payer-labels';
import { PayerFormModal } from '@/components/payers/payer-form-modal';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';

export const coverageDialogCopy = {
  createTitle: 'Añadir cobertura',
  editTitle: 'Editar cobertura',
  description:
    'El pagador, el plan y el número de afiliado de este paciente, para tenerlos a mano al cobrar.',
  payer: 'Pagador',
  payerPlaceholder: 'Elige un pagador',
  payerRequired: 'Elige un pagador.',
  createPayer: '¿No está en la lista? Crear pagador',
  plan: 'Plan',
  memberNumber: 'Número de afiliado',
  memberNumberRequired: 'Nº de afiliado o póliza',
  memberNumberVerifiedHint: 'Cambiarlo quita la verificación del administrador.',
  policyHolder: 'Titular',
  policyHolderHint: 'Solo si la póliza está a nombre de otra persona.',
  validFrom: 'Vigente desde',
  validTo: 'Vigente hasta',
  validToHint: 'Déjala vacía si no tiene fecha de fin.',
  // SEC-053: quien no es ADMIN y cambia la vigencia de una verificada.
  validityVerifiedHint: 'Cambiar las fechas quita la verificación del administrador.',
  rangeInvalid: 'La fecha de fin no puede ser anterior a la de inicio.',
  primary: 'Principal',
  primaryOnlyHint: 'Es la única cobertura: es la principal.',
  primaryAlreadyHint: 'Para cambiar la principal, marca otra cobertura como principal.',
  primaryHint: 'Es la que se usa por defecto. Marcarla desmarca la anterior.',
  notes: 'Notas',
  saveError: 'No pudimos guardar la cobertura.',
  add: 'Añadir',
};
const copy = coverageDialogCopy;

interface Draft {
  payerId: string;
  planName: string;
  memberNumber: string;
  policyHolderName: string;
  validFrom: string;
  validTo: string;
  isPrimary: boolean;
  notes: string;
}

function draftFrom(coverage: PatientCoverage | null, onlyCoverage: boolean): Draft {
  return {
    payerId: coverage?.payer.id ?? '',
    planName: coverage?.planName ?? '',
    memberNumber: coverage?.memberNumber ?? '',
    policyHolderName: coverage?.policyHolderName ?? '',
    validFrom: coverage?.validFrom ?? '',
    validTo: coverage?.validTo ?? '',
    isPrimary: coverage ? coverage.isPrimary : onlyCoverage,
    notes: coverage?.notes ?? '',
  };
}

interface CoverageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** null = alta. */
  coverage: PatientCoverage | null;
  /** Catálogo de pagadores de la clínica (el padre lo carga). */
  payers: Payer[];
  /** ADMIN y RECEPTION pueden crear un pagador desde aquí. */
  canCreatePayer: boolean;
  /**
   * Es la única cobertura viva (o la primera que se añade): se guarda como
   * principal y el control queda marcado y deshabilitado.
   */
  onlyCoverage?: boolean;
  /**
   * SEC-053: quien edita es ADMIN. Si no lo es, cambiar la vigencia de una
   * cobertura verificada la deja «Sin verificar» y el modal lo avisa.
   */
  editorIsAdmin?: boolean;
  onSaved: (saved: PatientCoverage) => void;
  /** Se creó un pagador desde el enlace: el padre lo suma a `payers`. */
  onPayerCreated: (payer: Payer) => void;
}

/**
 * Alta y edición de una cobertura del paciente (DX-153). El pagador sale del
 * catálogo; quien puede crearlo lo hace sin salir del modal y queda elegido.
 * Los errores de la API salen en el banner del modal, que sigue abierto.
 */
export function CoverageDialog({
  open,
  onOpenChange,
  token,
  patientId,
  coverage,
  payers,
  canCreatePayer,
  onlyCoverage = false,
  editorIsAdmin = false,
  onSaved,
  onPayerCreated,
}: CoverageDialogProps) {
  const ids = useId();
  const editing = coverage !== null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(coverage, onlyCoverage));
  const [fieldErrors, setFieldErrors] = useState<{
    payer?: string;
    member?: string;
    range?: string;
  }>({});
  const memberRef = useRef<HTMLInputElement>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingPayer, setCreatingPayer] = useState(false);

  // Pagadores activos y, al editar, el actual aunque ya esté inactivo.
  const options: Pick<Payer, 'id' | 'name' | 'type' | 'active'>[] = payers.filter(
    (p) => p.active || p.id === coverage?.payer.id,
  );
  if (coverage && !options.some((p) => p.id === coverage.payer.id)) options.unshift(coverage.payer);

  const primaryLocked = onlyCoverage || (editing && coverage.isPrimary);
  // SEC-049: con un pagador externo el nº de afiliado es obligatorio.
  const payerType = options.find((p) => p.id === draft.payerId)?.type ?? null;
  const memberRequired = payerType !== null && requiresMemberNumber(payerType);
  const normalizedMember = (value: string) => value.trim().replace(/\s+/g, ' ');

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setFieldErrors({});
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.payerId) {
      setFieldErrors({ payer: copy.payerRequired });
      return;
    }
    // Como la API: una cobertura anterior sin nº se sigue editando en lo demás;
    // se pide al crearla o al cambiar su pagador o su número.
    const memberTouched =
      !editing ||
      draft.payerId !== coverage.payer.id ||
      normalizedMember(draft.memberNumber) !== normalizedMember(coverage.memberNumber ?? '');
    const memberError =
      payerType && memberTouched ? memberNumberError(payerType, draft.memberNumber) : null;
    if (memberError) {
      setFieldErrors({ member: memberError });
      memberRef.current?.focus();
      return;
    }
    if (draft.validFrom && draft.validTo && draft.validTo < draft.validFrom) {
      setFieldErrors({ range: copy.rangeInvalid });
      return;
    }
    setSaving(true);
    setSaveError(null);
    const plan = draft.planName.trim();
    const member = draft.memberNumber.trim();
    const holder = draft.policyHolderName.trim();
    const notes = draft.notes.trim();
    try {
      const saved = editing
        ? await updateCoverage(token, patientId, coverage.id, {
            payerId: draft.payerId,
            planName: plan || null,
            memberNumber: member || null,
            policyHolderName: holder || null,
            validFrom: draft.validFrom || null,
            validTo: draft.validTo || null,
            notes: notes || null,
            // Solo se manda para promoverla: `false` sobre la principal se rechaza.
            ...(draft.isPrimary && !coverage.isPrimary ? { isPrimary: true } : {}),
          })
        : await createCoverage(token, patientId, {
            payerId: draft.payerId,
            ...(plan ? { planName: plan } : {}),
            ...(member ? { memberNumber: member } : {}),
            ...(holder ? { policyHolderName: holder } : {}),
            ...(draft.validFrom ? { validFrom: draft.validFrom } : {}),
            ...(draft.validTo ? { validTo: draft.validTo } : {}),
            ...(draft.isPrimary ? { isPrimary: true } : {}),
            ...(notes ? { notes } : {}),
          });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err, { fallback: copy.saveError }));
    } finally {
      setSaving(false);
    }
  }

  const payerId = `${ids}-payer`;
  const memberId = `${ids}-member`;
  const memberHint =
    editing && coverage.verifiedAt
      ? copy.memberNumberVerifiedHint
      : memberRequired
        ? memberNumberCopy.hint
        : undefined;
  const toId = `${ids}-to`;
  const toHint =
    editing && coverage.verifiedAt && !editorIsAdmin
      ? `${copy.validToHint} ${copy.validityVerifiedHint}`
      : copy.validToHint;
  const primaryId = `${ids}-primary`;
  const primaryHint = onlyCoverage
    ? copy.primaryOnlyHint
    : primaryLocked
      ? copy.primaryAlreadyHint
      : copy.primaryHint;

  return (
    <>
      <FormModal
        open={open}
        onOpenChange={(next) => {
          if (!saving) onOpenChange(next);
        }}
        title={editing ? copy.editTitle : copy.createTitle}
        description={copy.description}
        onSubmit={(e) => void submit(e)}
        submitLabel={editing ? undefined : copy.add}
        submitting={saving}
        error={saveError}
      >
        <FormField htmlFor={payerId} label={copy.payer} error={fieldErrors.payer}>
          <NativeSelect
            id={payerId}
            value={draft.payerId}
            onChange={(e) => set('payerId', e.target.value)}
            aria-invalid={fieldErrors.payer ? true : undefined}
            aria-describedby={fieldErrors.payer ? fieldErrorId(payerId) : undefined}
          >
            <option value="">{copy.payerPlaceholder}</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {payerTypeLabel(p.type)}
              </option>
            ))}
          </NativeSelect>
          {canCreatePayer ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto self-start px-0 max-sm:min-h-11"
              onClick={() => setCreatingPayer(true)}
            >
              {copy.createPayer}
            </Button>
          ) : null}
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField htmlFor={`${ids}-plan`} label={copy.plan}>
            <Input
              id={`${ids}-plan`}
              value={draft.planName}
              maxLength={120}
              autoComplete="off"
              onChange={(e) => set('planName', e.target.value)}
            />
          </FormField>
          <FormField
            htmlFor={memberId}
            label={memberRequired ? copy.memberNumberRequired : copy.memberNumber}
            hint={memberHint}
            hintId={`${memberId}-hint`}
            error={fieldErrors.member}
          >
            <Input
              ref={memberRef}
              id={memberId}
              value={draft.memberNumber}
              maxLength={60}
              autoComplete="off"
              aria-required={memberRequired || undefined}
              aria-invalid={fieldErrors.member ? true : undefined}
              aria-describedby={
                fieldErrors.member
                  ? fieldErrorId(memberId)
                  : memberHint
                    ? `${memberId}-hint`
                    : undefined
              }
              onChange={(e) => set('memberNumber', e.target.value)}
              className="tabular-nums"
            />
          </FormField>
        </div>

        <FormField htmlFor={`${ids}-holder`} label={copy.policyHolder} hint={copy.policyHolderHint}>
          <Input
            id={`${ids}-holder`}
            value={draft.policyHolderName}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => set('policyHolderName', e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField htmlFor={`${ids}-from`} label={copy.validFrom}>
            <DatePicker
              id={`${ids}-from`}
              value={draft.validFrom || null}
              onChange={(value) => set('validFrom', value ?? '')}
            />
          </FormField>
          <FormField
            htmlFor={toId}
            label={copy.validTo}
            hint={toHint}
            hintId={`${toId}-hint`}
            error={fieldErrors.range}
          >
            <DatePicker
              id={toId}
              value={draft.validTo || null}
              onChange={(value) => set('validTo', value ?? '')}
              aria-invalid={fieldErrors.range ? true : undefined}
              aria-describedby={fieldErrors.range ? fieldErrorId(toId) : `${toId}-hint`}
            />
          </FormField>
        </div>

        <Checkbox
          id={primaryId}
          checked={draft.isPrimary}
          disabled={primaryLocked}
          onChange={(e) => set('isPrimary', e.target.checked)}
          label={copy.primary}
          description={primaryHint}
        />

        <FormField htmlFor={`${ids}-notes`} label={copy.notes}>
          <Textarea
            id={`${ids}-notes`}
            value={draft.notes}
            maxLength={500}
            rows={3}
            autoGrow
            onChange={(e) => set('notes', e.target.value)}
          />
        </FormField>
      </FormModal>

      {creatingPayer ? (
        <PayerFormModal
          open
          onOpenChange={(next) => {
            if (!next) setCreatingPayer(false);
          }}
          payer={null}
          token={token}
          onSaved={(created) => {
            onPayerCreated(created);
            set('payerId', created.id);
          }}
        />
      ) : null}
    </>
  );
}
