'use client';
import * as React from 'react';
import { useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IssueCertificateModal } from './issue-certificate-modal';

export const appointmentCertificateCopy = {
  issueAttendance: 'Emitir justificante',
};

interface AppointmentCertificateActionProps {
  token: string;
  appointment: { id: string; patientId: string; status: string };
}

/**
 * DX-306: «Emitir justificante» en el detalle de una cita ATENDIDA de la agenda.
 * Abre el mismo modal de la ficha con esta cita ya elegida. Los cuatro roles lo
 * emiten; en cualquier otro estado no se pinta (la API daría 409).
 */
export function AppointmentCertificateAction({ token, appointment }: AppointmentCertificateActionProps) {
  const [open, setOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  if (appointment.status !== 'COMPLETED') return null;
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto sm:self-start"
        onClick={() => {
          setModalKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <FileCheck2 aria-hidden />
        {appointmentCertificateCopy.issueAttendance}
      </Button>
      {open ? (
        <IssueCertificateModal
          key={modalKey}
          open
          onOpenChange={setOpen}
          token={token}
          patientId={appointment.patientId}
          kind="ATTENDANCE"
          initialAppointmentId={appointment.id}
        />
      ) : null}
    </>
  );
}
