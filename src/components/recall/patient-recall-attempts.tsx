'use client';
import * as React from 'react';
import { useState } from 'react';
import { PhoneOff } from 'lucide-react';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { CHANNEL_LABELS, OUTCOME_LABELS } from '@/lib/recall/presentation';
import { attemptsLabel, recallWriteError } from '@/lib/recall/attempts-presentation';
import type { PatientRecall, RecallContact } from '@/lib/recall/recall-api';
import { clearPhoneReview, type RecallPhoneReview } from '@/lib/recall/recall-attempts-api';
import { recallTypeLabel } from '@/lib/recall/recall-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { InlineError } from '@/components/errors/inline-error';

/**
 * DX-465: lo del ciclo de intentos en la ficha. Vive en su propio trozo de JS
 * (`dynamic` desde `patient-recall-section`): la ficha tiene 73 KB propios de
 * presupuesto y esto solo hace falta cuando hay recalls o contactos.
 */
export const patientRecallAttemptsCopy = {
  attempts: (label: string) => `Intentos: ${label}`,
  exhausted: 'Intentos agotados',
  callbackOn: (day: string) => `Llamar el ${day}`,
  hiddenUntil: (day: string) => `Fuera de la lista hasta el ${day}`,
  contactsHeading: 'Historial de intentos',
  noContacts: 'Sin intentos.',
  contactCallback: (day: string) => `Volver a llamar el ${day}`,
  by: (name: string | null) => (name ? `por ${name}` : 'por un miembro que ya no está en la clínica'),
  phoneReviewTitle: 'Teléfono por revisar',
  phoneReview: (day: string, name: string | null) =>
    `Un intento lo marcó como número erróneo el ${day}${name ? `, ${name}` : ''}. Corrige el teléfono en los datos del paciente (al cambiarlo se quita solo) o márcalo como corregido.`,
  phoneReviewNoDay: 'Un intento lo marcó como número erróneo. Corrige el teléfono en los datos del paciente (al cambiarlo se quita solo) o márcalo como corregido.',
  clear: 'Ya está corregido',
  clearError: 'No pudimos quitar la marca del teléfono. Intenta de nuevo.',
};
const copy = patientRecallAttemptsCopy;

/** La línea del ciclo de un recall: «Intentos: 1 de 3 · Llamar el 12/12/2026». Nada si no hay intentos. */
export function RecallCycleLine({ recall, stamp }: { recall: PatientRecall; stamp: SedePainters }) {
  if (recall.attempts === 0 && !recall.hiddenUntil && !recall.callbackOn) return null;
  const callback = recall.callbackOn ? stamp.maybe.civilDate(recall.callbackOn, recall.locationId) : null;
  const hidden = !callback && recall.hiddenUntil ? stamp.maybe.civilDate(recall.hiddenUntil, recall.locationId) : null;
  const parts = [
    copy.attempts(attemptsLabel(recall.attempts, recall.maxAttempts)),
    callback ? copy.callbackOn(callback) : null,
    hidden ? copy.hiddenUntil(hidden) : null,
  ].filter(Boolean);
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-muted tabular-nums" data-testid="recall-cycle">
      {parts.join(' · ')}
      {recall.exhausted ? <Badge variant="warning">{copy.exhausted}</Badge> : null}
    </span>
  );
}

/** El historial de intentos del paciente (todos sus recalls), más recientes primero. */
export function RecallContactHistory({ contacts, stamp }: { contacts: readonly RecallContact[]; stamp: SedePainters }) {
  return (
    <div className="min-w-0">
      <h3 className="t-label mb-2 mt-3 text-muted">{copy.contactsHeading}</h3>
      {contacts.length === 0 ? (
        <p className="text-sm text-muted">{copy.noContacts}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface">
          {contacts.map((c) => {
            const callback = c.callbackOn ? stamp.maybe.civilDate(c.callbackOn, c.locationId) : null;
            return (
              <li key={c.id} className="flex min-w-0 flex-col gap-1 px-4 py-3 text-sm" data-testid="recall-contact-row">
                <span className="font-medium text-ink">
                  {recallTypeLabel(c)} · {CHANNEL_LABELS[c.channel]} · {OUTCOME_LABELS[c.outcome]}
                </span>
                {callback ? <span className="text-ink tabular-nums">{copy.contactCallback(callback)}</span> : null}
                {c.note ? <p className="whitespace-pre-line break-words text-ink">{c.note}</p> : null}
                <span className="text-xs text-muted tabular-nums">
                  {stamp.dateTime(c.createdAt, c.locationId)} {copy.by(c.author.fullName)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * «Teléfono por revisar» (D4): lo puso un intento «Número erróneo». «Ya está
 * corregido» lo quita (`POST /patients/:id/phone-review/clear`, los cuatro
 * roles); cambiar el teléfono del paciente también.
 */
export function PhoneReviewNotice({
  token,
  patientId,
  phoneReview,
  stamp,
  onCleared,
}: {
  token: string;
  patientId: string;
  phoneReview: RecallPhoneReview;
  stamp: SedePainters;
  onCleared: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = stamp.maybe.date(phoneReview.flaggedAt);

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      await clearPhoneReview(token, patientId);
      onCleared();
    } catch (err) {
      setError(recallWriteError(err, copy.clearError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Callout
      tone="warning"
      icon={PhoneOff}
      title={copy.phoneReviewTitle}
      data-testid="phone-review"
      action={
        <Button type="button" variant="secondary" size="sm" onClick={() => void clear()} disabled={busy}>
          {copy.clear}
        </Button>
      }
    >
      <p>{day ? copy.phoneReview(day, phoneReview.flaggedBy.fullName) : copy.phoneReviewNoDay}</p>
      {error ? <InlineError className="mt-1">{error}</InlineError> : null}
    </Callout>
  );
}
