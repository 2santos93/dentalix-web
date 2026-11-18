'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, MessageCircle, Phone, UserCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { telHref } from '@/lib/receivables/presentation';
import { statusLabel } from '@/lib/status/tones';
import {
  LEADS_HREF,
  LEAD_NOTE_MAX,
  addLeadNote,
  canScheduleFirstAppointment,
  getLead,
  leadWhatsAppHref,
  manualStageTargets,
  type ConvertLeadResult,
  type LeadDetail,
  type LeadStage,
} from '@/lib/leads/leads-api';
import { WORK_QUEUES_CHANGED_EVENT } from '@/components/work-queues/work-queues-context';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { SectionError } from '@/components/errors/section-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { SectionSkeleton } from '@/components/shared/async-section';
import { ExternalLink } from '@/components/shared/external-link';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { LEAD_CHANNEL_LABELS } from '@/lib/leads/leads-api';
import { LeadLostDialog, leadStageCopy, moveLeadStage } from './lead-lost-dialog';
import { LeadConvertDialog, LeadEditDialog, LeadNextActionDialog, LeadScheduleDialog } from './lead-dialogs';

export const leadDetailCopy = {
  back: 'Prospectos',
  loadError: 'No pudimos cargar el prospecto.',
  converted: 'Ya es paciente',
  anonymizedTitle: 'Prospecto anonimizado',
  anonymizedHint:
    'Pasó el plazo de conservación de los prospectos perdidos: su nombre, teléfono y notas se borraron. Queda solo para el informe.',
  data: 'Datos',
  edit: 'Editar',
  phone: 'Teléfono',
  noPhone: 'Sin teléfono',
  call: 'Llamar',
  callLabel: (name: string) => `Llamar a ${name}`,
  whatsapp: 'WhatsApp',
  whatsappLabel: (name: string) => `Escribir a ${name} por WhatsApp`,
  channel: 'Canal',
  interest: 'Motivo de interés',
  none: 'Sin indicar',
  sede: 'Sede',
  owner: 'Responsable',
  noOwner: 'Sin responsable',
  created: 'Alta',
  lastContact: 'Último contacto',
  noContact: 'Sin contacto aún',
  lostReason: 'Motivo de pérdida',
  follow: 'Seguimiento',
  followHint: '«Cita agendada» y «Asistió» los pone la cita: agenda la primera cita desde aquí.',
  stage: 'Etapa',
  staleBadge: 'Sin contactar +24 h',
  nextAction: 'Próxima acción',
  noNextAction: 'Sin próxima acción',
  setNextAction: 'Programar',
  changeNextAction: 'Cambiar',
  patientTitle: 'Paciente',
  patientHint: 'Al convertirlo se crea su ficha (o se enlaza con la que ya tiene su teléfono).',
  convert: 'Convertir en paciente',
  schedule: 'Agendar primera cita',
  openPatient: 'Abrir la ficha del paciente',
  firstAppointment: 'Primera cita',
  notes: 'Notas',
  notesHint: 'Solo de añadir: quedan con su autor y su fecha.',
  noteLabel: 'Nueva nota',
  notePlaceholder: 'Pidió el precio de la limpieza; prefiere que le escriban por la tarde.',
  noteWarning: 'Solo datos comerciales. No anotes síntomas, diagnósticos ni medicación: eso va en la historia clínica.',
  noteRequired: 'Escribe la nota.',
  addNote: 'Añadir nota',
  noteError: 'No pudimos añadir la nota. Intenta de nuevo.',
  noteAdded: 'Nota añadida. Cuenta como contacto.',
  noNotes: 'Sin notas todavía.',
  noteBy: (who: string, when: string) => `${who} · ${when}`,
  formerUser: 'Usuario retirado',
  saved: 'Prospecto guardado.',
  convertedNew: (name: string) => `Ficha de ${name} creada.`,
  convertedLinked: (name: string) => `${name} quedó enlazado con la ficha que ya tenía su teléfono.`,
  scheduled: (name: string) => `Primera cita de ${name} agendada: el prospecto pasa a «Cita agendada».`,
  remaining: (n: number) => `Quedan ${n} caracteres`,
};
const copy = leadDetailCopy;

