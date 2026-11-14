'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Mail, MessageCircle, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import type { SedeClock } from '@/lib/locations/sede-clock';
import {
  canRetryDeliver,
  deliverPostOp,
  getAppointmentPostOp,
  postOpPrintHref,
  whatsAppUrl,
  type PostOpChannel,
  type PostOpDeliverySummary,
  type PostOpSuggestions,
  type PostOpTemplateSummary,
} from '@/lib/postop/postop-api';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';

const copy = {
  heading: 'Indicaciones',
  loading: 'Cargando indicaciones',
  loadError: 'No pudimos cargar las indicaciones de la cita.',
  refreshError:
    'No pudimos actualizar las indicaciones. Se conservan los datos de la última carga y la entrega registrada.',
  retry: 'Reintentar',
  suggestedLegend: 'Indicaciones sugeridas para esta cita',
  noneSuggested: 'No hay indicaciones para esta cita',
  othersLabel: 'Otras indicaciones',
  othersLabelWithSuggested: 'O elige otras indicaciones',
  choose: 'Elige unas indicaciones',
  chooseOther: 'Elige otras indicaciones',
  chooseHint: 'Elige unas indicaciones para entregarlas.',
  noTemplates:
    'La clínica aún no tiene indicaciones activas. Un administrador las crea en Ajustes.',
  print: 'Imprimir',
  email: 'Enviar por email',
  whatsapp: 'Abrir WhatsApp',
  emailBlocked: 'No se puede enviar por email a este paciente.',
  whatsappBlocked: 'El teléfono del paciente no sirve para WhatsApp: revísalo en su ficha o escríbelo con + y su prefijo.',
  // El email entra en la cola del servidor: no se afirma que ya salió.
  emailSent: (to: string) => `Entrega registrada; el email a ${to} está en cola.`,
  emailSentToResponsible: (to: string) =>
    `Entrega registrada; el email al responsable del paciente (${to}) está en cola.`,
  emailTo: (to: string, toResponsible: boolean) =>
    toResponsible
      ? `Se enviará a ${to} (responsable del paciente).`
      : `Se enviará a ${to}.`,
  notQueuedTitle: 'El email no salió',
  notQueuedBody:
    'La entrega quedó registrada en la historia clínica como «Email · no enviado». Comparte este enlace con el paciente: solo se muestra aquí y se pierde al cerrar la cita.',
  notQueuedNoLink:
    'La entrega quedó registrada en la historia clínica como «Email · no enviado» y no hay enlace que compartir. Entrégala por otro canal.',
  linkLabel: 'Enlace público de las indicaciones',
  copyLink: 'Copiar enlace',
  copied: 'Copiado',
  copyFailed: 'No pudimos copiar automáticamente: cópialo a mano desde el campo.',
  dismiss: 'Entendido',
  printed: 'Entrega registrada: la vista para imprimir se abrió en otra pestaña.',
  printBlocked: 'Entrega registrada. El navegador bloqueó la pestaña para imprimir.',
  openPrint: 'Abrir para imprimir',
  whatsappRecorded: 'Entrega registrada: WhatsApp se abrió en otra pestaña.',
  whatsappBlockedPopup: 'Entrega registrada. El navegador bloqueó la pestaña de WhatsApp.',
  openWhatsApp: 'Abrir WhatsApp',
  deliverError: 'No pudimos entregar las indicaciones.',
  recheckError:
    'No pudimos comprobar si la entrega ya quedó registrada. Se reintenta la comprobación, no la entrega.',
  replayedEmail:
    'Esta entrega ya estaba registrada. Mira su estado en la lista «Entregadas en esta cita».',
  alreadyRecorded: 'La entrega ya había quedado registrada, así que no se repitió.',
  alreadyRecordedEmailNotSent:
    'La entrega ya había quedado registrada, pero el email no salió. Entrégala por otro canal.',
  alreadyRecordedLinkLost:
    'La entrega ya había quedado registrada, pero su enlace no se puede recuperar. Si el paciente no lo recibió, entrégala de nuevo.',
  deliveredHeading: 'Entregadas en esta cita',
  noDeliveries: 'Aún no se han entregado indicaciones en esta cita.',
  channel: {
    PRINT: 'Impresas',
    EMAIL: 'Email',
    WHATSAPP_LINK: 'WhatsApp',
  } satisfies Record<PostOpChannel, string>,
  // DX-250: la historia clínica no afirma un email que no salió.
  emailNotSent: 'Email · no enviado',
  emailQueued: 'Email · en cola',
  version: (code: string, version: number) => `${code} v${version}`,
};

