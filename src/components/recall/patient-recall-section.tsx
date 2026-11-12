'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { CHANNEL_LABELS, OUTCOME_LABELS, intervalLabel } from '@/lib/recall/presentation';
import { recallUpdatesNotice } from '@/lib/recall/recall-notice';
import {
  getPatientRecalls,
  listRecallTypes,
  type PatientRecall,
  type PatientRecalls,
  type RecallType,
} from '@/lib/recall/recall-api';
import {
  recallBasis,
  recallRows,
  recallTypeKey,
  recallTypeLabel,
  recallTypeOptions,
  type RecallBasis,
  type RecallTypeOption,
} from '@/lib/recall/recall-types';
import { AsyncSection } from '@/components/shared/async-section';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { RecallContactDialog } from './recall-contact-dialog';
import { RecallIntervalDialog } from './recall-interval-dialog';

export const patientRecallCopy = {
  heading: 'Recall',
  description:
    'Cada cuánto debe volver y a quién se ha llamado. El plazo cuenta desde lo más reciente: el último procedimiento que lo reinicia o la fecha fijada a mano.',
  notSet: 'Sin recall',
  set: 'Fijar',
  change: 'Cambiar',
  register: 'Registrar contacto',
  setLabel: (kind: string) => `Fijar recall de ${kind.toLowerCase()}`,
  changeLabel: (kind: string) => `Cambiar recall de ${kind.toLowerCase()}`,
  registerLabel: (kind: string) => `Registrar contacto de ${kind.toLowerCase()}`,
  due: (day: string) => `Vence el ${day}`,
  // DX-015-bis: de dónde cuenta el plazo. Lo congelado en el despliegue no lo fijó nadie a mano.
  basis: {
    procedure: (day: string) => `Cuenta desde el procedimiento realizado el ${day}`,
    frozen: (day: string) => `Cuenta desde la última visita atendida, el ${day}`,
    manual: (day: string) => `Cuenta desde el ${day}, fijado a mano`,
  } satisfies Record<RecallBasis['kind'], (day: string) => string>,
  pausedUntil: (day: string, reason: string | null) => `En pausa hasta el ${day}${reason ? ` · ${reason}` : ''}`,
  typeGone: 'Este tipo ya no existe en la clínica: el recall se conserva, pero no se puede cambiar.',
  contactsHeading: 'Historial de contactos',
  noContacts: 'Sin contactos.',
  by: (name: string | null) => (name ? `por ${name}` : 'por un miembro que ya no está en la clínica'),
  loadError: 'No pudimos cargar el recall.',
  saved: 'Recall guardado.',
  contactSaved: 'Contacto registrado.',
};
const copy = patientRecallCopy;

type Dialog =
  | { type: 'interval'; recallType: RecallTypeOption; recall: PatientRecall | null }
  | { type: 'contact'; recall: PatientRecall }
  | null;

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
  const [data, setData] = useState<PatientRecalls | null>(null);
  // DX-015-bis: los tipos de la clínica; `null` si no se pudieron leer (respaldo: Higiene y Control).
  const [types, setTypes] = useState<RecallType[] | null>(null);
  // DX-354b: cada recall y cada contacto con el formato y el reloj de SU sede; un solo aviso por sección.
  const stamp = useSedeStamp(token, [
    ...(data?.recalls.map((r) => r.locationId) ?? []),
    ...(data?.contacts.map((c) => c.locationId) ?? []),
  ]);
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
        const [res, typesRes] = await Promise.all([
          getPatientRecalls(token, patient.id),
          listRecallTypes(token).catch(() => null),
        ]);
        if (cancelled) return;
        setData(res);
        setTypes(typesRes);
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
  const rows = recallRows(recallTypeOptions(types), data?.recalls ?? []);

  return (
    <section aria-labelledby="recall-heading" className="flex flex-col gap-3" data-testid="patient-recall">
      <SectionHeader titleId="recall-heading" title={copy.heading} description={copy.description} />
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>
      <SedeStampNote stamp={stamp} />
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={false}
        skeleton={<Skeleton className="h-24 w-full" />}
      >
        <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface">
          {rows.map(({ type, recall, editable }) => {
            const label = type.name;
            const basis = recall ? recallBasis(recall) : null;
            return (
              <li
                key={recall?.id ?? type.ref}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                data-testid={`recall-row-${recallTypeKey(type)}`}
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{label}</span>
                    {recall ? <StatusBadge kind="recall" status={recall.status} /> : null}
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {recall
                      ? `${intervalLabel(recall.intervalMonths)} · ${copy.due(stamp.civilDate(recall.dueAt, recall.locationId))}`
                      : copy.notSet}
                  </span>
                  {recall && basis ? (
                    <span className="text-xs text-muted tabular-nums" data-testid="recall-basis">
                      {copy.basis[basis.kind](stamp.civilDate(basis.day, recall.locationId))}
                    </span>
                  ) : null}
                  {!editable ? <span className="text-xs text-muted">{copy.typeGone}</span> : null}
                  {recall?.status === 'PAUSED' && recall.disabledUntil ? (
                    <span className="text-xs text-muted tabular-nums">
                      {copy.pausedUntil(stamp.civilDate(recall.disabledUntil, recall.locationId), recall.disabledReason)}
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
                  {canSet && editable ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={recall ? copy.changeLabel(label) : copy.setLabel(label)}
                      onClick={() => setDialog({ type: 'interval', recallType: type, recall })}
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
                    {recallTypeLabel(c)} · {CHANNEL_LABELS[c.channel]} · {OUTCOME_LABELS[c.outcome]}
                  </span>
                  {c.note ? <p className="whitespace-pre-line break-words text-ink">{c.note}</p> : null}
                  <span className="text-xs text-muted tabular-nums">
                    {stamp.dateTime(c.createdAt, c.locationId)} {copy.by(c.author.fullName)}
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
          typeRef={dialog.recallType.ref}
          typeName={dialog.recallType.name}
          defaultIntervalMonths={dialog.recallType.defaultIntervalMonths}
          recall={dialog.recall}
          onSaved={(saved) => {
            setData({ recalls: saved.recalls, contacts: saved.contacts });
            // D9: «Recall de Higiene desactivado: lo sustituye Mantenimiento periodontal».
            const excluded = recallUpdatesNotice(saved.recallUpdates, null);
            setNotice(excluded ? `${copy.saved} ${excluded}.` : copy.saved);
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
