'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { apiErrorMessage } from '@/lib/api/error-message';
import { KIND_LABELS } from '@/lib/recall/presentation';
import type { RecallDueItem } from '@/lib/recall/recall-api';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { AsyncSection } from '@/components/shared/async-section';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export const scheduleDialogCopy = {
  title: 'Agendar cita',
  description: (name: string) => `Cita de control para ${name}. Al agendarla sale de la lista.`,
  reason: (kind: string) => `Recall: ${kind.toLowerCase()}`,
  loadError: 'No pudimos cargar los datos del paciente.',
};

/**
 * «Agendar» de la lista de recall (DX-015): el formulario de cita de siempre,
 * con el paciente, el motivo y la sede puestos. La cita lo saca de la lista.
 */
export function RecallScheduleDialog({
  token,
  item,
  onClose,
  onCreated,
}: {
  token: string;
  item: RecallDueItem;
  onClose: () => void;
  onCreated: () => void;
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
        if (!cancelled) setError(apiErrorMessage(err, { fallback: scheduleDialogCopy.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, item.patientId, reloadKey]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreenOnMobile className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scheduleDialogCopy.title}</DialogTitle>
          <DialogDescription>{scheduleDialogCopy.description(item.patientName)}</DialogDescription>
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
              defaultReason={scheduleDialogCopy.reason(KIND_LABELS[item.kind])}
              locationId={item.locationId}
              onCreated={onCreated}
            />
          ) : null}
        </AsyncSection>
      </DialogContent>
    </Dialog>
  );
}
