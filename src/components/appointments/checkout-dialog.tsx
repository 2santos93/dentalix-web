'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
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

export const checkoutCopy = {
  title: (name: string) => `Salida de ${name}`,
  description: 'Antes de despedirlo, revisa si falta algo. Puedes completar la cita aunque quede algo pendiente.',
  submit: 'Completar la cita',
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

  const items = list ? checkoutItems(list) : [];
  const pending = items.filter((i) => !i.done).map((i) => i.item);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      submitLabel={pending.length > 0 ? checkoutCopy.submitWithPending(pending.length) : checkoutCopy.submit}
      submitting={submitting}
      error={submitError}
    >
      {error && !list ? (
        <SectionError description={error} onRetry={load} />
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
            return (
              <li
                key={item}
                data-testid={`checkout-${item}`}
                data-done={done}
                className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm text-ink"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon aria-hidden className={done ? 'size-4 shrink-0 text-success-text' : 'size-4 shrink-0 text-warning-text'} />
                  {done ? text.done : text.pending}
                </span>
                {done ? null : (
                  <Link
                    href={`/patients/${list.patientId}${text.tab}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex min-h-11 shrink-0 items-center font-medium text-primary-text underline-offset-4 hover:underline sm:min-h-6"
                  >
                    {checkoutCopy.open}
                    <span className="sr-only">: {text.pending}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {list?.remindersOptedOut ? <p className="text-xs text-muted">{checkoutCopy.remindersOff}</p> : null}
    </FormModal>
  );
}
