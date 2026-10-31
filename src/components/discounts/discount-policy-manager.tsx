'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatDateTime } from '@/lib/format/date';
import { getDiscountPolicy, type DiscountPolicy } from '@/lib/discounts/discounts-api';
import { ROLE_LABELS } from '@/lib/discounts/discount-rules';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DiscountPolicyModal, POLICY_ROLES } from './discount-policy-modal';

export const policyManagerCopy = {
  loadError: 'No pudimos cargar la política de descuentos.',
  forbiddenTitle: 'Solo administración cambia los topes de descuento.',
  forbiddenHint: 'Si necesitas dar un descuento mayor que el de tu rol, pídeselo a quien administra la clínica.',
  sectionTitle: 'Topes por rol',
  tableLabel: 'Tope de descuento por rol',
  colRole: 'Rol',
  colMax: 'Máximo por ítem',
  percent: (n: number) => `${n} %`,
  threshold: (n: number) => `Motivo obligatorio por encima del ${n} %.`,
  defaults: 'Valores por defecto',
  updatedAt: (when: string) => `Cambiada el ${when}.`,
  edit: 'Cambiar',
  editLabel: 'Cambiar los topes de descuento',
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
 * de solo lectura, con «Cambiar» en un modal (un solo modelo de guardado). Lo que se cambia aplica a los descuentos
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
    // La columna de 720 px la pone SettingsPage.
    <div className="flex flex-col gap-4">
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
            <section aria-labelledby="discount-policy-title" className="flex flex-col gap-3">
              <SectionHeader
                titleId="discount-policy-title"
                title={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {policyManagerCopy.sectionTitle}
                    {policy.isDefault ? <Badge variant="neutral">{policyManagerCopy.defaults}</Badge> : null}
                  </span>
                }
                description={
                  <>
                    <span className="text-ink">{policyManagerCopy.threshold(policy.reasonRequiredAbovePercent)}</span>
                    {policy.isDefault || !policy.updatedAt ? null : (
                      <> {policyManagerCopy.updatedAt(formatDateTime(policy.updatedAt))}</>
                    )}
                  </>
                }
                actions={
                  // Valor editado en diálogo: «Cambiar» secundario, sin barra de guardar en la página.
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={policyManagerCopy.editLabel}
                    onClick={() => {
                      setModalKey((k) => k + 1);
                      setEditing(true);
                    }}
                    className="max-sm:w-full"
                  >
                    {policyManagerCopy.edit}
                  </Button>
                }
              />

              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <Table aria-label={policyManagerCopy.tableLabel} stack={false}>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col">{policyManagerCopy.colRole}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {policyManagerCopy.colMax}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {POLICY_ROLES.map((role) => (
                      <TableRow key={role} className="hover:bg-transparent">
                        <TableCell className="font-medium text-ink">{ROLE_LABELS[role]}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {policyManagerCopy.percent(policy.maxPercentByRole[role])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            <Link
              href="/caja/descuentos"
              className="self-start text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
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
