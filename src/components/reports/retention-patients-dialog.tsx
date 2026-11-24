'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { CalendarPlus, Download, MessageCircle, Phone } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { fetchClinicName } from '@/lib/clinic-branding';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { saveCsv } from '@/lib/files/save-csv';
import { recallWhatsAppHref } from '@/lib/recall/presentation';
import { telHref } from '@/lib/receivables/presentation';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import type { Appointment } from '@/lib/appointments/appointments-api';
import {
  downloadRetentionPatientsCsv,
  getRetentionPatients,
  type RetentionDefinition,
  type RetentionFilters,
  type RetentionPatient,
  type RetentionPatients,
  type RetentionSegment,
} from '@/lib/reports/retention-api';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ExternalLink } from '@/components/shared/external-link';
import { Pagination } from '@/components/shared/pagination';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';

export const retentionPatientsCopy = {
  description: (total: string, scope: string) => `${total} · ${scope}. De la visita más reciente a la más antigua.`,
  count: (n: number, text: string) => (n === 1 ? '1 paciente' : `${text} pacientes`),
  scopeAll: 'todas tus sedes y todo el equipo',
  listLabel: (label: string) => `Pacientes: ${label}`,
  columns: {
    patient: 'Paciente',
    lastVisit: 'Última visita',
    professional: 'Profesional',
    location: 'Sede',
    upcoming: 'Cita futura',
    contact: 'Contacto',
  },
  lastVisit: (day: string) => `Última visita ${day}`,
  upcomingYes: 'Con cita',
  upcomingNo: 'Sin cita',
  optedOut: 'No quiere avisos',
  optedOutWhy:
    '«No quiere avisos»: se dio de baja de los avisos; sigue contando en la cifra, pero no se muestra su teléfono ni WhatsApp.',
  noPhone: 'Sin teléfono',
  call: 'Llamar',
  callLabel: (name: string, phone: string) => `Llamar a ${name} al ${phone}`,
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `Escribir a ${name} por WhatsApp`,
  schedule: 'Agendar',
  export: 'Exportar lista',
  exporting: 'Exportando…',
  exported: 'Lista exportada.',
  exportError: 'No pudimos exportar la lista.',
  truncated: 'La lista se corta en 10.000 pacientes: acota el período, la sede o el profesional.',
  loadError: 'No pudimos cargar la lista de pacientes.',
  empty: 'Nadie en esta cifra',
  emptyHint: 'Con estos filtros la cifra es cero.',
  scheduleTitle: 'Agendar cita',
  scheduleDescription: (name: string) => `Cita para ${name}, con su última sede y profesional ya puestos.`,
  scheduleReason: 'Control de seguimiento',
  scheduleLoadError: 'No pudimos cargar los datos del paciente.',
  scheduled: (name: string) => `Cita agendada para ${name}.`,
};

const PAGE_SIZE = 25;

/** Qué lista abrir: la cifra (definición de la API) y, si viene de la tabla, su sede y profesional. */
export interface RetentionListTarget {
  definition: RetentionDefinition & { segment: RetentionSegment };
  /** El ámbito en palabras («Sede Norte · Dra. Pérez»). */
  scope: string | null;
  locationId?: string;
  providerId?: string;
}

function ContactCell({ item, clinicName }: { item: RetentionPatient; clinicName: string | null }) {
  const c = retentionPatientsCopy;
  if (item.reminderOptedOut) {
    return (
      <Badge variant="warning" data-testid="retention-opted-out">
        {c.optedOut}
      </Badge>
    );
  }
  if (!item.phone) return <span className="whitespace-nowrap text-xs text-muted">{c.noPhone}</span>;
  const whatsapp = recallWhatsAppHref({ patientName: item.patientName, patientWhatsApp: item.whatsApp }, clinicName);
  return (
    <span className="relative z-10 inline-flex items-center gap-1">
      <Tooltip content={`${c.call} · ${item.phone}`}>
        <Button asChild variant="ghost" size="icon-sm">
          <a href={telHref(item.phone)} aria-label={c.callLabel(item.patientName, item.phone)}>
            <Phone aria-hidden />
          </a>
        </Button>
      </Tooltip>
      {whatsapp ? (
        <Tooltip content={c.whatsapp}>
          <Button asChild variant="ghost" size="icon-sm">
            <ExternalLink href={whatsapp} aria-label={c.whatsappLabel(item.patientName)}>
              <MessageCircle aria-hidden />
            </ExternalLink>
          </Button>
        </Tooltip>
      ) : null}
    </span>
  );
}

