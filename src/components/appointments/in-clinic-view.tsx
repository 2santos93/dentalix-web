'use client';
import { useState } from 'react';
import { getTokenRole } from '@/lib/auth/token-role';
import { InClinicPanel } from '@/components/appointments/in-clinic-panel';
import { usePatientFlow } from '@/components/appointments/patient-flow-actions';
import { useInClinic } from '@/components/appointments/use-in-clinic';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Siren } from 'lucide-react';
import { WalkInDialog, walkInCopy } from '@/components/appointments/walk-in-dialog';
import { canWalkIn } from '@/lib/appointments/walk-in';
import { getActiveLocationId } from '@/lib/locations/location-store';

const copy = {
  title: 'En clínica',
  titleMine: 'Te esperan',
  description:
    'Quién está en la sala de espera, en el sillón y listo para cobrar en la sede, con los minutos de espera. Se actualiza solo.',
  descriptionMine: 'Tus pacientes en la sala de espera, en el sillón y listos para cobrar en la sede.',
  back: 'Agenda',
};

/**
 * DX-200: la ruta `/agenda/en-clinica` — el mismo panel que acompaña a la
 * agenda, solo, con su título de página.
 */
export function InClinicView({ token }: { token: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const state = useInClinic(token, { reloadKey });
  const runner = usePatientFlow(token, () => setReloadKey((k) => k + 1));
  const role = getTokenRole(token);
  const mine = role === 'DENTIST';
  const [walkInOpen, setWalkInOpen] = useState(false);
  // DX-470: la urgencia va a la sede del panel (la que el mostrador mira).
  const locationId = state.view?.locationId ?? getActiveLocationId();
  return (
    <div className="flex flex-col">
      <PageHeader
        back={{ href: '/agenda', label: copy.back }}
        title={mine ? copy.titleMine : copy.title}
        description={mine ? copy.descriptionMine : copy.description}
        actions={
          canWalkIn(role) && !state.noLocation ? (
            <Button type="button" onClick={() => setWalkInOpen(true)}>
              <Siren aria-hidden /> {walkInCopy.button}
            </Button>
          ) : null
        }
      />
      {walkInOpen ? (
        <WalkInDialog open onOpenChange={setWalkInOpen} token={token} locationId={locationId} />
      ) : null}
      <InClinicPanel state={state} role={role} runner={runner} showTitle={false} className="max-w-3xl" />
    </div>
  );
}
