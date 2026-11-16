'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { parseMoneyInput } from '@/lib/format/money';
import {
  createDentalLabService,
  LAB_LIMITS as L,
  updateDentalLabService,
  type DentalLab,
  type DentalLabService,
  type UpdateDentalLabServiceInput,
} from '@/lib/lab-orders/lab-orders-api';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

export const dentalLabServiceFormCopy = {
  createTitle: (lab: string) => `Nuevo servicio de ${lab}`,
  editTitle: (name: string) => `Editar «${name}»`,
  description:
    'El plazo en días hábiles calcula la fecha prometida de cada orden con el horario y los festivos de la sede. Nunca se borra: se desactiva.',
  name: 'Servicio',
  namePlaceholder: 'Por ejemplo, Corona zirconio',
  leadTime: 'Plazo (días hábiles)',
  leadTimeHint: `De ${L.leadTimeMin} a ${L.leadTimeMax}.`,
  price: 'Precio de referencia (opcional)',
  priceHint: 'Solo lo ve administración. No se cobra ni se suma al plan.',
  currency: 'Moneda del precio',
  active: 'Activo',
  activeHint: 'Uno inactivo no se ofrece en las órdenes nuevas.',
  submitCreate: 'Crear servicio',
  submitEdit: 'Guardar cambios',
  nameRequired: 'Escribe el nombre del servicio.',
  leadTimeInvalid: `Escribe un número entero de días hábiles, de ${L.leadTimeMin} a ${L.leadTimeMax}.`,
  currencyRequired: 'Elige la moneda del precio.',
  genericError: 'No pudimos guardar el servicio. Intenta de nuevo.',
};

const copy = dentalLabServiceFormCopy;

interface DentalLabServiceFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  lab: Pick<DentalLab, 'id' | 'name'>;
  /** `null` = alta. */
  service: DentalLabService | null;
  onSaved: (service: DentalLabService) => void;
}

/** Alta y edición de un servicio del laboratorio (DX-017, solo ADMIN): plazo y precio de referencia. */
export function DentalLabServiceFormModal({
  open,
  onOpenChange,
  token,
  lab,
  service,
  onSaved,
}: DentalLabServiceFormModalProps) {
  const id = useId();
  const locations = useLocationsState(token);
  const stamp = useSedeStamp(token);
  // La moneda sugerida es la de la sede activa (o la principal); se puede cambiar.
  const suggestedCurrency =
    locations.status === 'ready'
      ? ((locations.locations.find((l) => l.id === locations.activeLocationId) ?? locations.locations[0])?.currency ?? '')
      : '';
  const [name, setName] = useState(service?.name ?? '');
  const [leadTime, setLeadTime] = useState(service ? String(service.leadTimeBusinessDays) : '');
  const [price, setPrice] = useState(service?.referencePrice ? service.referencePrice.replace('.', ',') : '');
  const [currencyPicked, setCurrencyPicked] = useState<string | null>(service?.referenceCurrency ?? null);
  const [active, setActive] = useState(service?.active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [leadTimeError, setLeadTimeError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = currencyPicked ?? suggestedCurrency;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    const days = /^\d{1,3}$/.test(leadTime.trim()) ? Number(leadTime.trim()) : NaN;
    let invalid = false;
    if (trimmed === '') {
      setNameError(copy.nameRequired);
      invalid = true;
    }
    if (!Number.isInteger(days) || days < L.leadTimeMin || days > L.leadTimeMax) {
      setLeadTimeError(copy.leadTimeInvalid);
      invalid = true;
    }
    let referencePrice: string | null = null;
    let referenceCurrency: string | null = null;
    if (price.trim() !== '') {
      if (!currency) {
        setPriceError(copy.currencyRequired);
        invalid = true;
      } else {
        const parsed = parseMoneyInput(price, currency);
        if (!parsed.ok) {
          setPriceError(parsed.message);
          invalid = true;
        } else {
          referencePrice = parsed.value.toFixed(2);
          referenceCurrency = currency;
        }
      }
    }
    if (invalid) return;
    setSubmitting(true);
    setError(null);
    try {
      let saved: DentalLabService;
      if (service) {
        const patch: UpdateDentalLabServiceInput = {};
        if (trimmed !== service.name) patch.name = trimmed;
        if (days !== service.leadTimeBusinessDays) patch.leadTimeBusinessDays = days;
        const priceChanged =
          (referencePrice === null ? null : Number(referencePrice)) !==
            (service.referencePrice === null ? null : Number(service.referencePrice)) ||
          referenceCurrency !== service.referenceCurrency;
        if (priceChanged) {
          patch.referencePrice = referencePrice;
          patch.referenceCurrency = referenceCurrency;
        }
        if (active !== service.active) patch.active = active;
        if (Object.keys(patch).length === 0) {
          onOpenChange(false);
          return;
        }
        saved = await updateDentalLabService(token, lab.id, service.id, patch);
      } else {
        saved = await createDentalLabService(token, lab.id, {
          name: trimmed,
          leadTimeBusinessDays: days,
          ...(referencePrice !== null ? { referencePrice, referenceCurrency } : {}),
        });
      }
      onOpenChange(false);
      onSaved(saved);
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
      title={service ? copy.editTitle(service.name) : copy.createTitle(lab.name)}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={service ? copy.submitEdit : copy.submitCreate}
      submitting={submitting}
      error={error}
      touchTargets
      ownValidation
    >
      <div className="flex flex-col gap-4">
        <FormField htmlFor={`${id}-name`} label={copy.name} error={nameError}>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={L.serviceNameMax}
            placeholder={copy.namePlaceholder}
            autoComplete="off"
            disabled={submitting}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? fieldErrorId(`${id}-name`) : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
        </FormField>
        <FormField htmlFor={`${id}-lead`} label={copy.leadTime} hint={copy.leadTimeHint} error={leadTimeError}>
          <Input
            id={`${id}-lead`}
            inputMode="numeric"
            value={leadTime}
            maxLength={3}
            autoComplete="off"
            className="tabular-nums sm:w-32"
            disabled={submitting}
            aria-invalid={leadTimeError ? true : undefined}
            aria-describedby={leadTimeError ? fieldErrorId(`${id}-lead`) : undefined}
            onChange={(e) => {
              setLeadTime(e.target.value);
              setLeadTimeError(null);
            }}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <FormField htmlFor={`${id}-price`} label={copy.price} hint={copy.priceHint} error={priceError}>
            <MoneyInput
              id={`${id}-price`}
              value={price}
              currency={currency}
              money={stamp.money}
              disabled={submitting}
              aria-invalid={priceError ? true : undefined}
              aria-describedby={priceError ? fieldErrorId(`${id}-price`) : undefined}
              onValueChange={(text) => {
                setPrice(text);
                setPriceError(null);
              }}
            />
          </FormField>
          <FormField htmlFor={`${id}-currency`} label={copy.currency}>
            <CurrencySelect
              id={`${id}-currency`}
              token={token}
              value={currency}
              disabled={submitting}
              onChange={(code) => {
                setCurrencyPicked(code);
                setPriceError(null);
              }}
            />
          </FormField>
        </div>
        {service ? (
          <Checkbox
            label={copy.active}
            description={copy.activeHint}
            checked={active}
            disabled={submitting}
            onChange={(e) => setActive(e.target.checked)}
          />
        ) : null}
      </div>
    </FormModal>
  );
}
