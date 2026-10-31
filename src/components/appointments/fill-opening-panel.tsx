'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { announceAppointmentWarnings } from '@/components/appointments/appointment-warnings';
import { CalendarCheck, Link2, MessageCircle, MessageCircleReply, Phone, PhoneCall } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import {
  createWaitlistOffer,
  linkOfferChannels,
  listOpeningCandidates,
  moveAppointmentToOpening,
  offerMessage,
  recordOfferOutcome,
  type OfferOutcome,
  type OpeningCandidate,
  type OpeningCandidates,
  type OpeningSlot,
  type SlotLinkOffers,
} from '@/lib/appointments/opening-candidates';
import { LinkOfferDialog } from './link-offer-dialog';
import { scheduleFromWaitlist, type AppointmentWrite } from '@/lib/appointments/waitlist-api';
import { longAppointmentDay } from '@/lib/appointments/confirmation-message';
import { sedeTime, sedeTimeRange, type SedeClock } from '@/lib/locations/sede-clock';
import { notifyError } from '@/components/errors/notify';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { endSentence } from '@/lib/format/text';

// Copy as constants (i18n-ready, es-first).
export const fillOpeningCopy = {
  title: 'Ocupar este hueco',
  description: (day: string, range: string, provider: string, location: string) =>
    [day, range, provider, location].filter(Boolean).join(' · '),
  loading: 'Buscando candidatos…',
  loadError: 'No pudimos cargar los candidatos.',
  retry: 'Reintentar',
  empty: 'Nadie en la lista cabe en este hueco',
  emptyHint: 'Ni los pendientes por agendar ni las citas marcadas «Adelantar si hay hueco».',
  // DX-233: el hueco cae fuera del horario del profesional en la sede.
  offSchedule: 'Este hueco queda fuera del horario del profesional en la sede',
  offScheduleHint: 'No se proponen candidatos. Revisa su horario en Ajustes › Horarios › Profesionales.',
  showWaitlist: 'Ver pendientes',
  count: (n: number) => (n === 1 ? '1 candidato' : `${n} candidatos`),
  truncated: 'Se muestran los 50 primeros.',
  urgent: 'Urgente',
  pending: 'Pendiente',
  earlier: 'Adelantar cita',
  currentAppointment: (when: string) => `Cita actual: ${when}`,
  prefers: (w: string) => `Prefiere: ${w}`,
  minutes: (n: number) => `${n} min`,
  offersToday: (n: number, cap: number) => `Ofertas hoy: ${n} de ${cap}`,
  offered: 'Aviso enviado',
  whatsapp: 'Ofrecer por WhatsApp',
  whatsappFor: (name: string) => `Ofrecer el hueco por WhatsApp a ${name}`,
  whatsappBlocked: 'No recibe WhatsApp: llámalo',
  whatsappNoOptIn: 'Sin permiso de WhatsApp: llámalo',
  openWhatsApp: 'Abrir WhatsApp',
  call: 'Llamar',
  callFor: (name: string, phone: string) => `Llamar a ${name} al ${phone}`,
  called: 'Llamé',
  calledFor: (name: string) => `Anotar la llamada a ${name}`,
  outcomeLegend: (name: string) => `¿Qué respondió ${name}?`,
  answer: 'Anotar respuesta',
  answerFor: (name: string) => `Anotar la respuesta de ${name}`,
  answerRecorded: (name: string) => `Respuesta de ${name} anotada.`,
  answerError: 'No pudimos anotar la respuesta. Intenta de nuevo.',
  outcomes: {
    ACCEPTED: 'Aceptó',
    DECLINED: 'No aceptó',
    NO_ANSWER: 'No contestó',
  } satisfies Record<OfferOutcome, string>,
  capReached: 'Ya alcanzó el tope de ofertas de hoy',
  assign: 'Asignar',
  assignFor: (name: string) => `Asignar el hueco a ${name}`,
  assigned: (name: string, when: string) => endSentence(`Hueco asignado: ${name}, ${when}`),
  offerRecorded: (name: string) => `Oferta a ${name} registrada.`,
  offerError: 'No pudimos registrar la oferta. Intenta de nuevo.',
  assignError: 'No pudimos asignar el hueco. Intenta de nuevo.',
  // DX-435: oferta con enlace (el primero que acepta se queda el hueco).
  select: (name: string) => `Elegir a ${name} para la oferta con enlace`,
  selectedCount: (n: number) => (n === 1 ? '1 elegido' : `${n} elegidos`),
  sendLinkOffer: 'Enviar oferta con enlace',
  linkTooLate: 'Faltan menos de 20 minutos: ya no da tiempo a ofrecerlo por enlace.',
  linkNoChannel: 'Sin correo ni WhatsApp: llámalo',
  slotOffersSent: (n: number) => `Oferta enviada (${n})`,
  slotAcceptedBy: (name: string) => `Aceptado por ${name}`,
  slotExpired: 'Caducado',
  linkStates: {
    OPEN: 'Enlace enviado',
    ACCEPTED: 'Aceptó por enlace',
    DECLINED: 'Rechazó el enlace',
    EXPIRED: 'Enlace caducado',
    TAKEN: 'Lo ocupó otro',
  } satisfies Record<NonNullable<OpeningCandidate['linkOfferState']>, string>,
  linkAccepted: (name: string) => `${name} aceptó el hueco por enlace.`,
};

