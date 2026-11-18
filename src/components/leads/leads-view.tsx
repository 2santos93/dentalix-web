'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChartColumn, Inbox, Plus, SearchX } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useSedeStamp, type SedeStamp } from '@/lib/locations/sede-stamp';
import { statusLabel } from '@/lib/status/tones';
import {
  LEADS_REPORT_HREF,
  LEAD_CHANNEL_LABELS,
  LEAD_CHANNEL_ORDER,
  LEAD_STAGE_ORDER,
  getLeadBoard,
  hasLeadFilters,
  leadFiltersHref,
  leadHref,
  listLeads,
  manualStageTargets,
  parseLeadFilters,
  type Lead,
  type LeadBoard,
  type LeadChannel,
  type LeadFilters,
  type LeadPage,
  type LeadStage,
  type LeadsView as LeadsViewKind,
} from '@/lib/leads/leads-api';
import { WORK_QUEUES_CHANGED_EVENT } from '@/components/work-queues/work-queues-context';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { FieldError } from '@/components/errors/field-error';
import { SectionError } from '@/components/errors/section-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar, ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { RowActions, type RowAction } from '@/components/shared/row-actions';
import { TableSkeleton } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { LeadCreateDialog } from './lead-create-dialog';
import { LeadLostDialog, leadStageCopy, moveLeadStage } from './lead-lost-dialog';
import { useLeadOwners } from './use-lead-catalogs';

export const leadsCopy = {
  title: 'Prospectos',
  description:
    'Personas interesadas que aún no son pacientes: a quién contactar, quién lo lleva y cuántos llegan a cita.',
  report: 'Informe de conversión',
  viewLabel: 'Vista',
  board: 'Tablero',
  list: 'Lista',
  searchLabel: 'Buscar por nombre o teléfono',
  searchPlaceholder: 'Nombre o teléfono',
  channel: 'Canal',
  allChannels: 'Todos los canales',
  owner: 'Responsable',
  allOwners: 'Todos los responsables',
  ownersError: 'Responsables no disponibles',
  stage: 'Etapa',
  allStages: 'Todas las etapas',
  stale: 'Sin contactar hace más de 24 h',
  newLead: 'Nuevo prospecto',
  boardLabel: 'Tablero de prospectos por etapa',
  listLabel: 'Prospectos',
  countNoun: 'prospecto',
  countNounPlural: 'prospectos',
  columnCount: (n: number) => (n === 1 ? '1 prospecto' : `${n} prospectos`),
  columnMore: (shown: number, total: number) => `Se ven ${shown} de ${total}. Usa la lista para ver todos.`,
  openList: 'Ver en la lista',
  columnEmpty: 'Nadie en esta etapa.',
  colName: 'Nombre',
  colStage: 'Etapa',
  colChannel: 'Canal',
  colOwner: 'Responsable',
  colNext: 'Próxima acción',
  colCreated: 'Alta',
  noOwner: 'Sin responsable',
  noNext: 'Sin próxima acción',
  staleBadge: 'Sin contactar +24 h',
  converted: 'Ya es paciente',
  anonymized: 'Anonimizado',
  actionsOf: (name: string) => `Acciones de ${name}`,
  fromReport: 'Lista filtrada desde el informe de conversión.',
  reached: { SCHEDULED: 'Llegaron a tener cita', ATTENDED: 'Asistieron' } as const,
  clearFilters: 'Quitar filtros',
  emptyTitle: 'Aún no hay prospectos',
  emptyDescription:
    'Anota aquí a quien escribe o llama interesado: nombre, teléfono, canal y qué busca. Así nadie se queda sin respuesta.',
  noMatchTitle: 'Nadie coincide con los filtros',
  noMatchDescription: 'Prueba con otro nombre o teléfono, o quita los filtros.',
  staleEmptyTitle: 'Nadie sin contactar',
  staleEmptyDescription: 'Todos los prospectos abiertos tienen contacto reciente o una próxima acción pendiente.',
  loadError: 'No pudimos cargar los prospectos.',
  created: (name: string) => `${name} está en «Nuevo».`,
};
const copy = leadsCopy;

const VIEW_OPTIONS = [
  { value: 'tablero', label: copy.board },
  { value: 'lista', label: copy.list },
] as const;

function queuesChanged() {
  window.dispatchEvent(new Event(WORK_QUEUES_CHANGED_EVENT));
}

/** «WhatsApp · Ortodoncia»: canal y motivo de interés. */
export function leadMeta(lead: Pick<Lead, 'channel' | 'interestReason'>): string {
  return [LEAD_CHANNEL_LABELS[lead.channel], lead.interestReason].filter(Boolean).join(' · ');
}

