'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import {
  acceptOnlineRequest,
  declineOnlineRequest,
  listOnlineRequests,
  ONLINE_BOOKING_SETTINGS_HREF,
  type OnlineRequest,
  type OnlineRequestPage,
  type OnlineRequestStatus,
} from '@/lib/online-booking/online-booking-api';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { FormModal } from '@/components/shared/form-modal';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { Badge } from '@/components/ui/badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusBadge } from '@/components/ui/status-badge';

export const onlineRequestsCopy = {
  title: 'Solicitudes online',
  description:
    'Lo que piden los pacientes desde la página de reserva online. Acepta para crear la cita o rechaza; el paciente recibe un email.',
  filterLabel: 'Estado',
  filters: { PENDING: 'Por revisar', BOOKED: 'Reservadas', ACCEPTED: 'Aceptadas', DECLINED: 'Rechazadas', ALL: 'Todas' },
  loadError: 'No pudimos cargar las solicitudes online.',
  emptyPending: 'No hay solicitudes por revisar',
  empty: 'No hay solicitudes con este estado',
  emptyHint: 'Cuando un paciente pida cita desde la página de reserva online, aparecerá aquí.',
  settingsLink: 'Ajustes de la reserva online',
  tableLabel: 'Solicitudes de la reserva online',
  colPatient: 'Paciente',
  colWhen: 'Fecha y hora',
  colType: 'Tratamiento',
  colProvider: 'Profesional',
  colLocation: 'Sede',
  colKind: 'Paciente',
  colStatus: 'Estado',
  kindNew: 'Nuevo',
  kindExisting: 'Con ficha',
  duplicate: 'Posible duplicado: comprueba la ficha',
  contact: (email: string | null, phone: string | null) => [email, phone].filter(Boolean).join(' · '),
  accept: 'Aceptar',
  decline: 'Rechazar',
  acceptTitle: 'Aceptar la solicitud',
  acceptDescription: (patient: string, when: string) =>
    `Se crea la cita de ${patient} el ${when}, con la marca «Online», y se le envía el email con el enlace para confirmarla o cancelarla.`,
  acceptDuplicate: 'Antes de aceptar, abre la ficha y comprueba que es la misma persona.',
  acceptSubmit: 'Aceptar y agendar',
  declineTitle: 'Rechazar la solicitud',
  declineDescription: (patient: string, when: string) =>
    `La hora del ${when} no se reserva para ${patient}. La solicitud queda como rechazada.`,
  declineSubmit: 'Rechazar',
  accepted: (patient: string) => `Cita de ${patient} creada.`,
  declined: 'Solicitud rechazada.',
  actionError: 'No pudimos completar la acción. Intenta de nuevo.',
  countNoun: 'solicitud',
  countNounPlural: 'solicitudes',
};
const copy = onlineRequestsCopy;

type Filter = OnlineRequestStatus | 'ALL';
const FILTERS: Filter[] = ['PENDING', 'BOOKED', 'ACCEPTED', 'DECLINED', 'ALL'];
const PAGE_SIZE = 20;

/**
 * Bandeja «Solicitudes online» (DX-016): las solicitudes de la página pública
 * en las sedes del usuario, «Por revisar» primero. Cada una con su fecha y
 * hora en el reloj de SU sede, nuevo o con ficha, y el aviso de posible
 * duplicado. Aceptar crea la cita (con las reglas de la agenda: un 409 dice
 * que la hora ya se ocupó); rechazar la cierra. Sin entrada en la barra: se
 * llega desde Pendientes de Inicio y desde ⌘K.
 */
