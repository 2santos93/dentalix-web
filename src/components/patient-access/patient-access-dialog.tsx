'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import {
  PATIENT_ACCESS_DEFAULT_TTL,
  PATIENT_ACCESS_SCOPES,
  PATIENT_ACCESS_SCOPE_LABELS,
  PATIENT_ACCESS_TTL_OPTIONS,
  createPatientAccessLink,
  listPatientAccessLinks,
  revokePatientAccessLink,
  type AccessLink,
  type CreatedAccessLink,
  type PatientAccessScope,
} from '@/lib/patient-access/patient-access-api';
import { FormModal } from '@/components/shared/form-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ExternalLink } from '@/components/shared/external-link';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldErrorId } from '@/components/shared/form-field';
import { PATIENT_ACCESS_ACTION } from './patient-access-action';

export const patientAccessCopy = {
  title: PATIENT_ACCESS_ACTION,
  description:
    'El paciente abre el enlace con su fecha de nacimiento y consulta lo que elijas, sin poder cambiar nada (solo confirmar sus citas).',
  scopes: 'Qué verá',
  scopeHints: {
    APPOINTMENTS: 'Sus próximas citas, con la opción de confirmarlas.',
    PLANS: 'Los presupuestos presentados o aceptados, con su PDF.',
    ACCOUNT: 'Su estado de cuenta: saldo, cuotas y abonos.',
  } satisfies Record<PatientAccessScope, string>,
  scopesRequired: 'Elige al menos un apartado.',
  ttl: 'Validez del enlace',
  ttlOption: (days: number) => `${days} días`,
  ttlHint: 'Pasado ese plazo el enlace deja de funcionar. Puedes revocarlo antes.',
  submit: 'Crear enlace',
  close: 'Cerrar',
  genericError: 'No pudimos crear el enlace. Intenta de nuevo.',
  editPatient: 'Editar la ficha',
  linkLabel: 'Enlace para el paciente',
  onlyOnce: 'Copia el enlace ahora: no se podrá volver a ver.',
  expires: (when: string) => `Caduca el ${when}.`,
  copyLink: 'Copiar',
  copied: 'Enlace copiado',
  copyFailed: 'No pudimos copiar automáticamente: cópialo a mano desde el campo.',
  whatsapp: 'Abrir WhatsApp',
  noPhone: 'El paciente no tiene un teléfono válido para WhatsApp: copia el enlace y envíalo por otro medio.',
  minor:
    'Paciente menor de edad: envía el enlace a su responsable. Los datos del responsable en el portal llegarán más adelante.',
  listHeading: 'Enlaces activos',
  listEmpty: 'No tiene enlaces activos.',
  listError: 'No pudimos cargar los enlaces',
  listLoading: 'Cargando los enlaces activos…',
  createdBy: (name: string, when: string) => `Creado por ${name} el ${when}`,
  formerMember: 'un miembro que ya no está',
  expiresOn: (when: string) => `Caduca el ${when}`,
  lastViewed: (when: string) => `Último acceso: ${when}`,
  neverOpened: 'Nunca abierto',
  lockedUntil: (when: string) => `Bloqueado hasta ${when}`,
  revoke: 'Revocar',
  revokeLabel: (scopes: string, when: string) => `Revocar el enlace de ${scopes} creado el ${when}`,
  revokeTitle: '¿Revocar este enlace?',
  revokeDescription:
    'El paciente dejará de poder abrirlo al instante, también si lo tiene abierto ahora. No se puede deshacer: para volver a compartir, crea uno nuevo.',
  revokeConfirm: 'Revocar enlace',
  revokeCancel: 'Volver',
  revokeError: 'No pudimos revocar el enlace.',
  revoked: 'Enlace revocado.',
};
const copy = patientAccessCopy;

export function scopesLabel(scopes: readonly PatientAccessScope[]): string {
  return scopes.map((s) => PATIENT_ACCESS_SCOPE_LABELS[s]).join(' · ');
}

interface PatientAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** 409 sin fecha de nacimiento: abrir la edición de la ficha. */
  onEditPatient?: () => void;
}

/**
 * «Compartir con el paciente» (DX-101): apartados (al menos uno) y validez →
 * enlace de solo lectura. La URL llega UNA vez en la respuesta y solo vive en
 * este diálogo (copiar o abrir WhatsApp). Debajo, los enlaces activos con su
 * último acceso, bloqueo y «Revocar». Lo montan ADMIN y recepción, bajo demanda.
 */
