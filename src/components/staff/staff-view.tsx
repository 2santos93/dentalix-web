'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  listStaff,
  updateStaff,
  deactivateStaff,
  type StaffMember,
  type ClinicRole,
} from '@/lib/staff/staff-api';
import { createInvitation, type CreatedInvitation } from '@/lib/staff/invitations-api';
import { PendingInvitations } from '@/components/staff/pending-invitations';
import { useCopyToClipboard } from '@/lib/ui/use-copy-to-clipboard';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/molecules/form-field';
import { FormModal } from '@/components/molecules/form-modal';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { AsyncSection, TableSkeleton } from '@/components/molecules/async-section';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  inviteToggle: 'Invitar',
  formTitle: 'Invitar a la clínica',
  formDescription:
    'La persona recibirá un enlace para crear su propia contraseña y unirse a la clínica.',
  cancel: 'Cancelar',
  fullNameLabel: 'Nombre completo',
  emailLabel: 'Correo electrónico',
  roleLabel: 'Rol',
  submit: 'Enviar invitación',
  submitting: 'Enviando…',
  loading: 'Cargando personal…',
  tableLabel: 'Personal de la clínica',
  genericLoadError: 'No pudimos cargar el personal. Intenta de nuevo.',
  genericCreateError: 'No pudimos crear la invitación. Intenta de nuevo.',
  genericRoleChangeError: 'No pudimos actualizar el rol. Intenta de nuevo.',
  genericNameChangeError: 'No pudimos actualizar el nombre. Intenta de nuevo.',
  genericDeactivateError: 'No pudimos desactivar al miembro del equipo. Intenta de nuevo.',
  empty: 'No hay personal registrado todavía.',
  emptyHint: 'Agrega al primer miembro del equipo para empezar.',
  colName: 'Nombre',
  colEmail: 'Correo electrónico',
  colRole: 'Rol',
  colActions: 'Acciones',
  deactivateCta: 'Desactivar',
  deactivateTitle: 'Desactivar miembro del equipo',
  deactivateBody: (name: string) =>
    `${name} perderá el acceso a la clínica. Podrás reactivarlo/a más adelante.`,
  deactivateConfirmYes: 'Sí, desactivar',
  nameFieldLabel: (name: string) => `Nombre de ${name}`,
  roleFieldLabel: (name: string) => `Rol de ${name}`,
  inviteCreatedTitle: 'Invitación creada',
  inviteCreatedDescription: 'Comparte este enlace con la persona invitada.',
  copyLabel: 'Copiar',
  copiedLabel: 'Copiado',
  copyWarning: 'Cópialo ahora: por seguridad no podrás verlo de nuevo.',
  // Not "Cerrar" — `DialogContent`'s built-in X button already has that as
  // its (hardcoded, sr-only) accessible name; a second "Cerrar" button would
  // be ambiguous for both a11y and tests.
  closeLabel: 'Listo',
  pendingInvitationsTitle: 'Invitaciones pendientes',
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

interface StaffViewProps {
  token: string;
}

/**
 * Composes the staff list (table) + an inline "add staff" reveal section
 * (this app has no top-level modal convention for its primary create flow —
 * see `agenda-view.tsx`'s "Nueva cita" toggle; `Dialog` is only used for a
 * *secondary*, nested creation inside another form, e.g.
 * `appointment-form.tsx`'s "Crear paciente" — so this mirrors the dominant,
 * primary-action pattern: a `Button` toggling a revealed `Card`, not a
 * dialog).
 *
 * Row actions (role change, name change, deactivate) all follow
 * `agenda-view.tsx`/`day-agenda.tsx`'s status-change convention: mutate, then
 * re-fetch the list in place (`refreshInPlace`) so the table never remounts,
 * with `updatingId` disabling just the row being changed.
 */
