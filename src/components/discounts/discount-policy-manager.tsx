'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgePercent, Lock } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatDateTime } from '@/lib/format/date';
import { getDiscountPolicy, type DiscountPolicy } from '@/lib/discounts/discounts-api';
import { ROLE_LABELS } from '@/lib/discounts/discount-rules';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DiscountPolicyModal, POLICY_ROLES } from './discount-policy-modal';

export const policyManagerCopy = {
  loadError: 'No pudimos cargar la política de descuentos.',
  forbiddenTitle: 'Solo administración cambia los topes de descuento.',
  forbiddenHint: 'Si necesitas dar un descuento mayor que el de tu rol, pídeselo a quien administra la clínica.',
  tableLabel: 'Tope de descuento por rol',
  colRole: 'Rol',
  colMax: 'Descuento máximo por ítem',
  percent: (n: number) => `${n} %`,
  threshold: (n: number) => `Motivo obligatorio por encima del ${n} %.`,
  defaults: 'Valores por defecto',
  updatedAt: (when: string) => `Cambiada el ${when}.`,
  edit: 'Editar topes',
  saved: 'Política de descuentos guardada.',
  reportLink: 'Ver el informe de descuentos',
};

interface DiscountPolicyManagerProps {
  token: string;
  /** Solo ADMIN (la API lo exige también al guardar). */
  allowed: boolean;
}

/**
 * Ajustes → Descuentos (DX-204): el tope de cada rol y el umbral del motivo,
 * con «Editar topes» en un modal. Lo que se cambia aplica a los descuentos
 * que se den desde ahora.
 */
export function DiscountPolicyManager({ token, allowed }: DiscountPolicyManagerProps) {
  const [policy, setPolicy] = useState<DiscountPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getDiscountPolicy(token);
        if (cancelled) return;
        setPolicy(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, policyManagerCopy.loadError));
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
        title={policyManagerCopy.forbiddenTitle}
        description={policyManagerCopy.forbiddenHint}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<TableSkeleton rows={4} />}
      >
        {policy ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink">
                {policyManagerCopy.threshold(policy.reasonRequiredAbovePercent)}{' '}
                <span className="text-muted">
                  {policy.isDefault || !policy.updatedAt
                    ? ''
                    : policyManagerCopy.updatedAt(formatDateTime(policy.updatedAt))}
                </span>
              </p>
              <Button
                type="button"
                onClick={() => {
                  setModalKey((k) => k + 1);
                  setEditing(true);
                }}
                className="w-full sm:w-auto"
              >
                <BadgePercent aria-hidden />
                {policyManagerCopy.edit}
              </Button>
            </div>

            <table
              aria-label={policyManagerCopy.tableLabel}
              className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
            >
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left">
                  <th scope="col" className="px-4 py-3 font-medium text-muted">
                    {policyManagerCopy.colRole}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                    {policyManagerCopy.colMax}
                  </th>
                </tr>
              </thead>
              <tbody>
                {POLICY_ROLES.map((role) => (
                  <tr key={role} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-3 font-medium">{ROLE_LABELS[role]}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {policyManagerCopy.percent(policy.maxPercentByRole[role])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul aria-label={policyManagerCopy.tableLabel} className="flex flex-col gap-3 md:hidden">
              {POLICY_ROLES.map((role) => (
                <li
                  key={role}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
                >
                  <span className="font-medium">{ROLE_LABELS[role]}</span>
                  <span className="tabular-nums">{policyManagerCopy.percent(policy.maxPercentByRole[role])}</span>
                </li>
              ))}
            </ul>

            {policy.isDefault ? (
              <div>
                <Badge variant="muted">{policyManagerCopy.defaults}</Badge>
              </div>
            ) : null}
            <Link
              href="/caja/descuentos"
              className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {policyManagerCopy.reportLink}
            </Link>

            <DiscountPolicyModal
              key={modalKey}
              open={editing}
              onOpenChange={setEditing}
              token={token}
              policy={policy}
              onSaved={(saved) => {
                setPolicy(saved);
                setAnnouncement(policyManagerCopy.saved);
              }}
            />
          </>
        ) : null}
      </AsyncSection>
    </div>
  );
}
