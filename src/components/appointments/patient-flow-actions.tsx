'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { ApiError, isRejection } from '@/lib/api/api-error';
import { InlineError } from '@/components/errors/inline-error';
import { OVERBOOK_SLOT_TAKEN } from '@/lib/appointments/walk-in';
import { KeepOverbookedDialog, type KeepOverbookedPrompt } from '@/components/appointments/keep-overbooked-dialog';
import { CheckoutDialog } from '@/components/appointments/checkout-dialog';
import type { CheckoutItem } from '@/lib/appointments/checkout-checklist';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const patientFlowCopy = {
  retry: 'Reintentar',
  done: {
    ARRIVE: (name: string) => `${name} llegó.`,
    SEAT: (name: string) => `${name} pasó al sillón.`,
    READY: (name: string) => `${name} está listo para cobrar.`,
    CHECKOUT: (name: string) => `Cita de ${name} completada.`,
    UNDO_ARRIVAL: (name: string) => `Se deshizo la llegada de ${name}.`,
  } satisfies Record<FlowAction, (name: string) => string>,
  /** DX-509: deshecha la llegada de una urgencia que sigue en sobrecupo. */
  undoneOverbooked: (name: string) => `Se deshizo la llegada de ${name}. Sigue en sobrecupo.`,
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

/** DX-538-bis: el fallo de un paso dado con un modal abierto, para pintarlo dentro. */
export interface FlowError {
  appointmentId: string;
  message: string;
  /** `null`: la API lo rechazó y repetirlo daría lo mismo. */
  retry: (() => void) | null;
}

export interface PatientFlowRunner {
  /** DX-538-bis: el último paso que falló con un modal abierto. */
  error?: FlowError | null;
  /** Cita cuyo cambio está en curso (sus botones quedan deshabilitados). */
  pendingId: string | null;
  /** false: la API rechazó el paso; el aviso y el refresco ya se gestionaron. */
  run: (
    appointmentId: string,
    action: FlowAction,
    patientName: string,
    checkoutPending?: CheckoutItem[],
  ) => Promise<boolean>;
  /** DX-202: la sesión para leer la lista de la salida; sin ella, se completa directo. */
  token?: string;
  /** DX-273: `${appointmentId}:${planItemId}` que se está trayendo, si hay. */
  claimingKey?: string | null;
  /**
   * DX-273 «Traer a esta cita»: la cita pasa a reservar el tratamiento que
   * reservaba otra. false si la API lo rechazó (ya avisado con Reintentar).
   */
  claim?: (appointmentId: string, item: PlanItemReservedElsewhere) => Promise<boolean>;
  /**
   * DX-509: el diálogo «Mantener en sobrecupo» de «Deshacer llegada». Quien
   * usa el runner lo pinta una vez (cerrado no pinta nada).
   */
  overbookDialog?: ReactNode;
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
  const [overbookPrompt, setOverbookPrompt] = useState<KeepOverbookedPrompt | null>(null);
  const [flowError, setFlowError] = useState<FlowError | null>(null);

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

  async function run(
    appointmentId: string,
    action: FlowAction,
    patientName: string,
    checkoutPending?: CheckoutItem[],
  ) {
    setPendingId(appointmentId);
    setFlowError(null);
    try {
      let reserved: PlanItemReservedElsewhere[] = [];
      if (action === 'UNDO_ARRIVAL') {
        await undoArrival(token, appointmentId);
      } else {
        const result = await updateAppointment(token, appointmentId, {
          status: FLOW_ACTION_STATUS[action],
          ...(checkoutPending?.length ? { checkoutPending } : {}),
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
      // DX-509: la urgencia es un sobrecupo y su hora ya la ocupa otra cita:
      // deshacer la llegada exige decidir si sigue en sobrecupo.
      if (action === 'UNDO_ARRIVAL' && err instanceof ApiError && err.code === OVERBOOK_SLOT_TAKEN) {
        setOverbookPrompt({
          message: apiErrorMessage(err, patientFlowCopy.error),
          confirm: async () => {
            await undoArrival(token, appointmentId, { keepOverbooked: true });
            toast.success(patientFlowCopy.undoneOverbooked(patientName));
            onChanged();
            notifyInClinicChanged();
          },
        });
        return false;
      }
      // El reintento cierra sobre la propia operación (cita y paso): no hay
      // estado ambiente que pueda quedar viejo. DX-538-bis: un rechazo (4xx)
      // no se reintenta; con un modal abierto (detalle, «En clínica») el aviso
      // flotante quedaría inerte y oculto al lector: el error va junto al paso.
      const message = apiErrorMessage(err, patientFlowCopy.error);
      const retry = isRejection(err)
        ? null
        : () => void run(appointmentId, action, patientName, checkoutPending);
      if (modalOpen()) setFlowError({ appointmentId, message, retry });
      else notifyError(message, retry ? { onRetry: retry } : undefined);
      return false;
    } finally {
      setPendingId(null);
      onChanged();
      notifyInClinicChanged();
    }
  }

  return {
    pendingId,
    error: flowError,
    run,
    token,
    claimingKey,
    claim,
    overbookDialog: <KeepOverbookedDialog prompt={overbookPrompt} onClose={() => setOverbookPrompt(null)} />,
  };
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
  /** DX-237: es del profesional que la mira; el odontólogo solo actúa en las suyas. */
  ownAppointment?: boolean;
  /** DX-237: solo el siguiente paso y como icono, para las tarjetas de columnas. */
  compact?: boolean;
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
  ownAppointment = true,
  compact = false,
}: PatientFlowActionsProps) {
  const allActions = flowActions(status, role, isToday, ownAppointment);
  const actions = compact ? allActions.slice(0, 1) : allActions;
  const groupRef = useRef<HTMLDivElement>(null);
  // Se pulsó un paso aquí: al cambiar los botones (el pulsado desaparece) el
  // foco iría al <body>; se lleva al primer botón del grupo (WCAG 2.4.3).
  const clicked = useRef(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
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
            size={compact ? 'icon-sm' : 'sm'}
            variant={action === 'UNDO_ARRIVAL' ? 'ghost' : 'secondary'}
            aria-label={compact ? `${FLOW_ACTION_LABELS[action]}: ${patientName}` : undefined}
            title={compact ? FLOW_ACTION_LABELS[action] : undefined}
            loading={pending}
            onClick={() => {
              clicked.current = true;
              // DX-202: completar pasa por la salida del paciente.
              if (action === 'CHECKOUT' && runner.token) setCheckoutOpen(true);
              else void runner.run(appointmentId, action, patientName);
            }}
            data-flow-action={action}
            // DX-546 · FE-109: el icono se queda en 28 px y el `::after` lleva
            // el área de toque a 44 px con puntero táctil a cualquier ancho
            // (las columnas son la vista de las tabletas) y en una ventana
            // estrecha (`max-sm`).
            className={
              compact
                ? "relative size-7 bg-surface text-primary-text shadow-sm pointer-coarse:size-7 max-sm:after:absolute max-sm:after:-inset-2 max-sm:after:content-[''] pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']"
                : 'h-11 sm:h-9'
            }
          >
            <Icon aria-hidden />
            {compact ? null : FLOW_ACTION_LABELS[action]}
          </Button>
        );
      })}
      {/* DX-538-bis: el fallo, aquí mismo y anunciado (role="alert"). */}
      {!compact && runner.error?.appointmentId === appointmentId ? (
        <div className="flex basis-full flex-col items-start gap-2">
          <InlineError variant="summary">{runner.error.message}</InlineError>
          {runner.error.retry ? (
            <Button type="button" variant="secondary" size="sm" onClick={runner.error.retry}>
              {patientFlowCopy.retry}
            </Button>
          ) : null}
        </div>
      ) : null}
      {checkoutOpen && runner.token ? (
        <CheckoutDialog
          token={runner.token}
          appointmentId={appointmentId}
          patientName={patientName}
          onOpenChange={setCheckoutOpen}
          onComplete={(checkoutPending) => runner.run(appointmentId, 'CHECKOUT', patientName, checkoutPending)}
        />
      ) : null}
    </div>
  );
}
