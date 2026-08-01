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

/**
 * Escalón 3 de la escalera de errores: el fallo NO bloquea la pantalla (un
 * refresh en segundo plano, una acción de fila). El contenido sigue visible y
 * correcto, así que el aviso no puede robar espacio ni dejar rojo permanente.
 *
 * El `id` derivado del mensaje deduplica: un refresh que falla en bucle
 * produce un solo toast que se actualiza, no una pila.
 */
export function notifyError(message: string, opts: NotifyErrorOptions = {}) {
  const { onRetry, retryLabel = notifyCopy.retry } = opts;
  toast.error(message, {
    id: `error:${message}`,
    action: onRetry ? { label: retryLabel, onClick: onRetry } : undefined,
    duration: onRetry ? WITH_ACTION_DURATION : undefined,
  });
}