function columnsFor(fmt: RegionalFormat, clinicName: string | null): DataListColumn<RetentionPatient>[] {
  const c = retentionPatientsCopy;
  return [
    { id: 'patient', header: c.columns.patient, mobile: 'primary', cell: (r) => r.patientName },
    {
      id: 'lastVisit',
      header: c.columns.lastVisit,
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums">{fmt.date(new Date(r.lastVisitAt), r.timeZone)}</span>
      ),
      mobileCell: (r) => c.lastVisit(fmt.date(new Date(r.lastVisitAt), r.timeZone)),
    },
    { id: 'professional', header: c.columns.professional, cell: (r) => r.providerName },
    { id: 'location', header: c.columns.location, showFrom: 'lg', cell: (r) => r.locationName },
    {
      id: 'upcoming',
      header: c.columns.upcoming,
      mobile: 'trailing',
      cell: (r) =>
        r.hasUpcomingAppointment ? (
          <Badge variant="success">{c.upcomingYes}</Badge>
        ) : (
          <span className="text-muted">{c.upcomingNo}</span>
        ),
      mobileCell: (r) => (r.hasUpcomingAppointment ? c.upcomingYes : null),
    },
    {
      id: 'contact',
      header: c.columns.contact,
      align: 'end',
      cell: (r) => <ContactCell item={r} clinicName={clinicName} />,
      // En la tarjeta: el teléfono o por qué no hay; llamar y escribir van al «⋯».
      mobileCell: (r) => (r.reminderOptedOut ? c.optedOut : (r.phone ?? c.noPhone)),
    },
  ];
}

function ScheduleForm({
  token,
  item,
  onCreated,
}: {
  token: string;
  item: RetentionPatient;
  onCreated: (appointment: Appointment) => void;
}) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPatient(token, item.patientId)
      .then((p) => {
        if (cancelled) return;
        setPatient(p);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: retentionPatientsCopy.scheduleLoadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, item.patientId, reloadKey]);

  return (
    <AsyncSection
      loading={!patient && !error}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      isEmpty={false}
      skeleton={<Skeleton className="h-64 w-full" />}
    >
      {patient ? (
        <AppointmentForm
          token={token}
          defaultPatient={patient}
          defaultReason={retentionPatientsCopy.scheduleReason}
          locationId={item.locationId}
          defaultProviderId={item.providerId}
          onCreated={onCreated}
        />
      ) : null}
    </AsyncSection>
  );
}

/**
 * La lista de pacientes de una cifra de «Retención» (DX-260): los mismos
 * filtros del informe y, si se abrió desde la tabla, la sede y el profesional
 * de la fila; el total coincide con la cifra. Cada paciente abre su ficha;
 * «Agendar» cambia el diálogo al formulario de cita con su última sede y
 * profesional puestos y al crearla vuelve a la lista. Con baja de avisos
 * (DX-128) la API no da teléfono ni WhatsApp y aquí se dice por qué. «Exportar
 * lista» solo para ADMIN (lleva nombres y teléfonos; la API lo audita).
 */
