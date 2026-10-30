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
import { isPhoneRegion, PHONE_REGIONS, phoneRegionLabel, searchPhoneRegions, type PhoneRegionOption } from '@/lib/locations/phone-regions';
import { useSessionLocations } from '@/lib/locations/session-locations';
import {
  browserCountry,
  browserHourCycle,
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
import { COMBOBOX_NONE, CountryCombobox, phoneRegionComboboxCopy } from '@/components/shared/country-combobox';
import { Input } from '@/components/ui/input';
import { RegionalSettingsFields, regionalFieldId, type RegionalSuggestions } from './regional-settings-fields';

export const locationFormCopy = {
  createTitle: 'Nueva sede',
  editTitle: 'Editar sede',
  createDescription:
    'País, moneda, zona horaria, formato y reloj son obligatorios. La zona, el formato, el reloj y, si tu navegador lo indica, el país vienen sugeridos: revísalos.',
  editDescription:
    'Guardar confirma la moneda, la zona horaria, el formato y el reloj de la sede, aunque no cambies nada.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Sede Norte',
  nameMissing: 'Escribe el nombre de la sede.',
  address: 'Dirección',
  phone: 'Teléfono',
  phoneHint: 'Con indicativo internacional (+…).',
  phoneRegion: 'Prefijo telefónico por defecto',
  phoneRegionHint:
    'Se añade a los teléfonos escritos sin +. Cambiarlo cambia cómo se leen los ya guardados sin +, pero no los reescribe.',
  phoneRegionSuggested: 'Sugerido por el país de la sede.',
  noPhoneRegion: 'Sin prefijo por defecto',
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

type FieldErrors = RegionalSettingsErrors & { name?: string; phone?: string; defaultPhoneRegion?: string };

/** Campos a los que la API puede referir un 400 (`field`): el mensaje va junto a ellos. */
const API_FIELDS = ['name', 'phone', 'defaultPhoneRegion', ...REGIONAL_SETTINGS_FIELDS] as const;
type ApiField = (typeof API_FIELDS)[number];

interface LocationFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin sede: alta. Con sede: edición (también para completar una sede sin configurar). */
  location: ClinicLocation | null;
  onSaved: (saved: ClinicLocation) => void;
}

/**
 * Lo que el navegador propone al abrir el modal (spec G1 R10, G1-B §9):
 * - alta: país (solo de una región explícita, DX-312 P1), zona, formato y reloj;
 * - sede por configurar: formato y reloj, solo los que están vacíos (el valor
 *   guardado se muestra siempre, nunca la sugerencia); el país de una sede
 *   que ya lo tiene nunca se sustituye por la sugerencia;
 * - sede configurada: nada.
 */
function initialSuggestions(location: ClinicLocation | null): RegionalSuggestions {
  if (!location) {
    return {
      country: browserCountry(),
      timeZone: browserTimeZone(),
      locale: browserLocale(),
      hourCycle: browserHourCycle(),
    };
  }
  return {
    country: location.country ? null : browserCountry(),
    timeZone: null,
    locale: location.locale ? null : browserLocale(),
    hourCycle: location.hourCycle ? null : browserHourCycle(),
  };
}

/** La región que el país de la sede sugiere: la suya si es región de numeración (como la API). */
function suggestedPhoneRegion(country: string): string | null {
  return isPhoneRegion(country) ? country : null;
}

const formatPhoneRegion = (region: PhoneRegionOption) => phoneRegionLabel(region.code) ?? region.code;

function initialRegional(location: ClinicLocation | null, suggested: RegionalSuggestions): RegionalSettingsValues {
  return {
    country: location?.country || suggested.country || '',
    currency: location?.currency ?? '',
    timeZone: location?.timeZone ?? suggested.timeZone ?? '',
    locale: location?.locale ?? suggested.locale ?? '',
    // Sin reloj del navegador, vacío y obligatorio: nunca se adivina.
    hourCycle: location?.hourCycle ?? suggested.hourCycle ?? '',
  };
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
  const [suggestions] = useState(() => initialSuggestions(location));
  const [regional, setRegional] = useState<RegionalSettingsValues>(() => initialRegional(location, suggestions));
  /** Prefijo elegido a mano; hasta que se toca, manda `phoneRegion` (abajo). */
  const [chosenPhoneRegion, setChosenPhoneRegion] = useState<string | null>(null);
  const [phoneRegionTouched, setPhoneRegionTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Mensaje de la API que pide confirmar el cambio; `null` = diálogo cerrado. */
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  // Spec §6.3: en el alta, el prefijo sigue al país hasta que se toca. En la
  // edición se pinta el guardado, y solo si era el del país guardado se
  // propone el del país nuevo cuando este cambia.
  const phoneRegionFollowsCountry =
    !phoneRegionTouched &&
    (location === null ||
      (location.defaultPhoneRegion !== null &&
        location.defaultPhoneRegion === location.country &&
        regional.country !== location.country));
  const phoneRegion = phoneRegionTouched
    ? chosenPhoneRegion
    : phoneRegionFollowsCountry
      ? suggestedPhoneRegion(regional.country)
      : (location?.defaultPhoneRegion ?? null);
  const phoneRegionSuggested = phoneRegionFollowsCountry && regional.country !== '';
  const phoneRegionHint = phoneRegionSuggested
    ? `${copy.phoneRegionSuggested} ${copy.phoneRegionHint}`
    : copy.phoneRegionHint;

  function changePhoneRegion(code: string) {
    setChosenPhoneRegion(code === COMBOBOX_NONE ? null : code);
    setPhoneRegionTouched(true);
    setErrors((prev) => ({ ...prev, defaultPhoneRegion: undefined }));
  }

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
    const id =
      field === 'name' || field === 'phone' || field === 'defaultPhoneRegion'
        ? `${ID}-${field}`
        : regionalFieldId(ID, field);
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
      // Siempre en el alta, también `null`: la API no vuelve a sugerirlo.
      defaultPhoneRegion: phoneRegion,
      country: regional.country,
      currency: regional.currency,
      timeZone: canonicalTimeZone(regional.timeZone) ?? regional.timeZone.trim(),
      locale: canonicalLocale(regional.locale) ?? regional.locale.trim(),
      // Siempre, en el alta y en la edición: la validación ya exige uno de los dos.
      hourCycle: regional.hourCycle as CreateLocationInput['hourCycle'],
    };
  }

  function patch(confirmRegionalChange: boolean): UpdateLocationSettingsInput {
    const { address: newAddress, phone: newPhone, defaultPhoneRegion, ...rest } = body();
    return {
      ...rest,
      // Solo si cambió: sin el campo, la API lo deja como estaba.
      ...(defaultPhoneRegion !== location?.defaultPhoneRegion ? { defaultPhoneRegion } : {}),
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
          <FormField
            htmlFor={`${ID}-defaultPhoneRegion`}
            label={copy.phoneRegion}
            hint={phoneRegionHint}
            hintId={`${ID}-defaultPhoneRegion-hint`}
            error={errors.defaultPhoneRegion}
            className="sm:col-span-2"
          >
            <CountryCombobox<PhoneRegionOption>
              id={`${ID}-defaultPhoneRegion`}
              value={phoneRegion ?? COMBOBOX_NONE}
              onChange={changePhoneRegion}
              invalid={errors.defaultPhoneRegion ? true : undefined}
              ariaDescribedBy={
                errors.defaultPhoneRegion
                  ? fieldErrorId(`${ID}-defaultPhoneRegion`)
                  : `${ID}-defaultPhoneRegion-hint`
              }
              options={PHONE_REGIONS}
              search={searchPhoneRegions}
              formatOption={formatPhoneRegion}
              copy={phoneRegionComboboxCopy}
              noneOption={{ label: copy.noPhoneRegion }}
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
