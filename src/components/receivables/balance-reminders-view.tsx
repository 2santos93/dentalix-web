'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { BellRing, Check, Lock, MessageCircle, Settings2 } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import { fetchClinicName } from '@/lib/clinic-branding';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { useSedeStamp, type SedePainters } from '@/lib/locations/sede-stamp';
import {
  getBalanceReminders,
  markBalanceReminder,
  type BalanceReminderPolicy,
  type BalanceReminderRow,
  type BalanceRemindersPage,
} from '@/lib/receivables/reminders-api';
import { overdueAmounts, reminderDaysText, reminderWhatsAppHref } from '@/lib/receivables/presentation';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ExternalLink } from '@/components/shared/external-link';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataList, DATA_LIST_PHONE_QUERY, type DataListColumn } from '@/components/ui/data-list';
import { carteraNavFor, carteraPanelProps, type CarteraViewTabs } from './cartera-tabs';
import { AgeCell, AgeMeta } from './debtor-parts';
import { ReminderPolicyDialog } from './reminder-policy-dialog';
import { ScopeMarker } from './scope-marker';

export const remindersCopy = {
  title: 'Cartera',
  description:
    'A quién toca avisar hoy de su saldo vencido, según los tramos de la clínica. Escríbele por WhatsApp y marca «Avisado»: sale de la lista hasta su siguiente tramo.',
  listLabel: 'Pacientes por avisar hoy',
  countNoun: 'paciente por avisar',
  countNounPlural: 'pacientes por avisar',
  colPatient: 'Paciente',
  colOverdue: 'Vencido',
  colAge: 'Antigüedad',
  colNotices: 'Avisos',
  colActions: 'Acciones',
  stage: (days: number) => `Tramo de ${days} días`,
  noNotices: 'Primer aviso',
  notices: (sent: number, max: number) => `${sent} de ${max} avisos`,
  lastNotice: (day: string) => `último el ${day}`,
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `Escribir por WhatsApp a ${name}`,
  noWhatsApp: 'Sin WhatsApp',
  noWhatsAppHint: 'Su teléfono no sirve para WhatsApp: llámale y marca «Avisado».',
  mark: 'Marcar avisado',
  marking: 'Marcando…',
  markLabel: (name: string) => `Marcar avisado a ${name}`,
  marked: (name: string) => `${name}: marcado como avisado. Vuelve a la lista en su siguiente tramo.`,
  markError: 'No pudimos marcarlo como avisado.',
  policy: (p: BalanceReminderPolicy) =>
    `Tramos: ${reminderDaysText(p.days)} de la deuda vencida más antigua · hasta ${p.maxNotices} ${
      p.maxNotices === 1 ? 'aviso' : 'avisos'
    } por deuda · al menos ${p.minGapDays} ${p.minGapDays === 1 ? 'día' : 'días'} entre avisos.`,
  editPolicy: 'Cambiar tramos',
  excluded: (promise: number, optedOut: number) => {
    const parts: string[] = [];
    if (promise > 0) parts.push(promise === 1 ? '1 con compromiso de pago vigente' : `${promise} con compromiso de pago vigente`);
    if (optedOut > 0) parts.push(optedOut === 1 ? '1 dado de baja de los avisos' : `${optedOut} dados de baja de los avisos`);
    return `No aparecen ${parts.join(' y ')}.`;
  },
  incomplete: 'Cifras incompletas: revisa su estado de cuenta antes de avisar.',
  emptyTitle: 'Hoy no hay a quién avisar',
  emptyHint:
    'Cuando la deuda vencida de un paciente llegue a un tramo, aparecerá aquí con su mensaje de WhatsApp listo. Quien tiene un compromiso de pago vigente o se dio de baja de los avisos no aparece.',
  loadError: 'No pudimos cargar la lista de avisos.',
  forbiddenTitle: 'Tu rol no tiene acceso a la cartera.',
  forbiddenHint: 'La cartera es para administración y recepción. Pídele acceso a quien administra la clínica.',
  asOf: (day: string) => `Lista del ${day}, con los días del calendario de la sede de cada deuda.`,
};

/** Lo vencido de la fila, formateado con la sede de la deuda; vacío si la sede aún no tiene formato. */
function overdueTexts(row: BalanceReminderRow, stamp: SedePainters): string[] {
  const texts = overdueAmounts(row.currencies).map((a) => stamp.money(a.amount, a.currency, row.locationId));
  return texts.includes(NO_SEDE_FORMAT) ? [] : texts;
}

function NoticesCell({ row, policy, stamp }: { row: BalanceReminderRow; policy: BalanceReminderPolicy; stamp: SedePainters }) {
  const { noticesSent, lastNoticeOn } = row.reminder;
  if (noticesSent === 0) return <span className="text-muted">{remindersCopy.noNotices}</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {remindersCopy.notices(noticesSent, policy.maxNotices)}
      {lastNoticeOn ? (
        <span className="block text-xs text-muted">{remindersCopy.lastNotice(stamp.civilDate(lastNoticeOn, row.locationId))}</span>
      ) : null}
    </span>
  );
}

