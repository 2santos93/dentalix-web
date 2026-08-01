'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import {
  listStaffDirectory,
  type ClinicRole,
  type StaffDirectoryEntry,
  type StaffDirectoryStatus,
} from '@/lib/staff/staff-api';
import {
  createInvitation,
  revokeInvitation,
  type CreatedInvitation,
} from '@/lib/staff/invitations-api';
import { useCopyToClipboard } from '@/lib/ui/use-copy-to-clipboard';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/molecules/form-field';
import { FormModal } from '@/components/molecules/form-modal';
import { ConfirmDialog } from '@/components/molecules/confirm-dialog';
import { AsyncSection, TableSkeleton } from '@/components/molecules/async-section';
import { Pagination } from '@/components/molecules/pagination';
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
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  inviteToggle: 'Invitar',
  formTitle: 'Invitar a la clínica',
  formDescription:
    'La persona recibirá un enlace para crear su propia contraseña y unirse a la clínica.',
  fullNameLabel: 'Nombre completo',
  emailLabel: 'Correo electrónico',
  roleLabel: 'Rol',
  submit: 'Enviar invitación',
  submitting: 'Enviando…',
  tableLabel: 'Personal de la clínica',
  searchLabel: 'Buscar por nombre o correo',
  searchPlaceholder: 'Buscar…',
  filterRoleLabel: 'Filtrar por rol',
  filterStatusLabel: 'Filtrar por estado',
  allRoles: 'Todos los roles',
  allStatuses: 'Activos y pendientes',
  colName: 'Nombre',
  colEmail: 'Correo electrónico',
  colRole: 'Rol',
  colStatus: 'Estado',
  colActions: 'Acciones',
  statusActive: 'Aceptado',
  statusPending: 'Pendiente',
  statusInactive: 'Inactivo',
  resend: 'Reenviar',
  revoke: 'Revocar',
  revokeTitle: '¿Revocar la invitación?',
  revokeBody: (email: string) => `El enlace enviado a ${email} dejará de funcionar.`,
  revokeConfirmYes: 'Sí, revocar',
  viewProfile: (name: string) => `Ver el perfil de ${name}`,
  empty: 'No hay nadie que coincida.',
  emptyHint: 'Prueba con otra búsqueda o quita los filtros.',
  genericLoadError: 'No pudimos cargar el personal. Intenta de nuevo.',
  genericCreateError: 'No pudimos crear la invitación. Intenta de nuevo.',
  // Escalón 3 (segundo plano): sin "Intenta de nuevo." — el toast trae acción.
  genericResendError: 'No pudimos reenviar la invitación.',
  genericRevokeError: 'No pudimos revocar la invitación.',
  inviteCreatedTitle: 'Invitación creada',
  inviteCreatedDescription: 'Comparte este enlace con la persona invitada.',
  copyLabel: 'Copiar',
  copiedLabel: 'Copiado',
  copyWarning: 'Cópialo ahora: por seguridad no podrás verlo de nuevo.',
  // No "Cerrar": `DialogContent` ya trae una X con ese nombre accesible, y dos
  // "Cerrar" serían ambiguos para lectores de pantalla y para los tests.
  closeLabel: 'Listo',
};

const ROLE_OPTIONS: { value: ClinicRole; label: string }[] = [
  { value: 'ADMIN', label: 'Administrador/a' },
  { value: 'DENTIST', label: 'Odontólogo/a' },
  { value: 'ASSISTANT', label: 'Asistente' },
  { value: 'RECEPTION', label: 'Recepción' },
];

const ROLE_LABEL: Record<ClinicRole, string> = {
  ADMIN: 'Administrador/a',
  DENTIST: 'Odontólogo/a',
  ASSISTANT: 'Asistente',
  RECEPTION: 'Recepción',
};

const STATUS_OPTIONS: { value: StaffDirectoryStatus; label: string }[] = [
  { value: 'ACTIVE', label: copy.statusActive },
  { value: 'PENDING', label: copy.statusPending },
  { value: 'INACTIVE', label: copy.statusInactive },
];

// Verde solo para "Aceptado": es el único estado que significa "esta persona ya
// trabaja aquí". Pendiente es ámbar (algo por hacer) e inactivo es neutro (no
// es un error, solo alguien que ya no está).
const STATUS_BADGE: Record<
  StaffDirectoryStatus,
  { label: string; variant: 'success' | 'warning' | 'secondary' }
> = {
  ACTIVE: { label: copy.statusActive, variant: 'success' },
  PENDING: { label: copy.statusPending, variant: 'warning' },
  INACTIVE: { label: copy.statusInactive, variant: 'secondary' },
};

// Native <select> styled to match the Input atom (kept native for a11y/tests) —
// same class as agenda-view.tsx's `fieldClass`.
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

const PAGE_SIZE = 20;
// Lo bastante corto para no notarse al teclear, lo bastante largo para no
// disparar una petición por tecla.
const SEARCH_DEBOUNCE_MS = 300;

interface StaffViewProps {
  token: string;
}

/**
 * Directorio de personal: miembros e invitaciones pendientes en UNA sola lista
 * paginada, con búsqueda y filtros de rol y estado (todo server-side, vía
 * `GET /staff/directory`).
 *
 * La tabla no edita nada. Un miembro se abre en su perfil (`/staff/[id]`) y ahí
 * se le cambia el nombre, el rol o el acceso; así una fila no es a la vez lista
 * y formulario, que era lo que hacía la versión anterior. Las invitaciones no
 * tienen perfil que abrir —todavía no hay persona— y por eso son las únicas con
 * acciones en la fila: reenviar y revocar.
 */
