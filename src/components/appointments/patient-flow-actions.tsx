'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Armchair, CircleCheck, DoorOpen, Undo2, Wallet } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { updateAppointment, type AppointmentStatus } from '@/lib/appointments/appointments-api';
import {
  FLOW_ACTION_LABELS,
  FLOW_ACTION_STATUS,
  flowActions,
  notifyInClinicChanged,
  undoArrival,
  type FlowAction,
} from '@/lib/appointments/patient-flow';
import type { ClinicRole } from '@/lib/me/me-api';
import { notifyError } from '@/components/errors/notify';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const patientFlowCopy = {
  done: {
    ARRIVE: (name: string) => `${name} llegó.`,
    SEAT: (name: string) => `${name} pasó al sillón.`,
    READY: (name: string) => `${name} está listo para cobrar.`,
    CHECKOUT: (name: string) => `Cita de ${name} completada.`,
    UNDO_ARRIVAL: (name: string) => `Se deshizo la llegada de ${name}.`,
  } satisfies Record<FlowAction, (name: string) => string>,
  error: 'No pudimos cambiar el estado de la cita.',
  actionsFor: (name: string) => `Estado de ${name} en la clínica`,
};

const ICONS: Record<FlowAction, typeof DoorOpen> = {
  ARRIVE: DoorOpen,
  SEAT: Armchair,
  READY: Wallet,
  CHECKOUT: CircleCheck,
  UNDO_ARRIVAL: Undo2,
};

export interface PatientFlowRunner {
  /** Cita cuyo cambio está en curso (sus botones quedan deshabilitados). */
  pendingId: string | null;
  run: (appointmentId: string, action: FlowAction, patientName: string) => Promise<void>;
}

/**
 * DX-200: da un paso del flujo (llegó, en sillón, listo para cobrar,
 * completar, deshacer llegada). Si la API lo rechaza (403/409: otra persona
 * ya lo movió, un salto imposible), aviso con Reintentar (escalón 3) y se
 * vuelve a leer lo de la pantalla; `onChanged` refresca agenda y panel.
 */
export function usePatientFlow(token: string, onChanged: () => void): PatientFlowRunner {
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function run(appointmentId: string, action: FlowAction, patientName: string) {
    setPendingId(appointmentId);
    try {
      if (action === 'UNDO_ARRIVAL') {
        await undoArrival(token, appointmentId);
      } else {
        await updateAppointment(token, appointmentId, { status: FLOW_ACTION_STATUS[action] });
      }
      toast.success(patientFlowCopy.done[action](patientName));
    } catch (err) {
      // El reintento cierra sobre la propia operación (cita y paso): no hay
      // estado ambiente que pueda quedar viejo.
      notifyError(apiErrorMessage(err, patientFlowCopy.error), {
        onRetry: () => void run(appointmentId, action, patientName),
      });
    } finally {
      setPendingId(null);
      onChanged();
      notifyInClinicChanged();
    }
  }

  return { pendingId, run };
}

interface PatientFlowActionsProps {
  appointmentId: string;
  status: AppointmentStatus;
  role: ClinicRole | null;
  /** La cita es de hoy: solo entonces se marca «Llegó». */
  isToday: boolean;
  patientName: string;
  runner: PatientFlowRunner;
  className?: string;
}

/**
 * Botones rápidos del flujo en la tarjeta de una cita: el paso siguiente que
 * el rol puede dar. 44 px de alto en móvil (objetivo táctil), 36 px desde
 * `sm`. Nada si no hay paso posible.
 */
export function PatientFlowActions({
  appointmentId,
  status,
  role,
  isToday,
  patientName,
  runner,
  className,
}: PatientFlowActionsProps) {
  const actions = flowActions(status, role, isToday);
  const groupRef = useRef<HTMLDivElement>(null);
  // Se pulsó un paso aquí: al cambiar los botones (el pulsado desaparece) el
  // foco iría al <body>; se lleva al primer botón del grupo (WCAG 2.4.3).
  const clicked = useRef(false);
  const actionsKey = actions.join(',');
  useEffect(() => {
    if (!clicked.current) return;
    const group = groupRef.current;
    const active = document.activeElement;
    if (group && (active === null || active === document.body || !active.isConnected)) {
      group.querySelector<HTMLButtonElement>('button')?.focus();
      clicked.current = false;
    }
  }, [actionsKey]);
  if (actions.length === 0) return null;
  const pending = runner.pendingId === appointmentId;
  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={patientFlowCopy.actionsFor(patientName)}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {actions.map((action) => {
        const Icon = ICONS[action];
        return (
          <Button
            key={action}
            type="button"
            size="sm"
            variant={action === 'UNDO_ARRIVAL' ? 'ghost' : 'secondary'}
            loading={pending}
            onClick={() => {
              clicked.current = true;
              void runner.run(appointmentId, action, patientName);
            }}
            data-flow-action={action}
            className="h-11 sm:h-9"
          >
            <Icon aria-hidden />
            {FLOW_ACTION_LABELS[action]}
          </Button>
        );
      })}
    </div>
  );
}
