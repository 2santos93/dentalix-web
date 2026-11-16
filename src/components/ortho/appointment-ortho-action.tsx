'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Smile } from 'lucide-react';
import { getOrthoSettings } from '@/lib/ortho/ortho-settings';
import { listOrthoCases, openOrthoCase } from '@/lib/ortho/ortho-api';
import { orthoTabHref } from '@/lib/ortho/ortho-roles';
import { Button } from '@/components/ui/button';

export const appointmentOrthoActionCopy = {
  label: 'Registrar control de ortodoncia',
};

/**
 * DX-190: «Registrar control de ortodoncia» en el panel de la cita. Solo si la
 * clínica usa el módulo y el paciente tiene un caso que admite controles; abre
 * la ficha en «Ortodoncia» con el formulario ligado a esta cita. Si algo no
 * carga, el botón no aparece: el control se puede registrar desde la ficha.
 */
export function AppointmentOrthoAction({
  token,
  appointment,
}: {
  token: string;
  appointment: { id: string; patientId: string };
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const settings = await getOrthoSettings(token);
        if (!settings.enabled) return;
        const cases = await listOrthoCases(token, appointment.patientId);
        if (!cancelled) setShow(openOrthoCase(cases) !== null);
      } catch {
        // Sin el dato, sin el atajo (la ficha sigue ofreciéndolo).
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, appointment.patientId]);

  if (!show) return null;
  return (
    <Button asChild variant="secondary" className="w-full sm:w-auto sm:self-start">
      <Link href={orthoTabHref(appointment.patientId, appointment.id)}>
        <Smile aria-hidden />
        {appointmentOrthoActionCopy.label}
      </Link>
    </Button>
  );
}
