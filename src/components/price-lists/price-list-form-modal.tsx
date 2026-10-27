'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createPriceList,
  updatePriceList,
  type PriceList,
} from '@/lib/price-lists/price-lists-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Input } from '@/components/ui/input';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { clinicBaseCurrency, locationCurrency } from '@/lib/locations/location-settings';

const copy = {
  createTitle: 'Nueva lista de precios',
  editTitle: 'Editar lista de precios',
  description:
    'Una lista fija el precio de cada procedimiento. Úsala en una sede o como lista de un convenio.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Tarifas Sede Norte',
  currency: 'Moneda',
  currencyPlaceholder: 'Elige una moneda',
  currencyRequired: 'Elige la moneda de la lista.',
  currencyLocked:
    'La lista ya tiene precios: para cambiar de moneda, quítalos primero o crea otra lista.',
  location: 'Sede',
  locationHint:
    'Una sede tiene como máximo una lista activa, y sus precios se aplican a todos los pacientes de esa sede.',
  wholeClinic: 'Toda la clínica',
  create: 'Crear lista',
  save: 'Guardar cambios',
  invalidName: 'El nombre debe tener entre 2 y 120 caracteres.',
  genericError: 'No pudimos guardar la lista de precios. Intenta de nuevo.',
};

// <select> nativo con el aspecto del átomo Input.
const selectClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

interface PriceListFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sin lista: alta. Con lista: edición. */
  priceList: PriceList | null;
  locations: ClinicLocation[];
  token: string;
  onSaved: (saved: PriceList) => void;
  /** Vuelve a leer las sedes (la sede elegida no tenía moneda). */
  onRetryLocations: () => void;
}

/**
 * Alta y edición de una lista de precios (DX-105). La moneda se fija al crear
 * y no cambia mientras la lista tenga precios (la API responde 409). El padre
 * lo monta con una `key` por apertura para resembrar el estado.
 */
export function PriceListFormModal({
  open,
  onOpenChange,
  priceList,
  locations,
  token,
  onSaved,
  onRetryLocations,
}: PriceListFormModalProps) {
  const editing = priceList !== null;
  const [name, setName] = useState(priceList?.name ?? '');
  const [currencyChoice, setCurrencyChoice] = useState(priceList?.currency ?? '');
  const [locationId, setLocationId] = useState(priceList?.locationId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  // Mientras no se elige otra, la moneda de la sede escogida; sin sede, la
  // común de la clínica. Si no hay ninguna (sedes con monedas distintas), el
  // campo queda vacío y hay que elegirla. Una sede elegida sin moneda (sin
  // configurar) muestra `SedeConfigError`: nunca otra moneda (GLOBAL-G1).
  const chosenLocation = locations.find((l) => l.id === locationId);
  const suggested = chosenLocation ? locationCurrency(chosenLocation) : clinicBaseCurrency(locations);
  const currency = currencyChoice || suggested || '';
  const currencyLocked = editing && priceList.itemCount > 0;
  const sedeWithoutCurrency = !currencyChoice && chosenLocation !== undefined && suggested === null;

  // Una sede desactivada sigue ofreciéndose si es la de esta lista.
  const options = locations.filter((l) => l.isActive || l.id === priceList?.locationId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2 || trimmed.length > 120) return setError(copy.invalidName);
    if (!currency) return setCurrencyError(copy.currencyRequired);

    setSubmitting(true);
    try {
      const saved = editing
        ? await updatePriceList(token, priceList.id, {
            name: trimmed,
            ...(currencyLocked ? {} : { currency }),
            locationId: locationId === '' ? null : locationId,
          })
        : await createPriceList(token, {
            name: trimmed,
            currency,
            ...(locationId === '' ? {} : { locationId }),
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
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
    >
      <FormField htmlFor="price-list-name" label={copy.name}>
        <Input
          id="price-list-name"
          value={name}
          maxLength={120}
          placeholder={copy.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </FormField>
      <FormField
        htmlFor="price-list-currency"
        label={copy.currency}
        hint={currencyLocked ? copy.currencyLocked : undefined}
        error={sedeWithoutCurrency ? null : currencyError}
      >
        {sedeWithoutCurrency ? (
          <SedeConfigError
            kind="currency"
            variant="field"
            retryId="price-list-currency"
            onRetry={onRetryLocations}
            className="h-10 w-full"
          />
        ) : (
          <CurrencySelect
            id="price-list-currency"
            token={token}
            value={currency}
            onChange={(code) => {
              setCurrencyChoice(code);
              setCurrencyError(null);
            }}
            disabled={currencyLocked}
            placeholder={currency ? undefined : copy.currencyPlaceholder}
          />
        )}
      </FormField>
      <FormField htmlFor="price-list-location" label={copy.location} hint={copy.locationHint}>
        <select
          id="price-list-location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className={selectClass}
        >
          <option value="">{copy.wholeClinic}</option>
          {options.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </FormField>
    </FormModal>
  );
}
