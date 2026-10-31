'use client';
import { Textarea } from '@/components/ui/textarea';
import * as React from 'react';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CalendarSearch, Phone } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  dismissWaitlistEntry,
  type AppointmentWrite,
  type WaitlistEntry,
} from '@/lib/appointments/waitlist-api';
import { WAITLIST_LOAD_ERROR, type WaitlistState } from '@/components/appointments/use-waitlist';
import { waitingLabel, waitlistOriginLabel } from '@/lib/appointments/waitlist-display';
import type { StaffMember } from '@/lib/appointments/staff-api';
import type { AgendaClock } from '@/lib/locations/sede-clock';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import { notifyError } from '@/components/errors/notify';
import {
  OpeningsDialog,
  waitlistPatientName,
} from '@/components/appointments/openings-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { SectionError } from '@/components/errors/section-error';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready, es-first).
export const waitlistCopy = {
  title: 'Pendientes por agendar',
  count: (n: number) => (n === 1 ? '1 paciente' : `${n} pacientes`),
  loading: 'Cargando pendientes…',
  empty: 'No hay pacientes pendientes por agendar',
  emptyHint: 'Al cancelar una cita o marcar que no vino, el paciente aparece aquí para volver a llamarlo.',
  loadError: WAITLIST_LOAD_ERROR,
  retry: 'Reintentar',
  urgent: 'Urgente',
  prefers: (w: string) => `Prefiere: ${w}`,
  findSlot: 'Buscar hueco',
  findSlotFor: (name: string) => `Buscar hueco para ${name}`,
  dismiss: 'Descartar',
  dismissFor: (name: string) => `Descartar a ${name}`,
  dismissTitle: (name: string) => `Descartar a ${name}`,
  dismissDescription:
    'Sale de la lista sin agendarle cita. Queda registrado quién lo descartó y por qué.',
  reason: 'Motivo',
  reasonPlaceholder: 'No contesta, ya agendó por su cuenta, se mudó…',
  reasonMissing: 'Escribe el motivo para descartarlo.',
  dismissError: 'No pudimos descartarlo. Intenta de nuevo.',
  dismissed: (name: string) => `${name} salió de pendientes.`,
  more: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
  call: (phone: string) => `Llamar al ${phone}`,
};

/** Quien atiende pacientes (tiene agenda): odontología y administración. */
export function attendingStaff(staff: StaffMember[]): StaffMember[] {
  return staff.filter((s) => s.role === 'DENTIST' || s.role === 'ADMIN');
}

interface WaitlistPanelProps {
  token: string;
  staff: StaffMember[];
  /** DX-378: cada entrada, con el reloj de su sede. */
  clock: AgendaClock;
  /** La lista, cargada UNA vez por la agenda (`useWaitlist`). */
  waitlist: WaitlistState;
  /** Se agendó una cita desde la lista: la agenda se refresca. */
  onScheduled?: (appointment: AppointmentWrite) => void;
  className?: string;
}

/**
 * «Pendientes por agendar» (DX-122): pacientes que cancelaron o no vinieron
 * (y altas manuales), urgentes primero y luego por antigüedad. Desde cada uno:
 * «Buscar hueco» → «Agendar aquí», o «Descartar» con motivo.
 */
