'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Lock, MessageCircle, Phone, Smile } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { fetchClinicName } from '@/lib/clinic-branding';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import {
  contactLinks,
  daysAgoLabel,
  listOrthoFollowUp,
  ORTHO_TECHNIQUE_LABELS,
  type OrthoFollowUpFilter,
  type OrthoFollowUpPage,
  type OrthoFollowUpRow,
} from '@/lib/ortho/ortho-api';
import { orthoEnabled, useOrthoSettings } from '@/lib/ortho/ortho-settings';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ExternalLink } from '@/components/shared/external-link';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import type { RowAction } from '@/components/shared/row-actions';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { DataList, DATA_LIST_PHONE_QUERY, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tooltip } from '@/components/ui/tooltip';

const OrthoScheduleDialog = dynamic(() => import('./ortho-schedule-dialog').then((m) => m.OrthoScheduleDialog), {
  ssr: false,
});

export const orthoFollowUpCopy = {
  title: 'Ortodoncia',
  description:
    'Casos activos de la sede: quién está atrasado con su control y quién no tiene próxima cita. Llámalos y agéndales el control.',
  filterLabel: 'Mostrar',
  all: 'Todos',
  overdue: 'Atrasados',
  noNext: 'Sin próxima cita',
  providerLabel: 'Profesional',
  providerAll: 'Todos los profesionales',
  listLabel: 'Casos de ortodoncia activos',
  countNoun: 'caso',
  countNounPlural: 'casos',
  colPatient: 'Paciente',
  colCase: 'Caso',
  colLastVisit: 'Último control',
  colStatus: 'Seguimiento',
  colContact: 'Contacto',
  visits: (done: number, planned: number) => `${done}/${planned} controles`,
  noVisits: 'Sin controles',
  noShows: (n: number) => (n === 1 ? '1 inasistencia' : `${n} inasistencias`),
  nextAppointment: (when: string) => `Próxima cita ${when}`,
  noPhone: 'Sin teléfono',
  call: 'Llamar',
  callAction: (phone: string) => `Llamar · ${phone}`,
  callLabel: (name: string) => `Llamar a ${name}`,
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `Escribir a ${name} por WhatsApp`,
  schedule: 'Agendar control',
  openRecord: 'Abrir ficha',
  emptyAll: 'No hay casos de ortodoncia activos',
  emptyAllHint: 'Los casos se abren desde la ficha del paciente, en la pestaña «Ortodoncia».',
  emptyOverdue: 'No hay pacientes atrasados',
  emptyOverdueHint: 'Todos los casos activos tuvieron control dentro de su intervalo más 15 días.',
  emptyNoNext: 'Todos tienen próxima cita',
  emptyNoNextHint: 'Cada caso activo tiene una cita agendada o en curso.',
  loadError: 'No pudimos cargar la lista de ortodoncia.',
  settingsError: 'No pudimos comprobar si la clínica usa la ortodoncia.',
  disabledTitle: 'La ortodoncia no está activada en esta clínica.',
  disabledHint: 'Administración la activa en Ajustes › Ortodoncia.',
  forbiddenTitle: 'Tu rol no tiene acceso a la lista de ortodoncia.',
  scheduled: (name: string) => `Control agendado para ${name}.`,
};
const copy = orthoFollowUpCopy;

const fullName = (r: OrthoFollowUpRow) => `${r.patientFirstName} ${r.patientLastName}`;
const recordHref = (r: OrthoFollowUpRow) => `/patients/${r.patientId}?tab=ortho`;

function followUpStatus(r: OrthoFollowUpRow) {
  return (
    <span className="flex flex-wrap gap-1">
      {r.overdue ? <StatusBadge kind="orthoFollowUp" status="OVERDUE" /> : null}
      {r.noNextAppointment ? <StatusBadge kind="orthoFollowUp" status="NO_NEXT_APPOINTMENT" /> : null}
      {!r.overdue && !r.noNextAppointment ? <StatusBadge kind="orthoFollowUp" status="ON_TRACK" /> : null}
    </span>
  );
}

