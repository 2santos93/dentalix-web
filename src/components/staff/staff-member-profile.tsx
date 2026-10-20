'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ApiError } from '@/lib/api/api-error';
import {
  getStaffMember,
  updateStaff,
  deactivateStaff,
  reactivateStaff,
  unlockStaffLogin,
  type ClinicRole,
  type StaffMemberDetail,
  type UpdateStaffInput,
} from '@/lib/staff/staff-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/shared/form-field';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AsyncSection } from '@/components/shared/async-section';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { ScheduleBlockDialog } from '@/components/appointments/schedule-block-dialog';
import { StaffLocationsCard } from '@/components/staff/staff-locations-card';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import {
  blocksOwnAgendaOnly,
  canWriteScheduleBlocks,
} from '@/lib/appointments/schedule-blocks-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { toast } from 'sonner';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  back: 'Volver a Personal',
  sectionTitle: 'Datos del miembro',
  fullNameLabel: 'Nombre completo',
  emailLabel: 'Correo electrónico',
  emailHint: 'El correo identifica la cuenta y no se puede cambiar desde aquí.',
  roleLabel: 'Rol',
  licenseLabel: 'Registro profesional / nº de colegiado',
  licenseHint:
    'Lo exige la receta: en Colombia, RETHUS o tarjeta profesional; en España, nº de colegiado.',
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
  // 409 de la API, en inglés («Cannot demote the last admin», «You cannot
  // deactivate yourself», «Cannot deactivate the last admin»).
  lastAdminRole: 'No puedes quitar el rol de administrador al último administrador de la clínica.',
  cannotDeactivate:
    'No se puede desactivar: es el último administrador de la clínica o es tu propia cuenta.',
  // 404 al reactivar: ya estaba activa.
  alreadyActive: 'Esta persona ya tiene el acceso activo. Recarga para ver su estado.',
  // DX-122: bloquear su agenda (vacaciones, congreso) desde su perfil.
  agendaTitle: 'Agenda',
  agendaHint: 'Bloquea sus vacaciones, un congreso o una reunión: la agenda no le dará citas en ese rango.',
  blockAgenda: 'Bloquear agenda',
  blockCreated: 'Agenda bloqueada.',
  // DX-048: bloqueo del inicio de sesión por intentos fallidos.
  loginBlocked: (minutes: number) =>
    `Inicio de sesión bloqueado por intentos fallidos. Puede volver a intentarlo en ${minutes} min, o puedes desbloquearlo ahora.`,
  unlockLogin: 'Desbloquear inicio de sesión',
  unlockTitle: 'Desbloquear inicio de sesión',
  unlockBody: (name: string) =>
    `${name} podrá volver a iniciar sesión ahora mismo y se borrarán sus intentos fallidos. Hazlo solo si confirmaste que fue esta persona quien se equivocó.`,
  unlockConfirmYes: 'Sí, desbloquear',
  genericUnlockError: 'No pudimos desbloquear el inicio de sesión.',
  // DX-213: 404 al desbloquear = lo desactivaron entre la carga y el clic.
  unlockNotActive: 'Esta persona ya no tiene el acceso activo. Actualizamos su perfil.',
};

