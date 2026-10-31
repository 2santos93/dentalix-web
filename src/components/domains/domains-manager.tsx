'use client';
import * as React from 'react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Copy, Globe, Lock, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatDateTime } from '@/lib/format/date';
import {
  deleteDomain,
  listDomains,
  verificationRecordName,
  verifyDomain,
  type TenantDomain,
  type TenantDomainState,
} from '@/lib/domains/domains-api';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormModal } from '@/components/shared/form-modal';
import type { RowAction } from '@/components/shared/row-actions';
import { notifyError } from '@/components/errors/notify';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { clinicAddress } from './clinic-address';
import { RegisterDomainModal } from './register-domain-modal';

const copy = {
  add: 'Añadir dominio',
  count: (n: number) => (n === 1 ? '1 dominio' : `${n} dominios`),
  addressLabel: 'Dirección de tu clínica',
  addressHint: 'Funciona siempre, tengas o no un dominio propio.',
  copyAddress: 'Copiar',
  copyAddressLabel: (host: string) => `Copiar la dirección ${host}`,
  copied: 'Dirección copiada.',
  copyError: 'No pudimos copiar la dirección. Selecciónala y cópiala a mano.',
  empty: 'Todavía no hay dominios propios.',
  emptyHint:
    'Tu clínica ya funciona en su subdominio de Dentalix. Añade un dominio propio solo si quieres que el equipo entre desde él.',
  loadError: 'No pudimos cargar los dominios.',
  forbiddenTitle: 'Solo administración gestiona los dominios propios.',
  forbiddenHint: 'Pide a un ADMIN de la clínica que lo añada o lo elimine.',
  listLabel: 'Dominios propios',
  colHost: 'Dominio',
  colState: 'Estado',
  colDetail: 'Detalle',
  state: {
    PENDING: 'Pendiente',
    EXPIRED: 'Expirado',
    VERIFIED: 'Verificado',
    DISABLED: 'Desactivado',
  } satisfies Record<TenantDomainState, string>,
  /** La línea de la lista: sin jerga de DNS (el registro está en el diálogo del dominio). */
  summary: {
    PENDING: (d: TenantDomain) => `Sin verificar. Tienes hasta el ${formatDateTime(d.expiresAt)}.`,
    EXPIRED: () => 'Caducó sin verificarse. No abre Dentalix.',
    VERIFIED: (d: TenantDomain) => `Abre Dentalix desde el ${formatDateTime(d.verifiedAt)}.`,
    DISABLED: (d: TenantDomain) => `Desde el ${formatDateTime(d.disabledAt)} dejó de abrir Dentalix.`,
  } satisfies Record<TenantDomainState, (d: TenantDomain) => string>,
  detail: {
    PENDING: (d: TenantDomain) =>
      `Publica este registro TXT y verifícalo antes del ${formatDateTime(d.expiresAt)}.`,
    EXPIRED: () =>
      'Caducó sin verificarse o lo verificó otra cuenta. No abre Dentalix; elimínalo y vuelve a añadirlo si es tuyo.',
    VERIFIED: (d: TenantDomain) =>
      `Abre Dentalix desde el ${formatDateTime(d.verifiedAt)} mientras su registro TXT siga publicado. Lo comprobamos cada hora.`,
    DISABLED: (d: TenantDomain) =>
      `Desde el ${formatDateTime(d.disabledAt)} ya no encontramos su registro TXT y dejó de abrir Dentalix. Vuelve a publicarlo y verifícalo.`,
  } satisfies Record<TenantDomainState, (d: TenantDomain) => string>,
  recordName: 'Nombre',
  recordType: 'Tipo',
  recordValue: 'Valor',
  verify: 'Verificar',
  verifyAgain: 'Verificar de nuevo',
  close: 'Cerrar',
  remove: 'Eliminar',
  verified: (host: string) => `${host} verificado: ya abre Dentalix.`,
  notYet: (host: string) =>
    `Aún no vemos el registro TXT de ${host}. El DNS puede tardar en propagarse; inténtalo en unos minutos.`,
  verifyError: (host: string) => `No pudimos verificar ${host}.`,
  removeTitle: (host: string) => `¿Eliminar ${host}?`,
  removeVerified:
    'Deja de abrir Dentalix al momento y el dominio queda libre. Para volver a usarlo tendrás que añadirlo y verificarlo de nuevo.',
  removeOther: 'Sale de la lista y el dominio queda libre. Puedes volver a añadirlo cuando quieras.',
  removeConfirm: 'Eliminar dominio',
  removeError: 'No pudimos eliminar el dominio.',
};

