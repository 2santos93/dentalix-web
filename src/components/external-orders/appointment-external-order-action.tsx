'use client';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { getTokenRole } from '@/lib/auth/token-role';
import { canIssueExternalOrders } from '@/lib/external-orders/external-orders-api';
import { Button } from '@/components/ui/button';

// La agenda va en la primera carga: el modal llega en su propio trozo al abrirlo.
const IssueExternalOrderModal = dynamic(
  () => import('./issue-external-order-modal').then((m) => m.IssueExternalOrderModal),
  { ssr: false },
);

export const appointmentExternalOrderCopy = {
  issue: 'Nueva orden',
};

/** Estados en los que no tiene sentido emitir desde la cita. */
const CLOSED_STATUSES = new Set(['CANCELLED', 'NO_SHOW']);

interface AppointmentExternalOrderActionProps {
  token: string;
  appointment: { id: string; patientId: string; status: string };
}

/**
 * DX-572: «Nueva orden» en el detalle de la cita de la agenda. Abre el mismo
 * modal de la ficha con la cita puesta: la orden queda en la sede de la cita.
 * Solo DENTIST y ADMIN (recepción y asistente no emiten; la API daría 403), y
 * no en una cita cancelada o a la que el paciente no asistió.
 */
export function AppointmentExternalOrderAction({ token, appointment }: AppointmentExternalOrderActionProps) {
  const [open, setOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  if (!canIssueExternalOrders(getTokenRole(token)) || CLOSED_STATUSES.has(appointment.status)) return null;
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
        <ClipboardList aria-hidden />
        {appointmentExternalOrderCopy.issue}
      </Button>
      {open ? (
        <IssueExternalOrderModal
          key={modalKey}
          open
          onOpenChange={setOpen}
          token={token}
          patientId={appointment.patientId}
          appointmentId={appointment.id}
        />
      ) : null}
    </>
  );
}
