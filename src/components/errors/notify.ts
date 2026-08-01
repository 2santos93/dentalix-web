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
 * Un toast con acción tiene que durar lo que tarda una persona en notarlo,
 * leerlo, decidir y pulsar. Los 4s por defecto de sonner no dan para eso: la
 * salida se iría de la pantalla antes de poder usarla, que es justo lo que
 * «The Way-Out Rule» de DESIGN.md prohíbe. Sin acción, el aviso es solo
 * informativo y el default está bien.
 */
const WITH_ACTION_DURATION_MS = 12_000;

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
    duration: onRetry ? WITH_ACTION_DURATION_MS : undefined,
  });
}