export function OnlineRequestsView({ token }: { token: string }) {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OnlineRequestPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [action, setAction] = useState<{ kind: 'accept' | 'decline'; request: OnlineRequest } | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const rows = data?.items ?? [];
  const stamp = useSedeStamp(
    token,
    rows.map((r) => r.location.id),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listOnlineRequests(token, {
          status: filter === 'ALL' ? null : filter,
          page,
          pageSize: PAGE_SIZE,
        });
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
  }, [token, filter, page, reloadKey]);

  const when = (r: OnlineRequest) => stamp.dateTime(r.start, r.location.id);

  async function confirmAction() {
    if (!action) return;
    setActing(true);
    setActionError(null);
    try {
      if (action.kind === 'accept') {
        await acceptOnlineRequest(token, action.request.id);
        toast.success(copy.accepted(action.request.patient.fullName));
      } else {
        await declineOnlineRequest(token, action.request.id);
        toast.success(copy.declined);
      }
      setAction(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      // 409: ya resuelta o la hora ya se ocupó. El mensaje de la API lo dice;
      // la lista se recarga detrás para mostrar el estado real.
      setActionError(apiErrorMessage(err, copy.actionError));
      if (err instanceof ApiError && err.status === 409) setReloadKey((k) => k + 1);
    } finally {
      setActing(false);
    }
  }

  const columns: DataListColumn<OnlineRequest>[] = [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (r) => (
        <span className="flex flex-col gap-1">
          <Link
            href={`/patients/${r.patient.id}`}
            className="font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
          >
            {r.patient.fullName}
          </Link>
          {r.contactEmail || r.contactPhone ? (
            <span className="t-caption break-all text-muted">{copy.contact(r.contactEmail, r.contactPhone)}</span>
          ) : null}
          {r.possibleDuplicate ? (
            <Badge variant="warning" data-testid="online-request-duplicate" className="self-start">
              {copy.duplicate}
            </Badge>
          ) : null}
        </span>
      ),
      mobileCell: (r) => r.patient.fullName,
    },
    {
      id: 'when',
      header: copy.colWhen,
      cellClassName: 'tabular-nums whitespace-nowrap',
      cell: (r) => when(r),
      mobileCell: (r) => stamp.maybe.dateTime(r.start, r.location.id),
    },
    {
      id: 'type',
      header: copy.colType,
      cell: (r) => r.appointmentType.name,
      mobileCell: (r) => r.appointmentType.name,
    },
    {
      id: 'provider',
      header: copy.colProvider,
      cell: (r) => r.provider.fullName,
      mobileCell: (r) => r.provider.fullName,
    },
    {
      id: 'location',
      header: copy.colLocation,
      showFrom: 'lg',
      cell: (r) => r.location.name,
      mobileCell: (r) => r.location.name,
    },
    {
      id: 'kind',
      header: copy.colKind,
      cell: (r) => (
        <span className="flex flex-col items-start gap-1">
          <Badge variant="neutral">{r.patientKind === 'NEW' ? copy.kindNew : copy.kindExisting}</Badge>
        </span>
      ),
      mobileCell: (r) =>
        [r.patientKind === 'NEW' ? copy.kindNew : copy.kindExisting, r.possibleDuplicate ? copy.duplicate : null]
          .filter(Boolean)
          .join(' · '),
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (r) => <StatusBadge kind="onlineRequest" status={r.status} />,
    },
  ];

  const isEmpty = rows.length === 0;
  const target = action?.request ?? null;

  return (
    <div className="flex flex-col">
      <PageHeader title={copy.title} description={copy.description} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl<Filter>
            aria-label={copy.filterLabel}
            value={filter}
            onValueChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            options={FILTERS.map((f) => ({ value: f, label: copy.filters[f] }))}
            size="sm"
            fullWidthOnMobile
            className="max-w-full overflow-x-auto"
          />
          <Link href={ONLINE_BOOKING_SETTINGS_HREF} className="text-sm font-medium text-primary-text hover:underline max-sm:min-h-11 max-sm:content-center">
            {copy.settingsLink}
          </Link>
        </div>

        <SedeStampNote stamp={stamp} />

        <AsyncSection
          loading={loading && !data}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={isEmpty}
          emptyTitle={filter === 'PENDING' ? copy.emptyPending : copy.empty}
          emptyDescription={copy.emptyHint}
          emptyIcon={<Inbox aria-hidden />}
          skeleton={<TableSkeleton rows={4} />}
        >
          <ResultCount total={data?.total ?? 0} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
          <DataList
            label={copy.tableLabel}
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.id}
            getRowLabel={(r) => r.patient.fullName}
            rowActions={(r) =>
              r.status === 'PENDING'
                ? [
                    {
                      label: copy.accept,
                      onSelect: () => {
                        setActionError(null);
                        setAction({ kind: 'accept', request: r });
                      },
                    },
                    {
                      label: copy.decline,
                      destructive: true,
                      separatorBefore: true,
                      onSelect: () => {
                        setActionError(null);
                        setAction({ kind: 'decline', request: r });
                      },
                    },
                  ]
                : []
            }
          />
        </AsyncSection>
        {!error ? (
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} disabled={loading} />
        ) : null}
      </div>

      <FormModal
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !acting) setAction(null);
        }}
        title={action?.kind === 'decline' ? copy.declineTitle : copy.acceptTitle}
        description={
          target
            ? action?.kind === 'decline'
              ? copy.declineDescription(target.patient.fullName, when(target))
              : copy.acceptDescription(target.patient.fullName, when(target))
            : undefined
        }
        onSubmit={(e) => {
          e.preventDefault();
          void confirmAction();
        }}
        submitLabel={action?.kind === 'decline' ? copy.declineSubmit : copy.acceptSubmit}
        submitting={acting}
        destructive={action?.kind === 'decline'}
        error={actionError}
        fullScreenOnMobile={false}
      >
        {target && action?.kind === 'accept' && target.possibleDuplicate ? (
          <p className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning-text">
            {copy.acceptDuplicate}{' '}
            <Link href={`/patients/${target.patient.id}`} className="font-medium underline">
              {target.patient.fullName}
            </Link>
          </p>
        ) : null}
      </FormModal>
    </div>
  );
}
