'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  checkLabOrder,
  labOrderNumberLabel,
  receiveLabOrder,
  sendLabOrder,
  suggestLabOrderDueDate,
  type LabOrder,
} from '@/lib/lab-orders/lab-orders-api';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { DatePicker } from '@/components/ui/date-picker';

export type LabOrderStepKind = 'send' | 'receive' | 'check';

export const labOrderStepCopy = {
  sendTitle: (n: string) => `Enviar la orden ${n}`,
  sendDescription: (lab: string) =>
    `Queda registrado que hoy sale para ${lab}. Desde ese momento la orden ya no cambia: si hay que corregirla, se crea una nueva que la sustituye.`,
  sendConfirm: 'Enviar',
  dueOn: 'Fecha prometida',
  dueSuggested: (days: number) =>
    `Sugerida: ${days === 1 ? '1 día hábil' : `${days} días hábiles`} desde hoy con el horario de la sede. Se puede cambiar.`,
  dueHint: 'El día en que el laboratorio promete devolver el trabajo.',
  receiveTitle: (n: string) => `Recibir la orden ${n}`,
  receiveDescription: (lab: string) =>
    `Queda registrado que el trabajo llegó hoy de ${lab}, y quién lo recibió. Después, odontología lo revisa.`,
  receiveConfirm: 'Marcar recibida',
  checkTitle: (n: string) => `Revisar la orden ${n}`,
  checkDescription: 'Confirma que revisaste el trabajo y está listo para colocar. Queda con la fecha y tu nombre.',
  checkConfirm: 'Marcar revisada',
  genericError: 'No pudimos guardar el paso. Intenta de nuevo.',
};

const copy = labOrderStepCopy;

interface LabOrderStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  step: LabOrderStepKind;
  order: LabOrder;
  onDone: (order: LabOrder) => void;
}

/**
 * Confirmación de un paso de la orden de laboratorio (DX-017): «Enviar» con la
 * fecha prometida sugerida desde hoy (editable), «Recibir» y «Revisar». La API
 * guarda la fecha y quién; un 409/422 (p. ej. otra persona ya la recibió) llega
 * en el diálogo, en español.
 */
export function LabOrderStepDialog({ open, onOpenChange, token, step, order, onDone }: LabOrderStepDialogProps) {
  const id = useId();
  const [dueOn, setDueOn] = useState<string | null>(order.dueOn);
  const [dueTouched, setDueTouched] = useState(false);
  const [suggestedDays, setSuggestedDays] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serviceId = order.service?.id ?? null;

  // Al enviar, la sugerida se cuenta desde hoy (el día del envío).
  useEffect(() => {
    if (!open || step !== 'send' || !serviceId || dueTouched) return;
    let cancelled = false;
    suggestLabOrderDueDate(token, { serviceId, locationId: order.locationId })
      .then((s) => {
        if (cancelled) return;
        setDueOn(s.dueOn);
        setSuggestedDays(s.leadTimeBusinessDays);
      })
      .catch(() => {
        if (!cancelled) setSuggestedDays(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, step, serviceId, dueTouched, order.locationId]);

  async function confirm() {
    setConfirming(true);
    setError(null);
    try {
      const done =
        step === 'send'
          ? await sendLabOrder(token, order.id, dueOn)
          : step === 'receive'
            ? await receiveLabOrder(token, order.id)
            : await checkLabOrder(token, order.id);
      onOpenChange(false);
      onDone(done);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setConfirming(false);
    }
  }

  const n = labOrderNumberLabel(order.number);
  const title = step === 'send' ? copy.sendTitle(n) : step === 'receive' ? copy.receiveTitle(n) : copy.checkTitle(n);
  const description =
    step === 'send'
      ? copy.sendDescription(order.lab.name)
      : step === 'receive'
        ? copy.receiveDescription(order.lab.name)
        : copy.checkDescription;
  const confirmLabel = step === 'send' ? copy.sendConfirm : step === 'receive' ? copy.receiveConfirm : copy.checkConfirm;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      onConfirm={() => void confirm()}
      confirming={confirming}
      destructive={false}
      error={error}
    >
      {step === 'send' ? (
        <FormField
          htmlFor={`${id}-due`}
          label={copy.dueOn}
          hint={!dueTouched && suggestedDays !== null && dueOn ? copy.dueSuggested(suggestedDays) : copy.dueHint}
        >
          <DatePicker
            id={`${id}-due`}
            value={dueOn}
            disabled={confirming}
            onChange={(value) => {
              setDueOn(value);
              setDueTouched(true);
            }}
          />
        </FormField>
      ) : null}
    </ConfirmDialog>
  );
}
