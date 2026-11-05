import { toast } from 'sonner';

export const notifyCopy = {
  retry: 'Reintentar',
};

interface NotifyErrorOptions {
  /** Añade una acción de reintento al toast. */
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Un toast con acción **espera**: no se auto-descarta.
 *
 * Los 4s por defecto de sonner no dan para notarlo, leerlo, decidir y pulsar,
 * y una salida que se va de la pantalla incumple «The Way-Out Rule» de
 * DESIGN.md igual que no tenerla. Pero el problema de fondo no es que 4s sean
 * pocos: es que el aviso avisa de algo que **quedó sin hacer**. Si el estado
 * de una cita no cambió, dejar que el mensaje caduque en silencio deja la
 * divergencia y a nadie enterado.
 *
 * Esto además cierra la ventana del modal: un `ConfirmDialog` abierto marca
 * `inert` todo lo de fuera, así que un toast con reintento podía expirar
 * mientras era inalcanzable. Sin caducidad, espera a que se pueda usar.
 *
 * Siempre hay salida: el `Toaster` monta `closeButton`, y el `id` derivado del
 * mensaje impide que un fallo en bucle apile avisos.
 *
 * Sin acción, el aviso es solo informativo y el default de sonner está bien.
 */
const WITH_ACTION_DURATION = Infinity;

/** Margen para que quien cierra un modal y avisa a la vez termine de cerrarlo. */
const MODAL_SETTLE_MS = 250;

/**
 * Escalón 3 de la escalera de errores: el fallo NO bloquea la pantalla (un
 * refresh en segundo plano, una acción de fila). El contenido sigue visible y
 * correcto, así que el aviso no puede robar espacio ni dejar rojo permanente.
 *
 * El `id` derivado del mensaje deduplica: un refresh que falla en bucle
 * produce un solo toast que se actualiza, no una pila. Devuelve ese `id` para
 * que quien sondea lo cierre (`toast.dismiss`) cuando el fallo se resuelve.
 */
export function notifyError(message: string, opts: NotifyErrorOptions = {}): string {
  const { onRetry, retryLabel = notifyCopy.retry } = opts;
  const id = `error:${message}`;
  const show = (retry: (() => void) | undefined) =>
    toast.error(message, {
      id,
      action: retry ? { label: retryLabel, onClick: retry } : undefined,
      duration: retry ? WITH_ACTION_DURATION : undefined,
    });
  show(onRetry);
  // DX-538: con un modal abierto lo de fuera es inerte: el botón del aviso no se
  // podría pulsar. Se quita si el modal sigue ahí: quien lo cierra y avisa en el
  // mismo manejador aún lo tiene en el DOM en este instante, y ese sí lo conserva.
  // Quien deja el modal abierto da su error dentro.
  if (onRetry) {
    setTimeout(() => {
      if (modalIsOpen()) show(undefined);
    }, MODAL_SETTLE_MS);
  }
  return id;
}

/** ¿Hay un diálogo o una ficha modal de Radix abiertos? */
function modalIsOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

/** Un éxito corriente se lee y se va; 10 s dan para leerlo con calma. */
export const SUCCESS_DURATION_MS = 10_000;

interface NotifySuccessOptions {
  /**
   * El aviso lleva algo que hay que leer y no perder (una advertencia, un
   * número de recibo): no caduca; el botón de cerrar del `Toaster` es la salida.
   */
  persistent?: boolean;
}

/** Un éxito como toast: 10 s, o sin caducidad si `persistent`. */
export function notifySuccess(message: string, opts: NotifySuccessOptions = {}): void {
  toast.success(message, { duration: opts.persistent ? Infinity : SUCCESS_DURATION_MS });
}
