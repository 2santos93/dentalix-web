'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { CandidateRef, ExistingRecordRef } from '@/lib/api/api-error';
import { civilDateInZone, zonedDayStart } from '@/lib/format/date';
import { timeToIso } from '@/lib/dates/iso';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import type { Appointment } from '@/lib/appointments/appointments-api';
import {
  LEAD_CHANNEL_LABELS,
  LEAD_CHANNEL_ORDER,
  LEAD_NAME_MAX,
  LEAD_NEXT_ACTION_NOTE_MAX,
  LEAD_PHONE_INPUT_MAX,
  ambiguousCandidatesOf,
  convertLead,
  existingRecordHref,
  phoneTakenOf,
  splitLeadName,
  updateLead,
  type ConvertLeadResult,
  type Lead,
  type LeadChannel,
  type LeadDetail,
} from '@/lib/leads/leads-api';
import { Button } from '@/components/ui/button';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { FieldError } from '@/components/errors/field-error';
import { AsyncSection } from '@/components/shared/async-section';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { DatePicker } from '@/components/ui/date-picker';
import { TimeField } from '@/components/ui/date-field';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { phoneTakenMessage, leadCreateCopy } from './lead-create-dialog';
import { useLeadOwners, useLeadReasons } from './use-lead-catalogs';

// ── Editar ──────────────────────────────────────────────────────────────────

export const leadEditCopy = {
  title: 'Editar prospecto',
  description: 'Solo datos comerciales. El cambio queda en la auditoría.',
  owner: 'Responsable',
  noOwner: 'Sin responsable',
  ownersError: 'Responsables no disponibles',
  submit: 'Guardar',
  saveError: 'No pudimos guardar el prospecto. Intenta de nuevo.',
};