/** DX-435: con ofertas con enlace sin responder, el panel se refresca solo. */
export const LINK_OFFER_POLL_MS = 15_000;

const LINK_STATE_VARIANT = {
  OPEN: 'warning',
  ACCEPTED: 'success',
  DECLINED: 'muted',
  EXPIRED: 'muted',
  TAKEN: 'muted',
} as const;

/** «Oferta enviada (n)», «Aceptado por …» o «Caducado» del hueco; `null` si no hay enlaces. */
export function slotLinkOffersLabel(summary: SlotLinkOffers | undefined): string | null {
  if (!summary || summary.total === 0) return null;
  if (summary.acceptedBy) {
    return fillOpeningCopy.slotAcceptedBy(
      `${summary.acceptedBy.firstName} ${summary.acceptedBy.lastName}`.trim(),
    );
  }
  if (summary.pending > 0) return fillOpeningCopy.slotOffersSent(summary.pending);
  return summary.expired ? fillOpeningCopy.slotExpired : null;
}

interface FillOpeningPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** El hueco (o la cita recién cancelada) a ocupar. */
  slot: OpeningSlot;
  /** DX-378: reloj de la sede del hueco: el día y la hora en la agenda y en el mensaje. */
  clock: SedeClock;
  providerName: string;
  locationName: string;
  /** RECEPTION y ADMIN: ofrecer y asignar. El odontólogo solo mira. */
  canAct: boolean;
  /** Se asignó: la agenda se refresca y muestra al paciente nuevo. */
  onAssigned: (appointment: AppointmentWrite) => void;
  /** El hueco ya no estaba libre (409): la agenda también está desfasada. */
  onAgendaStale: () => void;
  /** «Ver pendientes» del estado vacío. */
  onShowWaitlist: () => void;
}

function fullName(c: OpeningCandidate): string {
  return `${c.patientFirstName} ${c.patientLastName}`.trim();
}

function whenLabel(start: string, clock: SedeClock): string {
  return `${longAppointmentDay(start, clock.timeZone)} a las ${sedeTime(start, clock)}`;
}

/**
 * «Ocupar este hueco» (DX-210): quién de la lista puede ocupar un hueco libre
 * de la agenda — pendientes que caben (urgentes primero) y citas futuras
 * marcadas «Adelantar si hay hueco» (la más lejana primero) —, con «Ofrecer
 * por WhatsApp» (sin datos clínicos, solo si el paciente no se dio de baja),
 * «Llamé» con su resultado y «Asignar». Hoja a la derecha en escritorio y a
 * pantalla completa en el móvil.
 */