/** Minutos que faltan (hacia arriba) hasta `until`, o `null` si ya pasó. */
function minutesLeft(until: string | null): number | null {
  if (!until) return null;
  const ms = Date.parse(until) - Date.now();
  return Number.isNaN(ms) || ms <= 0 ? null : Math.ceil(ms / 60_000);
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  const [license, setLicense] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [changingAccess, setChangingAccess] = useState(false);
  const [confirmingUnlock, setConfirmingUnlock] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  // DX-213: el 409 de la API («Esta cuenta da acceso a otra clínica…») no es
  // un fallo que se arregle reintentando: se queda junto al botón, tal cual.
  const [unlockRefused, setUnlockRefused] = useState<string | null>(null);

  // DX-122: el odontólogo solo bloquea su propia agenda (la API lo exige).
  const viewerRole = getTokenRole(token);
  const viewerId = getTokenUserId(token);
  const canBlock =
    canWriteScheduleBlocks(viewerRole) && (!blocksOwnAgendaOnly(viewerRole) || viewerId === userId);
  const [blocking, setBlocking] = useState(false);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);

  async function openBlockDialog() {
    // Las sedes solo hacen falta aquí; sin ellas se bloquea en todas.
    if (locations.length === 0) {
      setLocations(await listLocations(token).catch(() => []));
    }
    setBlocking(true);
  }

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
        setLicense(data.professionalLicense ?? '');
        setUnlockRefused(null);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(err, copy.genericLoadError));
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
      const patch: UpdateStaffInput = {};
      if (fullName !== member.fullName) patch.fullName = fullName;
      if (role !== member.role) patch.role = role;
      if (license.trim() !== (member.professionalLicense ?? '')) {
        patch.professionalLicense = license.trim();
      }
      if (Object.keys(patch).length === 0) return;
      const updated = await updateStaff(token, userId, patch);
      const next = {
        ...updated,
        status: member.status,
        loginBlockedUntil: member.loginBlockedUntil,
        // El `PATCH` no devuelve las sedes (no las cambia): se conservan.
        locationIds: member.locationIds,
        // `null` de la API = lo borró; solo `undefined` (respuesta sin el
        // campo) conserva el que había.
        professionalLicense:
          updated.professionalLicense !== undefined
            ? updated.professionalLicense
            : (member.professionalLicense ?? null),
      };
      setMember(next);
      setLicense(next.professionalLicense ?? '');
    } catch (err) {
      setSaveError(
        apiErrorMessage(err, { fallback: copy.genericSaveError, byStatus: { 409: copy.lastAdminRole } }),
      );
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
      notifyError(
        apiErrorMessage(err, {
          fallback: copy.genericDeactivateError,
          byStatus: { 409: copy.cannotDeactivate },
        }),
        { onRetry: () => handleDeactivate() },
      );
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
      notifyError(
        apiErrorMessage(err, {
          fallback: copy.genericReactivateError,
          byStatus: { 404: copy.alreadyActive },
        }),
        { onRetry: () => handleReactivate() },
      );
    } finally {
      setChangingAccess(false);
    }
  }

  async function handleUnlock() {
    setUnlocking(true);
    setUnlockRefused(null);
    try {
      await unlockStaffLogin(token, userId);
      setConfirmingUnlock(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      // Como al desactivar: el diálogo abierto dejaría inerte el toast.
      setConfirmingUnlock(false);
      if (err instanceof ApiError && err.status === 409) {
        setUnlockRefused(apiErrorMessage(err, copy.genericUnlockError));
      } else if (err instanceof ApiError && err.status === 404) {
        // Ya no es un miembro activo: recargar muestra su estado real (y quita
        // el botón); reintentar daría otra vez 404.
        notifyError(copy.unlockNotActive);
        setReloadKey((k) => k + 1);
      } else {
        notifyError(apiErrorMessage(err, { fallback: copy.genericUnlockError }), {
          onRetry: () => handleUnlock(),
        });
      }
    } finally {
      setUnlocking(false);
    }
  }

  // DX-213: a un desactivado no se le ofrece desbloquear (la API ya manda
  // `loginBlockedUntil: null`; esto lo mantiene si una respuesta vieja lo trae).
  const blockedMinutes =
    member && member.status === 'ACTIVE' ? minutesLeft(member.loginBlockedUntil) : null;

  const isUnchanged =
    !!member &&
    fullName === member.fullName &&
    role === member.role &&
    license.trim() === (member.professionalLicense ?? '');

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

                <FormField
                  htmlFor="profile-license"
                  label={copy.licenseLabel}
                  hint={copy.licenseHint}
                >
                  <Input
                    id="profile-license"
                    type="text"
                    maxLength={60}
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                  />
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

            {canBlock &&
            member.status === 'ACTIVE' &&
            (member.role === 'DENTIST' || member.role === 'ADMIN') ? (
              <Card className="flex flex-col gap-3 p-5">
                <h3 className="text-base font-semibold text-ink">{copy.agendaTitle}</h3>
                <p className="text-sm text-muted">{copy.agendaHint}</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="self-start"
                  onClick={() => void openBlockDialog()}
                >
                  {copy.blockAgenda}
                </Button>
              </Card>
            ) : null}

            {/* DX-089: sedes del miembro; la API solo deja verlas y cambiarlas al ADMIN. */}
            {viewerRole === 'ADMIN' ? (
              <StaffLocationsCard token={token} userId={userId} memberRole={member.role} />
            ) : null}

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
              {blockedMinutes !== null ? (
                <div className="mt-1 flex flex-col gap-3 border-t border-hairline pt-4">
                  <p className="flex items-start gap-1.5 text-sm text-warning">
                    <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{copy.loginBlocked(blockedMinutes)}</span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    disabled={unlocking}
                    onClick={() => setConfirmingUnlock(true)}
                  >
                    {copy.unlockLogin}
                  </Button>
                  {unlockRefused ? <InlineError>{unlockRefused}</InlineError> : null}
                </div>
              ) : null}
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

      {blocking && member ? (
        <ScheduleBlockDialog
          open
          onOpenChange={setBlocking}
          token={token}
          staff={[
            {
              userId: member.userId,
              fullName: member.fullName,
              role: member.role,
              locationIds: member.locationIds,
            },
          ]}
          locations={locations.filter((l) => l.isActive)}
          activeLocationId={null}
          defaultDate={todayLocal()}
          defaultProviderId={member.userId}
          ownProviderId={member.userId}
          onCreated={() => {
            setBlocking(false);
            toast.success(copy.blockCreated);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirmingUnlock}
        onOpenChange={setConfirmingUnlock}
        title={copy.unlockTitle}
        description={member ? copy.unlockBody(member.fullName) : undefined}
        confirmLabel={copy.unlockConfirmYes}
        confirming={unlocking}
        destructive={false}
        onConfirm={() => void handleUnlock()}
      />
    </div>
  );
}
