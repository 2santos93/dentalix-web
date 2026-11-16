'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listOrthoAccounts, type OrthoCaseAccount } from '@/lib/ortho/ortho-billing';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection } from '@/components/shared/async-section';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { OrthoAccountFigures } from './ortho-account-section';

export const orthoAccountsViewCopy = {
  heading: 'Ortodoncia',
  support: 'La cuenta de cada caso de ortodoncia del paciente: honorario, realizado, pagado y saldo. Los abonos se registran como siempre, en el plan.',
  loading: 'Cargando las cuentas de ortodoncia',
  loadError: 'No pudimos cargar la cuenta de ortodoncia.',
  empty: 'Sin cuenta de ortodoncia',
  emptyHint: 'El honorario del caso lo ponen odontología y administración.',
  caseTitle: 'Cuenta del caso',
};
const copy = orthoAccountsViewCopy;

/**
 * Pestaña «Ortodoncia» para recepción (DX-285): solo las cuentas de los casos
 * con honorario, sin datos clínicos (la API no le deja leer el caso).
 */
export function OrthoAccountsView({ token, patientId }: { token: string; patientId: string }) {
  const [accounts, setAccounts] = useState<OrthoCaseAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const stamp = useSedeStamp(
    token,
    accounts.map((a) => a.locationId),
  );

  useEffect(() => {
    let cancelled = false;
    listOrthoAccounts(token, patientId)
      .then((data) => {
        if (cancelled) return;
        setAccounts(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader as="h3" title={copy.heading} description={<span className="block max-w-[68ch]">{copy.support}</span>} />
      <SedeStampNote stamp={stamp} />
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
        isEmpty={accounts.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Wallet aria-hidden />}
        skeleton={
          <div role="status" aria-label={copy.loading}>
            <Skeleton className="h-32 w-full" />
          </div>
        }
      >
        <ul className="flex flex-col gap-4">
          {accounts.map((account) => (
            <li key={account.caseId} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="t-title text-ink">{copy.caseTitle}</h4>
                <StatusBadge kind="orthoCase" status={account.status} />
              </div>
              <OrthoAccountFigures account={account} stamp={stamp} />
            </li>
          ))}
        </ul>
      </AsyncSection>
    </div>
  );
}
