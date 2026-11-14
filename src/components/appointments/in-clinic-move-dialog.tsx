'use client';
import { useEffect, useState } from 'react';
import { MoveAppointmentDialog } from '@/components/appointments/move-appointment-dialog';
import { notifyError } from '@/components/errors/notify';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getAppointment, type Appointment } from '@/lib/appointments/appointments-api';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { listChairs, type Chair } from '@/lib/chairs/chairs-api';
import { getLocationSchedule, type BusinessHours } from '@/lib/locations/schedule-api';
import type { SedeClock } from '@/lib/locations/sede-clock';

const copy = {
  loadError: 'No pudimos abrir «Mover a…». Intenta de nuevo.',
};

interface Loaded {
  appointment: Appointment;
  providers: StaffMember[];
  chairs: Chair[];
  hours: BusinessHours | null;
}

interface InClinicMoveDialogProps {
  token: string;
  appointmentId: string;
  /** Sede del panel: la cita y sus sillones son de ella. */
  locationId: string;
  clock: SedeClock;
  onClose: () => void;
  onMoved: () => void;
}

/**
 * DX-492: «Mover a…» desde «En clínica». El panel solo trae nombre y horas: la
 * cita, el personal, los sillones y el horario se leen al abrir.
 */
export function InClinicMoveDialog({ token, appointmentId, locationId, clock, onClose, onMoved }: InClinicMoveDialogProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppointment(token, appointmentId),
      listStaff(token),
      listChairs(token, locationId, { includeInactive: true }),
      // Sin horario el modal no avisa antes de enviar: la API sigue mandando.
      getLocationSchedule(token).catch(() => null),
    ]).then(
      ([appointment, staff, chairs, hours]) => {
        if (cancelled) return;
        const providers = staff.filter(
          (s) => s.role === 'DENTIST' || s.role === 'ADMIN' || s.userId === appointment.providerId,
        );
        setLoaded({ appointment, providers, chairs, hours });
      },
      (err) => {
        if (cancelled) return;
        notifyError(apiErrorMessage(err, copy.loadError));
        onClose();
      },
    );
    return () => {
      cancelled = true;
    };
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) return null;
  return (
    <MoveAppointmentDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      token={token}
      appointment={loaded.appointment}
      clock={clock}
      providers={loaded.providers}
      hours={loaded.hours}
      chairs={loaded.chairs}
      onMoved={onMoved}
    />
  );
}