interface DomainsManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol en todas las rutas de /domains). */
  allowed: boolean;
}

function canVerify(domain: TenantDomain): boolean {
  return domain.status === 'PENDING' || domain.status === 'DISABLED';
}

function verifyLabel(domain: TenantDomain): string {
  return domain.status === 'DISABLED' ? copy.verifyAgain : copy.verify;
}

/** El registro TXT que la clínica publica en su DNS. */
function TxtRecord({ domain }: { domain: TenantDomain }) {
  return (
    <DescriptionList layout="inline" className="rounded-lg bg-surface-sunken p-3">
      <DescriptionItem label={copy.recordType} valueClassName="font-mono">
        TXT
      </DescriptionItem>
      <DescriptionItem label={copy.recordName} valueClassName="font-mono break-all select-all">
        {verificationRecordName(domain.host)}
      </DescriptionItem>
      <DescriptionItem label={copy.recordValue} valueClassName="font-mono break-all select-all">
        {domain.verifyToken}
      </DescriptionItem>
    </DescriptionList>
  );
}

const noSubscription = () => () => {};

/**
 * La dirección de Dentalix de la clínica, con «Copiar»: lo que se viene a
 * buscar aquí casi siempre. Solo en cliente (el host es del navegador).
 */
function ClinicAddress() {
  const address = useSyncExternalStore(
    noSubscription,
    () => clinicAddress(window.location.host),
    () => null,
  );
  if (!address) return null;

  async function copyAddress(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(copy.copied);
    } catch {
      notifyError(copy.copyError);
    }
  }

  return (
    <section
      aria-label={copy.addressLabel}
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="t-label text-muted">{copy.addressLabel}</p>
        <p className="t-data break-all text-ink">{address}</p>
        <p className="t-caption">{copy.addressHint}</p>
      </div>
      <Button
        type="button"
        variant="secondary"
        aria-label={copy.copyAddressLabel(address)}
        onClick={() => void copyAddress(address)}
        className="shrink-0"
      >
        <Copy aria-hidden />
        {copy.copyAddress}
      </Button>
    </section>
  );
}

const headerClassName = 'normal-case tracking-normal';

const columns: DataListColumn<TenantDomain>[] = [
  {
    id: 'host',
    header: copy.colHost,
    mobile: 'primary',
    headerClassName,
    cell: (d) => <span className="break-all">{d.host}</span>,
  },
  {
    id: 'state',
    header: copy.colState,
    mobile: 'trailing',
    headerClassName,
    cell: (d) => <StatusBadge kind="tenantDomain" status={d.status} />,
  },
  {
    id: 'detail',
    header: copy.colDetail,
    headerClassName,
    cell: (d) => <span className="text-muted">{copy.summary[d.status](d)}</span>,
    mobileCell: (d) => copy.summary[d.status](d),
  },
];

/**
 * Dominios propios de la clínica en /settings/dominios (SEC-009). Añadir uno
 * lo deja Pendiente 72 h hasta que el TXT demuestra que es de la clínica; la
 * re-verificación horaria lo pasa a Desactivado si el TXT desaparece. Se
 * puede eliminar en cualquier estado.
 *
 * La lista solo dice el estado; el registro TXT y «Verificar» viven en el
 * diálogo del dominio (tocar la fila), que se abre solo al añadir uno.
 */