interface AppointmentPostOpPanelProps {
  token: string;
  appointmentId: string;
  /** DX-378: reloj de la sede de la cita, para la hora de cada entrega. */
  clock: SedeClock | null;
  /**
   * DX-250: cita cancelada o no-show. Solo se leen las entregas anteriores:
   * sin selector, sin botones de entrega y, si no hay ninguna, sin nada.
   */
  readOnly?: boolean;
}

/** Abre la pestaña ya registrada la entrega; si el navegador la bloqueó, deja el enlace en el aviso. */
/** El canal de una entrega tal como se lee en la lista (un email que no salió lo dice). */
function channelLabel(d: PostOpDeliverySummary): string {
  if (d.channel === 'EMAIL' && d.emailStatus === 'NOT_SENT') return copy.emailNotSent;
  if (d.channel === 'EMAIL' && d.emailStatus === 'QUEUED') return copy.emailQueued;
  return copy.channel[d.channel];
}

/** Un UUID por clic (`Idempotency-Key`); `crypto.randomUUID` solo existe en contextos seguros. */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/**
 * Aviso EN el panel (la hoja modal de la cita deja inertes los toasts, que no
 * se pueden alcanzar ni con el ratón ni con el teclado): un error con su
 * «Reintentar», o una información con la acción que ofrece.
 */
interface Feedback {
  tone: 'error' | 'info';
  message: string;
  action?: { label: string; onClick: () => void };
}

/** Abre la pestaña ya registrada la entrega; si el navegador la bloqueó, deja el enlace en el panel. */
function finishInTab(
  win: Window | null,
  href: string,
  messages: { opened: string; blocked: string; action: string },
  setFeedback: (feedback: Feedback) => void,
) {
  if (win) {
    win.location.href = href;
    toast.success(messages.opened);
    return;
  }
  setFeedback({
    tone: 'info',
    message: messages.blocked,
    action: { label: messages.action, onClick: () => window.open(href, '_blank', 'noopener,noreferrer') },
  });
}

/**
 * Bloque del detalle de la cita (DX-222): propone las indicaciones del
 * procedimiento o del tipo de cita y las entrega impresas, por email o por un
 * enlace de WhatsApp. Cada entrega queda registrada con la versión exacta de
 * la plantilla. El padre lo monta con `key` por cita.
 */
