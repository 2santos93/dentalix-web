'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, LinkIcon, Printer } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { locationClock, type SedeClock } from '@/lib/locations/sede-clock';
import {
  SIGNATURE_LINK_LOCKED,
  SIGNATURE_SESSION_REQUIRED,
  getPublicSignature,
  getPublicSignatureDocument,
  requestSignatureCode,
  signPublicSignature,
  verifySignatureCode,
  type PublicSignature,
  type PublicSignatureDocument,
  type PublicSignedCopy,
} from '@/lib/signature-requests/signature-requests-api';
import { PublicNotice as Notice, publicBrandStyle } from '@/components/shared/public-page';
import { PublicBudgetSummary } from './public-budget';
import { SignaturePad } from '@/components/shared/signature-pad';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';

export const publicSignatureCopy = {
  loading: 'Cargando el documento…',
  // Sin «Intenta de nuevo.»: `SectionError` trae su propio botón.
  loadError: 'No pudimos abrir el enlace. Revisa tu conexión.',
  goneTitle: 'Enlace no válido',
  goneMessage:
    'Este enlace ya no sirve: caducó, ya se usó o se anuló. Pide a tu clínica que te envíe uno nuevo.',
  lockedMessage:
    'Se agotaron los 5 intentos y el enlace se bloqueó por seguridad. Pide a tu clínica que te envíe uno nuevo.',
  fallbackClinic: 'Tu clínica',
  title: 'Documento para firmar',
  intro: (to: string) =>
    `Para ver el documento, te enviaremos un código de 6 dígitos a ${to}.`,
  expires: (when: string) => `El enlace caduca el ${when}.`,
  sendCode: 'Enviarme el código',
  sending: 'Enviando…',
  codeLabel: 'Código de 6 dígitos',
  codeHint: (to: string) => `Lo enviamos a ${to}. Caduca en 10 minutos.`,
  codeInvalid: 'Escribe los 6 dígitos del código.',
  verify: 'Ver el documento',
  resend: 'Enviar otro código',
  resendIn: (s: number) => `Podrás pedir otro código en ${s} s`,
  codeSent: 'Te enviamos un código nuevo.',
  sessionExpired: 'Tu verificación caducó. Pide un código nuevo para continuar.',
  documentError: 'No pudimos cargar el documento.',
  documentRegion: 'Texto del documento',
  professional: (name: string) => `Profesional: ${name}`,
  signerPatient: (name: string) => `Firma: ${name}`,
  signerGuardian: (name: string) => `Firma: ${name}, como responsable del paciente`,
  readCheck: 'He leído el documento completo y estoy de acuerdo con su contenido.',
  readRequired: 'Confirma que leíste el documento completo.',
  signerDocument: 'Tu documento de identidad',
  signerDocumentHint: 'Queda en el documento junto a tu firma.',
  signerDocumentRequired: 'Escribe tu documento de identidad.',
  signature: 'Tu firma',
  signatureHint: 'Firma con el dedo dentro del recuadro.',
  signatureRequired: 'Firma en el recuadro.',
  sign: 'Firmar',
  // Fallbacks de `InlineError` (sin botón propio): llevan «Intenta de nuevo.».
  signError: 'No pudimos guardar tu firma. Intenta de nuevo.',
  codeError: 'No pudimos enviarte el código. Intenta de nuevo.',
  verifyError: 'No pudimos comprobar el código. Intenta de nuevo.',
  doneTitle: 'Documento firmado',
  doneMessage: (clinic: string) =>
    `${clinic} ya tiene tu firma. El documento queda completo cuando lo firme el profesional.`,
  signedAt: (when: string) => `Firmado el ${when}.`,
  signedByGuardian: (name: string, when: string) => `Firmado por el responsable (${name}) el ${when}.`,
  signatureAlt: (name: string) => `Firma de ${name}`,
  hash: 'Huella del documento (SHA-256)',
  print: 'Imprimir o guardar en PDF',
  // DX-415: presupuesto para aceptar.
  budgetTitle: 'Presupuesto para aceptar',
  budgetIntro: (to: string) => `Para ver el presupuesto, te enviaremos un código de 6 dígitos a ${to}.`,
  budgetVerify: 'Ver el presupuesto',
  budgetRegion: 'Presupuesto y condiciones',
  budgetConditions: 'Condiciones',
  budgetReadCheck: 'He revisado el presupuesto y acepto sus procedimientos, importes y condiciones.',
  budgetReadRequired: 'Confirma que revisaste el presupuesto y lo aceptas.',
  budgetSign: 'Aceptar y firmar',
  budgetDoneTitle: 'Presupuesto aceptado',
  budgetDoneMessage: (clinic: string) =>
    `${clinic} ya tiene tu aceptación. Te enviamos un correo de confirmación; guarda o imprime esta copia.`,
  budgetAcceptedAt: (when: string) => `Aceptado el ${when}.`,
  budgetHash: 'Huella de la aceptación (SHA-256)',
};

