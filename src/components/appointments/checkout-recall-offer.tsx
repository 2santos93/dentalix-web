'use client';
import * as React from 'react';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { recallNoticeCopy, recallUpdatesNotice } from '@/lib/recall/recall-notice';
import {
  announceRecallChanged,
  createDefaultPatientRecall,
  isRecallAlreadySet,
  type PatientRecall,
} from '@/lib/recall/recall-api';
import { checkoutRecallOffer, monthsLabel, type OfferedRecallType } from '@/lib/recall/recall-offer';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const checkoutRecallCopy = {
  schedule: (type: string, months: number) => `Programar recall de ${type.toLowerCase()} (${monthsLabel(months)})`,
  more: 'Otros…',
  moreLabel: 'Otros tipos de recall',
  saveError: 'No pudimos programar el recall. Intenta de nuevo.',
  alreadySet: 'Ya tenía un recall de ese tipo: actualizamos la lista.',
  scheduledFallback: (type: string) => `Recall de ${type} programado`,
};
const copy = checkoutRecallCopy;

/** Lo que queda tras programar el recall desde la salida. */
export interface ScheduledRecall {
  typeName: string;
  recall: PatientRecall | null;
  /** D9: «Recall de Higiene desactivado: lo sustituye …»; `null` si la exclusión no tocó nada. */
  excluded: string | null;
}

/**
 * DX-015-bis (D16): «Programar recall de <tipo> (N meses)» en el punto
 * «Próxima visita» de la salida, con el intervalo por defecto del tipo (D15).
 * Los dos primeros tipos como botón; el resto en «Otros…». Un 409 (alguien lo
 * creó entretanto) relee la lista. No bloquea completar la cita.
 */
export function CheckoutRecallOffer({
  token,
  patientId,
  types,
  onScheduled,
  onStale,
}: {
  token: string;
  patientId: string;
  types: readonly OfferedRecallType[];
  onScheduled: (scheduled: ScheduledRecall) => void;
  /** Releer la lista de salida (409: ya lo tenía). */
  onStale: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const offer = checkoutRecallOffer(false, types);
  if (!offer) return null;

  async function schedule(type: OfferedRecallType) {
    setBusyId(type.id);
    setError(null);
    setInfo(null);
    try {
      const result = await createDefaultPatientRecall(token, patientId, type.id);
      announceRecallChanged(patientId);
      onScheduled({
        typeName: type.name,
        recall: result.recalls.find((r) => r.recallTypeId === type.id) ?? null,
        excluded: recallUpdatesNotice(result.recallUpdates, null),
      });
    } catch (err) {
      if (isRecallAlreadySet(err)) {
        setInfo(copy.alreadySet);
        onStale();
      } else {
        setError(apiErrorMessage(err, { fallback: copy.saveError }));
      }
    } finally {
      setBusyId(null);
    }
  }

  const busy = busyId !== null;
  return (
    <div className="flex flex-col gap-2" data-testid="checkout-recall-offer">
      <div className="flex flex-wrap gap-2">
        {offer.buttons.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-busy={busyId === t.id || undefined}
            onClick={() => void schedule(t)}
          >
            {copy.schedule(t.name, t.defaultIntervalMonths)}
          </Button>
        ))}
        {offer.more.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={copy.moreLabel}>
                {copy.more}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {offer.more.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => void schedule(t)}>
                  {copy.schedule(t.name, t.defaultIntervalMonths)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {error ? <InlineError>{error}</InlineError> : null}
      <p role="status" className={info ? 'text-xs text-muted' : 'sr-only'}>
        {info}
      </p>
    </div>
  );
}

/**
 * «Recall de Higiene: vence el 15/05/2027», con la fecha en el formato de la
 * sede del recall; sin ese formato, sin fecha (nunca otro formato).
 */
export function ScheduledRecallText({ token, scheduled }: { token: string; scheduled: ScheduledRecall }) {
  const stamp = useSedeStamp(token, [scheduled.recall?.locationId]);
  const day = scheduled.recall ? stamp.maybe.civilDate(scheduled.recall.dueAt, scheduled.recall.locationId) : null;
  return <>{day ? recallNoticeCopy.due(scheduled.typeName, day) : copy.scheduledFallback(scheduled.typeName)}</>;
}
