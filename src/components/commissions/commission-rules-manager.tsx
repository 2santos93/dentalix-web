'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Percent } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  COMMISSIONS_HREF,
  listCommissionRules,
  ruleSummary,
  type CommissionRules,
  type ProfessionalCommissionRule,
} from '@/lib/commissions/commissions-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { CommissionRuleDialog } from './commission-rule-dialog';

export const commissionRulesManagerCopy = {
  tableLabel: 'Honorarios por profesional',
  colProfessional: 'Profesional',
  colRule: 'Regla',
  colStatus: 'Estado',
  noRule: 'Sin regla: no se le liquidan honorarios',
  active: 'Activa',
  inactive: 'Desactivada',
  retired: 'Ya no está en la clínica',
  configure: 'Configurar',
  edit: 'Cambiar regla',
  loadError: 'No pudimos cargar los honorarios de los profesionales.',
  empty: 'No hay odontólogos en la clínica',
  emptyHint: 'Invita al equipo desde Personal para poder configurar sus honorarios.',
  goToSettlements: 'Ver la liquidación del período',
  roleAdmin: 'Administración',
};

const copy = commissionRulesManagerCopy;

/**
 * Ajustes › Honorarios (DX-018, solo ADMIN): cada odontólogo o administrador
 * con su regla (o «Sin regla») y, en la fila, «Configurar» / «Cambiar regla».
 * La liquidación del período vive en /honorarios.
 */
export function CommissionRulesManager({ token }: { token: string }) {
  const [data, setData] = useState<CommissionRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<ProfessionalCommissionRule | null>(null);
  const [openKey, setOpenKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listCommissionRules(token);
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  function open(row: ProfessionalCommissionRule) {
    setEditing(row);
    setOpenKey((k) => k + 1);
  }

  const rows = data?.professionals ?? [];
  const columns: DataListColumn<ProfessionalCommissionRule>[] = [
    {
      id: 'professional',
      header: copy.colProfessional,
      mobile: 'primary',
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="[overflow-wrap:anywhere]">{r.professional.name}</span>
          {r.professional.role === 'ADMIN' ? (
            <span className="t-caption text-muted">{copy.roleAdmin}</span>
          ) : null}
        </span>
      ),
      mobileCell: (r) => r.professional.name,
    },
    {
      id: 'rule',
      header: copy.colRule,
      cell: (r) =>
        r.rule ? <span className="tabular-nums">{ruleSummary(r.rule)}</span> : <span className="text-muted">{copy.noRule}</span>,
      mobileCell: (r) => (r.rule ? ruleSummary(r.rule) : copy.noRule),
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (r) =>
        !r.professional.active ? (
          <Badge variant="neutral">{copy.retired}</Badge>
        ) : r.rule ? (
          <Badge variant={r.rule.active ? 'success' : 'neutral'}>{r.rule.active ? copy.active : copy.inactive}</Badge>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <AsyncSection
        loading={loading && !data}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={rows.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Percent aria-hidden />}
        skeleton={<TableSkeleton rows={3} />}
      >
        <DataList
          label={copy.tableLabel}
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.professional.membershipId}
          getRowLabel={(r) => r.professional.name}
          onRowClick={(r) => (r.professional.active ? open(r) : undefined)}
          rowActions={(r) =>
            r.professional.active ? [{ label: r.rule ? copy.edit : copy.configure, onSelect: () => open(r) }] : []
          }
        />
        <p className="text-sm">
          <Link href={COMMISSIONS_HREF} className="text-primary-text underline-offset-4 hover:underline">
            {copy.goToSettlements}
          </Link>
        </p>
      </AsyncSection>
      {editing && data ? (
        <CommissionRuleDialog
          key={openKey}
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          token={token}
          row={editing}
          categories={data.categories}
          deductionsAvailable={data.deductionsAvailable}
          onSaved={(saved) =>
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    professionals: prev.professionals.map((p) =>
                      p.professional.membershipId === saved.professional.membershipId ? saved : p,
                    ),
                  }
                : prev,
            )
          }
        />
      ) : null}
    </div>
  );
}