export function FillOpeningPanel({
  open,
  onOpenChange,
  token,
  slot,
  clock,
  providerName,
  locationName,
  canAct,
  onAssigned,
  onAgendaStale,
  onShowWaitlist,
}: FillOpeningPanelProps) {
  const [data, setData] = useState<OpeningCandidates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Candidatos que ya no sirven aquí (el hueco lo ocupó otro al asignarlos).
  const [gone, setGone] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // El grupo de resultados abierto: «Llamé» (oferta nueva por teléfono) o
  // «Anotar respuesta» (a la oferta pendiente de este hueco, p. ej. el WhatsApp).
  const [outcomeFor, setOutcomeFor] = useState<{ key: string; mode: OutcomeMode } | null>(null);
  // DX-435: candidatos elegidos para la oferta con enlace y su modal.
  const [selected, setSelected] = useState<string[]>([]);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const acceptedRef = React.useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await listOpeningCandidates(token, slot);
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, fillOpeningCopy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, slot, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  // DX-435: mientras haya enlaces sin responder, sondeo (sin el esqueleto: los
  // datos se quedan a la vista) para ver «Aceptado por …» sin recargar.
  const pendingLinks = open ? (data?.linkOffers?.pending ?? 0) : 0;
  useEffect(() => {
    if (pendingLinks === 0) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setReloadKey((k) => k + 1);
    }, LINK_OFFER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pendingLinks]);

  // Alguien aceptó desde el enlace: aviso y la agenda se pone al día.
  const acceptedBy = data?.linkOffers?.acceptedBy ?? null;
  useEffect(() => {
    if (!acceptedBy) return;
    const key = `${acceptedBy.patientId}:${acceptedBy.at ?? ''}`;
    if (acceptedRef.current === key) return;
    const first = acceptedRef.current === null && loading;
    acceptedRef.current = key;
    if (first) return;
    toast.success(fillOpeningCopy.linkAccepted(`${acceptedBy.firstName} ${acceptedBy.lastName}`.trim()));
    onAgendaStale();
  }, [acceptedBy, loading, onAgendaStale]);
  const keyOf = (c: OpeningCandidate) => c.waitlistEntryId ?? c.appointmentId ?? c.patientId;
  const items = (data?.items ?? []).filter((c) => !gone.includes(keyOf(c)));
  const cap = data?.offerCap ?? 2;
  const linkOpen = canAct && (data?.linkOfferOpen ?? false) && !acceptedBy;
  const selectedCandidates = items.filter((c) => selected.includes(keyOf(c)));
  const slotLinkLabel = slotLinkOffersLabel(data?.linkOffers);

  async function recordCall(c: OpeningCandidate, outcome: OfferOutcome) {
    setBusyKey(keyOf(c));
    try {
      await createWaitlistOffer(token, slot, c, { channel: 'PHONE', outcome });
      toast.success(fillOpeningCopy.offerRecorded(fullName(c)));
      setOutcomeFor(null);
    } catch (err) {
      notifyError(apiErrorMessage(err, fillOpeningCopy.offerError));
    } finally {
      setBusyKey(null);
      reload();
    }
  }

  /**
   * «Ofrecer por WhatsApp»: la oferta se registra ANTES de abrir WhatsApp (el
   * tope del día y el permiso de DX-128 los decide la API; si dice que no, no
   * se escribe). La pestaña se abre en el mismo clic, en blanco, para que el
   * bloqueador de ventanas no la frene, y se carga `wa.me` al registrarse. Si
   * el navegador la bloqueó igualmente, el aviso trae «Abrir WhatsApp».
   */
  async function offerByWhatsApp(c: OpeningCandidate, href: string) {
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    setBusyKey(keyOf(c));
    try {
      await createWaitlistOffer(token, slot, c, { channel: 'WA_ME' });
      if (win) {
        win.location.href = href;
        toast.success(fillOpeningCopy.offerRecorded(fullName(c)));
      } else {
        toast.success(fillOpeningCopy.offerRecorded(fullName(c)), {
          action: {
            label: fillOpeningCopy.openWhatsApp,
            onClick: () => window.open(href, '_blank', 'noopener,noreferrer'),
          },
        });
      }
    } catch (err) {
      win?.close();
      notifyError(apiErrorMessage(err, fillOpeningCopy.offerError));
    } finally {
      setBusyKey(null);
      reload();
    }
  }

  /** «Anotar respuesta» a la oferta pendiente del hueco (contestó el WhatsApp). */
  async function answer(c: OpeningCandidate, outcome: OfferOutcome) {
    if (!c.pendingOfferId) return;
    setBusyKey(keyOf(c));
    try {
      await recordOfferOutcome(token, c.pendingOfferId, outcome);
      toast.success(fillOpeningCopy.answerRecorded(fullName(c)));
      setOutcomeFor(null);
    } catch (err) {
      notifyError(apiErrorMessage(err, fillOpeningCopy.answerError));
    } finally {
      setBusyKey(null);
      reload();
    }
  }

  async function assign(c: OpeningCandidate) {
    setBusyKey(keyOf(c));
    try {
      const appointment =
        c.kind === 'WAITLIST' && c.waitlistEntryId
          ? await scheduleFromWaitlist(token, c.waitlistEntryId, {
              providerId: slot.providerId,
              start: slot.start,
            })
          : await moveAppointmentToOpening(token, c.appointmentId ?? '', slot);
      toast.success(fillOpeningCopy.assigned(fullName(c), whenLabel(appointment.start, clock)));
      announceAppointmentWarnings(appointment);
      onAssigned(appointment);
    } catch (err) {
      notifyError(apiErrorMessage(err, fillOpeningCopy.assignError));
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
        // Otro usuario ocupó el hueco (o el candidato ya no está): se quita
        // de la lista, se recarga y la agenda se pone al día.
        setGone((prev) => [...prev, keyOf(c)]);
        onAgendaStale();
        reload();
      }
    } finally {
      setBusyKey(null);
    }
  }

  const description = fillOpeningCopy.description(
    longAppointmentDay(slot.start, clock.timeZone),
    sedeTimeRange(slot.start, slot.end, clock),
    providerName,
    locationName,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="fill-opening-panel"
        className="h-[100dvh] max-h-[100dvh] rounded-t-none sm:w-[28rem]"
      >
        <SheetHeader className="pr-12">
          <SheetTitle>{fillOpeningCopy.title}</SheetTitle>
          <SheetDescription className="tabular-nums first-letter:uppercase">
            {description}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3 px-4 sm:px-6">
          {/* Fuera del ternario: «Aceptado por …» sigue a la vista aunque la
              lista quede vacía (el que aceptó ya no es candidato). */}
          {slotLinkLabel ? (
            <Badge
              data-testid="slot-link-offers"
              role="status"
              className="self-start"
              variant={acceptedBy ? 'success' : (data?.linkOffers.pending ?? 0) > 0 ? 'warning' : 'muted'}
            >
              {slotLinkLabel}
            </Badge>
          ) : null}
          {loading && !data ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <span className="sr-only">{fillOpeningCopy.loading}</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full" aria-hidden />
              ))}
            </div>
          ) : error && !data ? (
            <SectionError
              description={error}
              onRetry={reload}
              retryLabel={fillOpeningCopy.retry}
              className="py-10"
            />
          ) : data?.providerOffSchedule ? (
            <EmptyState
              role="status"
              title={fillOpeningCopy.offSchedule}
              description={fillOpeningCopy.offScheduleHint}
            />
          ) : items.length === 0 ? (
            <EmptyState
              role="status"
              title={fillOpeningCopy.empty}
              description={fillOpeningCopy.emptyHint}
              action={
                <Button type="button" variant="secondary" size="sm" onClick={onShowWaitlist}>
                  {fillOpeningCopy.showWaitlist}
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs tabular-nums text-muted" aria-live="polite">
                  {fillOpeningCopy.count(items.length)}
                  {data?.truncated ? ` · ${fillOpeningCopy.truncated}` : ''}
                </p>
              </div>
              {canAct && !acceptedBy ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2">
                  {linkOpen ? (
                    <>
                      <span className="text-xs tabular-nums text-muted" aria-live="polite">
                        {fillOpeningCopy.selectedCount(selectedCandidates.length)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="ml-auto"
                        disabled={selectedCandidates.length === 0}
                        onClick={() => setLinkDialogOpen(true)}
                      >
                        <Link2 aria-hidden /> {fillOpeningCopy.sendLinkOffer}
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-muted">{fillOpeningCopy.linkTooLate}</p>
                  )}
                </div>
              ) : null}
              <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface">
                {items.map((c) => (
                  <CandidateRow
                    key={keyOf(c)}
                    candidate={c}
                    cap={cap}
                    slot={slot}
                    clock={clock}
                    providerName={providerName}
                    locationName={locationName}
                    // Con el hueco ya aceptado por enlace no queda nada que ofrecer
                    // ni asignar (la agenda ya lo muestra ocupado).
                    canAct={canAct && !acceptedBy}
                    busy={busyKey === keyOf(c)}
                    selectable={linkOpen && (linkOfferChannels(c).LINK_EMAIL || linkOfferChannels(c).LINK_WA_ME) && c.offersToday < cap && c.linkOfferState !== 'OPEN'}
                    selected={selected.includes(keyOf(c))}
                    onToggleSelected={() =>
                      setSelected((prev) =>
                        prev.includes(keyOf(c)) ? prev.filter((k) => k !== keyOf(c)) : [...prev, keyOf(c)],
                      )
                    }
                    outcomeMode={outcomeFor?.key === keyOf(c) ? outcomeFor.mode : null}
                    onToggleOutcome={(mode) =>
                      setOutcomeFor((prev) =>
                        prev?.key === keyOf(c) && prev.mode === mode ? null : { key: keyOf(c), mode },
                      )
                    }
                    onWhatsApp={(href) => void offerByWhatsApp(c, href)}
                    onOutcome={(mode, outcome) =>
                      void (mode === 'ANSWER' ? answer(c, outcome) : recordCall(c, outcome))
                    }
                    onAssign={() => void assign(c)}
                  />
                ))}
              </ul>
            </>
          )}
        </SheetBody>
        {linkDialogOpen ? (
          <LinkOfferDialog
            open
            onOpenChange={setLinkDialogOpen}
            token={token}
            slot={slot}
            clock={clock}
            providerName={providerName}
            locationName={locationName}
            candidates={selectedCandidates}
            onSent={() => {
              setSelected([]);
              reload();
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type OutcomeMode = 'PHONE' | 'ANSWER';

interface CandidateRowProps {
  candidate: OpeningCandidate;
  cap: number;
  slot: OpeningSlot;
  clock: SedeClock;
  providerName: string;
  locationName: string;
  canAct: boolean;
  busy: boolean;
  /** DX-435: se puede elegir para la oferta con enlace. */
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  outcomeMode: OutcomeMode | null;
  onToggleOutcome: (mode: OutcomeMode) => void;
  onWhatsApp: (href: string) => void;
  onOutcome: (mode: OutcomeMode, outcome: OfferOutcome) => void;
  onAssign: () => void;
}

function CandidateRow({
  candidate: c,
  cap,
  slot,
  clock,
  providerName,
  locationName,
  canAct,
  busy,
  selectable,
  selected,
  onToggleSelected,
  outcomeMode,
  onToggleOutcome,
  onWhatsApp,
  onOutcome,
  onAssign,
}: CandidateRowProps) {
  const name = fullName(c);
  const capReached = c.offersToday >= cap;
  // Una llamada nueva no cabe con el tope (p. ej. otro la anotó mientras el
  // panel estaba abierto: 409): sus resultados se cierran. Anotar la respuesta
  // a una oferta ya hecha no cuenta para el tope.
  const shownOutcome = outcomeMode === 'PHONE' && capReached ? null : outcomeMode;
  const what = c.appointmentType?.name ?? c.reason;
  const canWhatsApp = !c.whatsappBlocked && c.whatsappPhone !== null;
  const waHref = c.whatsappPhone
    ? whatsAppUrl(
        c.whatsappPhone,
        offerMessage({
          firstName: c.patientFirstName,
          start: slot.start,
          locationName,
          providerName,
          clock,
        }),
      )
    : null;
  const outcomeGroupId = React.useId();
  const selectId = React.useId();
  const channels = linkOfferChannels(c);

  return (
    <li data-testid="opening-candidate" className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {selectable ? (
          <label htmlFor={selectId} className="flex min-h-6 min-w-0 cursor-pointer items-start gap-2">
            <Checkbox
              id={selectId}
              checked={selected}
              onChange={onToggleSelected}
              aria-label={fillOpeningCopy.select(name)}
              className="mt-0.5"
            />
            <span className="min-w-0 break-words text-sm font-semibold text-ink">{name}</span>
          </label>
        ) : (
          <p className="min-w-0 break-words text-sm font-semibold text-ink">{name}</p>
        )}
        <div className="flex shrink-0 flex-wrap gap-1">
          {c.priority === 'URGENT' ? <Badge variant="danger">{fillOpeningCopy.urgent}</Badge> : null}
          <Badge variant="muted">
            {c.kind === 'WAITLIST' ? fillOpeningCopy.pending : fillOpeningCopy.earlier}
          </Badge>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-muted">
        <p className="tabular-nums">
          {[what, fillOpeningCopy.minutes(c.durationMinutes)].filter(Boolean).join(' · ')}
        </p>
        {c.currentAppointment ? (
          <p className="tabular-nums text-ink">
            {fillOpeningCopy.currentAppointment(whenLabel(c.currentAppointment.start, clock))}
          </p>
        ) : null}
        {c.preferredWindow ? <p>{fillOpeningCopy.prefers(c.preferredWindow)}</p> : null}
        <div className="flex flex-wrap items-center gap-2 tabular-nums">
          <span>{fillOpeningCopy.offersToday(c.offersToday, cap)}</span>
          {c.linkOfferState ? (
            <Badge variant={LINK_STATE_VARIANT[c.linkOfferState]}>{fillOpeningCopy.linkStates[c.linkOfferState]}</Badge>
          ) : c.offeredForSlot ? (
            <Badge variant="warning">{fillOpeningCopy.offered}</Badge>
          ) : null}
        </div>
        {canAct && !channels.LINK_EMAIL && !channels.LINK_WA_ME ? (
          <p className="text-muted">{fillOpeningCopy.linkNoChannel}</p>
        ) : null}
        {c.whatsappBlocked ? (
          <p className="text-warning-text">
            {c.whatsappBlockedReason === 'NO_OPT_IN'
              ? fillOpeningCopy.whatsappNoOptIn
              : fillOpeningCopy.whatsappBlocked}
          </p>
        ) : null}
      </div>

      {canAct ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {canWhatsApp && waHref && !capReached ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={fillOpeningCopy.whatsappFor(name)}
                disabled={busy}
                onClick={() => onWhatsApp(waHref)}
              >
                <MessageCircle aria-hidden /> {fillOpeningCopy.whatsapp}
              </Button>
            ) : null}
            {!canWhatsApp && c.phone ? (
              <a
                href={`tel:${c.phone}`}
                aria-label={fillOpeningCopy.callFor(name, c.phone)}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                <Phone aria-hidden /> {fillOpeningCopy.call}
              </a>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-label={fillOpeningCopy.calledFor(name)}
              aria-expanded={shownOutcome === 'PHONE'}
              aria-controls={outcomeGroupId}
              disabled={busy || capReached}
              onClick={() => onToggleOutcome('PHONE')}
            >
              <PhoneCall aria-hidden /> {fillOpeningCopy.called}
            </Button>
            {c.pendingOfferId ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={fillOpeningCopy.answerFor(name)}
                aria-expanded={shownOutcome === 'ANSWER'}
                aria-controls={outcomeGroupId}
                disabled={busy}
                onClick={() => onToggleOutcome('ANSWER')}
              >
                <MessageCircleReply aria-hidden /> {fillOpeningCopy.answer}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              aria-label={fillOpeningCopy.assignFor(name)}
              loading={busy}
              disabled={busy}
              onClick={onAssign}
            >
              <CalendarCheck aria-hidden /> {fillOpeningCopy.assign}
            </Button>
          </div>
          {capReached ? <p className="text-xs text-muted">{fillOpeningCopy.capReached}</p> : null}
          {shownOutcome ? (
            <div
              id={outcomeGroupId}
              role="group"
              aria-label={fillOpeningCopy.outcomeLegend(name)}
              className="flex flex-wrap gap-2 rounded-lg bg-surface-sunken p-2"
            >
              {(Object.keys(fillOpeningCopy.outcomes) as OfferOutcome[]).map((outcome) => (
                <Button
                  key={outcome}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onOutcome(shownOutcome, outcome)}
                >
                  {fillOpeningCopy.outcomes[outcome]}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