type DialogState =
  | { kind: 'edit' }
  | { kind: 'next' }
  | { kind: 'lost' }
  | { kind: 'convert'; forSchedule: boolean }
  | { kind: 'schedule'; patientId: string }
  | null;

function queuesChanged() {
  window.dispatchEvent(new Event(WORK_QUEUES_CHANGED_EVENT));
}

/**
 * La ficha del prospecto (DX-556): datos, seguimiento (etapa a mano salvo las
 * que pone la cita, responsable y próxima acción), conversión en paciente,
 * primera cita y notas solo de añadir. Anonimizado: solo lectura.
 */
export function LeadDetailView({ token, leadId }: { token: string; leadId: string }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [moving, setMoving] = useState<LeadStage | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const noteId = useId();
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  // Con la ficha ya en pantalla, un fallo al releer es de fondo (escalón 3).
  const shownRef = useRef(false);
  const stamp = useSedeStamp(token, lead ? [lead.locationId] : []);

  useEffect(() => {
    let cancelled = false;
    getLead(token, leadId)
      .then((res) => {
        if (cancelled) return;
        shownRef.current = true;
        setLead(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = apiErrorMessage(err, { fallback: copy.loadError });
        if (shownRef.current) notifyError(message, { onRetry: reload });
        else setLoadError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, leadId, reloadKey, reload]);

  async function move(to: LeadStage) {
    if (!lead) return;
    if (to === 'LOST') {
      setDialog({ kind: 'lost' });
      return;
    }
    setMoving(to);
    await moveLeadStage(token, lead, to, () => {
      queuesChanged();
      reload();
    });
    setMoving(null);
  }

  if (loadError && !lead) {
    return (
      <>
        <PageHeader title={copy.back} back={{ href: LEADS_HREF, label: copy.back }} />
        <SectionError
          description={loadError}
          onRetry={() => {
            setLoadError(null);
            reload();
          }}
        />
      </>
    );
  }
  if (!lead) return <SectionSkeleton />;

  const readOnly = lead.anonymized;
  const whatsapp = leadWhatsAppHref(lead.whatsAppDigits);
  const targets = readOnly ? [] : manualStageTargets(lead.stage);
  const canSchedule = canScheduleFirstAppointment(lead);
  const patientHref = lead.convertedPatientId ? `/patients/${encodeURIComponent(lead.convertedPatientId)}` : null;
  const timeZone = stamp.clock?.of(lead.locationId)?.timeZone ?? null;

  async function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead) return;
    if (!note.trim()) {
      setNoteError(copy.noteRequired);
      return;
    }
    setSavingNote(true);
    setNoteError(null);
    try {
      await addLeadNote(token, lead.id, note.trim());
      setNote('');
      notifySuccess(copy.noteAdded);
      queuesChanged();
      reload();
    } catch (err) {
      setNoteError(apiErrorMessage(err, { fallback: copy.noteError }));
    } finally {
      setSavingNote(false);
    }
  }

  function afterConvert(result: ConvertLeadResult, forSchedule: boolean) {
    if (!lead) return;
    notifySuccess(result.created ? copy.convertedNew(lead.fullName) : copy.convertedLinked(lead.fullName));
    setDialog(forSchedule ? { kind: 'schedule', patientId: result.patientId } : null);
    reload();
  }

  function scheduleFirst() {
    if (!lead) return;
    setDialog(
      lead.convertedPatientId
        ? { kind: 'schedule', patientId: lead.convertedPatientId }
        : { kind: 'convert', forSchedule: true },
    );
  }

  const headerAction = readOnly ? null : canSchedule ? (
    <Button type="button" onClick={scheduleFirst}>
      <CalendarPlus aria-hidden />
      {copy.schedule}
    </Button>
  ) : patientHref ? (
    <Button asChild variant="secondary">
      <Link href={patientHref}>
        <UserCheck aria-hidden />
        {copy.openPatient}
      </Link>
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title={lead.fullName}
        back={{ href: LEADS_HREF, label: copy.back }}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="lead" status={lead.stage} />
            {lead.convertedPatientId ? <Badge variant="neutral">{copy.converted}</Badge> : null}
            {lead.stale ? <Badge variant="warning">{copy.staleBadge}</Badge> : null}
          </span>
        }
        actions={headerAction}
      />
      <div className="flex max-w-3xl flex-col gap-10">
        <SedeStampNote stamp={stamp} />
        {readOnly ? (
          <Callout tone="neutral" title={copy.anonymizedTitle}>
            {copy.anonymizedHint}
          </Callout>
        ) : null}

        <section aria-labelledby="lead-data" className="flex flex-col gap-4">
          <SectionHeader
            title={copy.data}
            titleId="lead-data"
            actions={
              readOnly ? null : (
                <Button type="button" variant="secondary" onClick={() => setDialog({ kind: 'edit' })}>
                  {copy.edit}
                </Button>
              )
            }
          />
          <DescriptionList columns={2}>
            <DescriptionItem label={copy.phone} numeric>
              {lead.phone ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span>{lead.phone}</span>
                  <Button asChild variant="secondary" size="sm">
                    <a href={telHref(lead.phone)} aria-label={copy.callLabel(lead.fullName)}>
                      <Phone aria-hidden />
                      {copy.call}
                    </a>
                  </Button>
                  {whatsapp ? (
                    <Button asChild variant="secondary" size="sm">
                      <ExternalLink href={whatsapp} aria-label={copy.whatsappLabel(lead.fullName)}>
                        <MessageCircle aria-hidden />
                        {copy.whatsapp}
                      </ExternalLink>
                    </Button>
                  ) : null}
                </span>
              ) : (
                <span className="text-muted">{copy.noPhone}</span>
              )}
            </DescriptionItem>
            <DescriptionItem label={copy.channel}>{LEAD_CHANNEL_LABELS[lead.channel]}</DescriptionItem>
            <DescriptionItem label={copy.interest}>
              {lead.interestReason ?? <span className="text-muted">{copy.none}</span>}
            </DescriptionItem>
            <DescriptionItem label={copy.sede}>{lead.locationName}</DescriptionItem>
            <DescriptionItem label={copy.created} numeric>
              {stamp.dateTime(lead.createdAt, lead.locationId)}
            </DescriptionItem>
            <DescriptionItem label={copy.lastContact} numeric>
              {lead.lastContactAt ? (
                stamp.dateTime(lead.lastContactAt, lead.locationId)
              ) : (
                <span className="text-muted">{copy.noContact}</span>
              )}
            </DescriptionItem>
          </DescriptionList>
        </section>

        <section aria-labelledby="lead-follow" className="flex flex-col gap-4">
          <SectionHeader
            title={copy.follow}
            titleId="lead-follow"
            description={readOnly ? undefined : copy.followHint}
          />
          <DescriptionList columns={2}>
            <DescriptionItem label={copy.stage}>
              <StatusBadge kind="lead" status={lead.stage} />
            </DescriptionItem>
            <DescriptionItem label={copy.owner}>
              {lead.ownerName ?? <span className="text-muted">{copy.noOwner}</span>}
            </DescriptionItem>
            {lead.stage === 'LOST' && lead.lostReason ? (
              <DescriptionItem label={copy.lostReason}>{lead.lostReason}</DescriptionItem>
            ) : null}
            <DescriptionItem label={copy.nextAction} wide>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {lead.nextActionAt ? (
                  <span>
                    <span className="tabular-nums">{stamp.dateTime(lead.nextActionAt, lead.locationId)}</span>
                    {lead.nextActionNote ? (
                      <span className="block text-sm text-muted [overflow-wrap:anywhere]">{lead.nextActionNote}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted">{copy.noNextAction}</span>
                )}
                {readOnly || !timeZone ? null : (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setDialog({ kind: 'next' })}>
                    {lead.nextActionAt ? copy.changeNextAction : copy.setNextAction}
                  </Button>
                )}
              </span>
            </DescriptionItem>
          </DescriptionList>
          {targets.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {targets.map((to) => (
                <Button
                  key={to}
                  type="button"
                  variant={to === 'LOST' ? 'destructive-ghost' : 'secondary'}
                  loading={moving === to}
                  disabled={moving !== null}
                  onClick={() => void move(to)}
                >
                  {leadStageCopy.moveTo(lead.stage, to)}
                </Button>
              ))}
            </div>
          ) : null}
        </section>

        {readOnly ? null : (
          <section aria-labelledby="lead-patient" className="flex flex-col gap-3">
            <SectionHeader
              title={copy.patientTitle}
              titleId="lead-patient"
              description={patientHref ? undefined : copy.patientHint}
            />
            {patientHref ? (
              <p className="flex flex-wrap items-center gap-3 text-sm">
                <Link href={patientHref} className="text-primary-text underline-offset-4 hover:underline">
                  {copy.openPatient}
                </Link>
                {lead.convertedAt ? (
                  <span className="text-muted tabular-nums">{stamp.dateTime(lead.convertedAt, lead.locationId)}</span>
                ) : null}
              </p>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="self-start max-sm:w-full"
                onClick={() => setDialog({ kind: 'convert', forSchedule: false })}
              >
                <UserCheck aria-hidden />
                {copy.convert}
              </Button>
            )}
          </section>
        )}

        <section aria-labelledby="lead-notes" className="flex flex-col gap-4">
          <SectionHeader title={copy.notes} titleId="lead-notes" description={copy.notesHint} />
          {readOnly ? null : (
            <form noValidate onSubmit={(e) => void submitNote(e)} className="flex flex-col gap-2">
              <Callout tone="warning">{copy.noteWarning}</Callout>
              <FormField htmlFor={noteId} label={copy.noteLabel} hint={copy.remaining(LEAD_NOTE_MAX - note.length)}>
                <Textarea
                  id={noteId}
                  autoGrow
                  maxLength={LEAD_NOTE_MAX}
                  placeholder={copy.notePlaceholder}
                  value={note}
                  aria-invalid={noteError ? true : undefined}
                  aria-describedby={noteError ? fieldErrorId(noteId) : undefined}
                  onChange={(e) => {
                    setNote(e.target.value);
                    if (noteError) setNoteError(null);
                  }}
                  className="max-h-60"
                />
              </FormField>
              {noteError ? <InlineError id={fieldErrorId(noteId)}>{noteError}</InlineError> : null}
              <Button type="submit" variant="secondary" loading={savingNote} className="self-start max-sm:w-full">
                {copy.addNote}
              </Button>
            </form>
          )}
          {lead.notes.length === 0 ? (
            <p className="text-sm text-muted">{copy.noNotes}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
              {lead.notes.map((n) => (
                <li key={n.id} className="flex flex-col gap-1 py-3">
                  <span className="text-xs text-muted tabular-nums">
                    {copy.noteBy(n.authorName ?? copy.formerUser, stamp.dateTime(n.createdAt, lead.locationId))}
                  </span>
                  <p className="whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">{n.body}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <LeadEditDialog
        open={dialog?.kind === 'edit'}
        onOpenChange={(open) => !open && setDialog(null)}
        token={token}
        lead={lead}
        onSaved={() => {
          setDialog(null);
          notifySuccess(copy.saved);
          reload();
        }}
      />
      {timeZone ? (
        <LeadNextActionDialog
          open={dialog?.kind === 'next'}
          onOpenChange={(open) => !open && setDialog(null)}
          token={token}
          lead={lead}
          timeZone={timeZone}
          onSaved={() => {
            setDialog(null);
            notifySuccess(copy.saved);
            queuesChanged();
            reload();
          }}
        />
      ) : null}
      <LeadLostDialog
        open={dialog?.kind === 'lost'}
        onOpenChange={(open) => !open && setDialog(null)}
        token={token}
        lead={lead}
        onSaved={() => {
          setDialog(null);
          notifySuccess(leadStageCopy.moved(lead.fullName, statusLabel('lead', 'LOST')));
          queuesChanged();
          reload();
        }}
      />
      <LeadConvertDialog
        open={dialog?.kind === 'convert'}
        onOpenChange={(open) => !open && setDialog(null)}
        token={token}
        lead={lead}
        forSchedule={dialog?.kind === 'convert' && dialog.forSchedule}
        onConverted={(result) => afterConvert(result, dialog?.kind === 'convert' && dialog.forSchedule)}
      />
      {dialog?.kind === 'schedule' ? (
        <LeadScheduleDialog
          token={token}
          lead={lead}
          patientId={dialog.patientId}
          onClose={() => {
            setDialog(null);
            reload();
          }}
          onCreated={() => {
            setDialog(null);
            notifySuccess(copy.scheduled(lead.fullName));
            queuesChanged();
            reload();
          }}
        />
      ) : null}
    </>
  );
}
