'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Mail, MessageCircle, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import type { SedeClock } from '@/lib/locations/sede-clock';
import {
  deliverPostOp,
  getAppointmentPostOp,
  postOpPrintHref,
  whatsAppUrl,
  type PostOpChannel,
  type PostOpSuggestions,
  type PostOpTemplateSummary,
} from '@/lib/postop/postop-api';
import { SectionError } from '@/components/errors/section-error';
import { notifyError } from '@/components/errors/notify';
import { Button } from '@/components/ui/button';
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
  choose: 'Elige unas indicaciones',
  chooseHint: 'Elige unas indicaciones para entregarlas.',
  noTemplates:
    'La clínica aún no tiene indicaciones activas. Un administrador las crea en Ajustes.',
  print: 'Imprimir',
  email: 'Enviar por email',
  whatsapp: 'Abrir WhatsApp',
  emailBlocked: 'No se puede enviar por email a este paciente.',
  whatsappBlocked: 'El teléfono del paciente no sirve para WhatsApp: revísalo en su ficha o escríbelo con + y su prefijo.',
  emailSent: (to: string) => `Indicaciones enviadas a ${to}.`,
  emailSentToResponsible: (to: string) =>
    `Indicaciones enviadas al responsable del paciente (${to}).`,
  emailNotQueued:
    'La entrega quedó registrada, pero el email no se pudo encolar. Comparte el enlace o usa WhatsApp.',
  printed: 'Entrega registrada: la vista para imprimir se abrió en otra pestaña.',
  printBlocked: 'Entrega registrada. El navegador bloqueó la pestaña para imprimir.',
  openPrint: 'Abrir para imprimir',
  whatsappRecorded: 'Entrega registrada: WhatsApp se abrió en otra pestaña.',
  whatsappBlockedPopup: 'Entrega registrada. El navegador bloqueó la pestaña de WhatsApp.',
  openWhatsApp: 'Abrir WhatsApp',
  deliverError: 'No pudimos entregar las indicaciones.',
  deliveredHeading: 'Entregadas en esta cita',
  noDeliveries: 'Aún no se han entregado indicaciones en esta cita.',
  channel: {
    PRINT: 'Impresas',
    EMAIL: 'Email',
    WHATSAPP_LINK: 'WhatsApp',
  } satisfies Record<PostOpChannel, string>,
  version: (code: string, version: number) => `${code} v${version}`,
};

interface AppointmentPostOpPanelProps {
  token: string;
  appointmentId: string;
  /** DX-378: reloj de la sede de la cita, para la hora de cada entrega. */
  clock: SedeClock | null;
}

/** Abre la pestaña ya registrada la entrega; si el navegador la bloqueó, deja el enlace en el aviso. */
function finishInTab(
  win: Window | null,
  href: string,
  messages: { opened: string; blocked: string; action: string },
) {
  if (win) {
    win.location.href = href;
    toast.success(messages.opened);
    return;
  }
  toast.success(messages.blocked, {
    action: {
      label: messages.action,
      onClick: () => window.open(href, '_blank', 'noopener,noreferrer'),
    },
  });
}

/**
 * Bloque del detalle de la cita (DX-222): propone las indicaciones del
 * procedimiento o del tipo de cita y las entrega impresas, por email o por un
 * enlace de WhatsApp. Cada entrega queda registrada con la versión exacta de
 * la plantilla. El padre lo monta con `key` por cita.
 */
