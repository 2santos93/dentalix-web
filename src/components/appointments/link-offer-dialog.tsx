'use client';
import * as React from 'react';
import { useState } from 'react';
import { CheckCircle2, MessageCircle, XCircle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import {
  createLinkOffer,
  linkOfferChannels,
  linkOfferMessage,
  type LinkOfferChannel,
  type OpeningCandidate,
  type OpeningSlot,
} from '@/lib/appointments/opening-candidates';
import type { SedeClock } from '@/lib/locations/sede-clock';
import { FormModal } from '@/components/shared/form-modal';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';

// Copy as constants (i18n-ready, es-first).
export const linkOfferCopy = {
  title: 'Enviar oferta con enlace',
  description: (n: number) =>
    `${n === 1 ? 'Un paciente recibe' : `${n} pacientes reciben`} un enlace para aceptar el hueco. El primero que lo acepte se queda la cita; a los demás les dirá que ya se ocupó.`,
  channelLegend: 'Enviar por',
  channels: {
    LINK_EMAIL: 'Correo electrónico',
    LINK_WA_ME: 'WhatsApp',
  } satisfies Record<LinkOfferChannel, string>,
  channelCount: (ok: number, total: number) =>
    ok === total ? `A los ${total}` : `A ${ok} de ${total}`,
  skipped: (names: string) => `Sin este canal (no se les envía): ${names}.`,
  none: 'Ninguno de los elegidos puede recibirlo por este canal.',
  submit: 'Enviar oferta',
  close: 'Listo',
  sent: 'Oferta enviada',
  sentEmail: 'Correo en camino',
  openWhatsApp: 'Abrir WhatsApp',
  openWhatsAppFor: (name: string) => `Abrir WhatsApp con la oferta para ${name}`,
  whatsappHint: 'Abre cada WhatsApp y envía el mensaje: ya lleva el enlace.',
  error: 'No se pudo enviar. Intenta de nuevo.',
  // DX-486: el resumen se anuncia (role=status) y los fallidos se pueden reintentar.
  summary: (ok: number, total: number) =>
    ok === total
      ? total === 1
        ? 'Oferta enviada.'
        : `Oferta enviada a los ${total}.`
      : ok === 0
        ? `No se pudo enviar a ninguno de los ${total}.`
        : `Oferta enviada a ${ok} de ${total}. ${total - ok === 1 ? 'Falló 1' : `Fallaron ${total - ok}`}.`,
  retryFailed: 'Reintentar con los que fallaron',
};

type Result = {
  key: string;
  name: string;
  ok: boolean;
  message: string | null;
  waHref: string | null;
};

const fullName = (c: OpeningCandidate) => `${c.patientFirstName} ${c.patientLastName}`.trim();
const keyOf = (c: OpeningCandidate) => c.waitlistEntryId ?? c.appointmentId ?? c.patientId;

interface LinkOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  slot: OpeningSlot;
  clock: SedeClock;
  providerName: string;
  locationName: string;
  candidates: OpeningCandidate[];
  /** Se envió al menos una: el panel recarga y limpia la selección. */
  onSent: () => void;
}

/**
 * DX-435: «Enviar oferta con enlace» a los candidatos elegidos, por email o por
 * WhatsApp. Las ofertas se crean una a una (la API aplica a cada una DX-128,
 * el tope del día y la ventana de 20 minutos); por WhatsApp quedan los enlaces
 * «Abrir WhatsApp» con el mensaje ya escrito (el navegador no deja abrir
 * varias pestañas de golpe).
 */
