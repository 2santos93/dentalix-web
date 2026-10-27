'use client';
import * as React from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createLocation,
  LOCATION_PHONE_MAX_LENGTH,
  updateLocationSettings,
  type ClinicLocation,
  type CreateLocationInput,
  type UpdateLocationSettingsInput,
} from '@/lib/locations/locations-api';
import { useSessionLocations } from '@/lib/locations/session-locations';
import {
  browserLocale,
  browserTimeZone,
  canonicalLocale,
  canonicalTimeZone,
  REGIONAL_SETTINGS_FIELDS,
  validateRegionalSettings,
  type RegionalSettingsErrors,
  type RegionalSettingsField,
  type RegionalSettingsValues,
} from '@/lib/locations/regional-settings';
import { FormModal } from '@/components/shared/form-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { RegionalSettingsFields, regionalFieldId } from './regional-settings-fields';

export const locationFormCopy = {
  createTitle: 'Nueva sede',
  editTitle: 'Editar sede',
  createDescription:
    'País, moneda, zona horaria y formato son obligatorios. La zona y el formato se sugieren desde tu navegador: revísalos.',
  editDescription:
    'Guardar confirma la moneda, la zona horaria y el formato de la sede, aunque no cambies nada.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Sede Norte',
  nameMissing: 'Escribe el nombre de la sede.',
  address: 'Dirección',
  phone: 'Teléfono',
  phoneHint: 'Con indicativo internacional (+…).',
  create: 'Crear sede',
  save: 'Guardar sede',
  genericError: 'No pudimos guardar la sede. Intenta de nuevo.',
  confirmTitle: '¿Cambiar de todos modos?',
  confirmChange: 'Cambiar de todos modos',
  confirmFallback:
    'La sede ya tiene movimientos. Cambiar su moneda o su zona horaria no convierte nada de lo registrado: confirma el cambio para continuar.',
};

const copy = locationFormCopy;
const ID = 'location-form';

/** Códigos de la API para el cambio de moneda o zona de una sede con historial (spec §3.2). */
const UNCONFIRMED = 'LOCATION_REGIONAL_CHANGE_UNCONFIRMED';
const CASH_OPEN = 'LOCATION_REGIONAL_CASH_OPEN';

type FieldErrors = RegionalSettingsErrors & { name?: string; phone?: string };

/** Campos a los que la API puede referir un 400 (`field`): el mensaje va junto a ellos. */
const API_FIELDS = ['name', 'phone', ...REGIONAL_SETTINGS_FIELDS] as const;
type ApiField = (typeof API_FIELDS)[number];

interface LocationFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin sede: alta. Con sede: edición (también para completar una sede sin configurar). */
  location: ClinicLocation | null;
  onSaved: (saved: ClinicLocation) => void;
}

function initialRegional(location: ClinicLocation | null): RegionalSettingsValues {
  if (location) {
    return {
      country: location.country,
      currency: location.currency ?? '',
      timeZone: location.timeZone ?? '',
      locale: location.locale ?? '',
    };
  }
  // R10: en el alta solo se sugieren zona y formato, a la vista y editables.
  return { country: '', currency: '', timeZone: browserTimeZone() ?? '', locale: browserLocale() ?? '' };
}

/**
 * Alta y edición de una sede (G1, spec §6.2). El cuerpo lleva exactamente lo
 * que muestra el formulario. En edición, guardar marca la sede como revisada
 * (`confirmRegionalSettings`). Cambiar moneda o zona de una sede con historial
 * pide confirmación (409 → `ConfirmDialog` → reenvío con
 * `confirmRegionalChange`); con una caja abierta no se puede, y se dice junto
 * al campo cambiado. Tras guardar, el selector de sede y el resto del shell
 * releen las sedes (`invalidate`). El padre lo monta con una `key` por apertura.
 */
