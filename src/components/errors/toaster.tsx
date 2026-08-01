'use client';
import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster } from 'sonner';

/**
 * Región de toasts de la app. Vive en el root layout, dentro de
 * `ThemeProvider`, para poder leer el tema resuelto: sonner pinta su propio
 * contenedor y no hereda las clases de Tailwind, así que el tema hay que
 * pasárselo explícitamente.
 *
 * Es el escalón 3 de la escalera de errores (ver DESIGN.md → Estados de
 * error): fallos que no bloquean nada y no deben tocar el layout.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      closeButton
      // Los tokens de la app, no los de sonner, para que el toast pertenezca
      // al mismo sistema visual que el resto (radio 12px = card).
      toastOptions={{
        classNames: {
          toast:
            'rounded-xl border border-border bg-surface text-ink shadow-lg',
          description: 'text-muted',
          actionButton:
            'rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground',
          closeButton: 'border-border bg-surface text-muted',
          error: 'border-danger/30',
        },
      }}
    />
  );
}
