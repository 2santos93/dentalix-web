'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  MAINTENANCE_KIND_LABELS,
  recordMaintenance,
  type Equipment,
  type EquipmentMaintenance,
  type MaintenanceKind,
} from '@/lib/equipment/equipment-api';
import { proposedNextDue } from '@/lib/equipment/equipment-format';
import { moneyInputCopy, parseMoneyInput } from '@/lib/format/money';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

export const maintenanceFormCopy = {
  title: 'Registrar mantenimiento',
  description: (name: string) =>
    `Queda en la hoja de vida de «${name}». No se edita ni se borra: si hay un error, se anula con motivo.`,
  kind: 'Tipo',
  performedOn: 'Fecha',
  technician: 'Técnico',
  company: 'Empresa',
  descriptionLabel: 'Qué se hizo',
  cost: 'Costo (opcional)',
  currency: 'Moneda',
  nextDue: 'Próximo mantenimiento (opcional)',
  nextDueProposed: (date: string) => `Si lo dejas vacío, se programa para el ${date} por la periodicidad del equipo.`,
  nextDueNone: 'Si lo dejas vacío, este mantenimiento no programa el siguiente.',
  submit: 'Registrar mantenimiento',
  dateRequired: 'Elige la fecha del mantenimiento.',
  dateFuture: 'La fecha del mantenimiento no puede ser futura.',
  descriptionRequired: 'Describe qué se hizo (hasta 2000 caracteres).',
  currencyRequired: 'Elige la moneda del costo.',
  nextDueBefore: 'El próximo mantenimiento tiene que ser posterior a este.',
  genericError: 'No pudimos registrar el mantenimiento. Intenta de nuevo.',
};

const copy = maintenanceFormCopy;

interface FieldErrors {
  performedOn?: string;
  description?: string;
  cost?: string;
  currency?: string;
  nextDueOn?: string;
}

interface MaintenanceFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  equipment: Equipment;
  /** La sede del equipo: su «hoy» y su moneda por defecto. */
  location: ClinicLocation | undefined;
  onSaved: (maintenance: EquipmentMaintenance) => void;
}

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/**
 * Registrar un mantenimiento de un equipo (DX-542, solo ADMIN): la fecha no es
 * futura en la sede; el costo, si lo hay, va con su moneda (la de la sede por
 * defecto). Un preventivo sin próximo explícito lo programa la API con la
 * periodicidad del equipo; aquí solo se anuncia.
 */