export function RetentionPatientsDialog({
  token,
  filters,
  target,
  fmt,
  isAdmin,
  onClose,
}: {
  token: string;
  filters: RetentionFilters;
  target: RetentionListTarget;
  fmt: RegionalFormat;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const c = retentionPatientsCopy;
  const segment = target.definition.segment;
  const query: RetentionFilters = {
    ...filters,
    ...(target.locationId ? { locationId: target.locationId } : {}),
    ...(target.providerId ? { providerId: target.providerId } : {}),
  };
  const queryKey = JSON.stringify(query);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RetentionPatients | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<RetentionPatient | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getRetentionPatients(
          token,
          JSON.parse(queryKey) as RetentionFilters,
          segment,
          page,
          PAGE_SIZE,
        );
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, { fallback: c.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, queryKey, segment, page, reloadKey, c.loadError]);

  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    try {
      const text = await downloadRetentionPatientsCsv(token, JSON.parse(queryKey) as RetentionFilters, segment);
      saveCsv(text, `retencion-${segment.replace(/_/g, '-')}-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(c.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: c.exportError }), { onRetry: () => void exportCsv() });
    } finally {
      setExporting(false);
    }
  }

  function rowActions(r: RetentionPatient): RowAction[] {
    const actions: RowAction[] = [];
    if (!r.hasUpcomingAppointment) {
      actions.push({ label: c.schedule, icon: <CalendarPlus aria-hidden />, onSelect: () => setScheduling(r) });
    }
    if (!r.reminderOptedOut && r.phone) {
      const phone = r.phone;
      actions.push({
        label: c.call,
        icon: <Phone aria-hidden />,
        onSelect: () => (window.location.href = telHref(phone)),
      });
      const whatsapp = recallWhatsAppHref({ patientName: r.patientName, patientWhatsApp: r.whatsApp }, clinicName);
      if (whatsapp) {
        actions.push({
          label: c.whatsapp,
          icon: <MessageCircle aria-hidden />,
          onSelect: () => window.open(whatsapp, '_blank', 'noopener,noreferrer'),
        });
      }
    }
    return actions;
  }

  const label = target.definition.label;
  const scope = target.scope ?? c.scopeAll;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreenOnMobile className="max-h-[90dvh] max-w-4xl overflow-y-auto">
        {scheduling ? (
          <>
            <DialogHeader>
              <DialogTitle>{c.scheduleTitle}</DialogTitle>
              <DialogDescription>{c.scheduleDescription(scheduling.patientName)}</DialogDescription>
            </DialogHeader>
            <ScheduleForm
              token={token}
              item={scheduling}
              onCreated={() => {
                setNotice(c.scheduled(scheduling.patientName));
                setScheduling(null);
                setReloadKey((k) => k + 1);
              }}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>
                {data ? c.description(c.count(data.total, fmt.number(data.total)), scope) : scope}
              </DialogDescription>
            </DialogHeader>
            {isAdmin ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void exportCsv()}
                disabled={exporting || loading || Boolean(error) || !data || data.total === 0}
                className="self-start max-sm:min-h-11"
                data-testid="retention-list-export"
              >
                <Download aria-hidden />
                {exporting ? c.exporting : c.export}
              </Button>
            ) : null}
            <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
              {notice}
            </p>
            <AsyncSection
              loading={loading && !data}
              error={error}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={data?.total === 0}
              emptyTitle={c.empty}
              emptyDescription={c.emptyHint}
              skeleton={<TableSkeleton rows={4} />}
            >
              {data ? (
                <div className="flex min-w-0 flex-col gap-3" aria-busy={loading} data-testid="retention-patients">
                  {data.truncated ? <p className="t-caption text-muted">{c.truncated}</p> : null}
                  {data.items.some((r) => r.reminderOptedOut) ? (
                    <p className="t-caption max-w-[80ch] text-muted" data-testid="retention-opted-out-why">
                      {c.optedOutWhy}
                    </p>
                  ) : null}
                  <DataList
                    label={c.listLabel(label)}
                    rows={data.items}
                    columns={columnsFor(fmt, clinicName)}
                    getRowKey={(r) => r.patientId}
                    getRowHref={(r) => `/patients/${r.patientId}`}
                    getRowLabel={(r) => r.patientName}
                    rowActions={rowActions}
                  />
                  <Pagination
                    page={data.page}
                    pageSize={data.pageSize}
                    total={data.total}
                    onPageChange={setPage}
                    disabled={loading}
                  />
                </div>
              ) : null}
            </AsyncSection>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