export function DomainsManager({ token, allowed }: DomainsManagerProps) {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TenantDomain | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listDomains(token);
        if (cancelled) return;
        setDomains(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, allowed, reloadKey]);

  if (!allowed) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }

  // El diálogo lee el dominio de la lista: un cambio de estado se ve al momento.
  const opened = domains.find((d) => d.id === openId) ?? null;

  function patch(id: string, changes: Partial<TenantDomain>) {
    setDomains((prev) => prev.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  }

  async function verify(domain: TenantDomain) {
    setVerifyingId(domain.id);
    try {
      const { status } = await verifyDomain(token, domain.id);
      if (status === 'VERIFIED') {
        patch(domain.id, {
          status,
          verifiedAt: new Date().toISOString(),
          expiresAt: null,
          failedChecks: 0,
          disabledAt: null,
        });
        toast.success(copy.verified(domain.host));
      } else {
        patch(domain.id, { status });
        toast.info(copy.notYet(domain.host));
      }
    } catch (err) {
      // 410: el PENDING caducó. 409: otra cuenta lo verificó antes (y con eso
      // invalidó este PENDING). Reintentar no cambia nada: solo se informa.
      const final = err instanceof ApiError && (err.status === 409 || err.status === 410);
      if (final && domain.status === 'PENDING') patch(domain.id, { status: 'EXPIRED' });
      notifyError(
        apiErrorMessage(err, copy.verifyError(domain.host)),
        final ? {} : { onRetry: () => void verify(domain) },
      );
    } finally {
      setVerifyingId(null);
    }
  }

  function askRemove(domain: TenantDomain) {
    setRemoveError(null);
    setRemoving(domain);
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await deleteDomain(token, removing.id);
      setDomains((prev) => prev.filter((d) => d.id !== removing.id));
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemoveBusy(false);
    }
  }

  function rowActions(domain: TenantDomain): RowAction[] {
    const actions: RowAction[] = [];
    if (canVerify(domain)) {
      actions.push({
        label: verifyLabel(domain),
        disabled: verifyingId === domain.id,
        onSelect: () => void verify(domain),
      });
    }
    actions.push({
      label: copy.remove,
      destructive: true,
      separatorBefore: actions.length > 0,
      onSelect: () => askRemove(domain),
    });
    return actions;
  }

  function openAdd() {
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  const addButton = (
    <Button type="button" onClick={openAdd} className="w-full sm:w-auto">
      <Plus aria-hidden />
      {copy.add}
    </Button>
  );
  const hasRows = !loading && !error && domains.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <ClinicAddress />

      <div className="flex flex-col gap-3">
        {/* Con filas, la primaria va en la barra; sin filas, dentro del vacío. */}
        {hasRows ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="t-data text-sm text-muted" aria-live="polite">
              {copy.count(domains.length)}
            </p>
            {addButton}
          </div>
        ) : null}

        <AsyncSection
          loading={loading}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={domains.length === 0}
          emptyTitle={copy.empty}
          emptyDescription={copy.emptyHint}
          emptyIcon={<Globe aria-hidden />}
          emptyAction={addButton}
        >
          <DataList
            label={copy.listLabel}
            rows={domains}
            columns={columns}
            getRowKey={(d) => d.id}
            onRowClick={(d) => setOpenId(d.id)}
            rowActions={rowActions}
            getRowLabel={(d) => d.host}
          />
        </AsyncSection>
      </div>

      <FormModal
        open={opened !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        title={opened?.host ?? ''}
        description={opened ? copy.detail[opened.status](opened) : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          if (opened) void verify(opened);
        }}
        submitLabel={opened ? verifyLabel(opened) : copy.verify}
        cancelLabel={copy.close}
        submitting={opened !== null && verifyingId === opened.id}
        hideSubmit={!opened || !canVerify(opened)}
      >
        {opened ? (
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <StatusBadge kind="tenantDomain" status={opened.status} />
            </div>
            {canVerify(opened) ? <TxtRecord domain={opened} /> : null}
          </div>
        ) : null}
      </FormModal>

      <RegisterDomainModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        onRegistered={(domain) => {
          // Un PENDING propio caducado del mismo host se sustituye en la API:
          // sale de la lista junto con cualquier fila del mismo host.
          setDomains((prev) => [domain, ...prev.filter((d) => d.host !== domain.host)]);
          // Lo siguiente es publicar el TXT: se abre el diálogo del dominio con él.
          setOpenId(domain.id);
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? copy.removeTitle(removing.host) : ''}
        description={removing?.status === 'VERIFIED' ? copy.removeVerified : copy.removeOther}
        confirmLabel={copy.removeConfirm}
        onConfirm={() => void confirmRemove()}
        confirming={removeBusy}
        destructive
        error={removeError}
      />
    </div>
  );
}
