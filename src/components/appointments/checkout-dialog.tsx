'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CircleCheck, CircleAlert } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  checkoutItems,
  getCheckoutChecklist,
  type CheckoutChecklist,
  type CheckoutItem,
} from '@/lib/appointments/checkout-checklist';
import { SectionError } from '@/components/errors/section-error';
import { FormModal } from '@/components/shared/form-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from '@/components/shared/external-link';
import { CheckoutRecallOffer, ScheduledRecallText, type ScheduledRecall } from './checkout-recall-offer';

export const checkoutCopy = {
  title: (name: string) => `Salida de ${name}`,
  description: 'Antes de despedirlo, revisa si falta algo. Puedes completar la cita aunque quede algo pendiente.',
  submit: 'Completar la cita',
  /** FE-108: la primaria mientras llega la lista; sin ella no se completa. */
  loading: 'Cargando…',
  submitWithPending: (count: number) => `Completar con ${count} pendiente${count === 1 ? '' : 's'}`,
  loadError: 'No pudimos comprobar la salida del paciente.',
  completeError: 'No pudimos completar la cita. Intenta de nuevo.',
  remindersOff: 'Dio de baja los recordatorios.',
  open: 'Abrir ficha',
  items: {
    NEXT_VISIT: { done: 'Tiene próxima cita o recall', pending: 'Sin próxima cita ni recall', tab: '' },
    PAYMENT: { done: 'Sin saldo vencido', pending: 'Tiene saldo vencido', tab: '?tab=account-statement' },
    PHONE: { done: 'Tiene teléfono', pending: 'Falta el teléfono', tab: '' },
    EMAIL: { done: 'Tiene correo', pending: 'Falta el correo', tab: '' },
  } satisfies Record<CheckoutItem, { done: string; pending: string; tab: string }>,
};

/**
 * DX-202: la salida del paciente. Enseña qué falta, con un enlace a la ficha en
 * otra pestaña para resolverlo, y se relee al volver a esta. No bloquea: lo que
 * quede pendiente viaja al completar y queda en la auditoría.
 *
 * FE-108: sin la lista no se puede completar. Mientras carga, la primaria está
 * ocupada y desactivada; si falla, desaparece y queda «Reintentar» (rung 1).
 * Completar sin ella mandaría `checkoutPending = []`: nada en la auditoría.
 */
export function CheckoutDialog({
  token,
  appointmentId,
  patientName,
  onOpenChange,
  onComplete,
}: {
  token: string;
  appointmentId: string;
  patientName: string;
  onOpenChange: (open: boolean) => void;
  onComplete: (pending: CheckoutItem[]) => Promise<boolean>;
}) {
  const [list, setList] = useState<CheckoutChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // DX-015-bis (D16): el recall programado desde aquí, para decir cuándo vence.
  const [scheduled, setScheduled] = useState<ScheduledRecall | null>(null);

  const load = useCallback(() => {
    getCheckoutChecklist(token, appointmentId).then(
      (data) => {
        setList(data);
        setError(null);
      },
      (err: unknown) => setError(apiErrorMessage(err, checkoutCopy.loadError)),
    );
  }, [token, appointmentId]);

  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  // «Reintentar» vuelve al esqueleto (y a la primaria ocupada) mientras pide;
  // la relectura al volver a la pestaña no, para no parpadear sobre el error.
  const retry = useCallback(() => {
    setError(null);
    load();
  }, [load]);

  // Programado aquí, el punto queda hecho sin esperar a la relectura.
  const items = list
    ? checkoutItems(list).map((i) => (i.item === 'NEXT_VISIT' && scheduled ? { ...i, done: true } : i))
    : [];
  const pending = items.filter((i) => !i.done).map((i) => i.item);
  const loadError = list ? null : error;
  const failed = loadError !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!list) return;
    setSubmitting(true);
    setSubmitError(null);
    const done = await onComplete(pending);
    setSubmitting(false);
    if (done) onOpenChange(false);
    // DX-538: el botón del aviso no se puede pulsar con el diálogo abierto: se reintenta desde aquí.
    else setSubmitError(checkoutCopy.completeError);
  }

  return (
    <FormModal
      open
      onOpenChange={onOpenChange}
      title={checkoutCopy.title(patientName)}
      description={checkoutCopy.description}
      onSubmit={handleSubmit}
      submitLabel={
        !list
          ? checkoutCopy.loading
          : pending.length > 0
            ? checkoutCopy.submitWithPending(pending.length)
            : checkoutCopy.submit
      }
      submitBusy={!list && !failed}
      hideSubmit={failed}
      submitting={submitting}
      error={submitError}
    >
      {loadError !== null ? (
        <SectionError description={loadError} onRetry={retry} />
      ) : !list ? (
        <div role="status" className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
          {items.map(({ item, done }) => {
            const text = checkoutCopy.items[item];
            const Icon = done ? CircleCheck : CircleAlert;
            const offerRecall = item === 'NEXT_VISIT' && !done && list.recallTypes.length > 0;
            return (
              <li
                key={item}
                data-testid={`checkout-${item}`}
                data-done={done}
                className="flex flex-col gap-2 px-3 py-2 text-sm text-ink"
              >
                <span className="flex min-h-11 items-center justify-between gap-3 sm:min-h-7">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon aria-hidden className={done ? 'size-4 shrink-0 text-success-text' : 'size-4 shrink-0 text-warning-text'} />
                    {item === 'NEXT_VISIT' && done && scheduled ? (
                      <ScheduledRecallText token={token} scheduled={scheduled} />
                    ) : done ? (
                      text.done
                    ) : (
                      text.pending
                    )}
                  </span>
                  {done ? null : (
                    <ExternalLink
                      href={`/patients/${list.patientId}${text.tab}`}
                      className="inline-flex min-h-11 shrink-0 items-center font-medium text-primary-text underline-offset-4 hover:underline sm:min-h-6"
                    >
                      {checkoutCopy.open}
                      <span className="sr-only">: {text.pending}</span>
                    </ExternalLink>
                  )}
                </span>
                {offerRecall ? (
                  <CheckoutRecallOffer
                    token={token}
                    patientId={list.patientId}
                    appointmentId={appointmentId}
                    types={list.recallTypes}
                    onScheduled={(next) => {
                      setScheduled(next);
                      load();
                    }}
                    onStale={load}
                  />
                ) : null}
                {item === 'NEXT_VISIT' && scheduled?.excluded ? (
                  <p className="text-xs text-muted">{scheduled.excluded}.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {list?.remindersOptedOut ? <p className="text-xs text-muted">{checkoutCopy.remindersOff}</p> : null}
    </FormModal>
  );
}
