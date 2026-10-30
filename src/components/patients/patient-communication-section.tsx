'use client';
import { PatientOptOutWarnings } from './patient-opt-out-warnings';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatDate } from '@/lib/format/date';
import {
  CHANNEL_LABELS,
  getPatientCommunication,
  OPT_IN_SOURCE_LABELS,
  OPT_OUT_SOURCE_LABELS,
  updatePatientCommunication,
  type ContactChannel,
  type PatientCommunication,
  type UpdatePatientCommunicationInput,
  type WhatsappOptInSource,
} from '@/lib/patients/communication-api';
import { phoneRegionLabel } from '@/lib/locations/phone-regions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { fieldClass } from '@/lib/ui/field-class';

// Copy as constants (i18n-ready) — es first, matches the rest of the app.
const copy = {
  heading: 'Comunicaciones',
  loading: 'Cargando comunicaciones',
  loadError: 'No pudimos cargar las comunicaciones del paciente.',
  edit: 'Editar comunicaciones',
  channel: 'Canal de los recordatorios',
  clinicDefault: 'por defecto de la clínica',
  mobile: 'Móvil',
  noMobile: 'Sin móvil registrado',
  mobileValid: 'Móvil válido',
  mobileInvalid: 'Móvil no válido',
  mobileInvalidHint: 'No sirve para WhatsApp: revisa el número o escríbelo con + y su indicativo.',
  // DX-329 (C1): los dígitos admiten dos lecturas válidas distintas; la API no elige ninguna.
  mobileAmbiguousHint: 'Ese número se puede leer de dos formas. Escríbelo con + y el prefijo del país.',
  email: 'Correo',
  noEmail: 'Sin correo',
  noEmailHint: 'Con canal Email y sin correo no le llegan los recordatorios.',
  whatsapp: 'WhatsApp',
  optIn: (at: string, source: string, by: string | null) =>
    `Aceptó el ${at} · ${source}${by ? ` · lo registró ${by}` : ''}`,
  noOptIn: 'Sin aceptación registrada',
  reminders: 'Recordatorios automáticos',
  remindersActive: 'Activos',
  optedOut: (at: string, source: string) => `Dado de baja el ${at}, ${source}`,
  whatsappManual:
    'Mientras la clínica no tenga WhatsApp automático, el recordatorio se envía a mano con «Abrir WhatsApp» desde la cita.',
  modalTitle: 'Comunicaciones del paciente',
  modalDescription:
    'Canal de los avisos automáticos de las citas. No es la autorización de marketing. Cada cambio queda en la auditoría con quién lo hizo.',
  mobileHint: (region: string | null) =>
    region
      ? `Sin + se usa el prefijo de la sede: ${region}. Se guarda en formato internacional.`
      : 'Escríbelo con + y el prefijo del país.',
  mobileRequired: 'Para elegir WhatsApp escribe el móvil del paciente.',
  optInLabel: 'Acepta que la clínica le escriba por WhatsApp',
  optInHint: 'Regístralo solo si el paciente lo aceptó. Se guarda la fecha, el origen y quién lo anotó.',
  optInSource: '¿Dónde lo aceptó?',
  optOutLabel: 'Dado de baja de los recordatorios automáticos',
  optOutHint: 'Márcalo si el paciente pidió no recibir más recordatorios; desmárcalo para reactivarlos.',
  saveError: 'No pudimos guardar las comunicaciones.',
  // DX-203: un menor o un paciente sin email, a su responsable.
  recipient: 'Destinatario de los avisos',
  recipientResponsible: (name: string | null, email: string | null, minor: boolean) =>
    `Su responsable${name ? `, ${name}` : ''}${email ? ` (${email})` : ''}${minor ? ' · menor de edad' : ' · sin email propio'}`,
  recipientGuardian: (name: string | null) =>
    `Al correo de la ficha, saludando a su responsable${name ? ` ${name}` : ''} (menor de edad; el responsable no tiene email)`,
  recipientContact: (name: string | null) =>
    `Su contacto principal${name ? `, ${name}` : ''} (menor de edad)`,
  recipientMinorAlone:
    'El paciente: es menor de edad y no tiene responsable ni contacto registrado',
};

function recipientLabel(recipient: PatientCommunication['recipient']): string {
  if (recipient.kind === 'RESPONSIBLE') {
    return copy.recipientResponsible(recipient.name, recipient.email, recipient.minor);
  }
  if (recipient.kind === 'GUARDIAN') return copy.recipientGuardian(recipient.name);
  if (recipient.kind === 'CONTACT') return copy.recipientContact(recipient.name);
  return copy.recipientMinorAlone;
}

const CHANNELS: ContactChannel[] = ['EMAIL', 'WHATSAPP', 'NONE'];
const SOURCES: WhatsappOptInSource[] = ['IN_PERSON', 'LINK', 'MESSAGE'];

