'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { toast } from 'sonner';
import {
  listStaffDirectory,
  type ClinicRole,
  type InvitationEmailDelivery,
  type StaffDirectoryEntry,
  type StaffDirectoryStatus,
} from '@/lib/staff/staff-api';
import {
  createInvitation,
  resendInvitation,
  revokeInvitation,
  type CreatedInvitation,
} from '@/lib/staff/invitations-api';
import { useCopyToClipboard } from '@/lib/ui/use-copy-to-clipboard';
import { Plus, Send, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Pagination } from '@/components/shared/pagination';
import { PageHeader } from '@/components/shared/page-header';
import { RowActions } from '@/components/shared/row-actions';
import {
  ListToolbar,
  ResultCount,
  toolbarFieldClass,
} from '@/components/shared/list-toolbar';
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
  // Titulo y descripcion viven aqui, no en `page.tsx`: la accion primaria va
  // dentro de la barra de la lista y el estado que la abre es de la vista.
  title: 'Personal',
  description:
    'Tu equipo y las invitaciones sin aceptar. Abre a una persona para cambiar su rol o su acceso.',
  inviteToggle: 'Invitar',
  formTitle: 'Invitar a la clínica',
  formDescription:
    'Le enviaremos un correo con un enlace para crear su contraseña y unirse a la clínica.',
  fullNameLabel: 'Nombre completo',
  emailLabel: 'Correo electrónico',
  roleLabel: 'Rol',
  submit: 'Enviar invitación',
  submitting: 'Enviando…',
  tableLabel: 'Personal de la clínica',
  searchLabel: 'Buscar por nombre o correo',
  searchPlaceholder: 'Buscar…',
  countNoun: 'persona',
  countNounPlural: 'personas',
  actionsFor: (name: string) => `Acciones de ${name}`,
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
  resend: 'Reenviar invitación',
  resendTitle: '¿Reenviar la invitación?',
  resendBody: (email: string) =>
    `Enviaremos un correo nuevo a ${email}. El enlace anterior dejará de funcionar y el nuevo vale 7 días.`,
  resendConfirmYes: 'Sí, reenviar',
  resentToast: 'Invitación reenviada',
  resentToastDescription: (email: string) => `Enviamos un correo nuevo a ${email}.`,
  revoke: 'Revocar',
  revokeTitle: '¿Revocar la invitación?',
  revokeBody: (email: string) => `El enlace enviado a ${email} dejará de funcionar.`,
  revokeConfirmYes: 'Sí, revocar',
  viewProfile: (name: string) => `Ver el perfil de ${name}`,
  // Los dos vacíos son distintos y hasta ahora se confundían: se mostraba
  // siempre el de búsqueda, así que una clínica recién creada —sin nadie dado
  // de alta y sin ningún filtro puesto— leía "No hay nadie que coincida",
  // como si hubiera buscado algo.
  empty: 'Todavía no hay nadie en el equipo.',
  emptyHint: 'Invita a la primera persona para empezar.',
  noMatches: 'No hay nadie que coincida.',
  noMatchesHint: 'Prueba con otra búsqueda o quita los filtros.',
  // Sin «Intenta de nuevo.»: alimenta SectionError, que trae Reintentar.
  genericLoadError: 'No pudimos cargar el personal.',
  genericCreateError: 'No pudimos crear la invitación. Intenta de nuevo.',
  // 409 «Email already an active member».
  alreadyMember: 'Esa persona ya es miembro activo de la clínica.',
  // Escalón 3 (segundo plano): sin "Intenta de nuevo." — el toast trae acción.
  genericResendError: 'No pudimos reenviar la invitación.',
  genericRevokeError: 'No pudimos revocar la invitación.',
  inviteCreatedTitle: 'Invitación creada',
  inviteResentTitle: 'Invitación reenviada',
  deliveryAnnounce: {
    SENT: (email: string) => `Correo de invitación enviado a ${email}.`,
    FAILED: (email: string) => `No se pudo enviar el correo de invitación a ${email}.`,
  },
  inviteCreatedDescription:
    'Le enviamos un correo con este enlace. Si no le llega, puedes copiarlo y compartirlo tú.',
  // El backend no pudo programar el correo (la invitación sí se creó).
  inviteNotQueuedDescription:
    'No pudimos programar el correo. Comparte este enlace con la persona invitada o reenvía la invitación más tarde.',
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

// Estado del correo de una invitación (DX-088). Rojo solo si falló: es lo único
// que pide hacer algo (reenviar); pendiente y enviado son informativos.
const EMAIL_DELIVERY_BADGE: Record<
  InvitationEmailDelivery,
  { label: string; variant: 'muted' | 'danger' }
