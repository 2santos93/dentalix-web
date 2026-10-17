'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Globe, Lock, Plus } from 'lucide-react';
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
import { notifyError } from '@/components/errors/notify';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RegisterDomainModal } from './register-domain-modal';

const copy = {
  add: 'Añadir dominio',
  count: (n: number) => (n === 1 ? '1 dominio' : `${n} dominios`),
  empty: 'Todavía no hay dominios propios.',
  emptyHint:
    'Tu clínica ya funciona en su subdominio de Dentalix. Añade un dominio propio solo si quieres que el equipo entre desde él.',
  loadError: 'No pudimos cargar los dominios.',
  forbiddenTitle: 'Solo administración gestiona los dominios propios.',
  forbiddenHint: 'Pide a un ADMIN de la clínica que lo añada o lo elimine.',
  listLabel: 'Dominios propios',
  state: {
    PENDING: 'Pendiente',
    EXPIRED: 'Expirado',
    VERIFIED: 'Verificado',
    DISABLED: 'Desactivado',
  } satisfies Record<TenantDomainState, string>,
  detail: {
    PENDING: (d: TenantDomain) =>
      `Publica este registro TXT y verifícalo antes del ${formatDateTime(d.expiresAt)}.`,
    EXPIRED: () =>
      'Caducó sin verificarse o lo verificó otra cuenta. No abre Dentalix; elimínalo y vuelve a añadirlo si es tuyo.',
    VERIFIED: (d: TenantDomain) =>
      `Abre Dentalix desde el ${formatDateTime(d.verifiedAt)}. Lo comprobamos cada hora.`,
    DISABLED: (d: TenantDomain) =>
      `Desde el ${formatDateTime(d.disabledAt)} ya no encontramos su registro TXT y dejó de abrir Dentalix. Vuelve a publicarlo y verifícalo.`,
  } satisfies Record<TenantDomainState, (d: TenantDomain) => string>,
  recordName: 'Nombre',
  recordType: 'Tipo',
  recordValue: 'Valor',
  verify: 'Verificar',
  verifyAgain: 'Verificar de nuevo',
  remove: 'Eliminar',
  actionFor: (action: string, host: string) => `${action} ${host}`,
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

const STATE_BADGE: Record<TenantDomainState, BadgeProps['variant']> = {
  PENDING: 'warning',
  EXPIRED: 'muted',
  VERIFIED: 'success',
  DISABLED: 'danger',
};

interface DomainsManagerProps {
  token: string;
  /** Solo ADMIN (la API exige el rol en todas las rutas de /domains). */
  allowed: boolean;
}

/** El registro TXT que la clínica publica en su DNS. */
function TxtRecord({ domain }: { domain: TenantDomain }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-surface-2 p-3 text-xs">
      <dt className="text-muted">{copy.recordType}</dt>
      <dd className="font-mono">TXT</dd>
      <dt className="text-muted">{copy.recordName}</dt>
      <dd className="font-mono break-all select-all">{verificationRecordName(domain.host)}</dd>
      <dt className="text-muted">{copy.recordValue}</dt>
      <dd className="font-mono break-all select-all">{domain.verifyToken}</dd>
    </dl>
  );
}

/**
 * Dominios propios de la clínica en /settings/dominios (SEC-009). Añadir uno
 * lo deja Pendiente 72 h hasta que el TXT demuestra que es de la clínica; la
 * re-verificación horaria lo pasa a Desactivado si el TXT desaparece. Se
 * puede eliminar en cualquier estado.
 */
export function DomainsManager({ token, allowed }: DomainsManagerProps) {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">
          {loading || error ? '' : copy.count(domains.length)}
        </p>
        <Button
          type="button"
          onClick={() => {
            setModalKey((k) => k + 1);
            setModalOpen(true);
          }}
          className="w-full sm:w-auto"
        >
          <Plus aria-hidden />
          {copy.add}
        </Button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={domains.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Globe aria-hidden />}
      >
        <ul
          aria-label={copy.listLabel}
          className="flex flex-col rounded-lg border border-border bg-surface text-sm text-ink"
        >
          {domains.map((d) => {
            const canVerify = d.status === 'PENDING' || d.status === 'DISABLED';
            return (
              <li
                key={d.id}
                className="flex flex-col gap-3 border-b border-hairline p-4 last:border-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 font-medium break-all">{d.host}</span>
                  <Badge variant={STATE_BADGE[d.status]}>{copy.state[d.status]}</Badge>
                </div>
                <p className="text-muted">{copy.detail[d.status](d)}</p>
                {canVerify ? <TxtRecord domain={d} /> : null}
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {canVerify ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={verifyingId === d.id}
                      onClick={() => void verify(d)}
                      aria-label={copy.actionFor(
                        d.status === 'DISABLED' ? copy.verifyAgain : copy.verify,
                        d.host,
                      )}
                    >
                      {d.status === 'DISABLED' ? copy.verifyAgain : copy.verify}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRemoveError(null);
                      setRemoving(d);
                    }}
                    aria-label={copy.actionFor(copy.remove, d.host)}
                  >
                    {copy.remove}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </AsyncSection>

      <RegisterDomainModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        onRegistered={(domain) =>
          // Un PENDING propio caducado del mismo host se sustituye en la API:
          // sale de la lista junto con cualquier fila del mismo host.
          setDomains((prev) => [domain, ...prev.filter((d) => d.host !== domain.host)])
        }
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