/** Los movimientos manuales de un prospecto como acciones del «⋯». Anonimizado o convertido-final: ninguno. */
export function stageActions(lead: Lead, onMove: (lead: Lead, to: LeadStage) => void): RowAction[] {
  if (lead.anonymized) return [];
  return manualStageTargets(lead.stage).map((to) => ({
    label: leadStageCopy.moveTo(lead.stage, to),
    onSelect: () => onMove(lead, to),
    separatorBefore: to === 'LOST' && manualStageTargets(lead.stage).length > 1,
  }));
}

function NextAction({ lead, stamp }: { lead: Lead; stamp: SedeStamp }) {
  if (lead.stale) return <Badge variant="warning">{copy.staleBadge}</Badge>;
  if (!lead.nextActionAt) return <span className="text-muted">{copy.noNext}</span>;
  return (
    <span className="block">
      <span className="block whitespace-nowrap tabular-nums">{stamp.dateTime(lead.nextActionAt, lead.locationId)}</span>
      {lead.nextActionNote ? (
        <span className="block text-xs text-muted [overflow-wrap:anywhere]">{lead.nextActionNote}</span>
      ) : null}
    </span>
  );
}

function LeadCard({
  lead,
  stamp,
  onMove,
}: {
  lead: Lead;
  stamp: SedeStamp;
  onMove: (lead: Lead, to: LeadStage) => void;
}) {
  const actions = stageActions(lead, onMove);
  return (
    <li
      data-testid="lead-card"
      className="relative flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={leadHref(lead.id)}
          className="min-w-0 font-medium text-ink [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
        >
          {lead.fullName}
        </Link>
        {actions.length > 0 ? (
          <RowActions label={copy.actionsOf(lead.fullName)} actions={actions} className="-mr-1 -mt-1 shrink-0" />
        ) : null}
      </div>
      {lead.phone ? <span className="text-xs text-muted tabular-nums">{lead.phone}</span> : null}
      <span className="text-xs text-muted">{leadMeta(lead)}</span>
      {lead.stage === 'LOST' && lead.lostReason ? <span className="text-xs text-muted">{lead.lostReason}</span> : null}
      <span className="text-xs text-muted">{lead.ownerName ?? copy.noOwner}</span>
      {lead.stale || lead.nextActionAt ? (
        <span className="text-xs">
          <NextAction lead={lead} stamp={stamp} />
        </span>
      ) : null}
    </li>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Cargando" className="grid gap-3 lg:grid-cols-5">
      {LEAD_STAGE_ORDER.map((s) => (
        <div key={s} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

function Board({
  board,
  stamp,
  filters,
  onMove,
}: {
  board: LeadBoard;
  stamp: SedeStamp;
  filters: LeadFilters;
  onMove: (lead: Lead, to: LeadStage) => void;
}) {
  return (
    <div aria-label={copy.boardLabel} role="region" className="grid gap-3 lg:grid-cols-5">
      {LEAD_STAGE_ORDER.map((stage) => {
        const column = board.columns.find((c) => c.stage === stage) ?? { stage, total: 0, items: [] };
        const headingId = `lead-col-${stage}`;
        return (
          <section
            key={stage}
            aria-labelledby={headingId}
            data-testid={`lead-column-${stage}`}
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface-sunken/40 p-3"
          >
            <header className="flex items-center justify-between gap-2">
              <h2 id={headingId} className="text-sm font-semibold text-ink">
                <StatusBadge kind="lead" status={stage} />
              </h2>
              <span className="text-xs text-muted tabular-nums">{copy.columnCount(column.total)}</span>
            </header>
            {column.items.length === 0 ? (
              <p className="py-2 text-xs text-muted">{copy.columnEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {column.items.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} stamp={stamp} onMove={onMove} />
                ))}
              </ul>
            )}
            {column.total > column.items.length ? (
              <p className="text-xs text-muted">
                {copy.columnMore(column.items.length, column.total)}{' '}
                <Link
                  className="text-primary-text underline-offset-4 hover:underline"
                  href={leadFiltersHref({ ...filters, view: 'lista', stage, page: 1 })}
                >
                  {copy.openList}
                </Link>
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

type Data = { kind: 'board'; board: LeadBoard } | { kind: 'list'; page: LeadPage };

/**
 * «Prospectos» (DX-556): la bandeja de interesados antes de ser paciente. Dos
 * vistas sobre los mismos filtros (en la URL): el tablero por etapas y la
 * lista paginada (con «sin contactar» y las cifras del informe). Las etapas
 * «Cita agendada» y «Asistió» no se eligen: las pone la cita.
 */
export function LeadsView({ token }: { token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtersKey = searchParams.toString();
  const filters = useMemo(() => parseLeadFilters(new URLSearchParams(filtersKey)), [filtersKey]);
  const owners = useLeadOwners(token);
  const ids = { channel: useId(), owner: useId(), stage: useId() };

  const [search, setSearch] = useState(filters.q);
  const debounced = useDebouncedValue(search.trim(), 300);
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [losing, setLosing] = useState<Lead | null>(null);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  // Qué vista tiene ya contenido en pantalla: un fallo al releerla es de fondo (escalón 3).
  const shownRef = useRef<LeadsViewKind | null>(null);

  const go = useCallback(
    (next: Partial<LeadFilters>) => {
      router.replace(leadFiltersHref({ ...filters, page: 1, ...next }), { scroll: false });
    },
    [router, filters],
  );

  // La búsqueda tecleada pasa a la URL tras el rebote.
  useEffect(() => {
    if (debounced !== filters.q) go({ q: debounced });
  }, [debounced, filters.q, go]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const next: Data =
          filters.view === 'lista'
            ? { kind: 'list', page: await listLeads(token, filters) }
            : { kind: 'board', board: await getLeadBoard(token, filters) };
        if (cancelled) return;
        shownRef.current = filters.view;
        setData(next);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        const message = apiErrorMessage(err, { fallback: copy.loadError });
        if (shownRef.current === filters.view) notifyError(message, { onRetry: reload });
        else setLoadError(message);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filters, reloadKey, reload]);

  const rows: Lead[] = useMemo(() => {
    if (!data) return [];
    return data.kind === 'list' ? data.page.items : data.board.columns.flatMap((c) => c.items);
  }, [data]);
  const stamp = useSedeStamp(
    token,
    rows.map((r) => r.locationId),
  );

  const afterMove = useCallback(() => {
    queuesChanged();
    reload();
  }, [reload]);
  const onMove = useCallback(
    (lead: Lead, to: LeadStage) => {
      if (to === 'LOST') setLosing(lead);
      else void moveLeadStage(token, lead, to, afterMove);
    },
    [token, afterMove],
  );

  const filtered = hasLeadFilters(filters);
  const fromReport = Boolean(filters.reached || filters.createdFrom || filters.createdTo);
  const isList = filters.view === 'lista';
  const current = data && ((isList && data.kind === 'list') || (!isList && data.kind === 'board')) ? data : null;
  const total = current
    ? current.kind === 'list'
      ? current.page.total
      : current.board.columns.reduce((n, c) => n + c.total, 0)
    : 0;

  const newLeadButton = (
    <Button type="button" onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      {copy.newLead}
    </Button>
  );

  function emptyState() {
    if (filters.stale && !filters.q && !filters.channel && !filters.ownerId) {
      return (
        <EmptyState
          role="status"
          icon={<Inbox aria-hidden />}
          title={copy.staleEmptyTitle}
          description={copy.staleEmptyDescription}
          action={
            <Button type="button" variant="secondary" onClick={() => go({ stale: false })}>
              {copy.clearFilters}
            </Button>
          }
        />
      );
    }
    if (filtered) {
      return (
        <EmptyState
          role="status"
          icon={<SearchX aria-hidden />}
          title={copy.noMatchTitle}
          description={copy.noMatchDescription}
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSearch('');
                router.replace(leadFiltersHref({ view: filters.view }), { scroll: false });
              }}
            >
              {copy.clearFilters}
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        role="status"
        icon={<Inbox aria-hidden />}
        title={copy.emptyTitle}
        description={copy.emptyDescription}
        action={newLeadButton}
        actionClassName="w-full sm:w-auto"
      />
    );
  }

  const columns: DataListColumn<Lead>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (r) => (
        <span className="block min-w-[9rem]">
          <span className="block [overflow-wrap:anywhere]">{r.fullName}</span>
          {r.phone ? <span className="block text-xs font-normal text-muted tabular-nums">{r.phone}</span> : null}
        </span>
      ),
      mobileCell: (r) => r.fullName,
    },
    {
      id: 'stage',
      header: copy.colStage,
      mobile: 'trailing',
      cell: (r) => <StatusBadge kind="lead" status={r.stage} />,
    },
    {
      id: 'channel',
      header: copy.colChannel,
      cell: (r) => <span className="text-sm">{leadMeta(r)}</span>,
      mobileCell: (r) => leadMeta(r),
    },
    {
      id: 'owner',
      header: copy.colOwner,
      showFrom: 'md',
      cell: (r) => r.ownerName ?? <span className="text-muted">{copy.noOwner}</span>,
      mobileCell: (r) => r.ownerName,
    },
    {
      id: 'next',
      header: copy.colNext,
      cell: (r) => <NextAction lead={r} stamp={stamp} />,
      mobileCell: (r) =>
        r.stale ? copy.staleBadge : r.nextActionAt ? stamp.maybe.dateTime(r.nextActionAt, r.locationId) : null,
    },
    {
      id: 'created',
      header: copy.colCreated,
      showFrom: 'lg',
      cell: (r) => <span className="whitespace-nowrap tabular-nums">{stamp.date(r.createdAt, r.locationId)}</span>,
      mobileCell: () => null,
    },
  ];

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Button asChild variant="secondary">
            <Link href={LEADS_REPORT_HREF}>
              <ChartColumn aria-hidden />
              {copy.report}
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <SegmentedControl
          aria-label={copy.viewLabel}
          value={filters.view}
          onValueChange={(view: LeadsViewKind) =>
            go(view === 'tablero' ? { view, stale: false, stage: null, reached: null } : { view })
          }
          options={VIEW_OPTIONS}
          fullWidthOnMobile
          className="sm:self-start"
        />
        <ListToolbar
          searchLabel={copy.searchLabel}
          searchPlaceholder={copy.searchPlaceholder}
          value={search}
          onChange={setSearch}
          action={newLeadButton}
        >
          <NativeSelect
            id={ids.channel}
            aria-label={copy.channel}
            value={filters.channel ?? ''}
            onChange={(e) => go({ channel: (e.target.value || null) as LeadChannel | null })}
            className="sm:w-48"
          >
            <option value="">{copy.allChannels}</option>
            {LEAD_CHANNEL_ORDER.map((c) => (
              <option key={c} value={c}>
                {LEAD_CHANNEL_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
          {owners.failed ? (
            <FieldError label={copy.ownersError} onRetry={owners.reload} className="sm:w-56" />
          ) : (
            <NativeSelect
              id={ids.owner}
              aria-label={copy.owner}
              value={filters.ownerId ?? ''}
              disabled={owners.items === null}
              onChange={(e) => go({ ownerId: e.target.value || null })}
              className="sm:w-56"
            >
              <option value="">{copy.allOwners}</option>
              {(owners.items ?? []).map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.fullName}
                </option>
              ))}
              {/* Un responsable del informe que ya no está en la lista: se conserva el filtro. */}
              {filters.ownerId && owners.items && !owners.items.some((o) => o.userId === filters.ownerId) ? (
                <option value={filters.ownerId}>{copy.owner}</option>
              ) : null}
            </NativeSelect>
          )}
          {isList ? (
            <>
              <NativeSelect
                id={ids.stage}
                aria-label={copy.stage}
                value={filters.stage ?? ''}
                onChange={(e) => go({ stage: (e.target.value || null) as LeadStage | null })}
                className="sm:w-44"
              >
                <option value="">{copy.allStages}</option>
                {LEAD_STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel('lead', s)}
                  </option>
                ))}
              </NativeSelect>
              <Checkbox label={copy.stale} checked={filters.stale} onChange={(e) => go({ stale: e.target.checked })} />
            </>
          ) : null}
        </ListToolbar>

        {isList && fromReport ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>
              {copy.fromReport}
              {filters.reached ? ` ${copy.reached[filters.reached]}.` : ''}
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => go({ reached: null, createdFrom: null, createdTo: null })}
            >
              {copy.clearFilters}
            </Button>
          </p>
        ) : null}

        <SedeStampNote stamp={stamp} />

        {loadError && !current ? (
          <SectionError description={loadError} onRetry={reload} />
        ) : !current ? (
          isList ? (
            <TableSkeleton rows={5} />
          ) : (
            <BoardSkeleton />
          )
        ) : total === 0 ? (
          emptyState()
        ) : current.kind === 'board' ? (
          <div aria-busy={loading}>
            <Board board={current.board} stamp={stamp} filters={filters} onMove={onMove} />
          </div>
        ) : (
          <div aria-busy={loading} className="flex flex-col gap-3">
            <ResultCount total={current.page.total} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
            <DataList
              label={copy.listLabel}
              rows={current.page.items}
              columns={columns}
              getRowKey={(r) => r.id}
              getRowHref={(r) => leadHref(r.id)}
              getRowLabel={(r) => r.fullName}
              rowActions={(r) => stageActions(r, onMove)}
            />
            <Pagination
              page={filters.page}
              pageSize={current.page.pageSize}
              total={current.page.total}
              onPageChange={(page) => router.replace(leadFiltersHref({ ...filters, page }), { scroll: false })}
              disabled={loading}
            />
          </div>
        )}
      </div>

      <LeadCreateDialog
        open={creating}
        onOpenChange={setCreating}
        token={token}
        onCreated={(lead) => {
          setCreating(false);
          notifySuccess(copy.created(lead.fullName));
          queuesChanged();
          reload();
        }}
      />
      {losing ? (
        <LeadLostDialog
          open
          onOpenChange={(open) => {
            if (!open) setLosing(null);
          }}
          token={token}
          lead={losing}
          onSaved={(lead) => {
            setLosing(null);
            notifySuccess(leadStageCopy.moved(lead.fullName, statusLabel('lead', 'LOST')));
            queuesChanged();
            reload();
          }}
        />
      ) : null}
    </>
  );
}
