'use client';
import * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  HEALTH_REGISTRATION_NUMBER_MAX_LENGTH,
  updateLocationHealthRegistration,
  type ClinicLocation,
} from '@/lib/locations/locations-api';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingsSection } from '@/components/settings/settings-page';

export const locationRegistrationCopy = {
  heading: 'Nº de registro sanitario',
  support:
    'El número con el que la sede está inscrita ante la autoridad sanitaria. Es opcional y solo aparece en los documentos si lo activas.',
  registration: 'Nº de registro sanitario',
  registrationHint: 'Opcional. Tal como te lo asignó la autoridad sanitaria.',
  counter: (n: number) => `${n}/${HEALTH_REGISTRATION_NUMBER_MAX_LENGTH}`,
  show: 'Mostrar el nº de registro en los documentos',
  showHint: 'Aparecerá en los documentos de esta sede que lo incluyan.',
  saveFor: (name: string) => `Guardar el nº de registro sanitario de ${name}`,
  saved: (name: string) => `Nº de registro sanitario de ${name} guardado.`,
  saveError: 'No pudimos guardar el nº de registro sanitario. Intenta de nuevo.',
  readOnly: 'Solo un administrador puede cambiarlo.',
  noRegistration: 'Sin nº',
  shown: 'Aparece en los documentos',
  hidden: 'No aparece en los documentos',
};

const copy = locationRegistrationCopy;

interface RegistrationDraft {
  registration: string;
  show: boolean;
}

function savedDraft(location: ClinicLocation): RegistrationDraft {
  return {
    registration: location.healthRegistrationNumber ?? '',
    show: location.showHealthRegistrationNumber ?? false,
  };
}

/**
 * DX-319, B6: el nº de registro sanitario de UNA sede (texto libre, sin formato
 * por país) y si sale en los documentos, en la ficha de la sede y con la barra
 * «Cambios sin guardar» (antes, una sección que repetía todas las sedes, cada
 * fila con su «Guardar» deshabilitado a la vista). ADMIN edita; el resto lo lee.
 */
export function LocationRegistrationForm({
  token,
  location,
  canEdit,
  onSaved,
}: {
  token: string;
  location: ClinicLocation;
  canEdit: boolean;
  onSaved: (location: ClinicLocation) => void;
}) {
  const saved = React.useMemo(() => savedDraft(location), [location]);
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const formId = `location-registration-${location.id}`;
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Tras un 400 el foco va al campo, ya con el error enlazado (se lee al
  // recibir el foco). Después del render: mientras guarda, el campo está
  // deshabilitado y no puede recibirlo.
  React.useEffect(() => {
    if (fieldError) inputRef.current?.focus();
  }, [fieldError]);
  // Un fallo que no es del campo (permiso, servidor, red): el foco vuelve a
  // «Guardar» de la barra para reintentar, con el error a la vista.
  React.useEffect(() => {
    if (error) document.querySelector<HTMLButtonElement>(`button[form="${formId}"]`)?.focus();
  }, [error, formId]);
  const registrationId = `health-registration-${location.id}`;

  if (!canEdit) {
    return (
      <SettingsSection title={copy.heading} description={copy.support}>
        <DescriptionList columns={1} className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <DescriptionItem label={copy.registration}>
            <span className="break-all">{saved.registration || copy.noRegistration}</span>
            <span className="block text-sm text-muted">{saved.show ? copy.shown : copy.hidden}</span>
          </DescriptionItem>
        </DescriptionList>
        <p className="text-sm text-muted">{copy.readOnly}</p>
      </SettingsSection>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    setSaving(true);
    try {
      const updated = await updateLocationHealthRegistration(token, location.id, {
        healthRegistrationNumber: draft.registration.trim() || null,
        showHealthRegistrationNumber: draft.show,
      });
      const next = { ...location, ...updated };
      onSaved(next);
      commit(savedDraft(next));
      toast.success(copy.saved(location.name));
    } catch (err) {
      const message = apiErrorMessage(err, copy.saveError);
      // 400: el campo tiene la culpa → el error va junto a él y el foco, a él.
      if (err instanceof ApiError && err.status === 400) {
        setFieldError(message);
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection title={copy.heading} description={copy.support}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
          <FormField
            htmlFor={registrationId}
            label={copy.registration}
            hint={`${copy.registrationHint} ${copy.counter(draft.registration.length)}`}
            hintId={`${registrationId}-hint`}
            error={fieldError}
          >
            <Input
              ref={inputRef}
              id={registrationId}
              autoComplete="off"
              maxLength={HEALTH_REGISTRATION_NUMBER_MAX_LENGTH}
              value={draft.registration}
              disabled={saving}
              onChange={(e) => update({ registration: e.target.value })}
              aria-label={`${copy.registration} · ${location.name}`}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? fieldErrorId(registrationId) : `${registrationId}-hint`}
              className="sm:max-w-80"
            />
          </FormField>
          <Checkbox
            id={`${registrationId}-show`}
            checked={draft.show}
            disabled={saving}
            onChange={(e) => update({ show: e.target.checked })}
            label={copy.show}
            description={copy.showHint}
          />
        </div>
        <SaveBar
          dirty={dirty}
          saving={saving}
          form={formId}
          error={error}
          saveAriaLabel={copy.saveFor(location.name)}
          onDiscard={() => {
            discard();
            setError(null);
            setFieldError(null);
          }}
        />
      </form>
    </SettingsSection>
  );
}