/** El enlace es de un presupuesto (DX-415): cambian los textos y el documento. */
function isBudget(type: PublicSignature['type']): boolean {
  return type === 'BUDGET';
}

const copy = publicSignatureCopy;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'gone'; locked?: boolean }
  | { kind: 'ready'; data: PublicSignature };

type Step =
  | { kind: 'intro' }
  | { kind: 'code'; notice?: string }
  | { kind: 'document'; session: string }
  | { kind: 'done'; copy: PublicSignedCopy; signature: string };

/** El reloj de la sede que envió el enlace (sus fechas, en su zona y su formato). */
function clockOf(location: PublicSignature['location']): SedeClock | null {
  return locationClock(location);
}

function when(iso: string, clock: SedeClock | null): string {
  return clock ? clock.fmt.longDateTime(new Date(iso), clock.timeZone) : NO_SEDE_FORMAT;
}

function isGone(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.code === SIGNATURE_LINK_LOCKED);
}

/**
 * Página pública `/firmar/[token]` (DX-243): el paciente (o su responsable)
 * firma desde el móvil. Antes de ver nada pide un código de 6 dígitos que le
 * llega por email; con él lee el documento completo, confirma que lo leyó y
 * firma con el dedo. Caducado, usado, anulado o bloqueado: «Enlace no válido»,
 * sin ningún dato. La sesión del código vive solo en memoria de esta pestaña.
 */
