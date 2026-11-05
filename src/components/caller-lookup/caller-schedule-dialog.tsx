'use client';
import * as React from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import type { CallerMatch } from '@/lib/caller-lookup/caller-lookup-api';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { AsyncSection } from '@/components/shared/async-section';
import { notifySuccess } from '@/components/errors/notify';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export const callerScheduleCopy = {
  title: 'Nueva cita',
  description: (name: string) => `Agenda una cita para ${name}.`,
  loadError: 'No pudimos cargar los datos del paciente.',
  created: 'Cita agendada.',
};

/**
 * «Nueva cita» de una tarjeta de «¿Quién llama?» (DX-224): el formulario de
 * cita de siempre, con el paciente ya puesto, sobre el diálogo de la llamada.
 */
export function CallerScheduleDialog({
  token,
  match,
  onClose,
  onCreated,
}: {
  token: string;
  match: CallerMatch;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [patient, setPatient] = React.useState<Patient | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    getPatient(token, match.id)
      .then((p) => {
        if (cancelled) return;
        setPatient(p);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: callerScheduleCopy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, match.id, reloadKey]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreenOnMobile className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{callerScheduleCopy.title}</DialogTitle>
          <DialogDescription>
            {callerScheduleCopy.description(`${match.firstName} ${match.lastName}`.trim())}
          </DialogDescription>
        </DialogHeader>
        <AsyncSection
          loading={!patient && !error}
          error={error}
          onRetry={() => {
            setError(null);
            setReloadKey((k) => k + 1);
          }}
          isEmpty={false}
          skeleton={<Skeleton className="h-64 w-full" />}
        >
          {patient ? (
            <AppointmentForm
              token={token}
              defaultPatient={patient}
              onCreated={() => {
                notifySuccess(callerScheduleCopy.created);
                onCreated();
              }}
            />
          ) : null}
        </AsyncSection>
      </DialogContent>
    </Dialog>
  );
}