/** Editar nombre, teléfono (con el aviso del repetido), canal, motivo y responsable (PATCH). */
export function LeadEditDialog({
  open,
  onOpenChange,
  token,
  lead,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  lead: LeadDetail;
  onSaved: (lead: Lead) => void;
}) {
  const router = useRouter();
  const ids = { name: useId(), phone: useId(), channel: useId(), reason: useId(), owner: useId() };
  const reasons = useLeadReasons(token, 'INTEREST', open);
  const owners = useLeadOwners(token, open);
  const [name, setName] = useState(lead.fullName);
  const [phone, setPhone] = useState(lead.phone ?? '');
  const [channel, setChannel] = useState<LeadChannel>(lead.channel);
  const [reason, setReason] = useState(lead.interestReason ?? '');
  const [ownerId, setOwnerId] = useState(lead.ownerId ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingRecordRef | null>(null);
  const [saving, setSaving] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(lead.fullName);
      setPhone(lead.phone ?? '');
      setChannel(lead.channel);
      setReason(lead.interestReason ?? '');
      setOwnerId(lead.ownerId ?? '');
      setErrors({});
      setError(null);
      setExisting(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = leadCreateCopy.nameRequired;
    if (!phone.trim()) next.phone = leadCreateCopy.phoneRequired;
    setErrors(next);
    if (next.name || next.phone) return;
    setSaving(true);
    setError(null);
    setExisting(null);
    try {
      const body: Parameters<typeof updateLead>[2] = {};
      if (name.trim() !== lead.fullName) body.fullName = name.trim();
      if (phone.trim() !== (lead.phone ?? '')) body.phone = phone.trim();
      if (channel !== lead.channel) body.channel = channel;
      if ((reason || null) !== lead.interestReason) body.interestReason = reason || null;
      if ((ownerId || null) !== lead.ownerId) body.ownerId = ownerId || null;
      onSaved(await updateLead(token, lead.id, body));
    } catch (err) {
      const taken = phoneTakenOf(err);
      if (taken) {
        setExisting(taken);
        setError(phoneTakenMessage(taken));
      } else {
        setError(apiErrorMessage(err, { fallback: leadEditCopy.saveError }));
      }
    } finally {
      setSaving(false);
    }
  }

  const existingHref = existing ? existingRecordHref(existing) : null;
  // El motivo guardado sigue en la lista aunque se haya retirado del catálogo.
  const reasonNames = (reasons.items ?? []).map((r) => r.name);
  if (lead.interestReason && reasons.items && !reasonNames.includes(lead.interestReason)) {
    reasonNames.push(lead.interestReason);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={leadEditCopy.title}
      description={leadEditCopy.description}
      onSubmit={(e) => void submit(e)}
      submitLabel={leadEditCopy.submit}
      submitting={saving}
      error={error}
      errorAction={
        existing && existingHref
          ? {
              label: existing.kind === 'PATIENT' ? leadCreateCopy.openPatient : leadCreateCopy.openLead,
              onAction: () => {
                onOpenChange(false);
                router.push(existingHref);
              },
            }
          : null
      }
      touchTargets
      ownValidation
    >
      <FormField htmlFor={ids.name} label={leadCreateCopy.name} error={errors.name}>
        <Input
          id={ids.name}
          autoComplete="off"
          maxLength={LEAD_NAME_MAX}
          value={name}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField htmlFor={ids.phone} label={leadCreateCopy.phone} error={errors.phone} hint={leadCreateCopy.phoneHint}>
        <Input
          id={ids.phone}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={LEAD_PHONE_INPUT_MAX}
          value={phone}
          aria-invalid={errors.phone ? true : undefined}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={ids.channel} label={leadCreateCopy.channel}>
          <NativeSelect id={ids.channel} value={channel} onChange={(e) => setChannel(e.target.value as LeadChannel)}>
            {LEAD_CHANNEL_ORDER.map((c) => (
              <option key={c} value={c}>
                {LEAD_CHANNEL_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor={ids.reason} label={leadCreateCopy.reason}>
          {reasons.failed ? (
            <FieldError label={leadCreateCopy.reasonsError} onRetry={reasons.reload} retryId={ids.reason} />
          ) : (
            <NativeSelect
              id={ids.reason}
              value={reason}
              disabled={reasons.items === null}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">{leadCreateCopy.noReason}</option>
              {reasonNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      <FormField htmlFor={ids.owner} label={leadEditCopy.owner}>
        {owners.failed ? (
          <FieldError label={leadEditCopy.ownersError} onRetry={owners.reload} retryId={ids.owner} />
        ) : (
          <NativeSelect
            id={ids.owner}
            value={ownerId}
            disabled={owners.items === null}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">{leadEditCopy.noOwner}</option>
            {(owners.items ?? []).map((o) => (
              <option key={o.userId} value={o.userId}>
                {o.fullName}
              </option>
            ))}
            {lead.ownerId && owners.items && !owners.items.some((o) => o.userId === lead.ownerId) ? (
              <option value={lead.ownerId}>{lead.ownerName ?? leadEditCopy.owner}</option>
            ) : null}
          </NativeSelect>
        )}
      </FormField>
    </FormModal>
  );
}

// ── Próxima acción ──────────────────────────────────────────────────────────

export const leadNextActionCopy = {
  title: 'Próxima acción',
  description: 'Cuándo volver a contactar y para qué. Con una próxima acción pendiente, no sale en «sin contactar».',
  day: 'Día',
  time: 'Hora',
  note: 'Qué hacer',
  notePlaceholder: 'Enviar presupuesto de limpieza',
  noteHint: 'Solo datos comerciales: nunca síntomas, diagnósticos ni medicación.',
  dayRequired: 'Elige el día.',
  submit: 'Guardar',
  clear: 'Quitar próxima acción',
  saveError: 'No pudimos guardar la próxima acción. Intenta de nuevo.',
};

/** El día y la hora de un instante en la zona de la sede. */
function wallClock(iso: string, timeZone: string): { day: string | null; time: string | null } {
  const day = civilDateInZone(iso, timeZone);
  if (!day) return { day: null, time: null };
  const start = zonedDayStart(day, timeZone);
  if (!start) return { day, time: null };
  const minutes = Math.round((Date.parse(iso) - Date.parse(start)) / 60_000);
  return { day, time: timeToIso({ hour: Math.floor(minutes / 60) % 24, minute: minutes % 60 }) };
}

/**
 * El instante del día y la hora en la zona de la sede: el inicio del día más
 * los minutos de la hora (sin cambio de hora en la sede, exacto; con él, la
 * hora de reloj se desplaza una hora como mucho en ese día).
 */
export function zonedInstant(day: string, time: string, timeZone: string): string | null {
  const start = zonedDayStart(day, timeZone);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!start || !match) return null;
  return new Date(Date.parse(start) + (Number(match[1]) * 60 + Number(match[2])) * 60_000).toISOString();
}

export const DEFAULT_NEXT_ACTION_TIME = '09:00';

export function LeadNextActionDialog({
  open,
  onOpenChange,
  token,
  lead,
  timeZone,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  lead: Pick<LeadDetail, 'id' | 'nextActionAt' | 'nextActionNote'>;
  /** Zona de la sede del prospecto. */
  timeZone: string;
  onSaved: (lead: Lead) => void;
}) {
  const ids = { day: useId(), time: useId(), note: useId() };
  const initial = () =>
    lead.nextActionAt ? wallClock(lead.nextActionAt, timeZone) : { day: null, time: DEFAULT_NEXT_ACTION_TIME };
  const [day, setDay] = useState<string | null>(initial().day);
  const [time, setTime] = useState<string | null>(initial().time);
  const [note, setNote] = useState(lead.nextActionNote ?? '');
  const [dayError, setDayError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const v = initial();
      setDay(v.day);
      setTime(v.time);
      setNote(lead.nextActionNote ?? '');
      setDayError(null);
      setError(null);
    }
  }

  async function save(clear: boolean) {
    let nextActionAt: string | null = null;
    if (!clear) {
      nextActionAt = day ? zonedInstant(day, time ?? DEFAULT_NEXT_ACTION_TIME, timeZone) : null;
      if (!nextActionAt) {
        setDayError(leadNextActionCopy.dayRequired);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await updateLead(token, lead.id, {
          nextActionAt,
          nextActionNote: clear ? null : note.trim() || null,
        }),
      );
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: leadNextActionCopy.saveError }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={leadNextActionCopy.title}
      description={leadNextActionCopy.description}
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      submitLabel={leadNextActionCopy.submit}
      submitting={saving}
      error={error}
      touchTargets
      ownValidation
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={ids.day} label={leadNextActionCopy.day} error={dayError ?? undefined}>
          <DatePicker
            id={ids.day}
            value={day}
            isInvalid={Boolean(dayError)}
            onChange={(v) => {
              setDay(v);
              if (dayError) setDayError(null);
            }}
          />
        </FormField>
        <FormField htmlFor={ids.time} label={leadNextActionCopy.time}>
          <TimeField id={ids.time} value={time} onChange={setTime} />
        </FormField>
      </div>
      <FormField htmlFor={ids.note} label={leadNextActionCopy.note} hint={leadNextActionCopy.noteHint}>
        <Textarea
          id={ids.note}
          maxLength={LEAD_NEXT_ACTION_NOTE_MAX}
          placeholder={leadNextActionCopy.notePlaceholder}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-20"
        />
      </FormField>
      {lead.nextActionAt ? (
        <Button type="button" variant="link" disabled={saving} onClick={() => void save(true)} className="self-start">
          {leadNextActionCopy.clear}
        </Button>
      ) : null}
    </FormModal>
  );
}

// ── Convertir en paciente ───────────────────────────────────────────────────

export const leadConvertCopy = {
  title: 'Convertir en paciente',
  scheduleTitle: 'Agendar primera cita',
  description: (name: string) =>
    `Se crea la ficha de ${name} con su nombre y teléfono, sin datos clínicos. Si ya hay un paciente con ese teléfono, se enlaza con él.`,
  firstName: 'Nombre',
  lastName: 'Apellido',
  firstNameRequired: 'Escribe el nombre.',
  lastNameRequired: 'Escribe el apellido.',
  submit: 'Convertir en paciente',
  scheduleSubmit: 'Convertir y agendar',
  candidatesLegend: 'Hay varios pacientes con ese teléfono. ¿Con cuál se enlaza?',
  candidatesHint: 'Elige uno: el prospecto queda enlazado con esa ficha.',
  chooseCandidate: 'Elige con qué paciente enlazarlo.',
  linkSubmit: 'Enlazar con este paciente',
  saveError: 'No pudimos convertir el prospecto. Intenta de nuevo.',
};

/**
 * «Convertir en paciente» (idempotente en la API): nombre y apellido
 * prellenados partiendo el nombre (primera palabra / resto). Si hay varios
 * pacientes con su teléfono (409 `LEAD_AMBIGUOUS_PATIENTS`), se elige uno y
 * se reenvía con `patientId`.
 */
export function LeadConvertDialog({
  open,
  onOpenChange,
  token,
  lead,
  forSchedule = false,
  onConverted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  lead: Pick<Lead, 'id' | 'fullName'>;
  /** Viene de «Agendar primera cita»: tras convertir se abre la cita. */
  forSchedule?: boolean;
  onConverted: (result: ConvertLeadResult) => void;
}) {
  const ids = { first: useId(), last: useId(), candidates: useId() };
  const [firstName, setFirstName] = useState(() => splitLeadName(lead.fullName).firstName);
  const [lastName, setLastName] = useState(() => splitLeadName(lead.fullName).lastName);
  const [errors, setErrors] = useState<{ first?: string; last?: string; candidate?: string }>({});
  const [candidates, setCandidates] = useState<readonly CandidateRef[] | null>(null);
  const [patientId, setPatientId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const split = splitLeadName(lead.fullName);
      setFirstName(split.firstName);
      setLastName(split.lastName);
      setErrors({});
      setCandidates(null);
      setPatientId('');
      setError(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    if (candidates) {
      if (!patientId) next.candidate = leadConvertCopy.chooseCandidate;
    } else {
      if (!firstName.trim()) next.first = leadConvertCopy.firstNameRequired;
      if (!lastName.trim()) next.last = leadConvertCopy.lastNameRequired;
    }
    setErrors(next);
    if (next.first || next.last || next.candidate) return;
    setSaving(true);
    setError(null);
    try {
      const result = await convertLead(
        token,
        lead.id,
        candidates ? { patientId } : { firstName: firstName.trim(), lastName: lastName.trim() },
      );
      onConverted(result);
    } catch (err) {
      const found = ambiguousCandidatesOf(err);
      if (found && found.length > 0) {
        setCandidates(found);
        setPatientId('');
      } else {
        setError(apiErrorMessage(err, { fallback: leadConvertCopy.saveError }));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={forSchedule ? leadConvertCopy.scheduleTitle : leadConvertCopy.title}
      description={leadConvertCopy.description(lead.fullName)}
      onSubmit={(e) => void submit(e)}
      submitLabel={
        candidates ? leadConvertCopy.linkSubmit : forSchedule ? leadConvertCopy.scheduleSubmit : leadConvertCopy.submit
      }
      submitting={saving}
      error={error}
      touchTargets
      ownValidation
    >
      {candidates ? (
        <RadioGroup
          id={ids.candidates}
          legend={leadConvertCopy.candidatesLegend}
          hint={leadConvertCopy.candidatesHint}
          value={patientId}
          onValueChange={(v) => {
            setPatientId(v);
            if (errors.candidate) setErrors({});
          }}
          error={errors.candidate ?? null}
        >
          {candidates.map((c) => (
            <RadioOption key={c.id} value={c.id} label={c.name || c.id} />
          ))}
        </RadioGroup>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor={ids.first} label={leadConvertCopy.firstName} error={errors.first}>
            <Input
              id={ids.first}
              autoComplete="off"
              value={firstName}
              aria-invalid={errors.first ? true : undefined}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </FormField>
          <FormField htmlFor={ids.last} label={leadConvertCopy.lastName} error={errors.last}>
            <Input
              id={ids.last}
              autoComplete="off"
              value={lastName}
              aria-invalid={errors.last ? true : undefined}
              onChange={(e) => setLastName(e.target.value)}
            />
          </FormField>
        </div>
      )}
    </FormModal>
  );
}

// ── Agendar primera cita ────────────────────────────────────────────────────

export const leadScheduleCopy = {
  title: 'Agendar primera cita',
  description: (name: string) =>
    `Primera cita de ${name}. Al guardarla, el prospecto pasa solo a «Cita agendada»; cuando la cita se complete, a «Asistió».`,
  loadError: 'No pudimos cargar los datos del paciente.',
};

/**
 * El formulario de cita de siempre con el paciente ya puesto, la sede del
 * prospecto y su motivo de interés (como «Necesita cita» de los controles
 * postoperatorios). La API mueve la etapa al crear la cita.
 */
export function LeadScheduleDialog({
  token,
  lead,
  patientId,
  onClose,
  onCreated,
}: {
  token: string;
  lead: Pick<Lead, 'fullName' | 'locationId' | 'interestReason'>;
  patientId: string;
  onClose: () => void;
  onCreated: (appointment: Appointment) => void;
}) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPatient(token, patientId)
      .then((p) => {
        if (cancelled) return;
        setPatient(p);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: leadScheduleCopy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreenOnMobile className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{leadScheduleCopy.title}</DialogTitle>
          <DialogDescription>{leadScheduleCopy.description(lead.fullName)}</DialogDescription>
        </DialogHeader>
        <AsyncSection
          loading={!patient && !error}
          error={error}
          onRetry={() => {
            setError(null);
            setReloadKey((k) => k + 1);
          }}
          isEmpty={false}
          skeleton={<Skeleton className="h-64 w-full" />}
        >
          {patient ? (
            <AppointmentForm
              token={token}
              defaultPatient={patient}
              defaultReason={lead.interestReason ?? undefined}
              locationId={lead.locationId}
              onCreated={onCreated}
            />
          ) : null}
        </AsyncSection>
      </DialogContent>
    </Dialog>
  );
}
