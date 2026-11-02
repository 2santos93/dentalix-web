'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatCivilDate } from '@/lib/format/date';
import { useSedeClock } from '@/lib/locations/sede-clock';
import {
  CHANNEL_LABELS,
  KIND_LABELS,
  KIND_ORDER,
  OUTCOME_LABELS,
  contactMoment,
  intervalLabel,
} from '@/lib/recall/presentation';
import { getPatientRecalls, type PatientRecall, type PatientRecalls, type RecallKind } from '@/lib/recall/recall-api';
import { AsyncSection } from '@/components/shared/async-section';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { RecallContactDialog } from './recall-contact-dialog';
import { RecallIntervalDialog } from './recall-interval-dialog';

export const patientRecallCopy = {
  heading: 'Recall',
  description: 'Cada cuánto debe volver y a quién se ha llamado. Una cita atendida reinicia el plazo.',
  notSet: 'Sin recall',
  set: 'Fijar',
  change: 'Cambiar',
  register: 'Registrar contacto',
  setLabel: (kind: string) => `Fijar recall de ${kind.toLowerCase()}`,
  changeLabel: (kind: string) => `Cambiar recall de ${kind.toLowerCase()}`,
  registerLabel: (kind: string) => `Registrar contacto de ${kind.toLowerCase()}`,
  due: (day: string) => `Vence el ${day}`,
  pausedUntil: (day: string, reason: string | null) => `En pausa hasta el ${day}${reason ? ` · ${reason}` : ''}`,
  contactsHeading: 'Historial de contactos',
  noContacts: 'Sin contactos.',
  by: (name: string | null) => (name ? `por ${name}` : 'por un miembro que ya no está en la clínica'),
  loadError: 'No pudimos cargar el recall.',
  saved: 'Recall guardado.',
  contactSaved: 'Contacto registrado.',
};
const copy = patientRecallCopy;

type Dialog = { type: 'interval'; kind: RecallKind } | { type: 'contact'; recall: PatientRecall } | null;

/**
 * Bloque «Recall» de la ficha (DX-015): un renglón por tipo con su vencimiento
 * y el historial de contactos. Lo ven los cuatro roles; lo fija el clínico
 * (`canSet`) y registra contactos el mostrador (`canContact`). La API vuelve a
 * comprobar el rol.
 */
export function PatientRecallSection({
  token,
  patient,
  canSet,
  canContact,
}: {
  token: string;
  patient: { id: string; fullName: string };
  canSet: boolean;
  canContact: boolean;
}) {
  const sede = useSedeClock(token);
  const clock = sede.status === 'ready' ? sede.clock : null;
  const [data, setData] = useState<PatientRecalls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getPatientRecalls(token, patient.id);
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: copy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patient.id, reloadKey]);

  const contacts = data?.contacts ?? [];
  const recallOf = (kind: RecallKind) => data?.recalls.find((r) => r.kind === kind) ?? null;

  return (
    <section aria-labelledby="recall-heading" className="flex flex-col gap-3" data-testid="patient-recall">
      <SectionHeader titleId="recall-heading" title={copy.heading} description={copy.description} />
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={false}
        skeleton={<Skeleton className="h-24 w-full" />}
      >
        <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface">
          {KIND_ORDER.map((kind) => {
            const recall = recallOf(kind);
            const label = KIND_LABELS[kind];
            return (
              <li
                key={kind}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                data-testid={`recall-row-${kind}`}
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{label}</span>
                    {recall ? <StatusBadge kind="recall" status={recall.status} /> : null}
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {recall
                      ? `${intervalLabel(recall.intervalMonths)} · ${copy.due(formatCivilDate(recall.dueAt))}`
                      : copy.notSet}
                  </span>
                  {recall?.status === 'PAUSED' && recall.disabledUntil ? (
                    <span className="text-xs text-muted tabular-nums">
                      {copy.pausedUntil(formatCivilDate(recall.disabledUntil), recall.disabledReason)}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-2">
                  {canContact && recall ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={copy.registerLabel(label)}
                      onClick={() => setDialog({ type: 'contact', recall })}
                    >
                      {copy.register}
                    </Button>
                  ) : null}
                  {canSet ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={recall ? copy.changeLabel(label) : copy.setLabel(label)}
                      onClick={() => setDialog({ type: 'interval', kind })}
                    >
                      {recall ? copy.change : copy.set}
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="min-w-0">
          <h3 className="t-label mb-2 mt-3 text-muted">{copy.contactsHeading}</h3>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted">{copy.noContacts}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface">
              {contacts.map((c) => (
                <li key={c.id} className="flex min-w-0 flex-col gap-1 px-4 py-3 text-sm" data-testid="recall-contact-row">
                  <span className="font-medium text-ink">
                    {KIND_LABELS[c.kind]} · {CHANNEL_LABELS[c.channel]} · {OUTCOME_LABELS[c.outcome]}
                  </span>
                  {c.note ? <p className="whitespace-pre-line break-words text-ink">{c.note}</p> : null}
                  <span className="text-xs text-muted tabular-nums">
                    {contactMoment(c.createdAt, clock)} {copy.by(c.author.fullName)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AsyncSection>

      {dialog?.type === 'interval' ? (
        <RecallIntervalDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          token={token}
          patientId={patient.id}
          kind={dialog.kind}
          recall={recallOf(dialog.kind)}
          onSaved={(saved) => {
            setData(saved);
            setNotice(copy.saved);
          }}
        />
      ) : null}
      {dialog?.type === 'contact' ? (
        <RecallContactDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          token={token}
          recallId={dialog.recall.id}
          patientName={patient.fullName}
          onSaved={() => {
            setNotice(copy.contactSaved);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </section>
  );
}
