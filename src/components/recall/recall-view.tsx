'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Lock, MessageCircle, NotebookPen, Phone, PhoneCall, PhoneOff } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { fetchClinicName } from '@/lib/clinic-branding';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { CHANNEL_LABELS, OUTCOME_LABELS, RECALL_SOON_DAYS, intervalLabel, overdueLabel, recallWhatsAppHref } from '@/lib/recall/presentation';
import { attemptsLabel } from '@/lib/recall/attempts-presentation';
import {
  attemptsQuery,
  parseRecallFilters,
  recallFiltersQuery,
  windowQuery,
  type RecallAttemptsFilter,
  type RecallListFilters,
  type RecallListView,
} from '@/lib/recall/recall-filters';
import {
  listRecallDue,
  listRecallTypes,
  type RecallDueItem,
  type RecallDuePage,
  type RecallContactChannel,
  type RecallDueSort,
  type RecallType,
} from '@/lib/recall/recall-api';
import { recallTypeFilter, recallTypeLabel, recallTypeOptions } from '@/lib/recall/recall-types';
import { recallAppointmentTypeId } from '@/lib/recall/recall-appointment-type';
import { telHref } from '@/lib/receivables/presentation';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DATA_LIST_PHONE_QUERY, type DataListColumn } from '@/components/ui/data-list';
import { SelectableDataList } from '@/components/ui/selectable-data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { Tooltip } from '@/components/ui/tooltip';
import { RecallContactDialog } from './recall-contact-dialog';
import { RecallSelectionBar } from './recall-selection-bar';
import { RecallScheduleDialog } from './recall-schedule-dialog';
import { ExternalLink } from '@/components/shared/external-link';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { RecallUnconfiguredList } from './recall-unconfigured-list';

// DX-465: el lote llega en su propio trozo al abrirlo.
const RecallBatchContactDialog = dynamic(
  () => import('./recall-batch-contact-dialog').then((m) => m.RecallBatchContactDialog),
  { ssr: false },
);

export const recallCopy = {
  title: 'Recall',
  description: 'Pacientes con el control vencido y sin cita: llámalos para que vuelvan.',
  // DX-015-bis (D17): la otra vista, los atendidos que nunca tuvieron recall.
  viewLabel: 'Vista de la lista de recall',
  viewDue: 'Vencidos',
  viewUnconfigured: 'Sin recall configurado',
  kindLabel: 'Tipo',
  kindAll: 'Todos los tipos',
  windowLabel: 'Vencimiento',
  windowDue: 'Ya vencidos',
  windowSoon: `Vencidos y próximos ${RECALL_SOON_DAYS} días`,
  sortLabel: 'Orden',
  sortMost: 'Más vencidos primero',
  sortLeast: 'Menos vencidos primero',
  // DX-465: qué parte del ciclo de intentos se ve.
  attemptsLabel: 'Intentos',
  attemptsDue: 'Por llamar ahora',
  attemptsContacted: 'Incluir contactados',
  attemptsExhausted: 'Intentos agotados',
  listLabel: 'Pacientes por llamar',
  countNoun: 'paciente',
  countNounPlural: 'pacientes',
  colPatient: 'Paciente',
  colKind: 'Tipo',
  colDue: 'Vencimiento',
  colAttempts: 'Intentos',
  colLastAttempt: 'Último intento',
  colContact: 'Contacto',
  noContact: 'Sin intentos',
  attemptsOf: (label: string) => `${label} intentos`,
  exhausted: 'Agotados',
  callbackOn: (day: string) => `Llamar el ${day}`,
  hiddenUntil: (day: string) => `Vuelve el ${day}`,
  phoneReview: 'Teléfono por revisar',
  noPhone: 'Sin teléfono',
  optedOut: 'No quiere avisos',
  call: 'Llamar',
  callAction: (phone: string) => `Llamar · ${phone}`,
  callLabel: (name: string, phone: string) => `Llamar a ${name} al ${phone}`,
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `Escribir a ${name} por WhatsApp`,
  schedule: 'Agendar',
  register: 'Registrar intento',
  openRecord: 'Abrir ficha',
  emptyTitle: 'Nadie pendiente de control',
  emptyHint: 'Cuando a un paciente se le venza el control y no tenga cita, aparecerá aquí. Prueba también con otros filtros.',
  emptyContactedHint:
    'Ni por llamar ni contactados hace poco con estos filtros. Prueba con otro tipo o con los próximos 30 días.',
  emptyExhaustedTitle: 'Nadie con los intentos agotados',
  emptyExhaustedHint:
    'Aquí salen los pacientes que llegaron al tope de intentos de su sede sin agendar. El tope se cambia en Ajustes › Recall.',
  loadError: 'No pudimos cargar la lista de recall.',
  forbiddenTitle: 'Tu rol no tiene acceso a la lista de recall.',
  forbiddenHint: 'La lista es para administración y recepción. Pídele acceso a quien administra la clínica.',
  contactSaved: (name: string) => `Intento registrado para ${name}.`,
  contactSavedHidden: (name: string) =>
    `Intento registrado para ${name}: sale de la lista hasta que toque volver a llamarle (míralo en «Incluir contactados»).`,
  batchSaved: (n: number) => (n === 1 ? 'Intento registrado para 1 paciente.' : `Intento registrado para ${n} pacientes.`),
  selectRow: (name: string) => `Seleccionar a ${name}`,
  selectAll: 'Seleccionar todos los de esta página',
  scheduled: (name: string) => `Cita agendada para ${name}: ya salió de la lista.`,
};
const copy = recallCopy;