export function LinkOfferDialog({
  open,
  onOpenChange,
  token,
  slot,
  clock,
  providerName,
  locationName,
  candidates: initialCandidates,
  onSent,
}: LinkOfferDialogProps) {
  const ids = React.useId();
  // Los elegidos al abrir: al enviar, el panel limpia su selección y la
  // recarga, y el modal tiene que seguir hablando de a quién se envió.
  const [candidates] = useState(initialCandidates);
  const emailCount = candidates.filter((c) => linkOfferChannels(c).LINK_EMAIL).length;
  const [channel, setChannel] = useState<LinkOfferChannel>(emailCount > 0 ? 'LINK_EMAIL' : 'LINK_WA_ME');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const statusRef = React.useRef<HTMLParagraphElement>(null);
  // Tras reintentar sin que quede nadie fallido, el botón desaparece: el foco
  // pasa al resumen en vez de caer en <body>.
  const focusStatus = React.useRef(false);
  React.useEffect(() => {
    if (!focusStatus.current) return;
    focusStatus.current = false;
    statusRef.current?.focus();
  }, [results]);

  const eligible = candidates.filter((c) => linkOfferChannels(c)[channel]);
  const skipped = candidates.filter((c) => !linkOfferChannels(c)[channel]);

  /** Crea las ofertas una a una: el fallo de una no frena a las demás. */
  async function send(targets: OpeningCandidate[]): Promise<Result[]> {
    const out: Result[] = [];
    for (const c of targets) {
      try {
        const offer = await createLinkOffer(token, slot, c, channel);
        const waHref =
          channel === 'LINK_WA_ME' && offer.url && offer.whatsappPhone
            ? whatsAppUrl(
                offer.whatsappPhone,
                linkOfferMessage({
                  firstName: c.patientFirstName,
                  start: slot.start,
                  locationName,
                  providerName,
                  clock,
                  url: offer.url,
                }),
              )
            : null;
        out.push({ key: keyOf(c), name: fullName(c), ok: true, message: null, waHref });
      } catch (err) {
        out.push({
          key: keyOf(c),
          name: fullName(c),
          ok: false,
          message: apiErrorMessage(err, linkOfferCopy.error),
          waHref: null,
        });
      }
    }
    return out;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (eligible.length === 0) return;
    setSubmitting(true);
    const out = await send(eligible);
    setSubmitting(false);
    setResults(out);
    if (out.some((r) => r.ok)) onSent();
  }

  /** Reenvía solo a los que fallaron; los que salieron bien no se repiten. */
  async function retryFailed() {
    if (!results) return;
    const failedKeys = new Set(results.filter((r) => !r.ok).map((r) => r.key));
    const targets = eligible.filter((c) => failedKeys.has(keyOf(c)));
    if (targets.length === 0) return;
    setSubmitting(true);
    const retried = await send(targets);
    setSubmitting(false);
    const merged = results.map((r) => retried.find((n) => n.key === r.key) ?? r);
    if (merged.every((r) => r.ok)) focusStatus.current = true;
    setResults(merged);
    if (retried.some((r) => r.ok)) onSent();
  }

  const okCount = results?.filter((r) => r.ok).length ?? 0;
  const failedCount = results ? results.length - okCount : 0;

  return (
    <FormModal
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
      title={linkOfferCopy.title}
      description={linkOfferCopy.description(candidates.length)}
      onSubmit={(e) => void submit(e)}
      submitLabel={linkOfferCopy.submit}
      cancelLabel={results ? linkOfferCopy.close : undefined}
      submitting={submitting}
      submitDisabled={eligible.length === 0}
      submitHint={results === null && eligible.length === 0 ? linkOfferCopy.none : null}
      hideSubmit={results !== null}
      lockCloseWhileSubmitting
      touchTargets
    >
      {/* Montada desde el principio (vacía) para que el lector anuncie el resumen. */}
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className={cn('text-sm font-medium text-ink focus-visible:outline-none', !results && 'sr-only')}
      >
        {results ? linkOfferCopy.summary(okCount, results.length) : null}
      </p>
      {results ? (
        <div className="flex flex-col gap-3">
          <ul data-testid="link-offer-results" className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border">
            {results.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex min-w-0 items-start gap-2 text-sm text-ink">
                  {r.ok ? (
                    <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success-text" />
                  ) : (
                    <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger-text" />
                  )}
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{r.name}</span>
                    {' · '}
                    {r.ok
                      ? channel === 'LINK_EMAIL'
                        ? linkOfferCopy.sentEmail
                        : linkOfferCopy.sent
                      : r.message}
                  </span>
                </span>
                {r.waHref ? (
                  <a
                    href={r.waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={linkOfferCopy.openWhatsAppFor(r.name)}
                    // DX-486: 44 px también en el enlace (el `touchTargets`
                    // del modal solo alcanza a los botones).
                    className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-11')}
                  >
                    <MessageCircle aria-hidden /> {linkOfferCopy.openWhatsApp}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          {results.some((r) => r.waHref) ? (
            <p className="text-xs text-muted">{linkOfferCopy.whatsappHint}</p>
          ) : null}
          {failedCount > 0 ? (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              disabled={submitting}
              onClick={() => void retryFailed()}
            >
              {linkOfferCopy.retryFailed}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <RadioGroup
            id={`${ids}-channel`}
            legend={linkOfferCopy.channelLegend}
            value={channel}
            onValueChange={(next) => setChannel(next as LinkOfferChannel)}
          >
            {(Object.keys(linkOfferCopy.channels) as LinkOfferChannel[]).map((ch, index) => {
              const ok = candidates.filter((c) => linkOfferChannels(c)[ch]).length;
              return (
                <RadioOption
                  key={ch}
                  id={index === 0 ? `${ids}-channel` : undefined}
                  value={ch}
                  // El recuento forma parte del nombre, como antes: «WhatsApp 2 de 3».
                  label={
                    <>
                      {linkOfferCopy.channels[ch]}{' '}
                      <span className="text-xs tabular-nums text-muted">
                        {linkOfferCopy.channelCount(ok, candidates.length)}
                      </span>
                    </>
                  }
                />
              );
            })}
          </RadioGroup>
          {skipped.length > 0 && eligible.length > 0 ? (
            <p className="mt-1 text-xs text-muted">{linkOfferCopy.skipped(skipped.map(fullName).join(', '))}</p>
          ) : null}
        </div>
      )}
    </FormModal>
  );
}
