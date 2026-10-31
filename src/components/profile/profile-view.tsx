'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { AvatarResizeError } from '@/lib/me/avatar-resize';
import {
  getMe,
  updateName,
  uploadAvatar,
  removeAvatar,
  type MyProfile,
} from '@/lib/me/me-api';
import { readJwtClaims } from '@/lib/auth/jwt-claims';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Avatar } from '@/components/ui/avatar';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingsSection } from '@/components/settings/settings-page';
import { initials } from '@/lib/format/initials';

// Copy as constants (i18n-ready) — same convention as staff-view.tsx.
const copy = {
  loading: 'Cargando perfil…',
  loadError: 'No pudimos cargar tu perfil.',
  accountHeading: 'Tu cuenta',
  accountHelp: 'Tu correo y tu rol los gestiona la administración de la clínica.',
  nameHeading: 'Nombre',
  nameHelp: 'Así te ven el equipo y los pacientes en citas, recetas y documentos.',
  nameLabel: 'Nombre completo',
  nameMissing: 'Escribe tu nombre.',
  save: 'Guardar',
  saveFor: 'Guardar el nombre',
  saveError: 'No pudimos guardar tu nombre. Intenta de nuevo.',
  emailLabel: 'Correo electrónico',
  clinicLabel: 'Clínica',
  roleLabel: 'Rol',
  otherClinics: 'También en',
  avatarAlt: 'Foto de perfil',
  upload: 'Cambiar foto',
  uploading: 'Subiendo…',
  remove: 'Quitar foto',
  avatarError: 'No pudimos actualizar tu foto. Intenta de nuevo.',
  avatarTooLarge: 'La foto pesa más de 900 KB y no pudimos reducirla. Elige otra imagen (PNG, JPEG o WebP).',
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador/a',
  DENTIST: 'Odontólogo/a',
  ASSISTANT: 'Asistente',
  RECEPTION: 'Recepción',
};

interface ProfileViewProps {
  token: string;
}

/**
 * "Mi perfil" (B6, plantilla de Ajustes): primero lo que es de solo lectura
 * —foto, correo, clínica y rol— y después lo editable —el nombre, con la barra
 * «Cambios sin guardar» como único guardado—. Antes el «Guardar» del nombre
 * quedaba encima del correo y la clínica, como si también los guardara.
 * Follows staff-view.tsx's load pattern — useState/useEffect keyed by a
 * `reloadKey` bump after a mutation, no TanStack Query in this app.
 */
export function ProfileView({ token }: ProfileViewProps) {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const { draft: name, setDraft: setName, dirty: nameDirty, discard: discardName, commit: commitName } =
    useSettingsDraft(profile?.fullName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameFieldError, setNameFieldError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    // Reset del estado de carga antes del fetch; setState-en-effect intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(null);
    getMe(token)
      .then((p) => {
        if (!active) return;
        setProfile(p);
      })
      .catch(() => active && setLoadError(copy.loadError))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token, reloadKey]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameFieldError(null);
    if (name.trim() === '') {
      setNameFieldError(copy.nameMissing);
      document.getElementById('profile-name')?.focus();
      return;
    }
    setSavingName(true);
    try {
      const updated = await updateName(token, name.trim());
      setProfile(updated);
      commitName(updated.fullName);
    } catch (err) {
      setNameError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSavingName(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      await uploadAvatar(token, file);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setAvatarError(err instanceof AvatarResizeError ? copy.avatarTooLarge : apiErrorMessage(err, copy.avatarError));
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleRemove() {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      await removeAvatar(token);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setAvatarError(apiErrorMessage(err, copy.avatarError));
    } finally {
      setAvatarBusy(false);
    }
  }

  if (loading) {
    return (
      <div role="status" aria-label={copy.loading} className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (loadError || !profile) {
    return (
      <SectionError
        description={loadError ?? copy.loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  // La membresía de ESTA clínica (la del token); las demás, aparte.
  const tenantId = readJwtClaims(token)?.tenantId;
  const membership = profile.memberships.find((m) => m.tenantId === tenantId) ?? profile.memberships[0];
  const others = profile.memberships.filter((m) => m !== membership);

  return (
    <>
      <SettingsSection title={copy.accountHeading} description={copy.accountHelp}>
        <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar
              size="xl"
              initials={initials(profile.fullName)}
              src={profile.avatarUrl}
              alt={profile.avatarUrl ? copy.avatarAlt : undefined}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={avatarBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  {avatarBusy ? copy.uploading : copy.upload}
                </Button>
                {profile.avatarUrl && (
                  <Button type="button" variant="ghost" disabled={avatarBusy} onClick={handleRemove}>
                    {copy.remove}
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                aria-label={copy.upload}
                onChange={handleUpload}
              />
              {avatarError && <InlineError>{avatarError}</InlineError>}
            </div>
          </div>
          <DescriptionList columns={2}>
            <DescriptionItem label={copy.emailLabel}>{profile.email}</DescriptionItem>
            {membership ? (
              <>
                <DescriptionItem label={copy.clinicLabel}>{membership.clinicName}</DescriptionItem>
                <DescriptionItem label={copy.roleLabel}>{ROLE_LABEL[membership.role] ?? membership.role}</DescriptionItem>
              </>
            ) : null}
            {others.length > 0 ? (
              <DescriptionItem label={copy.otherClinics}>
                {others.map((m) => `${m.clinicName} (${ROLE_LABEL[m.role] ?? m.role})`).join(' · ')}
              </DescriptionItem>
            ) : null}
          </DescriptionList>
        </div>
      </SettingsSection>

      <SettingsSection title={copy.nameHeading} description={copy.nameHelp}>
        <form id="profile-name-form" onSubmit={handleSaveName} noValidate className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <FormField htmlFor="profile-name" label={copy.nameLabel} error={nameFieldError}>
              <Input
                id="profile-name"
                autoComplete="name"
                value={name}
                disabled={savingName}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameFieldError(null);
                }}
                aria-invalid={nameFieldError ? true : undefined}
                aria-describedby={nameFieldError ? fieldErrorId('profile-name') : undefined}
                required
                className="sm:max-w-sm"
              />
            </FormField>
          </div>
          <SaveBar
            dirty={nameDirty}
            saving={savingName}
            form="profile-name-form"
            error={nameError}
            saveLabel={copy.save}
            saveAriaLabel={copy.saveFor}
            onDiscard={() => {
              discardName();
              setNameError(null);
              setNameFieldError(null);
            }}
          />
        </form>
      </SettingsSection>
    </>
  );
}