export function MaintenanceFormModal({
  open,
  onOpenChange,
  token,
  equipment,
  location,
  onSaved,
}: MaintenanceFormModalProps) {
  const today = location?.timeZone ? sedeToday(location.timeZone) : undefined;
  const stamp = useSedeStamp(token, [equipment.locationId]);
  const [kind, setKind] = useState<MaintenanceKind>('PREVENTIVE');
  const [performedOn, setPerformedOn] = useState<string | null>(today ?? null);
  const [technician, setTechnician] = useState('');
  const [company, setCompany] = useState('');
  const [description, setDescription] = useState('');
  const [costText, setCostText] = useState('');
  const [currency, setCurrency] = useState(location?.currency ?? '');
  const [nextDueOn, setNextDueOn] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const proposed = proposedNextDue(kind, performedOn, equipment.maintenanceIntervalMonths);
  const proposedLabel = proposed ? stamp.maybe.civilDate(proposed, equipment.locationId) : null;

  function clear(field: keyof FieldErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const next: FieldErrors = {};
    if (!performedOn) next.performedOn = copy.dateRequired;
    else if (today && performedOn > today) next.performedOn = copy.dateFuture;
    const text = description.trim();
    if (text === '' || text.length > 2000) next.description = copy.descriptionRequired;
    let cost: number | null = null;
    if (costText.trim() !== '') {
      const parsed = parseMoneyInput(costText, currency);
      if (!parsed.ok) next.cost = parsed.message;
      else if (parsed.value <= 0) next.cost = moneyInputCopy.positive;
      else cost = parsed.value;
      if (!currency) next.currency = copy.currencyRequired;
    }
    if (nextDueOn && performedOn && nextDueOn <= performedOn) next.nextDueOn = copy.nextDueBefore;
    setErrors(next);
    if (Object.values(next).some(Boolean) || !performedOn) return;
    setSubmitting(true);
    try {
      const saved = await recordMaintenance(token, equipment.id, {
        kind,
        performedOn,
        technician: orNull(technician),
        company: orNull(company),
        description: text,
        ...(cost !== null ? { cost, currency } : {}),
        ...(nextDueOn ? { nextDueOn } : {}),
      });
      onSaved(saved);
      onOpenChange(false);
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
      description={copy.description(equipment.name)}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      size="lg"
      touchTargets
      ownValidation
    >
      <SedeStampNote stamp={stamp} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="maintenance-kind" label={copy.kind}>
          <NativeSelect
            id="maintenance-kind"
            value={kind}
            disabled={submitting}
            onChange={(e) => setKind(e.target.value as MaintenanceKind)}
          >
            {(Object.keys(MAINTENANCE_KIND_LABELS) as MaintenanceKind[]).map((key) => (
              <option key={key} value={key}>
                {MAINTENANCE_KIND_LABELS[key]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="maintenance-date" label={copy.performedOn} error={errors.performedOn}>
          <DatePicker
            id="maintenance-date"
            name="performedOn"
            max={today}
            value={performedOn}
            disabled={submitting}
            onChange={(value) => {
              setPerformedOn(value);
              clear('performedOn');
            }}
            aria-invalid={errors.performedOn ? true : undefined}
            aria-describedby={errors.performedOn ? fieldErrorId('maintenance-date') : undefined}
          />
        </FormField>
        <FormField htmlFor="maintenance-technician" label={copy.technician}>
          <Input
            id="maintenance-technician"
            value={technician}
            maxLength={120}
            disabled={submitting}
            onChange={(e) => setTechnician(e.target.value)}
          />
        </FormField>
        <FormField htmlFor="maintenance-company" label={copy.company}>
          <Input
            id="maintenance-company"
            value={company}
            maxLength={120}
            disabled={submitting}
            onChange={(e) => setCompany(e.target.value)}
          />
        </FormField>
      </div>

      <FormField htmlFor="maintenance-description" label={copy.descriptionLabel} error={errors.description}>
        <Textarea
          id="maintenance-description"
          value={description}
          maxLength={2000}
          autoGrow
          className="max-h-60"
          disabled={submitting}
          onChange={(e) => {
            setDescription(e.target.value);
            clear('description');
          }}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? fieldErrorId('maintenance-description') : undefined}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <FormField htmlFor="maintenance-cost" label={copy.cost} error={errors.cost}>
          <MoneyInput
            id="maintenance-cost"
            money={(amount, code) => stamp.money(amount, code, equipment.locationId)}
            currency={currency}
            requirePositive
            value={costText}
            disabled={submitting}
            onValueChange={(value) => {
              setCostText(value);
              clear('cost');
            }}
            aria-invalid={errors.cost ? true : undefined}
            aria-describedby={errors.cost ? fieldErrorId('maintenance-cost') : undefined}
          />
        </FormField>
        <FormField htmlFor="maintenance-currency" label={copy.currency} error={errors.currency}>
          <CurrencySelect
            id="maintenance-currency"
            token={token}
            value={currency}
            disabled={submitting}
            invalid={errors.currency ? true : undefined}
            onChange={(code) => {
              setCurrency(code);
              clear('currency');
            }}
          />
        </FormField>
      </div>

      <FormField
        htmlFor="maintenance-next"
        label={copy.nextDue}
        hint={proposedLabel ? copy.nextDueProposed(proposedLabel) : copy.nextDueNone}
        hintId="maintenance-next-hint"
        error={errors.nextDueOn}
      >
        <DatePicker
          id="maintenance-next"
          name="nextDueOn"
          min={performedOn ?? undefined}
          value={nextDueOn}
          disabled={submitting}
          onChange={(value) => {
            setNextDueOn(value);
            clear('nextDueOn');
          }}
          aria-invalid={errors.nextDueOn ? true : undefined}
          aria-describedby={errors.nextDueOn ? fieldErrorId('maintenance-next') : 'maintenance-next-hint'}
        />
      </FormField>
    </FormModal>
  );
}