> = {
  SENT: { label: 'Correo: Enviado', variant: 'muted' },
  PENDING: { label: 'Correo: Pendiente', variant: 'muted' },
  FAILED: { label: 'Correo: Falló', variant: 'danger' },
};

/**
 * Mientras alguna invitación de la página tiene el correo pendiente, la lista
 * se vuelve a pedir en silencio cada pocos segundos (el despachador lo envía
 * en segundo plano), hasta un tope: si el proveedor tarda, el estado se ve al
 * recargar.
 */
export const DELIVERY_POLL_MS = 3_000;
const DELIVERY_POLL_MAX = 5;

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
 * acciones en la fila: reenviar y revocar. Cada invitación muestra además el
 * estado de su correo (DX-088).
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
  const [resendingId, setResendingId] = useState<string | null>(null);
  // El enlace del diálogo viene de un reenvío (cambia el título).
  const [linkFromResend, setLinkFromResend] = useState(false);
  // Anuncio para lectores de pantalla cuando el sondeo ve salir (o fallar) un
  // correo: el cambio de la etiqueta por sí solo no se anuncia.
  const [deliveryAnnouncement, setDeliveryAnnouncement] = useState('');
  // Vueltas de sondeo del estado del correo desde la última carga visible.
  const [polls, setPolls] = useState(0);

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
        // Carga visible nueva: el sondeo del estado del correo vuelve a empezar.
        setPolls(0);
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
  }, [token, page, search, roleFilter, statusFilter, reloadKey]);

  const hasPendingEmail = entries.some((e) => e.emailDelivery === 'PENDING');

  useEffect(() => {
    if (!token || loading || !hasPendingEmail || polls >= DELIVERY_POLL_MAX) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await listStaffDirectory(token, {
          page,
          pageSize: PAGE_SIZE,
          search: search || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
        });
        if (cancelled) return;
        const announcements = res.items.flatMap((next) => {
          const before = entries.find((e) => e.id === next.id && e.kind === next.kind);
          return before?.emailDelivery === 'PENDING' &&
            (next.emailDelivery === 'SENT' || next.emailDelivery === 'FAILED')
            ? [copy.deliveryAnnounce[next.emailDelivery](next.email)]
            : [];
        });
        if (announcements.length > 0) setDeliveryAnnouncement(announcements.join(' '));
        setEntries(res.items);
        setTotal(res.total);
      } catch {
        // Sondeo en segundo plano: lo que hay en pantalla sigue siendo
        // correcto (solo puede estar desactualizado), así que no se avisa;
        // el siguiente intento o una recarga lo ponen al día.
      } finally {
        if (!cancelled) setPolls((n) => n + 1);
      }
    }, DELIVERY_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, loading, hasPendingEmail, polls, entries, page, search, roleFilter, statusFilter]);

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
      setCreateError(
        apiErrorMessage(err, { fallback: copy.genericCreateError, byStatus: { 409: copy.alreadyMember } }),
      );
    } finally {
      setCreating(false);
    }
  }

  function handleCreateOpenChange(next: boolean) {
    setShowForm(next);
    if (!next) {
      setCreateError(null);
      setCreatedInvitation(null);
      setLinkFromResend(false);
      resetForm();
    }
  }

  async function handleResend(entry: StaffDirectoryEntry) {
    setBusyId(entry.id);
    try {
      // La MISMA invitación con un token nuevo: el enlace anterior deja de
      // servir y sale un correo nuevo (DX-088).
      const resent = await resendInvitation(token, entry.id);
      setResendingId(null);
      if (resent.emailDelivery === null) {
        // Sin correo programado, el enlace es la única vía: se muestra.
        setLinkFromResend(true);
        setCreatedInvitation(resent);
        setShowForm(true);
      } else {
        toast.success(copy.resentToast, {
          description: copy.resentToastDescription(entry.email),
        });
      }
      refresh();
    } catch (err) {
      // Igual que revocar: el diálogo se cierra para que el «Reintentar» del
      // toast no quede inerte debajo.
      setResendingId(null);
      const message = apiErrorMessage(err, copy.genericResendError);
      if (err instanceof ApiError && (err.status === 404 || err.status === 429)) {
        // Reintentar no sirve: la invitación ya no está pendiente (se recarga
        // la lista para que desaparezca) o hay que esperar (lo dice el mensaje).
        notifyError(message);
        if (err.status === 404) refresh();
      } else {
        notifyError(message, { onRetry: () => handleResend(entry) });
      }
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
      notifyError(apiErrorMessage(err, copy.genericRevokeError), {
        onRetry: () => handleRevoke(id),
      });
    } finally {
      setBusyId(null);
    }
  }

  const revokingEntry = revokingId
    ? entries.find((e) => e.id === revokingId) ?? null
    : null;
  const resendingEntry = resendingId
    ? entries.find((e) => e.id === resendingId) ?? null
    : null;

  const inviteLink = createdInvitation
    ? `${window.location.origin}/invitacion/${createdInvitation.token}`
    : '';

  const hasFilters = Boolean(search || roleFilter || statusFilter);

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <p className="sr-only" role="status" aria-live="polite">
        {deliveryAnnouncement}
      </p>

      {/* Un solo bloque apretado (12px) para filtrar → contar → leer: los tres
          pasos son el mismo gesto. La separación grande de la página es la que
          hay sobre él, contra la cabecera. */}
      <div className="flex flex-col gap-3">
        <ListToolbar
          searchLabel={copy.searchLabel}
          searchPlaceholder={copy.searchPlaceholder}
          value={searchInput}
          onChange={(v) => {
            setSearchInput(v);
            setPage(1);
          }}
          action={
            <Button type="button" onClick={() => setShowForm(true)}>
              <Plus /> {copy.inviteToggle}
            </Button>
          }
        >
          <select
            aria-label={copy.filterRoleLabel}
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as ClinicRole | '');
              setPage(1);
            }}
            className={cn(toolbarFieldClass, 'sm:w-48')}
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
            className={cn(toolbarFieldClass, 'sm:w-52')}
          >
            <option value="">{copy.allStatuses}</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </ListToolbar>

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
                className={toolbarFieldClass}
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
              <DialogTitle>
                {linkFromResend ? copy.inviteResentTitle : copy.inviteCreatedTitle}
              </DialogTitle>
              <DialogDescription>
                {createdInvitation?.emailDelivery === null
                  ? copy.inviteNotQueuedDescription
                  : copy.inviteCreatedDescription}
              </DialogDescription>
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

        {!loading && !loadError ? (
          <ResultCount
            total={total}
            noun={copy.countNoun}
            nounPlural={copy.countNounPlural}
          />
        ) : null}

        <AsyncSection
          loading={loading}
          error={loadError}
          onRetry={refresh}
          isEmpty={entries.length === 0}
          emptyTitle={hasFilters ? copy.noMatches : copy.empty}
          emptyDescription={hasFilters ? copy.noMatchesHint : copy.emptyHint}
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
                  <TableHead className="w-px text-right">
                    <span className="sr-only">{copy.colActions}</span>
                  </TableHead>
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
                      <TableCell className="font-medium text-ink" data-label={copy.colName}>
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
                      <TableCell className="text-muted" data-label={copy.colEmail}>{entry.email}</TableCell>
                      <TableCell className="text-muted" data-label={copy.colRole}>{ROLE_LABEL[entry.role]}</TableCell>
                      <TableCell data-label={copy.colStatus}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          {entry.kind === 'INVITATION' && entry.emailDelivery ? (
                            <Badge variant={EMAIL_DELIVERY_BADGE[entry.emailDelivery].variant}>
                              {EMAIL_DELIVERY_BADGE[entry.emailDelivery].label}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" data-label={copy.colActions}>
                        <RowActions
                          label={copy.actionsFor(entry.fullName)}
                          busy={busy}
                          // Un miembro no tiene acciones de fila: su perfil es la
                          // fila entera (enlace estirado) y ahí se le cambia el
                          // nombre, el rol o el acceso. Una invitación no tiene
                          // perfil que abrir —todavía no hay persona— y por eso
                          // es la única que las lleva.
                          actions={
                            entry.kind === 'INVITATION'
                              ? [
                                  {
                                    label: copy.resend,
                                    icon: <Send />,
                                    onSelect: () => setResendingId(entry.id),
                                  },
                                  {
                                    label: copy.revoke,
                                    icon: <Ban />,
                                    destructive: true,
                                    separatorBefore: true,
                                    onSelect: () => setRevokingId(entry.id),
                                  },
                                ]
                              : []
                          }
                        />
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
      </div>

      <ConfirmDialog
        open={resendingId !== null}
        onOpenChange={(open) => {
          if (!open) setResendingId(null);
        }}
        title={copy.resendTitle}
        description={resendingEntry ? copy.resendBody(resendingEntry.email) : undefined}
        confirmLabel={copy.resendConfirmYes}
        confirming={busyId === resendingId}
        destructive={false}
        onConfirm={() => resendingEntry && handleResend(resendingEntry)}
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
    </>
  );
}
