'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { Appointment } from '@/lib/appointments/appointments-api';
import { POST_OP_APPOINTMENT_REASON, type PostOpCheckItem } from '@/lib/post-op-checks/post-op-checks-api';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { AsyncSection } from '@/components/shared/async-section';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export const postOpScheduleCopy = {
  title: 'Agendar revisión',
  description: (name: string) =>
    `${name} necesita cita: el control ya quedó cerrado en la historia clínica. Elige el día y la hora de la revisión.`,
  loadError: 'No pudimos cargar los datos del paciente.',
};

/**
 * Tras «Necesita cita» (DX-566): el formulario de cita de siempre, con el
 * paciente, el profesional que hizo el procedimiento, la sede del control y
 * el motivo «Revisión postoperatoria» puestos. El control ya está cerrado: si
 * se cierra el diálogo sin agendar, no se pierde nada clínico.
 */
export function PostOpScheduleDialog({
  token,
  item,
  onClose,
  onCreated,
}: {
  token: string;
  item: Pick<PostOpCheckItem, 'patientId' | 'patientName' | 'professionalId' | 'locationId'>;
  onClose: () => void;
  onCreated: (appointment: Appointment) => void;
}) {
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
        if (!cancelled) setError(apiErrorMessage(err, { fallback: postOpScheduleCopy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, item.patientId, reloadKey]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreenOnMobile className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{postOpScheduleCopy.title}</DialogTitle>
          <DialogDescription>{postOpScheduleCopy.description(item.patientName)}</DialogDescription>
        </DialogHeader>
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
              defaultProviderId={item.professionalId}
              defaultReason={POST_OP_APPOINTMENT_REASON}
              locationId={item.locationId}
              onCreated={onCreated}
            />
          ) : null}
        </AsyncSection>
      </DialogContent>
    </Dialog>
  );
}