export function WaitlistPanel({
  token,
  staff,
  clock,
  waitlist,
  onScheduled,
  className,
}: WaitlistPanelProps) {
  const { entries, total, loading, error, reload, remove } = waitlist;
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [searching, setSearching] = useState<WaitlistEntry | null>(null);
  const searchingOwnClock = searching ? clock.of(searching.locationId) : null;
  const searchingClock = searching && searchingOwnClock ? { entry: searching, clock: searchingOwnClock } : null;
  const [dismissing, setDismissing] = useState<WaitlistEntry | null>(null);
  const [reason, setReason] = useState('');
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissSubmitting, setDismissSubmitting] = useState(false);
  // La tarjeta que abrió el diálogo ya no está: el foco va al título del panel.
  const entryGone = useRef(false);

  function focusAfterClose(event: Event) {
    if (!entryGone.current) return;
    entryGone.current = false;
    event.preventDefault();
    titleRef.current?.focus();
  }

  function resolved(entry: WaitlistEntry) {
    entryGone.current = true;
    remove(entry.id);
  }

  function handleScheduled(entry: WaitlistEntry, appointment: AppointmentWrite) {
    resolved(entry);
    setSearching(null);
    onScheduled?.(appointment);
  }

  function openDismiss(entry: WaitlistEntry) {
    setReason('');
    setDismissError(null);
    setDismissing(entry);
  }

  async function submitDismiss(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dismissing) return;
    if (reason.trim() === '') {
      setDismissError(waitlistCopy.reasonMissing);
      return;
    }
    setDismissSubmitting(true);
    try {
      await dismissWaitlistEntry(token, dismissing.id, reason.trim());
      toast.success(waitlistCopy.dismissed(waitlistPatientName(dismissing)));
      resolved(dismissing);
      setDismissing(null);
    } catch (err) {
      setDismissError(apiErrorMessage(err, waitlistCopy.dismissError));
    } finally {
      setDismissSubmitting(false);
    }
  }

  return (
    <section aria-labelledby={titleId} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <header className="flex items-baseline justify-between gap-2">
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="t-title rounded text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {waitlistCopy.title}
        </h2>
        {!loading && !error ? (
          <span className="t-caption tabular-nums text-muted">{waitlistCopy.count(total)}</span>
        ) : null}
      </header>

      {loading ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">{waitlistCopy.loading}</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" aria-hidden />
          ))}
        </div>
      ) : error ? (
        <SectionError
          description={error}
          onRetry={reload}
          retryLabel={waitlistCopy.retry}
          className="py-10"
        />
      ) : entries.length === 0 ? (
        // Una línea, no una caja vacía: comparte columna con «En clínica».
        <p role="status" className="text-sm text-muted">
          <span className="font-medium text-ink">{waitlistCopy.empty}</span>
          {'. '}
          <span>{waitlistCopy.emptyHint}</span>
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-border bg-surface">
            {entries.map((entry) => {
              const name = waitlistPatientName(entry);
              return (
                <li key={entry.id} data-testid="waitlist-entry" className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-ink">{name}</p>
                    {entry.priority === 'URGENT' ? (
                      <Badge variant="danger" className="shrink-0">
                        {waitlistCopy.urgent}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs text-muted">
                    <p>{waitlistOriginLabel(entry, clock.of(entry.locationId))}</p>
                    <p className="tabular-nums">
                      {waitingLabel(entry.createdAt, clock.timeZone)} · {entry.durationMinutes} min
                    </p>
                    {entry.preferredWindow ? <p>{waitlistCopy.prefers(entry.preferredWindow)}</p> : null}
                    {entry.note ? <p className="text-ink">{entry.note}</p> : null}
                    {entry.patientPhone ? (
                      <a
                        href={`tel:${entry.patientPhone}`}
                        aria-label={waitlistCopy.call(entry.patientPhone)}
                        className="inline-flex items-center gap-1 self-start rounded text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Phone className="size-3.5" aria-hidden />
                        <span className="tabular-nums">{entry.patientPhone}</span>
                      </a>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      aria-label={waitlistCopy.findSlotFor(name)}
                      onClick={() => {
                        // Los huecos se buscan y se pintan en el reloj de la sede de la entrada.
                        if (clock.of(entry.locationId)) setSearching(entry);
                        else notifyError(SEDE_LOCALE_ERROR);
                      }}
                    >
                      <CalendarSearch aria-hidden /> {waitlistCopy.findSlot}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={waitlistCopy.dismissFor(name)}
                      onClick={() => openDismiss(entry)}
                    >
                      {waitlistCopy.dismiss}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {total > entries.length ? (
            <p className="text-xs text-muted">{waitlistCopy.more(entries.length, total)}</p>
          ) : null}
        </>
      )}

      {searchingClock ? (
        <OpeningsDialog
          key={searchingClock.entry.id}
          open
          onOpenChange={(open) => {
            if (!open) setSearching(null);
          }}
          token={token}
          entry={searchingClock.entry}
          clock={searchingClock.clock}
          providers={attendingStaff(staff)}
          onScheduled={(appointment) => handleScheduled(searchingClock.entry, appointment)}
          onEntryGone={() => {
            resolved(searchingClock.entry);
            setSearching(null);
          }}
          onCloseAutoFocus={focusAfterClose}
        />
      ) : null}

      <FormModal
        open={dismissing !== null}
        onOpenChange={(open) => {
          if (!open) setDismissing(null);
        }}
        title={dismissing ? waitlistCopy.dismissTitle(waitlistPatientName(dismissing)) : ''}
        description={waitlistCopy.dismissDescription}
        onSubmit={submitDismiss}
        submitLabel={waitlistCopy.dismiss}
        submitting={dismissSubmitting}
        error={dismissError}
        onCloseAutoFocus={focusAfterClose}
      >
        <FormField htmlFor="waitlist-dismiss-reason" label={waitlistCopy.reason}>
          <Textarea
            id="waitlist-dismiss-reason"
            maxLength={200}
            rows={3}
            value={reason}
            placeholder={waitlistCopy.reasonPlaceholder}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      </FormModal>
    </section>
  );
}
