'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, FileText, MessageCircle, NotebookPen, Phone, PhoneCall } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import { fetchClinicName } from '@/lib/clinic-branding';
import { useSedeStamp, type SedeStamp } from '@/lib/locations/sede-stamp';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { postOpPrintHref } from '@/lib/postop/postop-api';
import {
  POST_OP_MAX_NO_ANSWER,
  POST_OP_OUTCOME_LABELS,
  canRegisterPostOpOutcome,
  listPostOpChecks,
  postOpAttemptsLabel,
  postOpDueLabel,
  postOpWhatsAppHref,
  type PostOpAttemptOutcome,
  type PostOpCheck,
  type PostOpCheckItem,
  type PostOpCheckPage,
} from '@/lib/post-op-checks/post-op-checks-api';
import { telHref } from '@/lib/receivables/presentation';
import { WORK_QUEUES_CHANGED_EVENT } from '@/components/work-queues/work-queues-context';
import { notifyError } from '@/components/errors/notify';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ExternalLink } from '@/components/shared/external-link';
import { ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import type { RowAction } from '@/components/shared/row-actions';
import { Button } from '@/components/ui/button';
import { DataList, DATA_LIST_PHONE_QUERY, type DataListColumn } from '@/components/ui/data-list';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { PostOpOutcomeDialog } from './post-op-outcome-dialog';
import { PostOpScheduleDialog } from './post-op-schedule-dialog';

export const postOpChecksCopy = {
  title: 'Controles postoperatorios',
  description: 'Pacientes operados a los que toca llamar hoy (y los que se quedaron sin llamar) para saber cómo siguen.',
  listLabel: 'Controles por llamar',
  countNoun: 'control',
  countNounPlural: 'controles',
  colPatient: 'Paciente',
  colDue: 'Vence',
  colProcedure: 'Procedimiento',
  colProfessional: 'Profesional',
  colAppointment: 'Cita',
  colAttempts: 'Intentos',
  colContact: 'Contacto',
  noPhone: 'Sin teléfono',
  noAppointment: 'Sin cita ligada',
  formerProfessional: 'Profesional retirado',
  noInstructions: 'Sin indicaciones entregadas',
  instructionsLabel: 'Indicaciones entregadas',
  instructionHint: (title: string) => `${title} (se abre en otra pestaña)`,
  attemptBy: (outcome: string, by: string, when: string) => `${outcome} · ${by} · ${when}`,
  call: 'Llamar',
  callAction: (phone: string) => `Llamar · ${phone}`,
  callLabel: (name: string, phone: string) => `Llamar a ${name} al ${phone}`,
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `Escribir a ${name} por WhatsApp`,
  register: 'Registrar resultado',
  detail: 'Ver detalle',
  detailTitle: (name: string) => `Control de ${name}`,
  detailDescription: (procedure: string | null, due: string) => (procedure ? `${procedure} · ${due}` : due),
  openRecord: 'Abrir ficha',
  emptyTitle: 'Nadie por llamar hoy',
  emptyHint:
    'Cuando un procedimiento que pide control postoperatorio se marca hecho, el paciente aparece aquí el día que toca llamarlo.',
  loadError: 'No pudimos cargar los controles postoperatorios.',
  savedRecord: (name: string) => `Control de ${name} cerrado. Quedó en la historia clínica.`,
  savedAttempt: (name: string, n: number) =>
    `Intento ${n} de ${POST_OP_MAX_NO_ANSWER} registrado para ${name}: sigue en la lista.`,
  unreachable: (name: string) =>
    `${name}: No localizado tras ${POST_OP_MAX_NO_ANSWER} intentos sin respuesta. El control se cerró y quedó en la historia clínica.`,
  scheduled: (name: string) => `Revisión postoperatoria agendada para ${name}.`,
};
const copy = postOpChecksCopy;

type OpenDialog =
  | { kind: 'outcome'; item: PostOpCheckItem }
  | { kind: 'schedule'; item: PostOpCheckItem }
  | { kind: 'detail'; item: PostOpCheckItem }
  | null;

const recordHref = (item: PostOpCheckItem) => `/patients/${item.patientId}`;

function ContactButtons({ item, clinicName }: { item: PostOpCheckItem; clinicName: string | null }) {
  const phone = item.patientPhone;
  if (!phone) return <span className="whitespace-nowrap text-xs text-muted">{copy.noPhone}</span>;
  const whatsapp = postOpWhatsAppHref(item, clinicName);
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

/** Las indicaciones entregadas en la cita: cada una abre su documento (DX-222). */
function Instructions({ item }: { item: PostOpCheckItem }) {
  const list = item.instructions ?? [];
  if (list.length === 0) return <span className="block text-xs text-muted">{copy.noInstructions}</span>;
  return (
    <ul aria-label={copy.instructionsLabel} className="relative z-10 flex flex-col gap-0.5">
      {list.map((i) => (
        <li key={i.deliveryId}>
          <ExternalLink
            href={postOpPrintHref(item.patientId, i.deliveryId)}
            className="inline-flex items-center gap-1 text-xs text-primary-text underline-offset-4 hover:underline"
          >
            <FileText aria-hidden className="size-3.5 shrink-0" />
            <span className="break-words">{i.title}</span>
            <span className="sr-only"> · {copy.instructionHint(i.title)}</span>
          </ExternalLink>
        </li>
      ))}
    </ul>
  );
}

/** El historial de intentos (resultado, quién, cuándo y la nota), con el reloj de la sede del control. */
function Attempts({ item, stamp }: { item: PostOpCheckItem; stamp: SedeStamp }) {
  const attempts = item.attempts ?? [];
  if (attempts.length === 0) return null;
  return (
    <ol className="mt-1 flex flex-col gap-1.5">
      {attempts.map((a) => (
        <li key={a.id} className="text-xs text-muted">
          <span className="block tabular-nums">
            {copy.attemptBy(POST_OP_OUTCOME_LABELS[a.outcome], a.byName, stamp.dateTime(a.at, item.locationId))}
          </span>
          {a.note ? <span className="line-clamp-3 block whitespace-pre-line break-words text-ink">{a.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * «Controles postoperatorios» (DX-566), desde la Agenda: los controles de hoy
 * y los vencidos de la sede activa, el más vencido primero. Toda la fila abre
 * la ficha; «Llamar» y «WhatsApp» son iconos en la tabla y van al «⋯» en el
 * teléfono. Los clínicos ven además el procedimiento, las indicaciones
 * entregadas y el historial de intentos, y registran el resultado; recepción
 * ve a quién llamar, sin el detalle clínico (la API ya lo manda a null).
 */
export function PostOpChecksView({ token }: { token: string }) {
  const router = useRouter();
  const role = getTokenRole(token);
  const canRegister = canRegisterPostOpOutcome(role);
  const isPhone = useMediaQuery(DATA_LIST_PHONE_QUERY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PostOpCheckPage | null>(null);
  const stamp = useSedeStamp(
    token,
    data?.items.map((r) => r.locationId),
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listPostOpChecks(token, { page });
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (res.items.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(err, { fallback: copy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, page, reloadKey]);

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

  function queuesChanged() {
    window.dispatchEvent(new Event(WORK_QUEUES_CHANGED_EVENT));
  }

  /** La fila se actualiza al momento (intentos) o sale (cerrado); luego se relee. */
  function handleSaved(item: PostOpCheckItem, check: PostOpCheck, outcome: PostOpAttemptOutcome) {
    const closed = check.status !== 'PENDING';
    setData((prev) => {
      if (!prev) return prev;
      return closed
        ? { ...prev, items: prev.items.filter((r) => r.id !== item.id), total: Math.max(0, prev.total - 1) }
        : {
            ...prev,
            items: prev.items.map((r) => (r.id === item.id ? { ...r, attemptsCount: check.attemptsCount } : r)),
          };
    });
    if (check.status === 'UNREACHABLE') setNotice(copy.unreachable(item.patientName));
    else if (closed) setNotice(copy.savedRecord(item.patientName));
    else setNotice(copy.savedAttempt(item.patientName, check.attemptsCount));
    queuesChanged();
    setReloadKey((k) => k + 1);
    if (outcome === 'NEEDS_APPOINTMENT' && check.status === 'DONE') setDialog({ kind: 'schedule', item });
    else setDialog(null);
  }

  function rowActions(item: PostOpCheckItem): RowAction[] {
    const actions: RowAction[] = [];
    const phone = item.patientPhone;
    if (isPhone && phone) {
      actions.push({
        label: copy.callAction(phone),
        icon: <Phone aria-hidden />,
        onSelect: () => {
          window.location.href = telHref(phone);
        },
      });
      const whatsapp = postOpWhatsAppHref(item, clinicName);
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
    if (canRegister) {
      actions.push({
        label: copy.register,
        icon: <NotebookPen aria-hidden />,
        separatorBefore: actions.length > 0,
        onSelect: () => setDialog({ kind: 'outcome', item }),
      });
    }
    if (isPhone && !item.clinicalHidden) {
      actions.push({
        label: copy.detail,
        icon: <ClipboardList aria-hidden />,
        onSelect: () => setDialog({ kind: 'detail', item }),
      });
    }
    actions.push({ label: copy.openRecord, onSelect: () => router.push(recordHref(item)) });
    return actions;
  }

  // Recepción no tiene columna de procedimiento: la API no se lo manda.
  const clinicalColumns = canRegister;

  const columns: DataListColumn<PostOpCheckItem>[] = [
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
      id: 'due',
      header: copy.colDue,
      mobile: 'trailing',
      headerClassName: 'whitespace-nowrap',
      cell: (r) => (
        <span className="block whitespace-nowrap tabular-nums">
          <span className={r.overdueDays > 0 ? 'block text-danger-text' : 'block'}>{postOpDueLabel(r.overdueDays)}</span>
          <span className="block text-xs text-muted">{stamp.civilDate(r.dueOn, r.locationId)}</span>
        </span>
      ),
      mobileCell: (r) => postOpDueLabel(r.overdueDays),
    },
    ...(clinicalColumns
      ? [
          {
            id: 'procedure',
            header: copy.colProcedure,
            cell: (r: PostOpCheckItem) =>
              r.clinicalHidden ? null : (
                <span className="block min-w-[10rem]">
                  <span className="block">{r.procedureName}</span>
                  <Instructions item={r} />
                </span>
              ),
            mobileCell: (r: PostOpCheckItem) => r.procedureName ?? null,
          } satisfies DataListColumn<PostOpCheckItem>,
        ]
      : []),
    {
      id: 'professional',
      header: copy.colProfessional,
      showFrom: 'md',
      cell: (r) => r.professionalName ?? <span className="text-muted">{copy.formerProfessional}</span>,
      mobileCell: (r) => r.professionalName ?? null,
    },
    {
      id: 'appointment',
      header: copy.colAppointment,
      showFrom: 'lg',
      cell: (r) =>
        r.appointmentStart ? (
          <span className="whitespace-nowrap tabular-nums">{stamp.dateTime(r.appointmentStart, r.locationId)}</span>
        ) : (
          <span className="text-muted">{copy.noAppointment}</span>
        ),
      mobileCell: () => null,
    },
    {
      id: 'attempts',
      header: copy.colAttempts,
      cell: (r) => (
        <span className="block min-w-[8rem]">
          <span className="block whitespace-nowrap">{postOpAttemptsLabel(r.attemptsCount)}</span>
          {r.clinicalHidden ? null : <Attempts item={r} stamp={stamp} />}
        </span>
      ),
      mobileCell: (r) => (r.attemptsCount > 0 ? postOpAttemptsLabel(r.attemptsCount) : null),
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
        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>
        <SedeStampNote stamp={stamp} />
        <AsyncSection
          loading={loading && !data}
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
            getRowKey={(r) => r.id}
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
      </div>

      {dialog?.kind === 'outcome' ? (
        <PostOpOutcomeDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog((d) => (d?.kind === 'outcome' ? null : d));
          }}
          token={token}
          item={dialog.item}
          onSaved={(check, outcome) => handleSaved(dialog.item, check, outcome)}
          onClosedElsewhere={(message) => {
            setDialog(null);
            notifyError(message);
            queuesChanged();
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
      {dialog?.kind === 'schedule' ? (
        <PostOpScheduleDialog
          token={token}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setNotice(copy.scheduled(dialog.item.patientName));
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'detail' ? (
        <Dialog open onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{copy.detailTitle(dialog.item.patientName)}</DialogTitle>
              <DialogDescription>
                {copy.detailDescription(dialog.item.procedureName, postOpDueLabel(dialog.item.overdueDays))}
              </DialogDescription>
            </DialogHeader>
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-ink">{copy.instructionsLabel}</h3>
              <Instructions item={dialog.item} />
            </section>
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-ink">{copy.colAttempts}</h3>
              <span className="text-sm">{postOpAttemptsLabel(dialog.item.attemptsCount)}</span>
              <Attempts item={dialog.item} stamp={stamp} />
            </section>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
