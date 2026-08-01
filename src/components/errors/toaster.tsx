'use client';
import { useTheme } from 'next-themes';
import { AlertCircle } from 'lucide-react';
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
      // El icono de error de sonner es `fill="currentColor"`, así que heredaba
      // `--normal-text` y salía en tinta: el único escalón cuyo icono no
      // hablaba el idioma del sistema. Verificado en navegador — el estilo
      // computado daba `rgb(15,23,42)` donde los otros tres dan `danger`.
      // Sustituirlo por el mismo `AlertCircle` que usan `FieldError` e
      // `InlineError` cierra la familia.
      icons={{
        error: <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-danger" />,
      }}
      // Los tokens de la app, no los de sonner, para que el toast pertenezca
      // al mismo sistema visual que el resto (radio 12px = card).
      //
      // sonner inyecta su propia hoja de estilos en `<head>` como CSS SIN
      // `@layer`; `globals.css` es `@import "tailwindcss"`, así que toda
      // utilidad de Tailwind v4 vive en `@layer utilities`. En la cascada,
      // CSS sin capa gana siempre a CSS con capa — sin importar
      // especificidad ni orden de inserción — así que sin más, ninguna de
      // estas clases le ganaba a las de sonner. El modificador `!` (mismo
      // patrón que `payment-receipt.tsx`) fuerza `!important`, que sí gana
      // sea cual sea la capa: es correcto por semántica de CSS, no por una
      // comprobación visual.
      //
      // `shadow-lg` va SIN `!` a propósito (Fix round 2): el `<li>` del
      // toast es focusable (`tabIndex: 0`, sonner) y su único indicador de
      // foco es un `box-shadow` normal en `:focus-visible` — un `!important`
      // de autor gana en todos los estados, así que `!shadow-lg` lo tapaba
      // sin excepción (WCAG 2.4.7). Sin `!`, `shadow-lg` es una utilidad
      // normal en capa y pierde contra el `box-shadow` normal SIN capa de
      // sonner tanto en reposo como en foco — el mismo razonamiento de
      // "sin capa gana" de arriba, aplicado a la propiedad correcta. La
      // sombra de reposo de sonner es visualmente equivalente a `shadow-lg`,
      // así que no se pierde nada del objetivo original.
      toastOptions={{
        classNames: {
          toast:
            '!rounded-xl !border !border-border !bg-surface !text-ink shadow-lg',
          description: '!text-muted',
          actionButton:
            '!rounded-md !bg-primary !px-2.5 !py-1 !text-xs !font-medium !text-primary-foreground',
          // `hover:!bg-surface-2` (Fix round 2): sin esto, `!bg-surface` gana
          // en TODOS los estados — incluido el `:hover` normal de sonner —
          // y el botón de cerrar no daba realimentación al pasar el cursor.
          closeButton: '!border-border !bg-surface !text-muted hover:!bg-surface-2',
          error: '!border-danger/30',
        },
      }}
    />
  );
}