/**
 * El diálogo abierto. «Agendar» puede venir de «Registrar intento» con
 * «Agendó» (D23): trae el canal y la nota elegidos allí.
 */
type Dialog =
  | { kind: 'contact'; item: RecallDueItem }
  | { kind: 'schedule'; item: RecallDueItem; channel?: RecallContactChannel; note?: string }
  | null;

/** Los filtros al montar: los de la URL (la vista solo existe en el cliente, tras el token). */
function initialFilters(): RecallListFilters {
  return parseRecallFilters(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search));
}

const recordHref = (item: RecallDueItem) => `/patients/${item.patientId}`;

/** DX-465: un «Número erróneo» marcó el teléfono; se quita en la ficha o al cambiarlo. */
function PhoneReviewBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={className}>
      <PhoneOff aria-hidden className="size-3" />
      {copy.phoneReview}
    </Badge>
  );
}

function ContactButtons({
  item,
  clinicName,
}: {
  item: Pick<RecallDueItem, 'patientName' | 'patientPhone' | 'patientWhatsApp' | 'reminderOptedOut'>;
  clinicName: string | null;
}) {
  if (item.reminderOptedOut) return <Badge variant="warning">{copy.optedOut}</Badge>;
  const phone = item.patientPhone;
  if (!phone) return <span className="whitespace-nowrap text-xs text-muted">{copy.noPhone}</span>;
  const whatsapp = recallWhatsAppHref(item, clinicName);
  return (
    <span className="relative z-10 inline-flex items-center gap-1">
      <Tooltip content={`${copy.call} · ${phone}`}>
        <Button asChild variant="ghost" size="icon-sm">
          <a href={telHref(phone)} aria-label={copy.callLabel(item.patientName, phone)}>
            <Phone aria-hidden />
          </a>
        </Button>
      </Tooltip>
      {whatsapp ? (
        <Tooltip content={copy.whatsapp}>
          <Button asChild variant="ghost" size="icon-sm">
            <ExternalLink href={whatsapp} aria-label={copy.whatsappLabel(item.patientName)}>
              <MessageCircle aria-hidden />
            </ExternalLink>
          </Button>
        </Tooltip>
      ) : null}
    </span>
  );
}

/**
 * Lista de llamada de recall (DX-015), de la sede activa: filtros, `DataList`
 * y páginas, como la cartera. Toda la fila abre la ficha; «Llamar» y
 * «WhatsApp» son iconos en la tabla y van al «⋯» en el teléfono, junto a
 * «Agendar» y «Registrar intento». Con baja de avisos (DX-128) no se ofrece
 * contacto: el paciente sigue en la lista para agendarle si llama él.
 */