interface ActionsProps {
  row: BalanceReminderRow;
  href: string | null;
  marking: boolean;
  onMark: (row: BalanceReminderRow) => void;
  stacked?: boolean;
}

/** WhatsApp (wa.me con el mensaje del saldo) y «Marcar avisado», en ese orden. */
function ReminderActions({ row, href, marking, onMark, stacked = false }: ActionsProps) {
  const name = row.patient.fullName;
  return (
    <div className={stacked ? 'grid grid-cols-2 gap-2' : 'flex items-center justify-end gap-2'}>
      {href ? (
        <Button asChild variant="secondary" size="sm" className={stacked ? 'w-full' : undefined}>
          <ExternalLink href={href} aria-label={remindersCopy.whatsappLabel(name)}>
            <MessageCircle aria-hidden />
            {remindersCopy.whatsapp}
          </ExternalLink>
        </Button>
      ) : (
        <span className="self-center text-xs text-muted" title={remindersCopy.noWhatsAppHint}>
          {remindersCopy.noWhatsApp}
        </span>
      )}
      <Button
        type="button"
        size="sm"
        className={stacked ? 'w-full' : undefined}
        aria-label={remindersCopy.markLabel(name)}
        aria-disabled={marking}
        onClick={() => {
          if (!marking) onMark(row);
        }}
      >
        <Check aria-hidden />
        {marking ? remindersCopy.marking : remindersCopy.mark}
      </Button>
    </div>
  );
}

/**
 * Cartera › Por avisar hoy (DX-146): los deudores a los que hoy toca avisar
 * de su saldo vencido según los tramos de la clínica (7, 30 y 60 días por
 * defecto). Cada fila trae el enlace de WhatsApp con el mensaje listo (solo
 * la clínica, el saldo vencido y su moneda) y «Marcar avisado», que deja una
 * gestión de cobranza y saca al paciente de la lista hasta su siguiente
 * tramo. El ADMIN ajusta los tramos desde aquí.
 */