export function AppointmentPostOpPanel({ token, appointmentId, clock, readOnly = false }: AppointmentPostOpPanelProps) {
  const ids = useId();
  const headingId = `${ids}-heading`;
  const emailHintId = `${ids}-email-hint`;
  const whatsappHintId = `${ids}-whatsapp-hint`;
  const chooseHintId = `${ids}-choose-hint`;
  const othersId = `${ids}-others`;
  const deliveredId = `${ids}-delivered`;
  const emailTargetId = `${ids}-email-target`;
  const linkFieldId = `${ids}-public-link`;

  const [data, setData] = useState<PostOpSuggestions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<PostOpChannel | null>(null);
  const deliveringRef = useRef(false);
  const [interacted, setInteracted] = useState(false);
  // Lo último que se leyó, para saber qué entregas había ANTES de un intento.
  const dataRef = useRef<PostOpSuggestions | null>(null);
  // DX-250: el enlace de un email que no salió solo existe en esa respuesta.
  const [notQueued, setNotQueued] = useState<{ url: string | null } | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  // Cada clic en «Copiar enlace» remonta el texto del aviso: se anuncia otra vez.
  const [copyCount, setCopyCount] = useState(0);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // Al reintentar desde el aviso, el botón desaparece si sale bien: el foco vuelve al panel.
  const refocusRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (feedback === null && refocusRef.current) {
      refocusRef.current = false;
      sectionRef.current?.focus();
    }
  }, [feedback]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    getAppointmentPostOp(token, appointmentId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: copy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, appointmentId, reloadKey]);

  /**
   * Registra la entrega ANTES de abrir nada. Para imprimir y WhatsApp la
   * pestaña se abre en blanco en el mismo clic (el bloqueador de ventanas no
   * la frena) y se carga cuando la API responde; si falla, se cierra.
   *
   * DX-250: un fallo del servidor o de la red no dice si la entrega llegó a
   * registrarse. «Reintentar» (solo en esos fallos) primero relee la lista y,
   * si ya hay una entrega nueva de esa plantilla y ese canal, no la repite.
   */
  async function deliver(
    templateId: string,
    channel: PostOpChannel,
    attempt: { knownIds: ReadonlySet<string>; recheck: boolean; key: string } = {
      knownIds: new Set(dataRef.current?.deliveries.map((d) => d.id) ?? []),
      recheck: false,
      // Un UUID por clic; el reintento lo reutiliza y la API no duplica.
      key: newIdempotencyKey(),
    },
  ) {
    if (deliveringRef.current) return;
    deliveringRef.current = true;
    setInteracted(true);
    const win = channel === 'EMAIL' ? null : window.open('', '_blank');
    if (win) win.opener = null;
    setBusy(channel);
    // Un clic nuevo borra el aviso anterior; un reintento lo conserva (y con él
    // el foco en su botón) hasta saber cómo acaba.
    if (!attempt.recheck) setFeedback(null);
    try {
      if (attempt.recheck) {
        let fresh: PostOpSuggestions;
        try {
          fresh = await getAppointmentPostOp(token, appointmentId);
        } catch {
          win?.close();
          // Sin la lista no se sabe si ya está: se reintenta la comprobación.
          setFeedback({
            tone: 'error',
            message: copy.recheckError,
            action: { label: copy.retry, onClick: () => retryFromFeedback(templateId, channel, attempt) },
          });
          return;
        }
        setData(fresh);
        setError(null);
        const landed = fresh.deliveries.find(
          (d) => !attempt.knownIds.has(d.id) && d.templateId === templateId && d.channel === channel,
        );
        if (landed) {
          win?.close();
          setFeedback(null);
          if (channel === 'PRINT') {
            // La pestaña ya se cerró: se ofrece abrir la vista imprimible.
            const href = postOpPrintHref(landed.patientId, landed.id);
            setFeedback({
              tone: 'info',
              message: copy.alreadyRecorded,
              action: { label: copy.openPrint, onClick: () => window.open(href, '_blank', 'noopener,noreferrer') },
            });
          } else {
            toast.info(
              channel === 'EMAIL' && landed.emailStatus === 'NOT_SENT'
                ? copy.alreadyRecordedEmailNotSent
                : channel === 'WHATSAPP_LINK'
                  ? copy.alreadyRecordedLinkLost
                  : copy.alreadyRecorded,
            );
          }
          return;
        }
      }
      const result = await deliverPostOp(token, appointmentId, { templateId, channel }, attempt.key);
      setFeedback(null);
      if (channel === 'EMAIL' && result.publicUrl === null && !result.emailQueued) {
        // Una repetición (`publicUrl` null): este clic no sabe cómo acabó el
        // email. No se abre la alerta de «no salió»: habla la lista releída.
        toast.info(copy.replayedEmail);
      } else if (channel === 'EMAIL' && !result.emailQueued) {
        // La API registró la entrega pero el email no entró en la cola: aviso
        // persistente con el enlace (solo existe en esta respuesta).
        setCopyState('idle');
        setNotQueued({ url: result.publicUrl });
      } else if (channel === 'EMAIL') {
        const to = result.sentTo ?? '';
        toast.success(
          result.sentToResponsible ? copy.emailSentToResponsible(to) : copy.emailSent(to),
        );
      } else if (channel === 'PRINT') {
        finishInTab(win, postOpPrintHref(result.delivery.patientId, result.delivery.id), {
          opened: copy.printed,
          blocked: copy.printBlocked,
          action: copy.openPrint,
        }, setFeedback);
      } else if (result.whatsapp) {
        finishInTab(win, whatsAppUrl(result.whatsapp.phone, result.whatsapp.text), {
          opened: copy.whatsappRecorded,
          blocked: copy.whatsappBlockedPopup,
          action: copy.openWhatsApp,
        }, setFeedback);
      } else {
        // WhatsApp sin mensaje: la API devolvió la entrega ya registrada por
        // una repetición (su enlace no se puede recuperar).
        win?.close();
        if (channel === 'WHATSAPP_LINK') toast.info(copy.alreadyRecordedLinkLost);
      }
      // La respuesta ya confirma esta entrega aunque falle la recarga siguiente.
      setData((current) =>
        current ? {
          ...current,
          deliveries: [result.delivery, ...current.deliveries.filter((d) => d.id !== result.delivery.id)],
        } : current,
      );
      setReloadKey((k) => k + 1);
    } catch (err) {
      win?.close();
      // El fallo se dice en el panel, junto a los botones (no en un toast: la
      // hoja modal lo deja inalcanzable). Un 4xx (422 sin canal, 429 de cuota…)
      // vuelve a fallar igual: sin «Reintentar». Un 5xx o la red, sí.
      const message = apiErrorMessage(err, { fallback: copy.deliverError });
      setFeedback({
        tone: 'error',
        message,
        ...(canRetryDeliver(err)
          ? {
              action: {
                label: copy.retry,
                onClick: () => retryFromFeedback(templateId, channel, { ...attempt, recheck: true }),
              },
            }
          : {}),
      });
    } finally {
      deliveringRef.current = false;
      setBusy(null);
    }
  }

  function retryFromFeedback(
    templateId: string,
    channel: PostOpChannel,
    attempt: { knownIds: ReadonlySet<string>; recheck: boolean; key: string },
  ) {
    refocusRef.current = true;
    void deliver(templateId, channel, attempt);
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
      setCopyCount((n) => n + 1);
    } catch {
      // Contexto no seguro o permiso denegado: el enlace queda seleccionado.
      linkInputRef.current?.select();
      setCopyState('failed');
      setCopyCount((n) => n + 1);
    }
  }

  function templatePicker(d: PostOpSuggestions, selectedId: string | null) {
    const suggestedValue = d.suggested.some((t) => t.id === selectedId) ? selectedId : '';
    const otherValue = d.others.some((t) => t.id === selectedId) ? selectedId : '';
    const hasSuggested = d.suggested.length > 0;
    return (
      <div className="flex flex-col gap-3">
        {hasSuggested ? (
          <RadioGroup
            id={`${ids}-template`}
            legend={<span className="sr-only">{copy.suggestedLegend}</span>}
            value={suggestedValue ?? ''}
            onValueChange={(value) => {
              setInteracted(true);
              setChosenId(value);
            }}
            className="gap-0"
          >
            {d.suggested.map((t, i) => (
              <RadioOption
                key={t.id}
                id={i === 0 ? `${ids}-template` : undefined}
                value={t.id}
                label={
                  <>
                    {t.title}{' '}
                    <span className="t-caption t-data text-muted">{copy.version(t.code, t.version)}</span>
                  </>
                }
              />
            ))}
          </RadioGroup>
        ) : (
          <p role={interacted ? 'status' : undefined} className="text-sm text-muted">
            {copy.noneSuggested}
          </p>
        )}
        {d.others.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={othersId}>
              {hasSuggested ? copy.othersLabelWithSuggested : copy.othersLabel}
            </Label>
            <NativeSelect
              id={othersId}
              value={otherValue ?? ''}
              onChange={(e) => {
                setInteracted(true);
                setChosenId(e.target.value || null);
              }}
            >
              <option value="">{hasSuggested ? copy.chooseOther : copy.choose}</option>
              {d.others.map((t: PostOpTemplateSummary) => (
                <option key={t.id} value={t.id}>
                  {`${t.title} (${copy.version(t.code, t.version)})`}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          !hasSuggested && <p className="text-sm text-muted">{copy.noTemplates}</p>
        )}
      </div>
    );
  }

  function body() {
    if (error && !data) {
      return (
        <SectionError
          description={error}
          onRetry={() => {
            setInteracted(true);
            setError(null);
            setReloadKey((k) => k + 1);
          }}
          className="py-6"
        />
      );
    }
    if (!data) {
      return (
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-11 w-full" />
        </div>
      );
    }

    // La elección vale mientras siga en la lista; si no, la primera sugerida.
    const available = [...data.suggested, ...data.others];
    const chosen = chosenId && available.some((t) => t.id === chosenId) ? chosenId : null;
    const selectedId = chosen ?? data.suggested[0]?.id ?? null;
    const hasTemplates = available.length > 0;
    const emailReason = data.email.allowed ? null : (data.email.reason ?? copy.emailBlocked);
    const whatsappReason = data.whatsapp.phone ? null : (data.whatsapp.reason ?? copy.whatsappBlocked);
    const noTemplate = selectedId === null;
    const emailTarget =
      emailReason === null && data.email.toMasked
        ? copy.emailTo(data.email.toMasked, data.email.toResponsible)
        : null;
    const describedBy = (reason: string | null, hintId: string, extraId: string | null = null) =>
      [noTemplate && hasTemplates ? chooseHintId : null, reason ? hintId : null, extraId]
        .filter(Boolean)
        .join(' ') || undefined;

    const delivered = (
      <div className="flex flex-col gap-2">
        <h4 id={deliveredId} className="t-caption text-muted">
          {copy.deliveredHeading}
        </h4>
        {data.deliveries.length === 0 ? (
          <p className="text-sm text-muted">{copy.noDeliveries}</p>
        ) : (
          <ul aria-labelledby={deliveredId} className="flex flex-col divide-y divide-border-subtle">
            {data.deliveries.map((d) => (
              <li key={d.id} className="t-data py-2 text-sm text-ink first:pt-0 last:pb-0">
                {[
                  copy.version(d.templateCode, d.templateVersion),
                  channelLabel(d),
                  clock ? clock.fmt.dateTime(new Date(d.deliveredAt), clock.timeZone) : NO_SEDE_FORMAT,
                  d.deliveredByName,
                ].join(' · ')}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
    if (readOnly) return delivered;

    return (
      <>
        {error && (
          <div role="status" className="flex flex-col items-start gap-2 text-sm text-muted">
            <p>{copy.refreshError}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setError(null);
                setInteracted(true);
                setReloadKey((k) => k + 1);
              }}
            >
              {copy.retry}
            </Button>
          </div>
        )}
        {templatePicker(data, selectedId)}
        {hasTemplates && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={noTemplate || (busy !== null && busy !== 'PRINT')}
              loading={busy === 'PRINT'}
              aria-describedby={describedBy(null, '')}
              onClick={() => selectedId && void deliver(selectedId, 'PRINT')}
            >
              <Printer aria-hidden /> {copy.print}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={noTemplate || emailReason !== null || (busy !== null && busy !== 'EMAIL')}
              loading={busy === 'EMAIL'}
              aria-describedby={describedBy(emailReason, emailHintId, emailTarget ? emailTargetId : null)}
              onClick={() => selectedId && void deliver(selectedId, 'EMAIL')}
            >
              <Mail aria-hidden /> {copy.email}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={noTemplate || whatsappReason !== null || (busy !== null && busy !== 'WHATSAPP_LINK')}
              loading={busy === 'WHATSAPP_LINK'}
              aria-describedby={describedBy(whatsappReason, whatsappHintId)}
              onClick={() => selectedId && void deliver(selectedId, 'WHATSAPP_LINK')}
            >
              <MessageCircle aria-hidden /> {copy.whatsapp}
            </Button>
          </div>
        )}
        {noTemplate && hasTemplates && (
          <p id={chooseHintId} className="text-xs text-muted">
            {copy.chooseHint}
          </p>
        )}
        {emailReason && (
          <p id={emailHintId} className="text-xs text-muted">
            {emailReason}
          </p>
        )}
        {emailTarget && hasTemplates && (
          <p id={emailTargetId} className="text-xs text-muted">
            {emailTarget}
          </p>
        )}
        {whatsappReason && (
          <p id={whatsappHintId} className="text-xs text-muted">
            {whatsappReason}
          </p>
        )}

        {feedback && (
          feedback.tone === 'error' ? (
            <div className="flex flex-col items-start gap-2">
              <InlineError variant="summary" className="w-full">
                {feedback.message}
              </InlineError>
              {feedback.action && (
                // Sin `loading`/`disabled`: el botón conserva el foco mientras se reintenta.
                <Button type="button" variant="secondary" onClick={feedback.action.onClick}>
                  {feedback.action.label}
                </Button>
              )}
            </div>
          ) : (
            <div role="status" className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface-sunken p-3 text-sm text-ink">
              <p>{feedback.message}</p>
              {feedback.action && (
                <Button type="button" variant="secondary" onClick={feedback.action.onClick}>
                  {feedback.action.label}
                </Button>
              )}
            </div>
          )
        )}

        {notQueued && (
          <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-subtle p-3 text-warning-text">
            <div role="alert" className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{copy.notQueuedTitle}</p>
              <p className="text-sm">{notQueued.url ? copy.notQueuedBody : copy.notQueuedNoLink}</p>
            </div>
            {notQueued.url && (
              <>
                <Label htmlFor={linkFieldId}>{copy.linkLabel}</Label>
                <Input
                  id={linkFieldId}
                  ref={linkInputRef}
                  readOnly
                  value={notQueued.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs text-ink"
                />
                <p role="status" aria-live="polite" className="text-xs empty:hidden">
                  {copyState === 'idle' ? null : (
                    <span key={copyCount}>{copyState === 'copied' ? copy.copied : copy.copyFailed}</span>
                  )}
                </p>
              </>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              {notQueued.url && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => void copyLink(notQueued.url ?? '')}
                >
                  {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {copy.copyLink}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => setNotQueued(null)}
              >
                {copy.dismiss}
              </Button>
            </div>
          </div>
        )}

        {delivered}
      </>
    );
  }

  // DX-250: en una cita cancelada o no-show, sin nada que mostrar, nada.
  if (readOnly && (!data || data.deliveries.length === 0)) return null;

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-border-subtle pt-4 focus:outline-none"
    >
      <h3 id={headingId} className="t-title text-ink">
        {copy.heading}
      </h3>
      {body()}
    </section>
  );
}