export function RecallView({ token }: { token: string }) {
  const router = useRouter();
  const isPhone = useMediaQuery(DATA_LIST_PHONE_QUERY);
  // DX-465: selección múltiple de la página que se ve, por `recallId`.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // DX-465: los filtros viven en la URL (enlazables, sobreviven a recargar).
  const [filters, setFilters] = useState<RecallListFilters>(initialFilters);
  const { view, typeRef, soon, sort, attempts, page } = filters;
  // Otra página u otros filtros: la selección es de lo que se ve, se vacía.
  function setFilter(next: Partial<RecallListFilters>) {
    // Cambiar un filtro vuelve a la primera página; cambiar de página, no.
    setFilters((prev) => ({ ...prev, page: 1, ...next }));
    setSelected(new Set());
  }
  const setView = (next: RecallListView) => setFilter({ view: next });
  const setPage = (next: number) => {
    setFilters((prev) => ({ ...prev, page: next }));
    setSelected(new Set());
  };
  // Hasta que llegan los tipos el filtro solo ofrece «Todos» (deshabilitado):
  // así no se elige una clave del respaldo que luego no esté entre las opciones.
  const [types, setTypes] = useState<RecallType[] | 'loading' | 'failed'>('loading');
  const typeOptions = types === 'loading' ? [] : recallTypeOptions(types === 'failed' ? null : types);
  const [data, setData] = useState<RecallDuePage | null>(null);
  // DX-354b: cada fila con el formato y el reloj de SU sede (`locationId`); un solo aviso por pantalla.
  const stamp = useSedeStamp(
    token,
    data?.items.map((r) => r.locationId),
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  // La URL sigue a los filtros, sin entrada nueva en el historial.
  useEffect(() => {
    const query = recallFiltersQuery(filters);
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [filters]);

  useEffect(() => {
    if (view !== 'due') return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listRecallDue(token, {
          ...(typeRef === 'ALL' ? {} : recallTypeFilter(typeRef)),
          ...windowQuery(soon),
          ...attemptsQuery(attempts),
          sort,
          page,
        });
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (res.items.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(apiErrorMessage(err, { fallback: copy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, view, typeRef, soon, sort, attempts, page, reloadKey]);

  // Los tipos del filtro: si la lectura falla, Higiene y Control (respaldo).
  useEffect(() => {
    let cancelled = false;
    listRecallTypes(token)
      .then((list) => {
        if (!cancelled) setTypes(list);
      })
      .catch(() => {
        // Respaldo: las claves de siempre.
        if (!cancelled) setTypes('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Nombre de la clínica para el mensaje de WhatsApp: si falla, «la clínica».
  useEffect(() => {
    let cancelled = false;
    fetchClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name);
      })
      .catch(() => {
        /* sin nombre, el mensaje dice «la clínica» */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function rowActions(item: RecallDueItem): RowAction[] {
    const actions: RowAction[] = [];
    const phone = item.patientPhone;
    if (isPhone && phone && !item.reminderOptedOut) {
      actions.push({
        label: copy.callAction(phone),
        icon: <Phone aria-hidden />,
        onSelect: () => {
          window.location.href = telHref(phone);
        },
      });
      const whatsapp = recallWhatsAppHref(item, clinicName);
      if (whatsapp) {
        actions.push({
          label: copy.whatsapp,
          icon: <MessageCircle aria-hidden />,
          onSelect: () => {
            window.open(whatsapp, '_blank', 'noopener,noreferrer');
          },
        });
      }
    }
    actions.push({
      label: copy.schedule,
      icon: <CalendarPlus aria-hidden />,
      separatorBefore: actions.length > 0,
      onSelect: () => setDialog({ kind: 'schedule', item }),
    });
    actions.push({
      label: copy.register,
      icon: <NotebookPen aria-hidden />,
      onSelect: () => setDialog({ kind: 'contact', item }),
    });
    actions.push({ label: copy.openRecord, onSelect: () => router.push(recordHref(item)) });
    return actions;
  }

  const columns: DataListColumn<RecallDueItem>[] = [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (r) => (
        <span className="block min-w-[9rem]">
          <span className="block">{r.patientName}</span>
          {r.patientPhone ? (
            <span className="block whitespace-nowrap text-xs font-normal text-muted tabular-nums">{r.patientPhone}</span>
          ) : null}
          {r.phoneReview ? <PhoneReviewBadge className="mt-1" /> : null}
        </span>
      ),
      mobileCell: (r) =>
        r.phoneReview ? (
          <>
            {r.patientName} <PhoneReviewBadge />
          </>
        ) : (
          r.patientName
        ),
    },
    {
      id: 'kind',
      header: copy.colKind,
      cell: (r) => (
        <span className="block whitespace-nowrap">
          <span className="block">{recallTypeLabel(r)}</span>
          <span className="block text-xs text-muted">{intervalLabel(r.intervalMonths)}</span>
        </span>
      ),
      mobileCell: (r) => (r.reminderOptedOut ? `${recallTypeLabel(r)} · ${copy.optedOut}` : recallTypeLabel(r)),
    },
    {
      id: 'due',
      header: copy.colDue,
      mobile: 'trailing',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => (
        <span className="block whitespace-nowrap tabular-nums">
          <span className="block">{overdueLabel(r.daysOverdue)}</span>
          <span className="block text-xs text-muted">{stamp.civilDate(r.dueAt, r.locationId)}</span>
        </span>
      ),
      mobileCell: (r) => overdueLabel(r.daysOverdue),
    },
    {
      id: 'attempts',
      header: copy.colAttempts,
      headerClassName: 'whitespace-nowrap',
      cell: (r) => {
        const when = attemptsWhen(r);
        return (
          <span className="block whitespace-nowrap tabular-nums">
            <span className="flex items-center gap-2">
              {attemptsLabel(r.attempts, r.maxAttempts)}
              {r.exhausted ? <Badge variant="warning">{copy.exhausted}</Badge> : null}
            </span>
            {when ? <span className="block text-xs text-muted">{when}</span> : null}
          </span>
        );
      },
      mobileCell: (r) => {
        const when = attemptsWhen(r);
        const label = copy.attemptsOf(attemptsLabel(r.attempts, r.maxAttempts));
        return when ? `${label} · ${when}` : label;
      },
    },
    {
      id: 'last-attempt',
      header: copy.colLastAttempt,
      showFrom: 'lg',
      cell: (r) =>
        r.lastAttempt ? (
          <span className="block">
            <span className="block">
              {OUTCOME_LABELS[r.lastAttempt.outcome]} · {CHANNEL_LABELS[r.lastAttempt.channel]}
            </span>
            <span className="block text-xs text-muted tabular-nums">{stamp.dateTime(r.lastAttempt.at, r.locationId)}</span>
          </span>
        ) : (
          <span className="text-muted">{copy.noContact}</span>
        ),
      mobileCell: (r) => (r.lastAttempt ? OUTCOME_LABELS[r.lastAttempt.outcome] : null),
    },
    {
      id: 'contact',
      header: <span className="sr-only">{copy.colContact}</span>,
      mobile: 'hidden',
      align: 'end',
      cell: (r) => <ContactButtons item={r} clinicName={clinicName} />,
    },
  ];

  /** «Llamar el 12/12/2026» o «Vuelve el …»: cuándo vuelve a la lista. Sin fecha de la sede, nada. */
  function attemptsWhen(r: RecallDueItem): string | null {
    if (r.callbackOn) {
      const day = stamp.maybe.civilDate(r.callbackOn, r.locationId);
      return day ? copy.callbackOn(day) : null;
    }
    if (r.hiddenUntil) {
      const day = stamp.maybe.civilDate(r.hiddenUntil, r.locationId);
      return day ? copy.hiddenUntil(day) : null;
    }
    return null;
  }

  const items = data?.items ?? [];
  const selectedItems = items.filter((i) => selected.has(i.recallId));
  const empty =
    attempts === 'exhausted'
      ? { title: copy.emptyExhaustedTitle, hint: copy.emptyExhaustedHint }
      : { title: copy.emptyTitle, hint: attempts === 'contacted' ? copy.emptyContactedHint : copy.emptyHint };

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <div className="flex flex-col gap-3">
        {!forbidden ? (
          <SegmentedControl<RecallListView>
            aria-label={copy.viewLabel}
            value={view}
            onValueChange={(next) => {
              setView(next);
              setNotice(null);
            }}
            options={[
              { value: 'due', label: copy.viewDue },
              { value: 'unconfigured', label: copy.viewUnconfigured },
            ]}
            fullWidthOnMobile
            className="self-start"
          />
        ) : null}
        {!forbidden && view === 'due' ? (
          <div className="grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:items-center">
            <NativeSelect
              aria-label={copy.kindLabel}
              value={typeRef}
              disabled={types === 'loading'}
              onChange={(e) => setFilter({ typeRef: e.target.value })}
              className="sm:w-48"
            >
              <option value="ALL">{copy.kindAll}</option>
              {typeOptions
                .filter((o) => o.active || o.ref === typeRef)
                .map((o) => (
                  <option key={o.ref} value={o.ref}>
                    {o.name}
                  </option>
                ))}
            </NativeSelect>
            <NativeSelect
              aria-label={copy.windowLabel}
              value={soon ? 'soon' : 'due'}
              onChange={(e) => setFilter({ soon: e.target.value === 'soon' })}
              className="sm:w-64"
            >
              <option value="due">{copy.windowDue}</option>
              <option value="soon">{copy.windowSoon}</option>
            </NativeSelect>
            <NativeSelect
              aria-label={copy.sortLabel}
              value={sort}
              onChange={(e) => setFilter({ sort: e.target.value as RecallDueSort })}
              className="sm:w-56"
            >
              <option value="MOST_OVERDUE">{copy.sortMost}</option>
              <option value="LEAST_OVERDUE">{copy.sortLeast}</option>
            </NativeSelect>
            <NativeSelect
              aria-label={copy.attemptsLabel}
              value={attempts}
              onChange={(e) => setFilter({ attempts: e.target.value as RecallAttemptsFilter })}
              className="sm:w-52"
            >
              <option value="due">{copy.attemptsDue}</option>
              <option value="contacted">{copy.attemptsContacted}</option>
              <option value="exhausted">{copy.attemptsExhausted}</option>
            </NativeSelect>
          </div>
        ) : null}

        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>
        {view === 'due' ? <SedeStampNote stamp={stamp} /> : null}

        {forbidden ? (
          <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
        ) : view === 'unconfigured' ? (
          <RecallUnconfiguredList token={token} onNotice={setNotice} />
        ) : (
          <>
            <AsyncSection
              loading={loading}
              error={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={items.length === 0}
              emptyTitle={empty.title}
              emptyDescription={empty.hint}
              emptyIcon={<PhoneCall aria-hidden />}
              skeleton={<TableSkeleton rows={5} />}
            >
              <ResultCount total={data?.total ?? 0} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
              <SelectableDataList
                label={copy.listLabel}
                rows={items}
                columns={columns}
                getRowKey={(r) => r.recallId}
                getRowHref={recordHref}
                getRowLabel={(r) => r.patientName}
                rowActions={rowActions}
                selection={{
                  selectedKeys: selected,
                  onChange: setSelected,
                  getRowLabel: (r) => copy.selectRow(r.patientName),
                  allLabel: copy.selectAll,
                }}
              />
            </AsyncSection>
            {selectedItems.length > 0 ? (
              <RecallSelectionBar
                count={selectedItems.length}
                onRegister={() => setBatchOpen(true)}
                onClear={() => setSelected(new Set())}
              />
            ) : null}
            {!loadError ? (
              <Pagination
                page={page}
                pageSize={data?.pageSize ?? 0}
                total={data?.total ?? 0}
                onPageChange={setPage}
                disabled={loading}
              />
            ) : null}
          </>
        )}
      </div>

      {dialog ? (
        <RecallContactDialog
          open={dialog.kind === 'contact'}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          token={token}
          recallId={dialog.item.recallId}
          patientName={dialog.item.patientName}
          timeZone={stamp.clock?.of(dialog.item.locationId)?.timeZone ?? null}
          onSaved={(contact) => {
            // Con el filtro por defecto, un intento (salvo «Agendó») lo saca de la lista unos días.
            setNotice(
              attempts === 'due' && contact.outcome !== 'BOOKED'
                ? copy.contactSavedHidden(dialog.item.patientName)
                : copy.contactSaved(dialog.item.patientName),
            );
            setReloadKey((k) => k + 1);
          }}
          onBook={({ channel, note }) => setDialog({ kind: 'schedule', item: dialog.item, channel, note })}
        />
      ) : null}
      {batchOpen ? (
        <RecallBatchContactDialog
          open
          onOpenChange={(open) => {
            if (!open) setBatchOpen(false);
          }}
          token={token}
          items={selectedItems}
          timeZoneOf={(locationId) => stamp.clock?.of(locationId)?.timeZone ?? null}
          onSaved={(count) => {
            setNotice(copy.batchSaved(count));
            setSelected(new Set());
            setReloadKey((k) => k + 1);
          }}
          onMissing={(recallIds) => {
            setSelected((prev) => new Set([...prev].filter((id) => !recallIds.includes(id))));
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
      {dialog?.kind === 'schedule' ? (
        <RecallScheduleDialog
          token={token}
          item={dialog.item}
          // D21: el tipo de cita del tipo de recall, de los tipos que ya cargó el filtro.
          appointmentTypeId={recallAppointmentTypeId(dialog.item.recallTypeId, Array.isArray(types) ? types : null)}
          defaultChannel={dialog.channel}
          note={dialog.note}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setNotice(copy.scheduled(dialog.item.patientName));
            setDialog(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </>
  );
}