interface Draft {
  channel: ContactChannel;
  phone: string;
  optIn: boolean;
  optInSource: WhatsappOptInSource;
  optOut: boolean;
}

function draftFrom(data: PatientCommunication): Draft {
  return {
    channel: data.contactChannel,
    phone: data.phone ?? '',
    optIn: data.whatsappOptIn !== null,
    optInSource: data.whatsappOptIn?.source ?? 'IN_PERSON',
    optOut: data.reminderOptOut !== null,
  };
}

/** Solo lo que cambió: la auditoría registra los campos enviados que cambian. */
function changesOf(data: PatientCommunication, draft: Draft): UpdatePatientCommunicationInput {
  const input: UpdatePatientCommunicationInput = {};
  if (draft.channel !== data.contactChannel) input.contactChannel = draft.channel;
  if (draft.phone.trim() !== (data.phone ?? '')) input.phone = draft.phone.trim() || null;
  if (draft.optIn !== (data.whatsappOptIn !== null)) {
    input.whatsappOptIn = draft.optIn;
    if (draft.optIn) input.whatsappOptInSource = draft.optInSource;
  }
  if (draft.optOut !== (data.reminderOptOut !== null)) input.reminderOptOut = draft.optOut;
  return input;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

interface PatientCommunicationSectionProps {
  token: string;
  patientId: string;
  /** Recepción y ADMIN; el profesional lo ve en solo lectura (la API también lo exige). */
  canEdit: boolean;
  /**
   * Tras guardar: la ficha actualiza su copia del paciente (el teléfono que
   * muestra «Datos» y el que siembra «Editar» salen de ahí).
   */
  onChanged?: (communication: PatientCommunication) => void;
}

/**
 * Bloque «Comunicaciones» de la ficha (DX-128): canal de los recordatorios
 * automáticos, móvil validado con el prefijo por defecto de la sede, opt-in de WhatsApp y baja
 * de recordatorios. Carga lo suyo (skeleton → error con reintento → datos);
 * la edición va en un modal, solo para recepción y ADMIN.
 */
export function PatientCommunicationSection({
  token,
  patientId,
  canEdit,
  onChanged,
}: PatientCommunicationSectionProps) {
  const ids = useId();
  const [data, setData] = useState<PatientCommunication | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPatientCommunication(token, patientId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, { fallback: copy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  function openEditor() {
    if (!data) return;
    setDraft(draftFrom(data));
    setPhoneError(null);
    setSaveError(null);
  }

  function close(isOpen: boolean) {
    if (!isOpen && !saving) setDraft(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !draft) return;
    const needsMobile = (draft.channel === 'WHATSAPP' || draft.optIn) && !draft.phone.trim();
    setPhoneError(needsMobile ? copy.mobileRequired : null);
    if (needsMobile) return;
    const input = changesOf(data, draft);
    if (Object.keys(input).length === 0) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updatePatientCommunication(token, patientId, input);
      setData(saved);
      setDraft(null);
      onChanged?.(saved);
    } catch (err) {
      setSaveError(apiErrorMessage(err, { fallback: copy.saveError }));
    } finally {
      setSaving(false);
    }
  }

  function content() {
    if (loadError) {
      return (
        <SectionError
          description={loadError}
          onRetry={() => {
            setLoadError(null);
            setData(null);
            setReloadKey((k) => k + 1);
          }}
          className="py-8"
        />
      );
    }
    if (!data) {
      return (
        <div role="status" aria-label={copy.loading} className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }
    const optIn = data.whatsappOptIn;
    const optOut = data.reminderOptOut;
    return (
      <>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Row label={copy.channel}>
            <span className="font-medium">{CHANNEL_LABELS[data.contactChannel]}</span>
            {data.contactChannel === data.clinicDefaultChannel ? (
              <span className="text-sm text-muted"> · {copy.clinicDefault}</span>
            ) : null}
          </Row>
          <Row label={copy.mobile}>
            {data.phoneStatus === 'MISSING' ? (
              <span className="text-muted">{copy.noMobile}</span>
            ) : (
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums">{data.phoneInternational ?? data.phone}</span>
                  <Badge variant={data.phoneStatus === 'VALID' ? 'success' : 'warning'}>
                    {data.phoneStatus === 'VALID' ? copy.mobileValid : copy.mobileInvalid}
                  </Badge>
                </span>
                {data.phoneStatus === 'INVALID' ? (
                  <span className="text-sm text-muted">
                    {data.phoneAmbiguous ? copy.mobileAmbiguousHint : copy.mobileInvalidHint}
                  </span>
                ) : null}
              </span>
            )}
          </Row>
          <Row label={copy.email}>
            {data.email ? (
              <span>{data.email}</span>
            ) : (
              <span className="flex flex-col gap-1">
                <span className="text-muted">{copy.noEmail}</span>
                {data.contactChannel === 'EMAIL' ? (
                  <span className="text-sm text-muted">{copy.noEmailHint}</span>
                ) : null}
              </span>
            )}
          </Row>
          <Row label={copy.whatsapp}>
            {optIn ? (
              <span className="tabular-nums">
                {copy.optIn(
                  formatDate(optIn.at),
                  OPT_IN_SOURCE_LABELS[optIn.source],
                  optIn.recordedBy?.fullName ?? null,
                )}
              </span>
            ) : (
              <span className="text-muted">{copy.noOptIn}</span>
            )}
          </Row>
          {data.recipient.minor || data.recipient.kind === 'RESPONSIBLE' ? (
            <Row label={copy.recipient}>{recipientLabel(data.recipient)}</Row>
          ) : null}
          <Row label={copy.reminders}>
            {optOut ? (
              <Badge variant="warning" className="whitespace-normal tabular-nums">
                {copy.optedOut(formatDate(optOut.at), OPT_OUT_SOURCE_LABELS[optOut.source])}
              </Badge>
            ) : (
              <span>{copy.remindersActive}</span>
            )}
          </Row>
        </dl>
        {canEdit ? <PatientOptOutWarnings token={token} patientId={patientId} /> : null}
        {data.contactChannel === 'WHATSAPP' && !optOut ? (
          <p className="flex items-start gap-2 text-sm text-muted">
            <MessageCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {copy.whatsappManual}
          </p>
        ) : null}
      </>
    );
  }

  const phoneRegion = phoneRegionLabel(data?.phoneCountry ?? null);
  const alreadyOptedIn = data?.whatsappOptIn !== null && data?.whatsappOptIn !== undefined;

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${ids}-heading`} className="text-base font-semibold text-ink">
          {copy.heading}
        </h3>
        {canEdit && data ? (
          <Button type="button" variant="secondary" size="sm" onClick={openEditor}>
            {copy.edit}
          </Button>
        ) : null}
      </div>
      {content()}

      {draft ? (
        <FormModal
          open
          onOpenChange={close}
          title={copy.modalTitle}
          description={copy.modalDescription}
          onSubmit={(e) => void submit(e)}
          submitting={saving}
          error={saveError}
        >
          <FormField htmlFor={`${ids}-channel`} label={copy.channel}>
            <select
              id={`${ids}-channel`}
              name="contactChannel"
              value={draft.channel}
              onChange={(e) => setDraft({ ...draft, channel: e.target.value as ContactChannel })}
              className={fieldClass}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            htmlFor={`${ids}-phone`}
            label={copy.mobile}
            hint={copy.mobileHint(phoneRegion)}
            error={phoneError}
          >
            <Input
              id={`${ids}-phone`}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={40}
              value={draft.phone}
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? fieldErrorId(`${ids}-phone`) : undefined}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </FormField>

          <div className="flex items-start gap-3">
            <input
              id={`${ids}-optin`}
              type="checkbox"
              checked={draft.optIn}
              onChange={(e) => setDraft({ ...draft, optIn: e.target.checked })}
              aria-describedby={`${ids}-optin-hint`}
              className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
            />
            <div className="flex flex-col gap-0.5">
              <label htmlFor={`${ids}-optin`} className="text-sm font-medium text-ink">
                {copy.optInLabel}
              </label>
              <p id={`${ids}-optin-hint`} className="text-xs text-muted">
                {copy.optInHint}
              </p>
            </div>
          </div>

          {draft.optIn && !alreadyOptedIn ? (
            <FormField htmlFor={`${ids}-source`} label={copy.optInSource}>
              <select
                id={`${ids}-source`}
                name="whatsappOptInSource"
                value={draft.optInSource}
                onChange={(e) =>
                  setDraft({ ...draft, optInSource: e.target.value as WhatsappOptInSource })
                }
                className={fieldClass}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {OPT_IN_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}

          <div className="flex items-start gap-3">
            <input
              id={`${ids}-optout`}
              type="checkbox"
              checked={draft.optOut}
              onChange={(e) => setDraft({ ...draft, optOut: e.target.checked })}
              aria-describedby={`${ids}-optout-hint`}
              className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
            />
            <div className="flex flex-col gap-0.5">
              <label htmlFor={`${ids}-optout`} className="text-sm font-medium text-ink">
                {copy.optOutLabel}
              </label>
              <p id={`${ids}-optout-hint`} className="text-xs text-muted">
                {copy.optOutHint}
              </p>
            </div>
          </div>
        </FormModal>
      ) : null}
    </section>
  );
}
