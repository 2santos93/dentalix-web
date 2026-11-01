'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Lock, MessageCircle, NotebookPen, Phone, PhoneCall } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { fetchClinicName } from '@/lib/clinic-branding';
import { formatCivilDate } from '@/lib/format/date';
import { useSedeClock } from '@/lib/locations/sede-clock';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import {
  CHANNEL_LABELS,
  KIND_LABELS,
  KIND_ORDER,
  OUTCOME_LABELS,
  RECALL_SOON_DAYS,
  contactMoment,
  intervalLabel,
  overdueLabel,
  recallWhatsAppHref,
} from '@/lib/recall/presentation';
import {
  listRecallDue,
  type RecallDueItem,
  type RecallDuePage,
  type RecallDueSort,
  type RecallKind,
} from '@/lib/recall/recall-api';
import { telHref } from '@/lib/receivables/presentation';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, DATA_LIST_PHONE_QUERY, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { Tooltip } from '@/components/ui/tooltip';
import { RecallContactDialog } from './recall-contact-dialog';
import { RecallScheduleDialog } from './recall-schedule-dialog';

export const recallCopy = {
  title: 'Recall',
  description: 'Pacientes con el control vencido y sin cita: llámalos para que vuelvan.',
  kindLabel: 'Tipo',
  kindAll: 'Todos los tipos',
  windowLabel: 'Vencimiento',
  windowDue: 'Ya vencidos',
  windowSoon: `Vencidos y próximos ${RECALL_SOON_DAYS} días`,
  sortLabel: 'Orden',
  sortMost: 'Más vencidos primero',
  sortLeast: 'Menos vencidos primero',
  listLabel: 'Pacientes por llamar',
  countNoun: 'paciente',
  countNounPlural: 'pacientes',
  colPatient: 'Paciente',
  colKind: 'Tipo',
  colDue: 'Vencimiento',
  colLastContact: 'Último contacto',
  colContact: 'Contacto',
  noContact: 'Sin contactos',
  noPhone: 'Sin teléfono',
  optedOut: 'No quiere avisos',
  call: 'Llamar',
  callAction: (phone: string) => `Llamar · ${phone}`,
  callLabel: (name: string, phone: string) => `Llamar a ${name} al ${phone}`,
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `Escribir a ${name} por WhatsApp`,
  schedule: 'Agendar',
  register: 'Registrar contacto',
  openRecord: 'Abrir ficha',
  emptyTitle: 'Nadie pendiente de control',
  emptyHint: 'Cuando a un paciente se le venza el control y no tenga cita, aparecerá aquí. Prueba también con otros filtros.',
  loadError: 'No pudimos cargar la lista de recall.',
  forbiddenTitle: 'Tu rol no tiene acceso a la lista de recall.',
  forbiddenHint: 'La lista es para administración y recepción. Pídele acceso a quien administra la clínica.',
  contactSaved: (name: string) => `Contacto registrado para ${name}.`,
  scheduled: (name: string) => `Cita agendada para ${name}: ya salió de la lista.`,
};
const copy = recallCopy;

type Dialog = { kind: 'contact' | 'schedule'; item: RecallDueItem } | null;

const recordHref = (item: RecallDueItem) => `/patients/${item.patientId}`;

