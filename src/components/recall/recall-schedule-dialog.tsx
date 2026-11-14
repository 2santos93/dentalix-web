'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { apiErrorMessage } from '@/lib/api/error-message';
import { recallTypeLabel } from '@/lib/recall/recall-types';
import { createRecallContact, type RecallContactChannel, type RecallDueItem } from '@/lib/recall/recall-api';
import { bookedContactInput } from '@/lib/recall/recall-appointment-type';
import { CHANNEL_LABELS, CHANNEL_ORDER } from '@/lib/recall/presentation';
import type { Appointment } from '@/lib/appointments/appointments-api';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection } from '@/components/shared/async-section';
import { FormField } from '@/components/shared/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export const scheduleDialogCopy = {
  title: 'Agendar cita',
  description: (name: string) => `Cita de control para ${name}. Al agendarla sale de la lista.`,
  reason: (kind: string) => `Recall: ${kind.toLowerCase()}`,
  loadError: 'No pudimos cargar los datos del paciente.',
  // D22: la cita se registra también como contacto «Agendó» por este canal.
  channel: 'Contacto por',
  channelHint: 'Queda en el historial de recall como «Agendó», con esta cita.',
  note: (note: string) => `Nota del contacto: ${note}`,
  registering: 'Cita agendada. Registrando el contacto…',
  contactFailed: (reason: string) => `La cita quedó agendada, pero no se registró el contacto: ${reason}`,
};

/**
 * D22: registra el contacto «Agendó» de una cita ya creada. Si falla, la cita
 * se queda y un aviso reintenta solo el contacto (nunca otra cita).
 */
export async function registerBookedContact(
  token: string,
  recallId: string,
  input: ReturnType<typeof bookedContactInput>,
): Promise<boolean> {
  try {
    await createRecallContact(token, recallId, input);
    return true;
  } catch (err) {
    notifyError(scheduleDialogCopy.contactFailed(apiErrorMessage(err)), {
      onRetry: () => void registerBookedContact(token, recallId, input),
    });
    return false;
  }
}

/**
 * «Agendar» de la lista de recall (DX-015): el formulario de cita de siempre,
 * con el paciente, el motivo, la sede y (D21) el tipo de cita del tipo de
 * recall puestos. La cita lo saca de la lista. Al crearla registra el contacto
 * «Agendó» (D22) y solo entonces avisa al padre, que cierra y refresca.
 */
export function RecallScheduleDialog({
  token,
  item,
  appointmentTypeId,
  defaultChannel = 'CALL',
  note,
  onClose,
  onCreated,
}: {
  token: string;
  item: RecallDueItem;
  /** D21: el tipo de cita del tipo de recall; el formulario lo ignora si ya no está activo. */
  appointmentTypeId?: string | null;
  /** D23: el canal y la nota que se eligieron en «Registrar contacto». */
  defaultChannel?: RecallContactChannel;
  note?: string;
  onClose: () => void;
  /** Con la cita creada y el contacto ya intentado (haya salido o no). */
  onCreated: (appointment: Appointment) => void;
}) {
  const [channel, setChannel] = useState<RecallContactChannel>(defaultChannel);
  // Con la cita creada el formulario desaparece: otra cita no se puede crear.
  const [registering, setRegistering] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPatient(token, item.patientId)
      .then((p) => {
        if (cancelled) return;
        setPatient(p);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: scheduleDialogCopy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, item.patientId, reloadKey]);

  async function handleCreated(appointment: Appointment) {
    setRegistering(true);
    await registerBookedContact(token, item.recallId, bookedContactInput(channel, appointment.id, note));
    onCreated(appointment);
  }

  const trimmedNote = note?.trim() ?? '';
  return (
    <Dialog open onOpenChange={(open) => !open && !registering && onClose()}>
      <DialogContent fullScreenOnMobile className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scheduleDialogCopy.title}</DialogTitle>
          <DialogDescription>{scheduleDialogCopy.description(item.patientName)}</DialogDescription>
        </DialogHeader>
        {registering ? (
          <p role="status" className="text-sm text-muted">
            {scheduleDialogCopy.registering}
          </p>
        ) : (
          <>
            <FormField
              htmlFor="recall-schedule-channel"
              label={scheduleDialogCopy.channel}
              hint={scheduleDialogCopy.channelHint}
            >
              <NativeSelect
                id="recall-schedule-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as RecallContactChannel)}
                className="sm:max-w-56"
              >
                {CHANNEL_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {trimmedNote ? (
              <p className="whitespace-pre-line break-words text-sm text-muted">
                {scheduleDialogCopy.note(trimmedNote)}
              </p>
            ) : null}
            <AsyncSection
              loading={!patient && !error}
              error={error}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={false}
              skeleton={<Skeleton className="h-64 w-full" />}
            >
              {patient ? (
                <AppointmentForm
                  token={token}
                  defaultPatient={patient}
                  defaultReason={scheduleDialogCopy.reason(recallTypeLabel(item))}
                  locationId={item.locationId}
                  defaultAppointmentTypeId={appointmentTypeId}
                  onCreated={(appointment) => void handleCreated(appointment)}
                />
              ) : null}
            </AsyncSection>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
