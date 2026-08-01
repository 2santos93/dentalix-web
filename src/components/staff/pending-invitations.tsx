'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  listInvitations,
  revokeInvitation,
  createInvitation,
  type Invitation,
  type CreatedInvitation,
} from '@/lib/staff/invitations-api';
import { useCopyToClipboard } from '@/lib/ui/use-copy-to-clipboard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { AsyncSection, TableSkeleton } from '@/components/molecules/async-section';
import { notifyError } from '@/components/errors/notify';
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

// Copy as constants (i18n-ready) — es first, matches staff-view.tsx.
const copy = {
  retry: 'Reintentar',
  tableLabel: 'Invitaciones pendientes',
  genericLoadError: 'No pudimos cargar las invitaciones. Intenta de nuevo.',
  // Escalón 3 (segundo plano): sin "Intenta de nuevo." — el toast trae acción.
  genericRevokeError: 'No pudimos revocar la invitación.',
  genericResendError: 'No pudimos reenviar la invitación.',
  empty: 'No hay invitaciones pendientes.',
  emptyHint: 'Las invitaciones que envíes aparecerán aquí hasta que se acepten o expiren.',
  colName: 'Nombre',
  colEmail: 'Correo electrónico',
  colRole: 'Rol',
  colStatus: 'Estado',
  colActions: 'Acciones',
  statusPending: 'Pendiente',
  statusExpired: 'Expirada',
  resendCta: 'Reenviar',
  revokeCta: 'Revocar',
  revokeTitle: 'Revocar invitación',
  revokeBody: (name: string) => `${name} ya no podrá usar el enlace de invitación.`,
  revokeConfirmYes: 'Sí, revocar',
  resendLabel: (name: string) => `Reenviar invitación de ${name}`,
  revokeLabel: (name: string) => `Revocar invitación de ${name}`,
  resentTitle: 'Invitación reenviada',
  resentDescription: 'Comparte este nuevo enlace con la persona invitada.',
  copyLabel: 'Copiar',
  copiedLabel: 'Copiado',
  copyWarning: 'Cópialo ahora: por seguridad no podrás verlo de nuevo.',
  closeLabel: 'Listo',
};

const ROLE_LABELS: Record<Invitation['role'], string> = {
  ADMIN: 'Administrador/a',
  DENTIST: 'Odontólogo/a',
  ASSISTANT: 'Asistente',
  RECEPTION: 'Recepción',
};

interface PendingInvitationsProps {
  token: string;
  /** Bumped by the parent (e.g. after creating an invitation) to force a reload. */
  refreshKey?: number;
}

/**
 * The list of invitations still awaiting acceptance. Structure mirrors the
 * staff table right above it (`staff-view.tsx`): `AsyncSection` +
 * `TableSkeleton`, a `Card`-wrapped `Table`, verbatim `ApiError.message`, and
 * an `updatingId` disabling just the row in flight.
 *
 * `listInvitations` only ever returns `VALID` or `EXPIRED` rows (the backend
 * excludes accepted/revoked ones — see `ListInvitationsUseCase`), so those
 * two map 1:1 to the "Pendiente"/"Expirada" badges below.
 */
export function PendingInvitations({ token, refreshKey }: PendingInvitationsProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Which row is currently being mutated (revoke or resend) — disables that
  // row's buttons, same convention as staff-view.tsx.
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // Row awaiting revoke confirmation.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Set on a successful resend; while non-null the reveal dialog shows the
  // one-time new link (same pattern as staff-view.tsx's createdInvitation).
  const [resentInvitation, setResentInvitation] = useState<CreatedInvitation | null>(null);
  const { copied, copy: copyInviteLink } = useCopyToClipboard();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listInvitations(token);
        if (cancelled) return;
        setInvitations(data);
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
  }, [token, reloadKey, refreshKey]);

  function refreshInPlace(): Promise<void> {
    if (!token) return Promise.resolve();
    return listInvitations(token)
      .then((data) => {
        setInvitations(data);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
      });
  }

  async function handleRevoke(id: string) {
    setUpdatingId(id);
    try {
      await revokeInvitation(token, id);
      setConfirmingId(null);
      await refreshInPlace();
    } catch (err) {
      // Close the confirm dialog on failure too, not just success: while a
      // Radix modal stays open it marks everything outside it (including
      // this toast) inert, so a "Reintentar" the user can see but can't
      // click — same lesson as staff-view.tsx's handleDeactivate.
      setConfirmingId(null);
      notifyError(err instanceof ApiError ? err.message : copy.genericRevokeError, {
        onRetry: () => handleRevoke(id),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleResend(invitation: Invitation) {
    setUpdatingId(invitation.id);
    try {
      const created = await createInvitation(token, {
        fullName: invitation.fullName,
        email: invitation.email,
        role: invitation.role,
      });
      setResentInvitation(created);
      await refreshInPlace();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : copy.genericResendError, {
        onRetry: () => handleResend(invitation),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  const confirmingInvitation = confirmingId
    ? invitations.find((i) => i.id === confirmingId) ?? null
    : null;

  const resentLink = resentInvitation
    ? `${window.location.origin}/invitacion/${resentInvitation.token}`
    : '';

  return (
    <div className="flex flex-col gap-4">
      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        retryLabel={copy.retry}
        isEmpty={invitations.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        skeleton={<TableSkeleton rows={2} />}
      >
        <Card className="overflow-hidden p-0">
          <Table aria-label={copy.tableLabel}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{copy.colName}</TableHead>
                <TableHead>{copy.colEmail}</TableHead>
                <TableHead>{copy.colRole}</TableHead>
                <TableHead>{copy.colStatus}</TableHead>
                <TableHead>{copy.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => {
                const updating = updatingId === inv.id;
                return (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.fullName}</TableCell>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>{ROLE_LABELS[inv.role]}</TableCell>
                    <TableCell>
                      {inv.status === 'EXPIRED' ? (
                        <Badge variant="muted">{copy.statusExpired}</Badge>
                      ) : (
                        <Badge variant="warning">{copy.statusPending}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updating}
                          aria-label={copy.resendLabel(inv.fullName)}
                          onClick={() => handleResend(inv)}
                        >
                          {copy.resendCta}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updating}
                          aria-label={copy.revokeLabel(inv.fullName)}
                          onClick={() => setConfirmingId(inv.id)}
                        >
                          {copy.revokeCta}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </AsyncSection>

      <ConfirmDialog
        open={confirmingId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmingId(null);
        }}
        title={copy.revokeTitle}
        description={
          confirmingInvitation ? copy.revokeBody(confirmingInvitation.fullName) : undefined
        }
        confirmLabel={copy.revokeConfirmYes}
        confirming={updatingId === confirmingId}
        onConfirm={() => confirmingId && handleRevoke(confirmingId)}
      />

      <Dialog
        open={resentInvitation !== null}
        onOpenChange={(open) => {
          if (!open) setResentInvitation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.resentTitle}</DialogTitle>
            <DialogDescription>{copy.resentDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg px-3 py-2">
            <p className="break-all font-mono text-sm text-ink">{resentLink}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => copyInviteLink(resentLink)}
            >
              {copied ? copy.copiedLabel : copy.copyLabel}
            </Button>
          </div>
          <p className="text-sm text-muted">{copy.copyWarning}</p>
          <DialogFooter>
            <Button type="button" onClick={() => setResentInvitation(null)}>
              {copy.closeLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