function ContactButtons({ item, clinicName }: { item: RecallDueItem; clinicName: string | null }) {
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
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={copy.whatsappLabel(item.patientName)}>
              <MessageCircle aria-hidden />
            </a>
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
 * «Agendar» y «Registrar contacto». Con baja de avisos (DX-128) no se ofrece
 * contacto: el paciente sigue en la lista para agendarle si llama él.
 */
export function RecallView({ token }: { token: string }) {
  const router = useRouter();
  const isPhone = useMediaQuery(DATA_LIST_PHONE_QUERY);
  const sede = useSedeClock(token);
  const clock = sede.status === 'ready' ? sede.clock : null;
  const [kind, setKind] = useState<RecallKind | 'ALL'>('ALL');
  const [soon, setSoon] = useState(false);
  const [sort, setSort] = useState<RecallDueSort>('MOST_OVERDUE');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecallDuePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listRecallDue(token, {
          ...(kind !== 'ALL' ? { kind } : {}),
          ...(soon ? { withinDays: RECALL_SOON_DAYS } : {}),
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
  }, [token, kind, soon, sort, page, reloadKey]);

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
        </span>
      ),
      mobileCell: (r) => r.patientName,
    },
    {
      id: 'kind',
      header: copy.colKind,
      cell: (r) => (
        <span className="block whitespace-nowrap">
          <span className="block">{KIND_LABELS[r.kind]}</span>
          <span className="block text-xs text-muted">{intervalLabel(r.intervalMonths)}</span>
        </span>
      ),
      mobileCell: (r) => (r.reminderOptedOut ? `${KIND_LABELS[r.kind]} · ${copy.optedOut}` : KIND_LABELS[r.kind]),
    },
    {
      id: 'due',
      header: copy.colDue,
      mobile: 'trailing',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => (
        <span className="block whitespace-nowrap tabular-nums">
          <span className="block">{overdueLabel(r.daysOverdue)}</span>
          <span className="block text-xs text-muted">{formatCivilDate(r.dueAt)}</span>
        </span>
      ),
      mobileCell: (r) => overdueLabel(r.daysOverdue),
    },
    {
      id: 'last-contact',
      header: copy.colLastContact,
      showFrom: 'lg',
      cell: (r) =>
        r.lastContact ? (
          <span className="block">
            <span className="block">
              {CHANNEL_LABELS[r.lastContact.channel]} · {OUTCOME_LABELS[r.lastContact.outcome]}
            </span>
            <span className="block text-xs text-muted tabular-nums">{contactMoment(r.lastContact.createdAt, clock)}</span>
          </span>
        ) : (
          <span className="text-muted">{copy.noContact}</span>
        ),
      mobileCell: (r) =>
        r.lastContact ? OUTCOME_LABELS[r.lastContact.outcome] : null,
    },
    {
      id: 'contact',
      header: <span className="sr-only">{copy.colContact}</span>,
      mobile: 'hidden',
      align: 'end',
      cell: (r) => <ContactButtons item={r} clinicName={clinicName} />,
    },
  ];

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <div className="flex flex-col gap-3">
        {!forbidden ? (
          <div className="grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:items-center">
            <NativeSelect
              aria-label={copy.kindLabel}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as RecallKind | 'ALL');
                setPage(1);
              }}
              className="sm:w-48"
            >
              <option value="ALL">{copy.kindAll}</option>
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label={copy.windowLabel}
              value={soon ? 'soon' : 'due'}
              onChange={(e) => {
                setSoon(e.target.value === 'soon');
                setPage(1);
              }}
              className="sm:w-64"
            >
              <option value="due">{copy.windowDue}</option>
              <option value="soon">{copy.windowSoon}</option>
            </NativeSelect>
            <NativeSelect
              aria-label={copy.sortLabel}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as RecallDueSort);
                setPage(1);
              }}
              className="sm:w-56"
            >
              <option value="MOST_OVERDUE">{copy.sortMost}</option>
              <option value="LEAST_OVERDUE">{copy.sortLeast}</option>
            </NativeSelect>
          </div>
        ) : null}

        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>

        {forbidden ? (
          <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />
        ) : (
          <>
            <AsyncSection
              loading={loading}
              error={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={items.length === 0}
              emptyTitle={copy.emptyTitle}
              emptyDescription={copy.emptyHint}
              emptyIcon={<PhoneCall aria-hidden />}
              skeleton={<TableSkeleton rows={5} />}
            >
              <ResultCount total={data?.total ?? 0} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
              <DataList
                label={copy.listLabel}
                rows={items}
                columns={columns}
                getRowKey={(r) => r.recallId}
                getRowHref={recordHref}
                getRowLabel={(r) => r.patientName}
                rowActions={rowActions}
              />
            </AsyncSection>
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
          onSaved={() => {
            setNotice(copy.contactSaved(dialog.item.patientName));
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
      {dialog?.kind === 'schedule' ? (
        <RecallScheduleDialog
          token={token}
          item={dialog.item}
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