export function PatientAccessDialog({ open, onOpenChange, token, patientId, onEditPatient }: PatientAccessDialogProps) {
  const ids = useId();
  const [scopes, setScopes] = useState<PatientAccessScope[]>([...PATIENT_ACCESS_SCOPES]);
  const [ttl, setTtl] = useState<number>(PATIENT_ACCESS_DEFAULT_TTL);
  const [scopesError, setScopesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsBirthDate, setNeedsBirthDate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedAccessLink | null>(null);
  const [listKey, setListKey] = useState(0);
  const firstScopeRef = useRef<HTMLInputElement>(null);

  function toggle(scope: PatientAccessScope, checked: boolean) {
    setScopes((prev) => {
      const next = checked ? [...prev, scope] : prev.filter((s) => s !== scope);
      return PATIENT_ACCESS_SCOPES.filter((s) => next.includes(s));
    });
    if (checked) setScopesError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsBirthDate(false);
    if (scopes.length === 0) {
      setScopesError(copy.scopesRequired);
      firstScopeRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const link = await createPatientAccessLink(token, patientId, { scopes, ttlDays: ttl });
      setCreated(link);
      setListKey((k) => k + 1);
    } catch (err) {
      const message = apiErrorMessage(err, copy.genericError);
      // 409 sin fecha de nacimiento (el segundo factor): se ofrece editar la ficha.
      setNeedsBirthDate(err instanceof ApiError && err.code === 'PATIENT_ACCESS_NO_BIRTH_DATE');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      hideSubmit={created !== null}
      cancelLabel={created ? copy.close : undefined}
      error={error}
      errorAction={
        needsBirthDate && onEditPatient
          ? {
              label: copy.editPatient,
              onAction: () => {
                onOpenChange(false);
                onEditPatient();
              },
            }
          : null
      }
      touchTargets
    >
      {created ? (
        <CreatedLinkPanel token={token} link={created} />
      ) : (
        <>
          <fieldset
            aria-describedby={scopesError ? fieldErrorId(`${ids}-scopes`) : undefined}
            aria-invalid={scopesError ? true : undefined}
            className="flex min-w-0 flex-col gap-1.5"
          >
            <legend className="mb-1.5 text-sm font-medium text-ink">{copy.scopes}</legend>
            {PATIENT_ACCESS_SCOPES.map((scope, i) => (
              <Checkbox
                key={scope}
                ref={i === 0 ? firstScopeRef : undefined}
                id={`${ids}-scope-${scope}`}
                checked={scopes.includes(scope)}
                onChange={(e) => toggle(scope, e.target.checked)}
                label={PATIENT_ACCESS_SCOPE_LABELS[scope]}
                description={copy.scopeHints[scope]}
              />
            ))}
            {scopesError ? <InlineError id={fieldErrorId(`${ids}-scopes`)}>{scopesError}</InlineError> : null}
          </fieldset>
          <RadioGroup
            id={`${ids}-ttl`}
            legend={copy.ttl}
            hint={copy.ttlHint}
            value={String(ttl)}
            onValueChange={(v) => setTtl(Number(v))}
          >
            {PATIENT_ACCESS_TTL_OPTIONS.map((days, i) => (
              <RadioOption
                key={days}
                id={i === 0 ? `${ids}-ttl` : undefined}
                value={String(days)}
                label={copy.ttlOption(days)}
              />
            ))}
          </RadioGroup>
        </>
      )}
      <ActiveLinks key={listKey} token={token} patientId={patientId} />
    </FormModal>
  );
}

/** La URL recién creada (una sola vez): copiar, WhatsApp, caducidad y aviso de menor. */
function CreatedLinkPanel({ token, link }: { token: string; link: CreatedAccessLink }) {
  const ids = useId();
  const stamp = useSedeStamp(token);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const when = stamp.maybe.dateTime(link.expiresAt);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopyState('copied');
    } catch {
      inputRef.current?.select();
      setCopyState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3" data-testid="patient-access-created">
      <Callout tone="warning" role="status">
        {copy.onlyOnce}
      </Callout>
      <label htmlFor={`${ids}-url`} className="t-label text-muted">
        {copy.linkLabel}
      </label>
      <Input
        id={`${ids}-url`}
        ref={inputRef}
        readOnly
        value={link.url}
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted tabular-nums">
        {scopesLabel(link.scopes)}
        {when ? ` · ${copy.expires(when)}` : ''}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" onClick={() => void handleCopy()} className="w-full sm:w-auto">
          {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {copy.copyLink}
        </Button>
        {link.whatsapp ? (
          <Button asChild className="w-full sm:w-auto">
            <ExternalLink href={whatsAppUrl(link.whatsapp.phone, link.whatsapp.text)}>
              <MessageCircle aria-hidden /> {copy.whatsapp}
            </ExternalLink>
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="text-xs text-muted empty:hidden">
        {copyState === 'copied' ? copy.copied : copyState === 'failed' ? copy.copyFailed : ''}
      </p>
      {link.whatsapp ? null : (
        <Callout tone="neutral" role="note" data-testid="patient-access-no-phone">
          {copy.noPhone}
        </Callout>
      )}
      {link.minor ? (
        <Callout tone="info" role="note" data-testid="patient-access-minor">
          {copy.minor}
        </Callout>
      ) : null}
    </div>
  );
}

type ListState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; links: AccessLink[]; loadedAt: number };

/** Los enlaces vivos del paciente (sin URL: no se guarda), con «Revocar». */
function ActiveLinks({ token, patientId }: { token: string; patientId: string }) {
  const ids = useId();
  const stamp = useSedeStamp(token);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ attempt: number; value: ListState }>({ attempt: 0, value: { kind: 'loading' } });
  const current: ListState = state.attempt === attempt ? state.value : { kind: 'loading' };
  const [revoking, setRevoking] = useState<AccessLink | null>(null);
  const [revokePending, setRevokePending] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const justRevoked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    listPatientAccessLinks(token, patientId)
      .then((links) => {
        if (!cancelled) setState({ attempt, value: { kind: 'ready', links, loadedAt: Date.now() } });
      })
      .catch(() => {
        if (!cancelled) setState({ attempt, value: { kind: 'error' } });
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, attempt]);

  async function confirmRevoke() {
    if (!revoking) return;
    const link = revoking;
    setRevokePending(true);
    setRevokeError(null);
    try {
      await revokePatientAccessLink(token, patientId, link.id);
      setState((prev) =>
        prev.value.kind === 'ready'
          ? { ...prev, value: { ...prev.value, links: prev.value.links.filter((l) => l.id !== link.id) } }
          : prev,
      );
      setNotice(copy.revoked);
      justRevoked.current = true;
      setRevoking(null);
    } catch (err) {
      // El diálogo sigue abierto con el motivo: «Revocar enlace» es el reintento.
      setRevokeError(apiErrorMessage(err, copy.revokeError));
    } finally {
      setRevokePending(false);
    }
  }

  return (
    <section aria-labelledby={`${ids}-h`} className="flex flex-col gap-2 border-t border-border-subtle pt-4">
      <h3 id={`${ids}-h`} ref={headingRef} tabIndex={-1} className="t-label text-ink focus-visible:outline-none">
        {copy.listHeading}
      </h3>
      <p role="status" className="sr-only">
        {notice}
      </p>
      {current.kind === 'loading' ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{copy.listLoading}</span>
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-5 w-48 max-w-full" />
        </div>
      ) : current.kind === 'error' ? (
        <FieldError label={copy.listError} className="w-full" onRetry={() => setAttempt((n) => n + 1)} />
      ) : current.links.length === 0 ? (
        <p className="text-sm text-muted">{copy.listEmpty}</p>
      ) : (
        <>
          <SedeStampNote stamp={stamp} />
          <ul className="flex flex-col divide-y divide-border-subtle" aria-labelledby={`${ids}-h`}>
            {current.links.map((l) => {
              const created = stamp.dateTime(l.createdAt);
              const locked = l.lockedUntil && new Date(l.lockedUntil).getTime() > current.loadedAt ? stamp.dateTime(l.lockedUntil) : null;
              return (
                <li key={l.id} data-testid="patient-access-link" className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 tabular-nums">
                    <p className="font-medium text-ink">{scopesLabel(l.scopes)}</p>
                    <p className="text-muted">{copy.createdBy(l.createdBy.fullName ?? copy.formerMember, created)}</p>
                    <p className="text-muted">
                      {copy.expiresOn(stamp.dateTime(l.expiresAt))} ·{' '}
                      {l.lastViewedAt ? copy.lastViewed(stamp.dateTime(l.lastViewedAt)) : copy.neverOpened}
                    </p>
                    {locked ? <p className="font-medium text-danger-text">{copy.lockedUntil(locked)}</p> : null}
                  </div>
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="sm"
                    className="self-start max-sm:min-h-11"
                    aria-label={copy.revokeLabel(scopesLabel(l.scopes), created)}
                    onClick={() => {
                      setRevokeError(null);
                      setRevoking(l);
                    }}
                  >
                    {copy.revoke}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => {
          if (!o && !revokePending) {
            setRevoking(null);
            setRevokeError(null);
          }
        }}
        error={revokeError}
        title={copy.revokeTitle}
        description={copy.revokeDescription}
        confirmLabel={copy.revokeConfirm}
        cancelLabel={copy.revokeCancel}
        destructive
        confirming={revokePending}
        onConfirm={() => void confirmRevoke()}
        onCloseAutoFocus={(event) => {
          // La fila revocada ya no está: el foco va al título de la lista.
          if (!justRevoked.current) return;
          justRevoked.current = false;
          event.preventDefault();
          headingRef.current?.focus();
        }}
      />
    </section>
  );
}