export function BalanceRemindersView({ token, tabs }: { token: string; tabs?: CarteraViewTabs }) {
  const isAdmin = getTokenRole(token) === 'ADMIN';
  const isPhone = useMediaQuery(DATA_LIST_PHONE_QUERY);
  const [data, setData] = useState<BalanceRemindersPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [policyOpen, setPolicyOpen] = useState(false);
  const stamp = useSedeStamp(
    token,
    data?.items.map((r) => r.locationId),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getBalanceReminders(token, { page });
        if (cancelled) return;
        setData(res);
        setError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setError(apiErrorMessage(err, { fallback: remindersCopy.loadError }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, page, reloadKey]);

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

  const reload = () => setReloadKey((k) => k + 1);

  async function mark(row: BalanceReminderRow) {
    const patientId = row.patient.id;
    setMarking(patientId);
    try {
      await markBalanceReminder(token, patientId, { channel: 'WHATSAPP_LINK' });
      // Sale de la lista ya; la recarga confirma el resto (otro pudo marcar).
      setData((prev) =>
        prev ? { ...prev, items: prev.items.filter((i) => i.patient.id !== patientId), total: Math.max(0, prev.total - 1) } : prev,
      );
      const message = remindersCopy.marked(row.patient.fullName);
      setAnnouncement(message);
      notifySuccess(message);
    } catch (err) {
      // 409: ya estaba avisado hoy (otra persona lo marcó): la lista se pone al día.
      if (err instanceof ApiError && err.status === 409) reload();
      notifyError(apiErrorMessage(err, { fallback: remindersCopy.markError }), {
        onRetry: err instanceof ApiError && err.status === 409 ? undefined : () => void mark(row),
      });
    } finally {
      setMarking(null);
    }
  }

  const items = data?.items ?? [];
  const policy = data?.policy ?? null;
  const hrefOf = (row: BalanceReminderRow) =>
    stamp.ready ? reminderWhatsAppHref(row.patient.whatsApp, clinicName, overdueTexts(row, stamp)) : null;

  const columns: DataListColumn<BalanceReminderRow>[] = [
    {
      id: 'patient',
      header: remindersCopy.colPatient,
      mobile: 'primary',
      cell: (r) => (
        <span className="block min-w-[9rem]">
          <span className="block text-ink">{r.patient.fullName}</span>
          {r.patient.phone ? <span className="block text-xs text-muted tabular-nums">{r.patient.phone}</span> : null}
        </span>
      ),
      mobileCell: (r) => r.patient.fullName,
    },
    {
      id: 'overdue',
      header: remindersCopy.colOverdue,
      numeric: true,
      mobile: 'trailing',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => (
        <span className="flex flex-col gap-0.5">
          {overdueAmounts(r.currencies).map((a) => (
            <span key={a.currency} className="whitespace-nowrap font-medium tabular-nums text-ink">
              {stamp.money(a.amount, a.currency, r.locationId)}
            </span>
          ))}
          {r.paymentsWithoutRateCount > 0 ? (
            <span className="block max-w-[12rem] text-xs text-warning-text">{remindersCopy.incomplete}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'age',
      header: remindersCopy.colAge,
      cell: (r) => (
        <span className="flex flex-col gap-1">
          <AgeCell row={r} />
          <span className="text-xs text-muted">{remindersCopy.stage(r.reminder.stageDays)}</span>
        </span>
      ),
      mobileCell: (r) => <AgeMeta row={r} />,
    },
    {
      id: 'notices',
      header: remindersCopy.colNotices,
      showFrom: 'lg',
      cell: (r) => (policy ? <NoticesCell row={r} policy={policy} stamp={stamp} /> : null),
    },
    {
      id: 'actions',
      header: <span className="sr-only">{remindersCopy.colActions}</span>,
      mobile: 'hidden',
      align: 'end',
      cell: (r) => (
        <ReminderActions row={r} href={hrefOf(r)} marking={marking === r.patient.id} onMark={(row) => void mark(row)} />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={remindersCopy.title}
        description={remindersCopy.description}
        meta={data ? <ScopeMarker location={data.scope.location ?? null} /> : null}
      />
      {!forbidden ? carteraNavFor(token, tabs) : null}

      <div className="flex flex-col gap-3" {...carteraPanelProps(tabs)}>
        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={remindersCopy.forbiddenTitle}
            description={remindersCopy.forbiddenHint}
          />
        ) : (
          <>
            <SedeStampNote stamp={stamp} />
            {policy ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">{remindersCopy.policy(policy)}</p>
                {isAdmin ? (
                  <Button type="button" variant="secondary" size="sm" className="self-start sm:self-auto" onClick={() => setPolicyOpen(true)}>
                    <Settings2 aria-hidden />
                    {remindersCopy.editPolicy}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <AsyncSection
              loading={loading && !data}
              error={error}
              onRetry={reload}
              isEmpty={items.length === 0}
              emptyTitle={remindersCopy.emptyTitle}
              emptyDescription={remindersCopy.emptyHint}
              emptyIcon={<BellRing aria-hidden />}
              skeleton={<TableSkeleton rows={4} />}
            >
              <ResultCount total={data?.total ?? 0} noun={remindersCopy.countNoun} nounPlural={remindersCopy.countNounPlural} />
              {isPhone ? (
                <ul aria-label={remindersCopy.listLabel} className="flex flex-col gap-3">
                  {items.map((r) => (
                    <li key={r.patient.id}>
                      <Card className="flex flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold text-ink">{r.patient.fullName}</p>
                            <p className="text-sm text-muted">
                              <AgeMeta row={r} /> · {remindersCopy.stage(r.reminder.stageDays)}
                            </p>
                          </div>
                          <span className="flex shrink-0 flex-col items-end">
                            {overdueAmounts(r.currencies).map((a) => (
                              <span key={a.currency} className="whitespace-nowrap font-medium tabular-nums text-ink">
                                {stamp.money(a.amount, a.currency, r.locationId)}
                              </span>
                            ))}
                          </span>
                        </div>
                        {r.paymentsWithoutRateCount > 0 ? (
                          <p className="text-xs text-warning-text">{remindersCopy.incomplete}</p>
                        ) : null}
                        <ReminderActions
                          row={r}
                          href={hrefOf(r)}
                          marking={marking === r.patient.id}
                          onMark={(row) => void mark(row)}
                          stacked
                        />
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <DataList
                  label={remindersCopy.listLabel}
                  rows={items}
                  columns={columns}
                  getRowKey={(r) => r.patient.id}
                />
              )}
              {data && data.total > data.pageSize ? (
                <Pagination page={page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} disabled={loading} />
              ) : null}
            </AsyncSection>

            {data && (data.excluded.openPromise > 0 || data.excluded.optedOut > 0) ? (
              <p className="text-xs text-muted">{remindersCopy.excluded(data.excluded.openPromise, data.excluded.optedOut)}</p>
            ) : null}
            {data ? <p className="text-xs text-muted tabular-nums">{remindersCopy.asOf(stamp.civilDate(data.asOf))}</p> : null}
            <p role="status" aria-live="polite" className="sr-only">
              {announcement}
            </p>
          </>
        )}
      </div>

      {isAdmin && policy ? (
        <ReminderPolicyDialog
          open={policyOpen}
          onOpenChange={setPolicyOpen}
          token={token}
          policy={policy}
          onSaved={(saved) => {
            setData((prev) => (prev ? { ...prev, policy: saved } : prev));
            reload();
          }}
        />
      ) : null}
    </>
  );
}

