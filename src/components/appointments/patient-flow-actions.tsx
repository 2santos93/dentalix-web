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
import {
  canClaimReserved,
  claimPlanItem,
  reservationCopy,
  reservedElsewhereToast,
  reservedItemLabel,
  type PlanItemReservedElsewhere,
} from '@/lib/appointments/plan-item-reservations';
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
  /** false: la API rechazó el paso; el aviso y el refresco ya se gestionaron. */
  run: (appointmentId: string, action: FlowAction, patientName: string) => Promise<boolean>;
  /** DX-273: `${appointmentId}:${planItemId}` que se está trayendo, si hay. */
  claimingKey?: string | null;
  /**
   * DX-273 «Traer a esta cita»: la cita pasa a reservar el tratamiento que
   * reservaba otra. false si la API lo rechazó (ya avisado con Reintentar).
   */
  claim?: (appointmentId: string, item: PlanItemReservedElsewhere) => Promise<boolean>;
}

/** Id del toast «reservado en otra cita» de un tratamiento de la cita. */
function reservedToastId(appointmentId: string, planItemId: string): string {
  return `reserved:${claimKey(appointmentId, planItemId)}`;
}

/** Avisos «reservado en otra cita» abiertos en esta pestaña. */
const openReservedToasts = new Set<string>();

/**
 * QA DX-273 (D1): cierra los avisos «reservado en otra cita». Se llama al
 * abrir la hoja «En clínica», que ya ofrece la misma acción: un toast queda
 * por encima del diálogo modal pero no recibe toques (el diálogo bloquea el
 * resto de la página) y el toque caería en lo de debajo.
 */
export function dismissReservedToasts(): void {
  for (const id of openReservedToasts) toast.dismiss(id);
  openReservedToasts.clear();
}

/** ¿Hay un diálogo modal abierto (hoja o modal de Radix)? */
function modalOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

/**
 * QA DX-273 (D2): el botón del aviso mide al menos 44×44 px en móvil (36 px
 * de alto desde `sm`), como el resto de objetivos táctiles.
 */
const RESERVED_ACTION_CLASS = '!min-h-11 !min-w-11 !px-3 sm:!min-h-9';

/**
 * Revisión DX-293: sonner fusiona las opciones con las del toast abierto
 * con el mismo id. Un aviso sin acción tiene que borrar la acción (y las
 * demás opciones) de un aviso anterior con «Traer a esta cita» que siga
 * abierto (p. ej. «Llegó», «Deshacer llegada» y otra vez «Llegó» con la
 * titular ya en la clínica), o seguiría ofreciendo un botón que da 409.
 */
const TRANSIENT_TOAST = {
  action: undefined,
  duration: undefined,
  onDismiss: undefined,
  classNames: undefined,
} as const;

/** Clave de un «Traer a esta cita» en curso. */
export function claimKey(appointmentId: string, planItemId: string): string {
  return `${appointmentId}:${planItemId}`;
}

/**
 * DX-200: da un paso del flujo (llegó, en sillón, listo para cobrar,
 * completar, deshacer llegada). Si la API lo rechaza (403/409: otra persona
 * ya lo movió, un salto imposible), aviso con Reintentar (escalón 3) y se
 * vuelve a leer lo de la pantalla; `onChanged` refresca agenda y panel.
 */
export function usePatientFlow(token: string, onChanged: () => void): PatientFlowRunner {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);

  async function claim(appointmentId: string, item: PlanItemReservedElsewhere) {
    setClaimingKey(claimKey(appointmentId, item.planItemId));
    try {
      await claimPlanItem(token, appointmentId, item.planItemId);
      // Revisión M4: el aviso de «Llegó» ya no hace falta (se trajo desde el
      // toast o desde el panel).
      const toastId = reservedToastId(appointmentId, item.planItemId);
      toast.dismiss(toastId);
      openReservedToasts.delete(toastId);
      toast.success(reservationCopy.claimed(reservedItemLabel(item)));
      return true;
    } catch (err) {
      notifyError(apiErrorMessage(err, reservationCopy.claimError), {
        onRetry: () => void claim(appointmentId, item),
      });
      return false;
    } finally {
      setClaimingKey(null);
      onChanged();
      notifyInClinicChanged();
    }
  }

  async function run(appointmentId: string, action: FlowAction, patientName: string) {
    setPendingId(appointmentId);
    try {
      let reserved: PlanItemReservedElsewhere[] = [];
      if (action === 'UNDO_ARRIVAL') {
        await undoArrival(token, appointmentId);
      } else {
        const result = await updateAppointment(token, appointmentId, {
          status: FLOW_ACTION_STATUS[action],
        });
        reserved = result.planItemsReservedElsewhere ?? [];
      }
      toast.success(patientFlowCopy.done[action](patientName));
      // DX-273: el tratamiento sigue reservado en otra cita. Aviso que no
      // bloquea y espera (lleva acción); el panel «En clínica» lo repite.
      if (action === 'ARRIVE') {
        // Con un diálogo modal abierto (p. ej. el detalle de la cita) el
        // toast no recibiría toques (QA D1): solo informa, sin acción, y
        // remite a «En clínica», que sí la tiene.
        const inModal = modalOpen();
        for (const item of reserved) {
          const id = reservedToastId(appointmentId, item.planItemId);
          // DX-293: la reserva la tiene otra cita de hoy con el paciente en
          // la clínica: «Traer» daría 409. Solo explica dónde está.
          if (!canClaimReserved(item)) {
            openReservedToasts.delete(id);
            toast.warning(reservedItemLabel(item), {
              id,
              ...TRANSIENT_TOAST,
              description: reservedElsewhereToast(item),
            });
            continue;
          }
          if (inModal) {
            openReservedToasts.delete(id);
            toast.warning(reservedItemLabel(item), {
              id,
              ...TRANSIENT_TOAST,
              description: `${reservedElsewhereToast(item)} ${reservationCopy.claimFromPanel}`,
            });
            continue;
          }
          openReservedToasts.add(id);
          toast.warning(reservedItemLabel(item), {
            id,
            description: reservedElsewhereToast(item),
            duration: Infinity,
            onDismiss: () => openReservedToasts.delete(id),
            classNames: { actionButton: RESERVED_ACTION_CLASS },
            action: {
              label: reservationCopy.claim,
              onClick: () => {
                openReservedToasts.delete(id);
                void claim(appointmentId, item);
              },
            },
          });
        }
      }
      return true;
    } catch (err) {
      // El reintento cierra sobre la propia operación (cita y paso): no hay
      // estado ambiente que pueda quedar viejo.
      notifyError(apiErrorMessage(err, patientFlowCopy.error), {
        onRetry: () => void run(appointmentId, action, patientName),
      });
      return false;
    } finally {
      setPendingId(null);
      onChanged();
      notifyInClinicChanged();
    }
  }

  return { pendingId, run, claimingKey, claim };
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
