import { toast } from 'sonner';
import type { components } from '@/lib/api/schema';

type WarningCode = components['schemas']['AppointmentWarningCode'];

const copy = {
  offSchedule: 'Cita fuera del horario del profesional',
};

/** Lo que trae la respuesta de crear o mover una cita. */
export interface AppointmentWarnings {
  warnings?: string[];
  /** DX-233: el código de cada aviso, en el mismo orden que `warnings`. */
  warningCodes?: WarningCode[];
}

/**
 * Avisos que no impidieron agendar o mover (DX-122 bloqueo que deja agendar,
 * DX-233 fuera del horario del profesional). Son toasts de aviso: la cita ya
 * está guardada, nada que deshacer. El de horario lleva título propio y dura
 * más, porque suele pedir una decisión (avisar al profesional, mover la cita).
 */
export function announceAppointmentWarnings(result: AppointmentWarnings | null | undefined): void {
  const warnings = result?.warnings ?? [];
  const codes = result?.warningCodes ?? [];
  warnings.forEach((message, i) => {
    if (codes[i] === 'PROVIDER_OFF_SCHEDULE') {
      toast.warning(copy.offSchedule, { description: message, duration: 10000 });
    } else {
      toast.warning(message);
    }
  });
}
