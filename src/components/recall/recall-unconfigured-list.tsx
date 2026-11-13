'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, UserCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { recallUpdatesNotice } from '@/lib/recall/recall-notice';
import {
  listRecallUnconfigured,
  type RecallUnconfiguredItem,
  type RecallUnconfiguredPage,
} from '@/lib/recall/recall-api';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ResultCount } from '@/components/shared/list-toolbar';
import { Pagination } from '@/components/shared/pagination';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { RecallDefaultDialog } from './recall-default-dialog';

export const recallUnconfiguredCopy = {
  listLabel: 'Pacientes sin recall configurado',
  hint: 'Atendidos en los últimos 24 meses, sin recall activo ni cita próxima.',
  countNoun: 'paciente',
  countNounPlural: 'pacientes',
  colPatient: 'Paciente',
  colPhone: 'Teléfono',
  colLastVisit: 'Última visita',
  colReminders: 'Avisos',
  noPhone: 'Sin teléfono',
  optedOut: 'No quiere avisos',
  schedule: 'Programar recall',
  openRecord: 'Abrir ficha',
  emptyTitle: 'Todos los pacientes atendidos tienen recall',
  emptyHint: 'Cuando alguien atendido en los últimos 24 meses se quede sin recall ni cita, aparecerá aquí.',
  loadError: 'No pudimos cargar los pacientes sin recall.',
  scheduled: (type: string, name: string) => `Recall de ${type} programado para ${name}: ya salió de la lista.`,
};
const copy = recallUnconfiguredCopy;

const recordHref = (item: RecallUnconfiguredItem) => `/patients/${item.patientId}`;

/**
 * DX-015-bis (D17): «Sin recall configurado» en /recall. Pacientes atendidos
 * sin recall activo ni cita, de la sede activa, paginados como «Vencidos».
 * Acciones de fila: «Programar recall» (D15, también recepción) y «Abrir ficha».
 */
export function RecallUnconfiguredList({
  token,
  onNotice,
}: {
  token: string;
  onNotice: (message: string) => void;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecallUnconfiguredPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [target, setTarget] = useState<RecallUnconfiguredItem | null>(null);
  const stamp = useSedeStamp(
    token,
    data?.items.map((r) => r.lastVisitLocationId),
  );
  const locations = useLocationsState(token);
  const sedeName = (id: string) =>
    locations.status === 'ready' ? (locations.locations.find((l) => l.id === id)?.name ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listRecallUnconfigured(token, { page });
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (res.items.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: copy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, page, reloadKey]);

  function rowActions(item: RecallUnconfiguredItem): RowAction[] {
    return [
      { label: copy.schedule, icon: <CalendarClock aria-hidden />, onSelect: () => setTarget(item) },
      { label: copy.openRecord, onSelect: () => router.push(recordHref(item)) },
    ];
  }

  const columns: DataListColumn<RecallUnconfiguredItem>[] = [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (r) => <span className="block min-w-[9rem]">{r.patientName}</span>,
      mobileCell: (r) => r.patientName,
    },
    {
      id: 'phone',
      header: copy.colPhone,
      cell: (r) =>
        r.patientPhone ? (
          <span className="whitespace-nowrap tabular-nums">{r.patientPhone}</span>
        ) : (
          <span className="whitespace-nowrap text-xs text-muted">{copy.noPhone}</span>
        ),
      mobileCell: (r) => r.patientPhone,
    },
    {
      id: 'last-visit',
      header: copy.colLastVisit,
      mobile: 'trailing',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => {
        const sede = sedeName(r.lastVisitLocationId);
        return (
          <span className="block whitespace-nowrap tabular-nums">
            <span className="block">{stamp.civilDate(r.lastVisitAt, r.lastVisitLocationId)}</span>
            {sede ? <span className="block text-xs text-muted">{sede}</span> : null}
          </span>
        );
      },
      mobileCell: (r) => stamp.civilDate(r.lastVisitAt, r.lastVisitLocationId),
    },
    {
      id: 'reminders',
      header: <span className="sr-only">{copy.colReminders}</span>,
      align: 'end',
      cell: (r) => (r.reminderOptedOut ? <Badge variant="warning">{copy.optedOut}</Badge> : null),
      mobileCell: (r) => (r.reminderOptedOut ? copy.optedOut : null),
    },
  ];

  const items = data?.items ?? [];

  return (
    <>
      <p className="text-sm text-muted">{copy.hint}</p>
      <SedeStampNote stamp={stamp} />
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={items.length === 0}
        emptyTitle={copy.emptyTitle}
        emptyDescription={copy.emptyHint}
        emptyIcon={<UserCheck aria-hidden />}
        skeleton={<TableSkeleton rows={5} />}
      >
        <ResultCount total={data?.total ?? 0} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
        <DataList
          label={copy.listLabel}
          rows={items}
          columns={columns}
          getRowKey={(r) => r.patientId}
          getRowHref={recordHref}
          getRowLabel={(r) => r.patientName}
          rowActions={rowActions}
        />
      </AsyncSection>
      {!error ? (
        <Pagination
          page={page}
          pageSize={data?.pageSize ?? 0}
          total={data?.total ?? 0}
          onPageChange={setPage}
          disabled={loading}
        />
      ) : null}

      {target ? (
        <RecallDefaultDialog
          token={token}
          patient={{ id: target.patientId, name: target.patientName }}
          onOpenChange={(open) => {
            if (!open) setTarget(null);
          }}
          onSaved={(result, typeName) => {
            // D9: si la exclusión desactivó otro, se dice también.
            const excluded = recallUpdatesNotice(result.recallUpdates, null);
            const done = copy.scheduled(typeName, target.patientName);
            onNotice(excluded ? `${done} ${excluded}.` : done);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </>
  );
}