export function StaffView({ token }: StaffViewProps) {
  const [entries, setEntries] = useState<StaffDirectoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // `searchInput` es lo que se teclea; `search` es lo que se consulta. Separar
  // los dos es lo que permite el debounce sin que el campo se sienta lento.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<ClinicRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<StaffDirectoryStatus | ''>('');
  // Todo cambio de filtro vuelve a la página 1 (se hace en los manejadores, no
  // en un efecto): quedarse en la página 3 de un resultado que ahora tiene una
  // sola deja la tabla vacía sin motivo aparente.
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ClinicRole>('ASSISTANT');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(
    null,
  );
  const { copied, copy: copyInviteLink } = useCopyToClipboard();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    const debounce = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounce);
  }, [searchInput]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listStaffDirectory(token, {
          page,
          pageSize: PAGE_SIZE,
          search: search || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
        });
        if (cancelled) return;
        setEntries(res.items);
        setTotal(res.total);
        // El backend acota `pageSize`, así que se lee de la respuesta y no se
        // asume el valor pedido.
        setPageSize(res.pageSize);
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
  }, [token, page, search, roleFilter, statusFilter, reloadKey]);

  function refresh() {
    setReloadKey((k) => k + 1);
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
      setCreatedInvitation(created);
      resetForm();
      refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : copy.genericCreateError);
    } finally {
      setCreating(false);
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

  async function handleResend(entry: StaffDirectoryEntry) {
    setBusyId(entry.id);
    try {
      // No hay endpoint de reenvío: crear otra invitación para el mismo correo
      // revoca la anterior en el backend, así que solo vive un enlace por
      // persona.
      const created = await createInvitation(token, {
        fullName: entry.fullName,
        email: entry.email,
        role: entry.role,
      });
      setCreatedInvitation(created);
      setShowForm(true);
      refresh();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : copy.genericResendError, {
        onRetry: () => handleResend(entry),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(id: string) {
    setBusyId(id);
    try {
      await revokeInvitation(token, id);
      setRevokingId(null);
      refresh();
    } catch (err) {
      // Se cierra el diálogo también al fallar: mientras esté abierto, Radix
      // marca inerte todo lo de fuera (incluido el toast), y un "Reintentar"
      // visible pero no clicable incumple el contrato del escalón 3.
      setRevokingId(null);
      notifyError(err instanceof ApiError ? err.message : copy.genericRevokeError, {
        onRetry: () => handleRevoke(id),
      });
    } finally {
      setBusyId(null);
    }
  }

  const revokingEntry = revokingId
    ? entries.find((e) => e.id === revokingId) ?? null
    : null;

  const inviteLink = createdInvitation
    ? `${window.location.origin}/invitacion/${createdInvitation.token}`
    : '';

  const hasFilters = Boolean(search || roleFilter || statusFilter);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <Input
              type="search"
              aria-label={copy.searchLabel}
              placeholder={copy.searchPlaceholder}
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              className="pl-9 sm:w-64"
            />
          </div>
          <select
            aria-label={copy.filterRoleLabel}
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as ClinicRole | '');
              setPage(1);
            }}
            className={cn(fieldClass, 'sm:w-48')}
          >
            <option value="">{copy.allRoles}</option>
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            aria-label={copy.filterStatusLabel}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StaffDirectoryStatus | '');
              setPage(1);
            }}
            className={cn(fieldClass, 'sm:w-52')}
          >
            <option value="">{copy.allStatuses}</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
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

      <Dialog open={!!createdInvitation} onOpenChange={handleCreateOpenChange}>
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

      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={refresh}
        isEmpty={entries.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={hasFilters ? copy.emptyHint : undefined}
        skeleton={<TableSkeleton rows={5} />}
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
              {entries.map((entry) => {
                const badge = STATUS_BADGE[entry.status];
                const isMember = entry.kind === 'MEMBER';
                const busy = busyId === entry.id;
                return (
                  <TableRow
                    key={`${entry.kind}-${entry.id}`}
                    className={cn(isMember && 'relative')}
                  >
                    <TableCell className="font-medium text-ink">
                      {isMember ? (
                        // El enlace se estira sobre toda la fila con un
                        // pseudo-elemento: la fila entera es clicable pero el
                        // foco y el nombre accesible siguen viviendo en un <a>
                        // de verdad, no en un onClick sobre el <tr>.
                        <Link
                          href={`/staff/${entry.id}`}
                          aria-label={copy.viewProfile(entry.fullName)}
                          className="rounded-sm after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {entry.fullName}
                        </Link>
                      ) : (
                        entry.fullName
                      )}
                    </TableCell>
                    <TableCell className="text-muted">{entry.email}</TableCell>
                    <TableCell className="text-muted">{ROLE_LABEL[entry.role]}</TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {entry.kind === 'INVITATION' ? (
                        // `relative` para que estos botones queden por encima
                        // del pseudo-elemento del enlace de la fila (aquí no
                        // hay ninguno, pero mantiene el patrón si un día un
                        // miembro gana acciones).
                        <div className="relative flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            loading={busy}
                            onClick={() => void handleResend(entry)}
                            aria-label={`${copy.resend} a ${entry.email}`}
                          >
                            {copy.resend}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => setRevokingId(entry.id)}
                            aria-label={`${copy.revoke} la invitación de ${entry.email}`}
                          >
                            {copy.revoke}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </AsyncSection>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        disabled={loading}
      />

      <ConfirmDialog
        open={revokingId !== null}
        onOpenChange={(open) => {
          if (!open) setRevokingId(null);
        }}
        title={copy.revokeTitle}
        description={revokingEntry ? copy.revokeBody(revokingEntry.email) : undefined}
        confirmLabel={copy.revokeConfirmYes}
        confirming={busyId === revokingId}
        onConfirm={() => revokingId && handleRevoke(revokingId)}
      />
    </div>
  );
}