export function PublicSignatureView({ linkToken }: { linkToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [step, setStep] = useState<Step>({ kind: 'intro' });

  useEffect(() => {
    let cancelled = false;
    getPublicSignature(linkToken)
      .then((data) => {
        if (cancelled) return;
        setState({ kind: 'ready', data });
        if (data.codeSent) setStep((s) => (s.kind === 'intro' ? { kind: 'code' } : s));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(isGone(err) ? { kind: 'gone' } : { kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [linkToken, reloadKey]);

  const data = state.kind === 'ready' ? state.data : null;
  const clinicName = data?.clinic.name ?? copy.fallbackClinic;
  const clock = data ? clockOf(data.location) : null;
  // Estables: el paso del documento los usa en su efecto de carga.
  const gone = useCallback((locked = false) => setState({ kind: 'gone', locked }), []);
  const sessionExpired = useCallback(
    () => setStep({ kind: 'code', notice: copy.sessionExpired }),
    [],
  );

  return (
    <div style={publicBrandStyle(data?.clinic)} className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            description={copy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'gone' && (
          <Notice
            icon={LinkIcon}
            title={copy.goneTitle}
            message={state.locked ? copy.lockedMessage : copy.goneMessage}
          />
        )}

        {data && (
          <>
            <header className="flex items-center gap-3 print:hidden">
              {data.clinic.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- logo de la clínica en un host arbitrario; next/image exigiría whitelistear cada dominio
                <img
                  src={data.clinic.logoUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-10 shrink-0 rounded-lg object-contain"
                />
              )}
              <p className="t-title min-w-0 break-words text-ink">{clinicName}</p>
            </header>

            {step.kind === 'intro' && (
              <IntroStep
                data={data}
                clock={clock}
                linkToken={linkToken}
                onSent={(next) => {
                  setState({ kind: 'ready', data: next });
                  setStep({ kind: 'code' });
                }}
                onGone={gone}
              />
            )}
            {step.kind === 'code' && (
              <CodeStep
                data={data}
                linkToken={linkToken}
                notice={step.notice}
                onResent={(next) => setState({ kind: 'ready', data: next })}
                onVerified={(session) => setStep({ kind: 'document', session })}
                onGone={gone}
              />
            )}
            {step.kind === 'document' && (
              <DocumentStep
                clock={clock}
                linkToken={linkToken}
                session={step.session}
                onSessionExpired={sessionExpired}
                onSigned={(signed, signature) => setStep({ kind: 'done', copy: signed, signature })}
                onGone={gone}
              />
            )}
            {step.kind === 'done' && <DoneStep signed={step.copy} signature={step.signature} clock={clock} />}
          </>
        )}
      </main>
    </div>
  );
}

function IntroStep({
  data,
  clock,
  linkToken,
  onSent,
  onGone,
}: {
  data: PublicSignature;
  clock: SedeClock | null;
  linkToken: string;
  onSent: (data: PublicSignature) => void;
  onGone: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      onSent(await requestSignatureCode(linkToken));
    } catch (err) {
      if (isGone(err)) onGone();
      else setError(apiErrorMessage(err, copy.codeError));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="t-display text-ink">{isBudget(data.type) ? copy.budgetTitle : copy.title}</h1>
      <p className="text-base text-ink">
        {isBudget(data.type) ? copy.budgetIntro(data.destinationMasked) : copy.intro(data.destinationMasked)}
      </p>
      <p className="text-sm text-muted tabular-nums">{copy.expires(when(data.expiresAt, clock))}</p>
      {error ? <InlineError variant="summary">{error}</InlineError> : null}
      <Button type="button" size="lg" className="w-full sm:w-auto sm:self-start" loading={sending} onClick={() => void send()}>
        {copy.sendCode}
      </Button>
    </section>
  );
}

/** Segundos que faltan hasta `iso` (0 si ya pasó), contados cada segundo. */
function useCountdown(iso: string | null | undefined): number {
  const target = iso ? new Date(iso).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  return target ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
}

function CodeStep({
  data,
  linkToken,
  notice,
  onResent,
  onVerified,
  onGone,
}: {
  data: PublicSignature;
  linkToken: string;
  notice?: string;
  onResent: (data: PublicSignature) => void;
  onVerified: (session: string) => void;
  onGone: (locked?: boolean) => void;
}) {
  const ids = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const wait = useCountdown(data.resendAvailableAt);

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError(copy.codeInvalid);
      codeRef.current?.focus();
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const session = await verifySignatureCode(linkToken, code);
      onVerified(session.sessionToken);
    } catch (err) {
      if (isGone(err)) {
        onGone(err instanceof ApiError && err.code === SIGNATURE_LINK_LOCKED);
        return;
      }
      setError(apiErrorMessage(err, copy.verifyError));
      setCode('');
      // Para escribir otro sin buscar el campo; el motivo va enlazado.
      codeRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      onResent(await requestSignatureCode(linkToken));
      setInfo(copy.codeSent);
    } catch (err) {
      if (isGone(err)) onGone();
      else setError(apiErrorMessage(err, copy.codeError));
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={(e) => void verify(e)} noValidate className="flex flex-col gap-4">
      <h1 className="t-display text-ink">{isBudget(data.type) ? copy.budgetTitle : copy.title}</h1>
      {info ? (
        <p role="status" className="text-sm text-muted">
          {info}
        </p>
      ) : null}
      <FormField htmlFor={`${ids}-code`} label={copy.codeLabel} hint={copy.codeHint(data.destinationMasked)}>
        <Input
          ref={codeRef}
          id={`${ids}-code`}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${ids}-error` : undefined}
          className="h-12 text-center text-2xl tracking-[0.5em] tabular-nums"
        />
      </FormField>
      {error ? <InlineError id={`${ids}-error`}>{error}</InlineError> : null}
      <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-start" loading={verifying}>
        {isBudget(data.type) ? copy.budgetVerify : copy.verify}
      </Button>
      {data.codeSendsLeft > 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 self-start"
          disabled={wait > 0 || verifying}
          loading={resending}
          onClick={() => void resend()}
        >
          {wait > 0 ? copy.resendIn(wait) : copy.resend}
        </Button>
      ) : null}
    </form>
  );
}

function DocumentStep({
  clock,
  linkToken,
  session,
  onSessionExpired,
  onSigned,
  onGone,
}: {
  clock: SedeClock | null;
  linkToken: string;
  session: string;
  onSessionExpired: () => void;
  /** La copia firmada y la firma que se acaba de enviar (para la copia imprimible). */
  onSigned: (signed: PublicSignedCopy, signature: string) => void;
  onGone: () => void;
}) {
  const ids = useId();
  const [doc, setDoc] = useState<PublicSignatureDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [read, setRead] = useState(false);
  const [signerDocument, setSignerDocument] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ read?: string; document?: string; signature?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicSignatureDocument(linkToken, session)
      .then((data) => {
        if (!cancelled) setDoc(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === SIGNATURE_SESSION_REQUIRED) onSessionExpired();
        else if (isGone(err)) onGone();
        else setLoadError(apiErrorMessage(err, copy.documentError));
      });
    return () => {
      cancelled = true;
    };
  }, [linkToken, session, reloadKey, onSessionExpired, onGone]);

  if (loadError) {
    return (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!doc) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">{copy.loading}</span>
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  async function sign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!doc) return;
    const next: typeof errors = {};
    if (!read) next.read = doc.budget ? copy.budgetReadRequired : copy.readRequired;
    if (doc.signerDocumentRequired && signerDocument.trim() === '') next.document = copy.signerDocumentRequired;
    if (!signature) next.signature = copy.signatureRequired;
    setErrors(next);
    if (Object.keys(next).length > 0 || !signature) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const signed = await signPublicSignature(linkToken, session, {
        signature,
        accepted: true,
        ...(doc.signerDocumentRequired ? { signerDocument: signerDocument.trim() } : {}),
      });
      onSigned(signed, signature);
    } catch (err) {
      if (err instanceof ApiError && err.code === SIGNATURE_SESSION_REQUIRED) onSessionExpired();
      else if (isGone(err)) onGone();
      else setSubmitError(apiErrorMessage(err, copy.signError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void sign(e)} noValidate className="flex flex-col gap-5">
      <article
        aria-label={doc.budget ? copy.budgetRegion : copy.documentRegion}
        className="rounded-xl border border-border bg-white px-4 py-5 text-[#111827]"
      >
        <h1 className="text-lg font-semibold">{doc.title}</h1>
        {doc.budget ? (
          <>
            <div className="mt-3">
              <PublicBudgetSummary budget={doc.budget} clock={clock} />
            </div>
            <h2 className="mt-4 text-sm font-semibold">{copy.budgetConditions}</h2>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{doc.body}</p>
          </>
        ) : (
          <>
            <p className="mt-3 whitespace-pre-line text-[0.9375rem] leading-relaxed">{doc.body}</p>
            <p className="mt-4 text-sm text-[#4b5563]">{copy.professional(doc.professionalName)}</p>
          </>
        )}
        <p className={doc.budget ? 'mt-3 text-sm text-[#4b5563]' : 'text-sm text-[#4b5563]'}>
          {doc.signerType === 'GUARDIAN' ? copy.signerGuardian(doc.signerName) : copy.signerPatient(doc.signerName)}
        </p>
      </article>

      {/* Checkbox v2: fila entera clicable (44 px en táctil); el error va debajo
          con `aria-invalid` + `aria-describedby`, como un FormField. */}
      <Checkbox
        id={`${ids}-read`}
        label={doc.budget ? copy.budgetReadCheck : copy.readCheck}
        checked={read}
        error={errors.read}
        onChange={(e) => {
          setRead(e.target.checked);
          if (e.target.checked) setErrors((x) => ({ ...x, read: undefined }));
        }}
      />

      {doc.signerDocumentRequired ? (
        <FormField
          htmlFor={`${ids}-doc`}
          label={copy.signerDocument}
          hint={copy.signerDocumentHint}
          error={errors.document}
        >
          <Input
            id={`${ids}-doc`}
            value={signerDocument}
            onChange={(e) => setSignerDocument(e.target.value)}
            maxLength={60}
            autoComplete="off"
          />
        </FormField>
      ) : null}

      <div className="flex flex-col gap-1">
        <SignaturePad
          label={copy.signature}
          hint={copy.signatureHint}
          onChange={(value) => {
            setSignature(value);
            if (value) setErrors((x) => ({ ...x, signature: undefined }));
          }}
          disabled={submitting}
          height={180}
        />
        {errors.signature ? <InlineError>{errors.signature}</InlineError> : null}
      </div>

      {submitError ? <InlineError variant="summary">{submitError}</InlineError> : null}
      <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-start" loading={submitting}>
        {doc.budget ? copy.budgetSign : copy.sign}
      </Button>
    </form>
  );
}

function DoneStep({
  signed,
  signature,
  clock,
}: {
  signed: PublicSignedCopy;
  /** La firma (PNG en data URL) que se acaba de enviar: la misma que guarda la clínica. */
  signature: string;
  clock: SedeClock | null;
}) {
  const signedAt = when(signed.signedAt, clock);
  const budget = signed.budget;
  return (
    <section className="flex flex-col gap-5">
      <div
        role="status"
        className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-6 py-10 text-center print:hidden"
      >
        <span
          aria-hidden
          className="mb-1 flex size-10 items-center justify-center rounded-full bg-success-subtle text-success-text"
        >
          <CheckCircle2 className="size-5" />
        </span>
        <h1 className="t-title text-ink">{budget ? copy.budgetDoneTitle : copy.doneTitle}</h1>
        <p className="max-w-sm text-sm text-muted">
          {budget ? copy.budgetDoneMessage(signed.clinic.name) : copy.doneMessage(signed.clinic.name)}
        </p>
      </div>
      <article className="rounded-xl border border-border bg-white px-4 py-5 text-[#111827] print:border-0 print:p-0">
        <p className="text-sm font-semibold">{signed.clinic.name}</p>
        <h2 className="text-lg font-semibold">{signed.title}</h2>
        {budget ? (
          <div className="mt-3">
            <PublicBudgetSummary budget={budget} clock={clock} />
            <h3 className="mt-4 text-sm font-semibold">{copy.budgetConditions}</h3>
          </div>
        ) : null}
        <p
          className={
            budget
              ? 'mt-1 whitespace-pre-line text-sm leading-relaxed'
              : 'mt-3 whitespace-pre-line text-[0.9375rem] leading-relaxed'
          }
        >
          {signed.body}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL de la firma recién dibujada; next/image no aporta nada */}
        <img
          src={signature}
          alt={copy.signatureAlt(signed.signerName)}
          className="mt-4 h-24 w-auto max-w-full border-b border-[#d1d5db] object-contain"
        />
        <p className="mt-2 text-sm">
          {signed.signerName}
          {signed.signerDocument ? ` · ${signed.signerDocument}` : ''}
        </p>
        <p className="text-sm tabular-nums">
          {budget
            ? copy.budgetAcceptedAt(signedAt)
            : signed.signerType === 'GUARDIAN'
              ? copy.signedByGuardian(signed.signerName, signedAt)
              : copy.signedAt(signedAt)}
        </p>
        <p className="mt-3 text-xs text-[#4b5563]">
          {budget ? copy.budgetHash : copy.hash}: <span className="break-all font-mono">{signed.contentHash}</span>
        </p>
      </article>
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto sm:self-start print:hidden"
        onClick={() => window.print()}
      >
        <Printer aria-hidden />
        {copy.print}
      </Button>
    </section>
  );
}
