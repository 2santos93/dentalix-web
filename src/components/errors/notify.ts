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
  });
}