export function StaffView({ token }: StaffViewProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ClinicRole>('ASSISTANT');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Set on a successful invite; while non-null the modal shows the one-time
  // link instead of the form (the invitee isn't staff yet, so there's
  // nothing to refresh in the table above — see `handleCreateSubmit`).
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const { copied, copy: copyInviteLink } = useCopyToClipboard();
  // Bumped on a successful invite so `PendingInvitations` (which owns its own
  // fetch) reloads without this component knowing anything about its state.
  const [invitationsRefreshKey, setInvitationsRefreshKey] = useState(0);

  // Which row is currently being mutated (role/name change or deactivate) —
  // disables that row's controls, same as agenda-view.tsx's `updatingId`.
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // Row awaiting deactivate confirmation (inline, not a dialog/native confirm()).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // The inline name editor is uncontrolled (defaultValue), so on a failed
  // PATCH the DOM keeps the edited value. Without this, a later no-op blur
  // (e.g. tabbing through the row again) would still see value !== fullName
  // and re-fire the same mutation. Keep refs to reset the DOM value back to
  // the last-known-good fullName after a failure.
  const nameInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listStaff(token);
        if (cancelled) return;
        setStaff(data);
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
  }, [token, reloadKey]);

  function refreshInPlace(): Promise<void> {
    if (!token) return Promise.resolve();
    return listStaff(token)
      .then((data) => {
        setStaff(data);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
      });
  }

  function resetForm() {
    setFullName('');
    setEmail('');
    setRole('ASSISTANT');
  }

  async function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const created = await createInvitation(token, { fullName, email, role });
      // Keep the modal open: this is the only time the raw token is ever
      // shown, so the caller must copy the link before dismissing it.
      setCreatedInvitation(created);
      setInvitationsRefreshKey((k) => k + 1);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : copy.genericCreateError);
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(userId: string, nextRole: ClinicRole) {
    setUpdatingId(userId);
    setRowError(null);
    try {
      await updateStaff(token, userId, { role: nextRole });
      await refreshInPlace();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : copy.genericRoleChangeError);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleNameChange(userId: string, nextName: string, previousName: string) {
    setUpdatingId(userId);
    setRowError(null);
    try {
      await updateStaff(token, userId, { fullName: nextName });
      await refreshInPlace();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : copy.genericNameChangeError);
      // Reset the (uncontrolled) input back to the last known fullName so a
      // subsequent no-op blur doesn't keep re-firing the same failed PATCH.
      const el = nameInputRefs.current.get(userId);
      if (el) el.value = previousName;
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeactivate(userId: string) {
    setUpdatingId(userId);
    setRowError(null);
    try {
      // The backend 409s (last admin / self-deactivation) — surfaced via
      // `rowError` below like any other row action; no client-side check
      // (the auth store only holds tokens, not the current user's identity).
      await deactivateStaff(token, userId);
      setConfirmingId(null);
      await refreshInPlace();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : copy.genericDeactivateError);
    } finally {
      setUpdatingId(null);
    }
  }

  function handleCreateOpenChange(next: boolean) {
    setShowForm(next);
    if (!next) {
      setCreateError(null);
      setCreatedInvitation(null);
      resetForm();
    }
  }

  const confirmingMember = confirmingId
    ? staff.find((s) => s.userId === confirmingId) ?? null
    : null;

  const inviteLink = createdInvitation
    ? `${window.location.origin}/invitacion/${createdInvitation.token}`
    : '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setShowForm(true)}>
          <Plus /> {copy.inviteToggle}
        </Button>
      </div>

      <FormModal
        open={showForm && !createdInvitation}
        onOpenChange={handleCreateOpenChange}
        title={copy.formTitle}
        description={copy.formDescription}
        onSubmit={handleCreateSubmit}
        submitLabel={copy.submit}
        submitting={creating}
        error={createError}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField htmlFor="staff-full-name" label={copy.fullNameLabel}>
            <Input
              id="staff-full-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="staff-email" label={copy.emailLabel}>
            <Input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="staff-role" label={copy.roleLabel}>
            <select
              id="staff-role"
              required
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
        </div>
      </FormModal>

      <Dialog open={showForm && !!createdInvitation} onOpenChange={handleCreateOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.inviteCreatedTitle}</DialogTitle>
            <DialogDescription>{copy.inviteCreatedDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg px-3 py-2">
            <p className="break-all font-mono text-sm text-ink">{inviteLink}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => copyInviteLink(inviteLink)}
            >
              {copied ? copy.copiedLabel : copy.copyLabel}
            </Button>
          </div>
          <p className="text-sm text-muted">{copy.copyWarning}</p>
          <DialogFooter>
            <Button type="button" onClick={() => handleCreateOpenChange(false)}>
              {copy.closeLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rowError && !confirmingId && (
        <p role="alert" className="text-sm text-danger">
          {rowError}
        </p>
      )}

      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={staff.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        skeleton={<TableSkeleton rows={4} />}
      >
        <Card className="overflow-hidden p-0">
          <Table aria-label={copy.tableLabel}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{copy.colName}</TableHead>
                <TableHead>{copy.colEmail}</TableHead>
                <TableHead>{copy.colRole}</TableHead>
                <TableHead>{copy.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => {
                const updating = updatingId === s.userId;
                return (
                  <TableRow key={s.userId}>
                    <TableCell>
                      <Input
                        key={`${s.userId}-${s.fullName}`}
                        ref={(el) => {
                          if (el) nameInputRefs.current.set(s.userId, el);
                          else nameInputRefs.current.delete(s.userId);
                        }}
                        defaultValue={s.fullName}
                        aria-label={copy.nameFieldLabel(s.fullName)}
                        disabled={updating}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value && value !== s.fullName) {
                            handleNameChange(s.userId, value, s.fullName);
                          }
                        }}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell>{s.email}</TableCell>
                    <TableCell>
                      <select
                        aria-label={copy.roleFieldLabel(s.fullName)}
                        value={s.role}
                        disabled={updating}
                        onChange={(e) =>
                          handleRoleChange(s.userId, e.target.value as ClinicRole)
                        }
                        className={cn(fieldClass, 'h-9')}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={updating}
                        onClick={() => {
                          setRowError(null);
                          setConfirmingId(s.userId);
                        }}
                      >
                        {copy.deactivateCta}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </AsyncSection>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ink">{copy.pendingInvitationsTitle}</h2>
        <PendingInvitations token={token} refreshKey={invitationsRefreshKey} />
      </div>

      <ConfirmDialog
        open={confirmingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingId(null);
            setRowError(null);
          }
        }}
        title={copy.deactivateTitle}
        description={
          confirmingMember ? copy.deactivateBody(confirmingMember.fullName) : undefined
        }
        confirmLabel={copy.deactivateConfirmYes}
        confirming={updatingId === confirmingId}
        error={rowError}
        onConfirm={() => confirmingId && handleDeactivate(confirmingId)}
      />
    </div>
  );
}