export function AppointmentPostOpPanel({ token, appointmentId, clock }: AppointmentPostOpPanelProps) {
  const ids = useId();
  const headingId = `${ids}-heading`;
  const emailHintId = `${ids}-email-hint`;
  const whatsappHintId = `${ids}-whatsapp-hint`;
  const chooseHintId = `${ids}-choose-hint`;
  const othersId = `${ids}-others`;
  const deliveredId = `${ids}-delivered`;

  const [data, setData] = useState<PostOpSuggestions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<PostOpChannel | null>(null);
  const deliveringRef = useRef(false);
  const [interacted, setInteracted] = useState(false);

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
   */
  async function deliver(templateId: string, channel: PostOpChannel) {
    if (deliveringRef.current) return;
    deliveringRef.current = true;
    setInteracted(true);
    const win = channel === 'EMAIL' ? null : window.open('', '_blank');
    if (win) win.opener = null;
    setBusy(channel);
    try {
      const result = await deliverPostOp(token, appointmentId, { templateId, channel });
      if (channel === 'EMAIL' && !result.emailQueued) {
        // La API registró la entrega pero el email no entró en la cola.
        toast.warning(copy.emailNotQueued);
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
        });
      } else if (result.whatsapp) {
        finishInTab(win, whatsAppUrl(result.whatsapp.phone, result.whatsapp.text), {
          opened: copy.whatsappRecorded,
          blocked: copy.whatsappBlockedPopup,
          action: copy.openWhatsApp,
        });
      } else {
        win?.close();
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
      // Escalón 3: el panel sigue igual; el reintento repite esta misma entrega.
      notifyError(apiErrorMessage(err, { fallback: copy.deliverError }), {
        onRetry: () => void deliver(templateId, channel),
      });
    } finally {
      deliveringRef.current = false;
      setBusy(null);
    }
  }

  function templatePicker(d: PostOpSuggestions, selectedId: string | null) {
    if (d.suggested.length > 0) {
      return (
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">{copy.suggestedLegend}</legend>
          {d.suggested.map((t) => (
            <label
              key={t.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface-2"
            >
              <input
                type="radio"
                name={`${ids}-template`}
                value={t.id}
                checked={selectedId === t.id}
                onChange={() => {
                  setInteracted(true);
                  setChosenId(t.id);
                }}
                className="size-4 accent-primary"
              />
              <span className="text-sm text-ink">{t.title}</span>
              <span className="text-xs tabular-nums text-muted">{copy.version(t.code, t.version)}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <p role={interacted ? 'status' : undefined} className="text-sm text-muted">
          {copy.noneSuggested}
        </p>
        {d.others.length > 0 ? (
          <>
            <label htmlFor={othersId} className="text-xs font-medium text-muted">
              {copy.othersLabel}
            </label>
            <select
              id={othersId}
              value={selectedId ?? ''}
              onChange={(e) => {
                setInteracted(true);
                setChosenId(e.target.value || null);
              }}
              className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">{copy.choose}</option>
              {d.others.map((t: PostOpTemplateSummary) => (
                <option key={t.id} value={t.id}>
                  {`${t.title} (${copy.version(t.code, t.version)})`}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="text-sm text-muted">{copy.noTemplates}</p>
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
    const describedBy = (reason: string | null, hintId: string) =>
      [noTemplate && hasTemplates ? chooseHintId : null, reason ? hintId : null]
        .filter(Boolean)
        .join(' ') || undefined;

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
              aria-describedby={describedBy(emailReason, emailHintId)}
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
        {whatsappReason && (
          <p id={whatsappHintId} className="text-xs text-muted">
            {whatsappReason}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <h4 id={deliveredId} className="text-xs font-medium tracking-wide text-muted">
            {copy.deliveredHeading}
          </h4>
          {data.deliveries.length === 0 ? (
            <p className="text-sm text-muted">{copy.noDeliveries}</p>
          ) : (
            <ul aria-labelledby={deliveredId} className="flex flex-col divide-y divide-hairline">
              {data.deliveries.map((d) => (
                <li key={d.id} className="py-2 text-sm tabular-nums text-ink first:pt-0 last:pb-0">
                  {[
                    copy.version(d.templateCode, d.templateVersion),
                    copy.channel[d.channel],
                    clock ? clock.fmt.dateTime(new Date(d.deliveredAt), clock.timeZone) : NO_SEDE_FORMAT,
                    d.deliveredByName,
                  ].join(' · ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-hairline pt-4">
      <h3 id={headingId} className="text-sm font-semibold text-ink">
        {copy.heading}
      </h3>
      {body()}
    </section>
  );
}
