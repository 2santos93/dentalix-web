'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { HandCoins, NotebookPen } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';
import {
  getPatientCollections,
  type PatientCollections,
} from '@/lib/collections/collections-api';
import {
  CHANNEL_LABELS,
  OUTCOME_LABELS,
  PROMISE_STATUS_BADGE,
  PROMISE_STATUS_LABELS,
} from '@/lib/collections/presentation';
import { AsyncSection } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CollectionNoteDialog } from './collection-note-dialog';
import { PaymentPromiseDialog } from './payment-promise-dialog';

export const collectionsCopy = {
  heading: 'Cobranza',
  description: 'Gestiones de cobro y compromisos de pago. No se editan ni se borran: una corrección es otra gestión.',
  registerNote: 'Registrar gestión',
  promise: 'Compromiso de pago',
  notesHeading: 'Gestiones',
  promisesHeading: 'Compromisos de pago',
  loadError: 'No pudimos cargar la cobranza.',
  emptyTitle: 'Sin gestiones de cobro',
  emptyHint: 'Registra cada llamada, mensaje o conversación sobre el pago para que el equipo sepa qué se habló.',
  noPromises: 'Sin compromisos de pago.',
  noNotes: 'Sin gestiones.',
  by: (name: string | null) => (name ? `por ${name}` : 'por un miembro que ya no está en la clínica'),
  promiseLine: (amount: string, day: string) => `${amount} para el ${day}`,
  covered: (amount: string) => `Abonado: ${amount}`,
  // DX-215: estaba cumplido y se anuló el abono que lo cumplía.
  reopened: (when: string) => `Reabierto el ${when}: se anuló el abono que lo cumplía.`,
  noteSaved: 'Gestión registrada.',
  promiseSaved: 'Compromiso de pago registrado.',
};

/**
 * Bloque «Cobranza» de la ficha (DX-150), en el estado de cuenta: historial de
 * gestiones (append-only) y de compromisos con su estado y lo abonado, y las
 * dos acciones en modales. Solo ADMIN y RECEPTION (quien llama decide si se
 * pinta; la API vuelve a comprobar el rol).
 */
export function PatientCollectionsSection({
  token,
  patient,
  debtCurrencies = [],
  refreshKey = 0,
}: {
  token: string;
  patient: { id: string; fullName: string };
  /** Monedas con saldo vencido (de la cabecera): las que propone el compromiso. */
  debtCurrencies?: string[];
  /** Cambia cuando se registra o anula un abono en la ficha: se vuelve a leer (un abono puede cumplir el compromiso). */
  refreshKey?: number;
}) {
  const [data, setData] = useState<PatientCollections | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<'note' | 'promise' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getPatientCollections(token, patient.id);
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: collectionsCopy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patient.id, reloadKey, refreshKey]);

  const notes = data?.notes ?? [];
  const promises = data?.promises ?? [];
  const hasOpenPromise = promises.some((p) => p.status === 'OPEN');
  // Solo con la lista cargada: antes no se sabe si ya hay uno abierto (409).
  const canPromise = data !== null && !error && !hasOpenPromise;
  const currencies = [...new Set([...debtCurrencies, ...promises.map((p) => p.currency)])];

  return (
    <section aria-labelledby="collections-heading" className="flex flex-col gap-3" data-testid="patient-collections">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="collections-heading" className="text-lg font-semibold text-ink">
            {collectionsCopy.heading}
          </h2>
          <p className="max-w-[68ch] text-sm text-muted">{collectionsCopy.description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => setDialog('note')} className="max-sm:h-11">
            <NotebookPen aria-hidden />
            {collectionsCopy.registerNote}
          </Button>
          {canPromise ? (
            <Button type="button" variant="outline" onClick={() => setDialog('promise')} className="max-sm:h-11">
              <HandCoins aria-hidden />
              {collectionsCopy.promise}
            </Button>
          ) : null}
        </div>
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={notes.length === 0 && promises.length === 0}
        emptyTitle={collectionsCopy.emptyTitle}
        emptyDescription={collectionsCopy.emptyHint}
        skeleton={<Skeleton className="h-24 w-full" />}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="t-label mb-2 text-muted">{collectionsCopy.promisesHeading}</h3>
            {promises.length === 0 ? (
              <p className="text-sm text-muted">{collectionsCopy.noPromises}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-border bg-surface">
                {promises.map((p) => (
                  <li key={p.id} className="flex min-w-0 flex-col gap-1 px-4 py-3 text-sm" data-testid="promise-row">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={PROMISE_STATUS_BADGE[p.status]}>{PROMISE_STATUS_LABELS[p.status]}</Badge>
                      <span className="font-medium tabular-nums text-ink">
                        {collectionsCopy.promiseLine(formatCurrency(p.amount, p.currency), formatCivilDate(p.dueDate))}
                      </span>
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {collectionsCopy.covered(formatCurrency(p.covered, p.currency))} ·{' '}
                      {formatDateTime(p.createdAt)} {collectionsCopy.by(p.createdBy.fullName)}
                    </span>
                    {/* Si se volvió a cumplir con otro abono, ya no aplica. */}
                    {p.reopenedAt && p.status !== 'KEPT' ? (
                      <span className="text-xs text-warning-text tabular-nums">
                        {collectionsCopy.reopened(formatDateTime(p.reopenedAt))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="t-label mb-2 text-muted">{collectionsCopy.notesHeading}</h3>
            {notes.length === 0 ? (
              <p className="text-sm text-muted">{collectionsCopy.noNotes}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-border bg-surface">
                {notes.map((n) => (
                  <li key={n.id} className="flex min-w-0 flex-col gap-1 px-4 py-3 text-sm" data-testid="note-row">
                    <span className="font-medium text-ink">
                      {CHANNEL_LABELS[n.channel]} · {OUTCOME_LABELS[n.outcome]}
                    </span>
                    {n.text ? <p className="whitespace-pre-line break-words text-ink">{n.text}</p> : null}
                    <span className="text-xs text-muted tabular-nums">
                      {formatDateTime(n.createdAt)} {collectionsCopy.by(n.author.fullName)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </AsyncSection>

      <CollectionNoteDialog
        open={dialog === 'note'}
        onOpenChange={(open) => setDialog(open ? 'note' : null)}
        token={token}
        patient={patient}
        onSaved={() => {
          setNotice(collectionsCopy.noteSaved);
          setReloadKey((k) => k + 1);
        }}
      />
      <PaymentPromiseDialog
        open={dialog === 'promise'}
        onOpenChange={(open) => setDialog(open ? 'promise' : null)}
        token={token}
        patient={patient}
        currencies={currencies}
        onSaved={() => {
          setNotice(collectionsCopy.promiseSaved);
          setReloadKey((k) => k + 1);
        }}
      />
    </section>
  );
}