/**
 * Pacientes › Ortodoncia (DX-190): casos activos con «Atrasado» y «Sin
 * próxima cita», de la sede activa (o de todas), filtrables por profesional.
 * «Agendar control» abre el formulario de cita y «Llamar», el teléfono o
 * WhatsApp. Los cuatro roles (recepción llama y agenda).
 */
export function OrthoFollowUpView({ token }: { token: string }) {
  const router = useRouter();
  const isPhone = useMediaQuery(DATA_LIST_PHONE_QUERY);
  const settings = useOrthoSettings(token);
  const enabled = orthoEnabled(settings);
  const [filter, setFilter] = useState<OrthoFollowUpFilter>('ALL');
  const [providerId, setProviderId] = useState('');
  const [providers, setProviders] = useState<StaffMember[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrthoFollowUpPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<OrthoFollowUpRow | null>(null);
  const stamp = useSedeStamp(
    token,
    data?.items.map((r) => r.locationId),
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listOrthoFollowUp(token, { filter, providerId: providerId || undefined, page });
        if (cancelled) return;
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
  }, [token, enabled, filter, providerId, page, reloadKey]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listStaff(token)
      .then((staff) => {
        if (!cancelled) setProviders(staff.filter((m) => m.role === 'DENTIST' || m.role === 'ADMIN'));
      })
      // Sin la lista, el filtro solo ofrece «Todos».
      .catch(() => undefined);
    fetchClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, enabled]);

  function rowActions(r: OrthoFollowUpRow): RowAction[] {
    const actions: RowAction[] = [];
    const links = contactLinks(r, clinicName);
    if (isPhone && links) {
      actions.push({
        label: copy.callAction(r.patientPhone ?? r.patientPhoneE164 ?? ''),
        icon: <Phone aria-hidden />,
        onSelect: () => {
          window.location.href = links.tel;
        },
      });
      const whatsapp = links.whatsapp;
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
      onSelect: () => setScheduling(r),
    });
    actions.push({ label: copy.openRecord, onSelect: () => router.push(recordHref(r)) });
    return actions;
  }

  const columns: DataListColumn<OrthoFollowUpRow>[] = [
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (r) => (
        <span className="block min-w-[9rem]">
          <span className="block">{fullName(r)}</span>
          <span className="block text-xs font-normal text-muted">{r.providerName ?? ''}</span>
        </span>
      ),
      mobileCell: (r) => fullName(r),
    },
    {
      id: 'case',
      header: copy.colCase,
      showFrom: 'lg',
      cell: (r) => (
        <span className="block whitespace-nowrap">
          <span className="block">{ORTHO_TECHNIQUE_LABELS[r.technique]}</span>
          <span className="block text-xs text-muted tabular-nums">{copy.visits(r.visitsDone, r.plannedVisits)}</span>
        </span>
      ),
      mobileCell: (r) => copy.visits(r.visitsDone, r.plannedVisits),
    },
    {
      id: 'last-visit',
      header: copy.colLastVisit,
      mobile: 'trailing',
      cell: (r) => (
        <span className="block whitespace-nowrap tabular-nums">
          <span className="block">{r.lastVisitDate ? daysAgoLabel(r.daysSinceLastVisit) : copy.noVisits}</span>
          {r.lastVisitDate ? (
            <span className="block text-xs text-muted">{stamp.civilDate(r.lastVisitDate, r.locationId)}</span>
          ) : null}
        </span>
      ),
      mobileCell: (r) => (r.lastVisitDate ? daysAgoLabel(r.daysSinceLastVisit) : copy.noVisits),
    },
    {
      id: 'status',
      header: copy.colStatus,
      cell: (r) => (
        <span className="flex flex-col gap-1">
          {followUpStatus(r)}
          {r.nextAppointmentAt ? (
            <span className="text-xs text-muted tabular-nums">
              {copy.nextAppointment(stamp.dateTime(r.nextAppointmentAt, r.locationId))}
            </span>
          ) : null}
          {r.noShowCount > 0 ? <span className="text-xs text-danger-text">{copy.noShows(r.noShowCount)}</span> : null}
        </span>
      ),
      mobileCell: (r) => followUpStatus(r),
    },
    {
      id: 'contact',
      header: <span className="sr-only">{copy.colContact}</span>,
      mobile: 'hidden',
      align: 'end',
      cell: (r) => {
        const links = contactLinks(r, clinicName);
        if (!links) return <span className="whitespace-nowrap text-xs text-muted">{copy.noPhone}</span>;
        return (
          <span className="relative z-10 inline-flex items-center gap-1">
            <Tooltip content={copy.call}>
              <Button asChild variant="ghost" size="icon-sm">
                <a href={links.tel} aria-label={copy.callLabel(fullName(r))}>
                  <Phone aria-hidden />
                </a>
              </Button>
            </Tooltip>
            {links.whatsapp ? (
              <Tooltip content={copy.whatsapp}>
                <Button asChild variant="ghost" size="icon-sm">
                  <ExternalLink href={links.whatsapp} aria-label={copy.whatsappLabel(fullName(r))}>
                    <MessageCircle aria-hidden />
                  </ExternalLink>
                </Button>
              </Tooltip>
            ) : null}
            <Tooltip content={copy.schedule}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${copy.schedule} · ${fullName(r)}`}
                onClick={() => setScheduling(r)}
              >
                <CalendarPlus aria-hidden />
              </Button>
            </Tooltip>
          </span>
        );
      },
    },
  ];

  const items = data?.items ?? [];
  const empty =
    filter === 'OVERDUE'
      ? { title: copy.emptyOverdue, hint: copy.emptyOverdueHint }
      : filter === 'NO_NEXT_APPOINTMENT'
        ? { title: copy.emptyNoNext, hint: copy.emptyNoNextHint }
        : { title: copy.emptyAll, hint: copy.emptyAllHint };

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      {settings.status === 'loading' ? (
        <TableSkeleton rows={4} />
      ) : settings.status === 'error' ? (
        <SectionError description={copy.settingsError} onRetry={settings.retry} />
      ) : !enabled ? (
        <EmptyState role="status" icon={<Smile aria-hidden />} title={copy.disabledTitle} description={copy.disabledHint} />
      ) : forbidden ? (
        <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:items-center">
            <SegmentedControl<OrthoFollowUpFilter>
              aria-label={copy.filterLabel}
              value={filter}
              onValueChange={(next) => {
                setFilter(next);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: copy.all },
                { value: 'OVERDUE', label: copy.overdue },
                { value: 'NO_NEXT_APPOINTMENT', label: copy.noNext },
              ]}
              fullWidthOnMobile
            />
            <NativeSelect
              aria-label={copy.providerLabel}
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setPage(1);
              }}
              className="sm:w-64"
            >
              <option value="">{copy.providerAll}</option>
              {providers.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
                </option>
              ))}
            </NativeSelect>
          </div>
          <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
            {notice}
          </p>
          <SedeStampNote stamp={stamp} />
          <AsyncSection
            loading={loading}
            error={loadError}
            onRetry={() => setReloadKey((k) => k + 1)}
            isEmpty={items.length === 0}
            emptyTitle={empty.title}
            emptyDescription={empty.hint}
            emptyIcon={<Smile aria-hidden />}
            skeleton={<TableSkeleton rows={5} />}
          >
            <ResultCount total={data?.total ?? 0} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
            <DataList
              label={copy.listLabel}
              rows={items}
              columns={columns}
              getRowKey={(r) => r.caseId}
              getRowHref={recordHref}
              getRowLabel={fullName}
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
        </div>
      )}
      {scheduling ? (
        <OrthoScheduleDialog
          token={token}
          row={scheduling}
          onClose={() => setScheduling(null)}
          onCreated={() => {
            setNotice(copy.scheduled(fullName(scheduling)));
            setScheduling(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </>
  );
}
