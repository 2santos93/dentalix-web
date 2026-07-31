'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  getMe,
  updateName,
  uploadAvatar,
  removeAvatar,
  type MyProfile,
} from '@/lib/me/me-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/molecules/form-field';

// Copy as constants (i18n-ready) — same convention as staff-view.tsx.
const copy = {
  loading: 'Cargando perfil…',
  loadError: 'No pudimos cargar tu perfil. Intenta de nuevo.',
  retry: 'Reintentar',
  nameLabel: 'Nombre completo',
  save: 'Guardar',
  saving: 'Guardando…',
  saveError: 'No pudimos guardar tu nombre. Intenta de nuevo.',
  emailLabel: 'Correo electrónico',
  clinicLabel: 'Clínica',
  roleLabel: 'Rol',
  avatarAlt: 'Foto de perfil',
  upload: 'Cambiar foto',
  uploading: 'Subiendo…',
  remove: 'Quitar foto',
  avatarError: 'No pudimos actualizar tu foto. Intenta de nuevo.',
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador/a',
  DENTIST: 'Odontólogo/a',
  ASSISTANT: 'Asistente',
  RECEPTION: 'Recepción',
};

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

interface ProfileViewProps {
  token: string;
}

/**
 * "Mi perfil": avatar (upload/remove), editable name, read-only email and
 * clinic/role. Follows staff-view.tsx's load pattern — useState/useEffect
 * keyed by a `reloadKey` bump after a mutation, no TanStack Query in this app.
 */
export function ProfileView({ token }: ProfileViewProps) {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
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
        setName(p.fullName);
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
    setSavingName(true);
    try {
      const updated = await updateName(token, name.trim());
      setProfile(updated);
      setName(updated.fullName);
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : copy.saveError);
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
      setAvatarError(err instanceof ApiError ? err.message : copy.avatarError);
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
      setAvatarError(err instanceof ApiError ? err.message : copy.avatarError);
    } finally {
      setAvatarBusy(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loading}
      </p>
    );
  }
  if (loadError || !profile) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
        <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
          {copy.retry}
        </Button>
      </div>
    );
  }

  const membership = profile.memberships[0];

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-6">
        <div className="flex items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={copy.avatarAlt}
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
            >
              {initials(profile.fullName)}
            </span>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
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
            {avatarError && (
              <p role="alert" className="text-sm text-danger">
                {avatarError}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveName} className="flex flex-col gap-3">
          <FormField htmlFor="profile-name" label={copy.nameLabel}>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          {nameError && (
            <p role="alert" className="text-sm text-danger">
              {nameError}
            </p>
          )}
          <div>
            <Button type="submit" disabled={savingName}>
              {savingName ? copy.saving : copy.save}
            </Button>
          </div>
        </form>

        <dl className="grid gap-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted">{copy.emailLabel}:</dt>
            <dd className="text-ink">{profile.email}</dd>
          </div>
          {membership && (
            <>
              <div className="flex gap-2">
                <dt className="text-muted">{copy.clinicLabel}:</dt>
                <dd className="text-ink">{membership.clinicName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted">{copy.roleLabel}:</dt>
                <dd className="text-ink">{ROLE_LABEL[membership.role] ?? membership.role}</dd>
              </div>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
