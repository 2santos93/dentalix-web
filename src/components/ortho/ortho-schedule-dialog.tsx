'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listAppointmentTypes } from '@/lib/appointments/appointment-types-api';
import type { Appointment } from '@/lib/appointments/appointments-api';
import { orthoAppointmentTypeId, type OrthoFollowUpRow } from '@/lib/ortho/ortho-api';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { AsyncSection } from '@/components/shared/async-section';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export const orthoScheduleCopy = {
  title: 'Agendar control',
  description: (name: string) => `Control de ortodoncia para ${name}. Al agendarlo sale de «Sin próxima cita».`,
  reason: 'Control de ortodoncia',
  loadError: 'No pudimos cargar los datos del paciente.',
};

/**
 * «Agendar control» de la lista de ortodoncia (DX-190): el formulario de cita
 * de siempre con el paciente, la sede y el responsable del caso, el motivo y,
 * si la clínica lo tiene, su tipo de cita de ortodoncia.
 */
export function OrthoScheduleDialog({
  token,
  row,
  onClose,
  onCreated,
}: {
  token: string;
  row: OrthoFollowUpRow;
  onClose: () => void;
  onCreated: (appointment: Appointment) => void;
}) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [typeId, setTypeId] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPatient(token, row.patientId)
      .then((p) => {
        if (cancelled) return;
        setPatient(p);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: orthoScheduleCopy.loadError }));
      });
    // Sin tipos el formulario funciona igual (sin tipo puesto).
    listAppointmentTypes(token)
      .then((types) => {
        if (!cancelled) setTypeId(orthoAppointmentTypeId(types));
      })
      .catch(() => {
        if (!cancelled) setTypeId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, row.patientId, reloadKey]);

  const name = `${row.patientFirstName} ${row.patientLastName}`;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreenOnMobile className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{orthoScheduleCopy.title}</DialogTitle>
          <DialogDescription>{orthoScheduleCopy.description(name)}</DialogDescription>
        </DialogHeader>
        <AsyncSection
          loading={(!patient || typeId === undefined) && !error}
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={false}
          skeleton={<Skeleton className="h-64 w-full" />}
        >
          {patient && typeId !== undefined ? (
            <AppointmentForm
              token={token}
              defaultPatient={patient}
              defaultReason={orthoScheduleCopy.reason}
              locationId={row.locationId}
              defaultProviderId={row.providerId}
              defaultAppointmentTypeId={typeId}
              onCreated={onCreated}
            />
          ) : null}
        </AsyncSection>
      </DialogContent>
    </Dialog>
  );
}
