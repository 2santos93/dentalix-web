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
import { buttonVariants } from '@/components/ui/button';

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
  close: 'Cerrar',
  sent: 'Oferta enviada',
  sentEmail: 'Correo en camino',
  openWhatsApp: 'Abrir WhatsApp',
  openWhatsAppFor: (name: string) => `Abrir WhatsApp con la oferta para ${name}`,
  whatsappHint: 'Abre cada WhatsApp y envía el mensaje: ya lleva el enlace.',
  error: 'No se pudo enviar. Intenta de nuevo.',
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
  candidates,
  onSent,
}: LinkOfferDialogProps) {
  const ids = React.useId();
  const emailCount = candidates.filter((c) => linkOfferChannels(c).LINK_EMAIL).length;
  const [channel, setChannel] = useState<LinkOfferChannel>(emailCount > 0 ? 'LINK_EMAIL' : 'LINK_WA_ME');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const eligible = candidates.filter((c) => linkOfferChannels(c)[channel]);
  const skipped = candidates.filter((c) => !linkOfferChannels(c)[channel]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (eligible.length === 0) return;
    setSubmitting(true);
    const out: Result[] = [];
    for (const c of eligible) {
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
    setSubmitting(false);
    setResults(out);
    if (out.some((r) => r.ok)) onSent();
  }

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
      submitHint={eligible.length === 0 ? linkOfferCopy.none : null}
      hideSubmit={results !== null}
      lockCloseWhileSubmitting
      touchTargets
    >
      {results ? (
        <div className="flex flex-col gap-3">
          <ul data-testid="link-offer-results" className="flex flex-col divide-y divide-hairline rounded-xl border border-border">
            {results.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex min-w-0 items-start gap-2 text-sm text-ink">
                  {r.ok ? (
                    <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
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
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
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
        </div>
      ) : (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-ink">{linkOfferCopy.channelLegend}</legend>
          {(Object.keys(linkOfferCopy.channels) as LinkOfferChannel[]).map((ch) => {
            const ok = candidates.filter((c) => linkOfferChannels(c)[ch]).length;
            return (
              <label
                key={ch}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name={`${ids}-channel`}
                  value={ch}
                  checked={channel === ch}
                  onChange={() => setChannel(ch)}
                  className="size-4 accent-primary"
                />
                <span className="text-sm text-ink">{linkOfferCopy.channels[ch]}</span>
                <span className="text-xs tabular-nums text-muted">
                  {linkOfferCopy.channelCount(ok, candidates.length)}
                </span>
              </label>
            );
          })}
          {skipped.length > 0 && eligible.length > 0 ? (
            <p className="mt-1 text-xs text-muted">{linkOfferCopy.skipped(skipped.map(fullName).join(', '))}</p>
          ) : null}
        </fieldset>
      )}
    </FormModal>
  );
}