export function LocationFormModal({ open, onOpenChange, token, location, onSaved }: LocationFormModalProps) {
  const editing = location !== null;
  const sessionLocations = useSessionLocations(token);
  const [name, setName] = useState(location?.name ?? '');
  const [address, setAddress] = useState(location?.address ?? '');
  const [phone, setPhone] = useState(location?.phone ?? '');
  const [regional, setRegional] = useState<RegionalSettingsValues>(() => initialRegional(location));
  const [suggestions] = useState(() =>
    editing ? undefined : { timeZone: regional.timeZone || null, locale: regional.locale || null },
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Mensaje de la API que pide confirmar el cambio; `null` = diálogo cerrado. */
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  function changeRegional<F extends RegionalSettingsField>(field: F, value: RegionalSettingsValues[F]) {
    setRegional((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  /** Moneda o zona que esta edición cambia (rellenar un valor que faltaba no es cambiarlo). */
  function movedFields(): RegionalSettingsField[] {
    if (!location) return [];
    return (['currency', 'timeZone'] as const).filter((field) => {
      const before = location[field];
      if (before === null) return false;
      if (field === 'currency') return before !== regional.currency;
      // Las dos con la misma forma: una zona guardada sin canonicalizar no es un cambio.
      const zone = (value: string) => canonicalTimeZone(value) ?? value.trim();
      return zone(before) !== zone(regional.timeZone);
    });
  }

  function focusField(field: ApiField) {
    const id = field === 'name' || field === 'phone' ? `${ID}-${field}` : regionalFieldId(ID, field);
    document.getElementById(id)?.focus();
  }

  function validate(): FieldErrors {
    const found: FieldErrors = validateRegionalSettings(regional);
    if (name.trim() === '') found.name = copy.nameMissing;
    return found;
  }

  function body(): CreateLocationInput {
    const trimmedAddress = address.trim();
    const trimmedPhone = phone.trim();
    return {
      name: name.trim(),
      ...(trimmedAddress ? { address: trimmedAddress } : {}),
      ...(trimmedPhone ? { phone: trimmedPhone } : {}),
      country: regional.country as CreateLocationInput['country'],
      currency: regional.currency,
      timeZone: canonicalTimeZone(regional.timeZone) ?? regional.timeZone.trim(),
      locale: canonicalLocale(regional.locale) ?? regional.locale.trim(),
    };
  }

  function patch(confirmRegionalChange: boolean): UpdateLocationSettingsInput {
    const { address: newAddress, phone: newPhone, ...rest } = body();
    return {
      ...rest,
      // Vaciar un dato que tenía lo borra; si no tenía, no se envía.
      ...(newAddress !== undefined || location?.address ? { address: newAddress ?? '' } : {}),
      ...(newPhone !== undefined || location?.phone ? { phone: newPhone ?? null } : {}),
      confirmRegionalSettings: true,
      ...(confirmRegionalChange ? { confirmRegionalChange: true as const } : {}),
    };
  }

  async function save(confirmRegionalChange: boolean) {
    setSubmitting(true);
    setFormError(null);
    try {
      const saved =
        location === null
          ? await createLocation(token, body())
          : await updateLocationSettings(token, location.id, patch(confirmRegionalChange));
      setConfirmMessage(null);
      sessionLocations.invalidate();
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setConfirmMessage(null);
      handleError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleError(err: unknown) {
    if (err instanceof ApiError && err.code === UNCONFIRMED) {
      setConfirmMessage(apiErrorMessage(err, { fallback: copy.confirmFallback, maxLength: 1000 }));
      return;
    }
    const text = apiErrorMessage(err, copy.genericError);
    if (err instanceof ApiError && err.code === CASH_OPEN) {
      // No se ofrece confirmar: primero hay que cerrar la caja.
      const field = movedFields()[0];
      if (field) {
        setErrors((prev) => ({ ...prev, [field]: text }));
        focusField(field);
        return;
      }
    }
    if (
      err instanceof ApiError &&
      err.status === 400 &&
      err.field &&
      (API_FIELDS as readonly string[]).includes(err.field)
    ) {
      const field = err.field as ApiField;
      setErrors((prev) => ({ ...prev, [field]: text }));
      focusField(field);
      return;
    }
    setFormError(text);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    const first = (['name', ...REGIONAL_SETTINGS_FIELDS] as const).find((f) => found[f]);
    if (first) {
      focusField(first);
      return;
    }
    // Lo que se envía es lo que se ve: zona y formato quedan en su forma canónica.
    const timeZone = canonicalTimeZone(regional.timeZone) ?? regional.timeZone.trim();
    const locale = canonicalLocale(regional.locale) ?? regional.locale.trim();
    setRegional((prev) => ({ ...prev, timeZone, locale }));
    void save(false);
  }

  return (
    <>
      <FormModal
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? copy.editTitle : copy.createTitle}
        description={editing ? copy.editDescription : copy.createDescription}
        onSubmit={handleSubmit}
        submitLabel={editing ? copy.save : copy.create}
        submitting={submitting}
        error={formError}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor={`${ID}-name`} label={copy.name} error={errors.name} className="sm:col-span-2">
            <Input
              id={`${ID}-name`}
              value={name}
              placeholder={copy.namePlaceholder}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              aria-required
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? fieldErrorId(`${ID}-name`) : undefined}
            />
          </FormField>
          <FormField htmlFor={`${ID}-address`} label={copy.address}>
            <Input id={`${ID}-address`} value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
          <FormField
            htmlFor={`${ID}-phone`}
            label={copy.phone}
            hint={copy.phoneHint}
            hintId={`${ID}-phone-hint`}
            error={errors.phone}
          >
            <Input
              id={`${ID}-phone`}
              type="tel"
              value={phone}
              maxLength={LOCATION_PHONE_MAX_LENGTH}
              onChange={(e) => {
                setPhone(e.target.value);
                setErrors((prev) => ({ ...prev, phone: undefined }));
              }}
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={errors.phone ? fieldErrorId(`${ID}-phone`) : `${ID}-phone-hint`}
            />
          </FormField>
        </div>
        <RegionalSettingsFields
          idPrefix={ID}
          values={regional}
          onChange={changeRegional}
          errors={errors}
          token={token}
          suggestions={suggestions}
        />
      </FormModal>
      <ConfirmDialog
        open={confirmMessage !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmMessage(null);
        }}
        title={copy.confirmTitle}
        description={confirmMessage ?? undefined}
        confirmLabel={copy.confirmChange}
        confirming={submitting}
        onConfirm={() => void save(true)}
      />
    </>
  );
}
