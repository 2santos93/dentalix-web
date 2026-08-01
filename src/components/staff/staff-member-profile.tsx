'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  getStaffMember,
  updateStaff,
  deactivateStaff,
  reactivateStaff,
  type ClinicRole,
  type StaffMemberDetail,
} from '@/lib/staff/staff-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/molecules/form-field';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { AsyncSection } from '@/components/molecules/async-section';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  back: 'Volver a Personal',
  sectionTitle: 'Datos del miembro',
  fullNameLabel: 'Nombre completo',
  emailLabel: 'Correo electrónico',
  emailHint: 'El correo identifica la cuenta y no se puede cambiar desde aquí.',
  roleLabel: 'Rol',
  save: 'Guardar cambios',
  saving: 'Guardando…',
  statusActive: 'Aceptado',
  statusInactive: 'Inactivo',
  accessTitle: 'Acceso',
  accessActiveHint: 'Puede entrar a la clínica con su cuenta.',
  accessInactiveHint: 'No puede entrar. Reactívalo/a para devolverle el acceso.',
  deactivate: 'Desactivar acceso',
  reactivate: 'Reactivar acceso',
  deactivateTitle: 'Desactivar miembro del equipo',
  deactivateBody: (name: string) =>
    `${name} perderá el acceso a la clínica. Podrás reactivarlo/a más adelante.`,
  deactivateConfirmYes: 'Sí, desactivar',
  loading: 'Cargando perfil…',
  genericLoadError: 'No pudimos cargar el perfil.',
  genericSaveError: 'No pudimos guardar los cambios. Intenta de nuevo.',
  // Escalón 3 (segundo plano): sin "Intenta de nuevo." — el toast trae acción.
  genericDeactivateError: 'No pudimos desactivar el acceso.',
  genericReactivateError: 'No pudimos reactivar el acceso.',
};

const ROLE_OPTIONS: { value: ClinicRole; label: string }[] = [
  { value: 'ADMIN', label: 'Administrador/a' },
  { value: 'DENTIST', label: 'Odontólogo/a' },
  { value: 'ASSISTANT', label: 'Asistente' },
  { value: 'RECEPTION', label: 'Recepción' },
];

// Native <select> styled to match the Input atom (kept native for a11y/tests) —
// same class as agenda-view.tsx's `fieldClass`.
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

interface StaffMemberProfileProps {
  token: string;
  userId: string;
}

/**
 * Perfil de un miembro: aquí se edita lo que antes se editaba a pelo en la
 * tabla (nombre y rol) y se le quita o devuelve el acceso.
 *
 * El formulario es un envío explícito, no un guardado al perder el foco: en la
 * tabla anterior un cambio de rol se disparaba con solo mover el ratón, sin
 * confirmación ni forma de echarse atrás.
 */
export function StaffMemberProfile({ token, userId }: StaffMemberProfileProps) {
  const [member, setMember] = useState<StaffMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<ClinicRole>('ASSISTANT');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [changingAccess, setChangingAccess] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getStaffMember(token, userId);
        if (cancelled) return;
        setMember(data);
        setFullName(data.fullName);
        setRole(data.role);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, userId, reloadKey]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!member) return;
    setSaveError(null);
    setSaving(true);
    try {
      // Solo se manda lo que cambió: un PATCH con el mismo rol dispararía la
      // guardia de "último admin" del backend sin que el usuario haya tocado
      // el rol.
      const patch: { fullName?: string; role?: ClinicRole } = {};
      if (fullName !== member.fullName) patch.fullName = fullName;
      if (role !== member.role) patch.role = role;
      if (Object.keys(patch).length === 0) return;
      const updated = await updateStaff(token, userId, patch);
      setMember({ ...updated, status: member.status });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : copy.genericSaveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    setChangingAccess(true);
    try {
      await deactivateStaff(token, userId);
      setConfirmingDeactivate(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      // Se cierra el diálogo también al fallar: mientras esté abierto, Radix
      // deja inerte todo lo de fuera, incluido el toast con el reintento.
      setConfirmingDeactivate(false);
      notifyError(err instanceof ApiError ? err.message : copy.genericDeactivateError, {
        onRetry: () => handleDeactivate(),
      });
    } finally {
      setChangingAccess(false);
    }
  }

  async function handleReactivate() {
    setChangingAccess(true);
    try {
      await reactivateStaff(token, userId);
      setReloadKey((k) => k + 1);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : copy.genericReactivateError, {
        onRetry: () => handleReactivate(),
      });
    } finally {
      setChangingAccess(false);
    }
  }

  const isUnchanged =
    !!member && fullName === member.fullName && role === member.role;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/staff">
            <ArrowLeft /> {copy.back}
          </Link>
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={
          <p role="status" className="text-sm text-muted">
            {copy.loading}
          </p>
        }
      >
        {member && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-ink">{member.fullName}</h2>
              <Badge variant={member.status === 'ACTIVE' ? 'success' : 'secondary'}>
                {member.status === 'ACTIVE' ? copy.statusActive : copy.statusInactive}
              </Badge>
            </div>

            <Card className="p-5">
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <h3 className="text-base font-semibold text-ink">{copy.sectionTitle}</h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField htmlFor="profile-full-name" label={copy.fullNameLabel}>
                    <Input
                      id="profile-full-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </FormField>
                  <FormField
                    htmlFor="profile-email"
                    label={copy.emailLabel}
                    hint={copy.emailHint}
                  >
                    <Input id="profile-email" type="email" readOnly value={member.email} />
                  </FormField>
                </div>

                <FormField htmlFor="profile-role" label={copy.roleLabel}>
                  <select
                    id="profile-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as ClinicRole)}
                    className={fieldClass}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                {saveError && <InlineError variant="summary">{saveError}</InlineError>}

                <Button
                  type="submit"
                  loading={saving}
                  disabled={isUnchanged}
                  className="self-start"
                >
                  {copy.save}
                </Button>
              </form>
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <h3 className="text-base font-semibold text-ink">{copy.accessTitle}</h3>
              <p className="text-sm text-muted">
                {member.status === 'ACTIVE'
                  ? copy.accessActiveHint
                  : copy.accessInactiveHint}
              </p>
              {member.status === 'ACTIVE' ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="self-start"
                  disabled={changingAccess}
                  onClick={() => setConfirmingDeactivate(true)}
                >
                  {copy.deactivate}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  loading={changingAccess}
                  onClick={() => void handleReactivate()}
                >
                  {copy.reactivate}
                </Button>
              )}
            </Card>
          </div>
        )}
      </AsyncSection>

      <ConfirmDialog
        open={confirmingDeactivate}
        onOpenChange={setConfirmingDeactivate}
        title={copy.deactivateTitle}
        description={member ? copy.deactivateBody(member.fullName) : undefined}
        confirmLabel={copy.deactivateConfirmYes}
        confirming={changingAccess}
        onConfirm={() => void handleDeactivate()}
      />
    </div>
  );
}
