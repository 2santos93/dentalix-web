'use client';
import * as React from 'react';
import { useClinicBranding } from '@/components/brand/branding-context';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { ClinicLogo } from '@/components/brand/clinic-brand';
import { Logo } from '@/components/ui/logo';
import type { HeroImage } from '@/lib/auth/hero-images';

/** La clínica del host (white-label). `null` en el apex o si no tiene nombre. */
export interface AuthClinic {
  name: string;
  logoUrl: string | null;
}

interface AuthLayoutProps {
  /**
   * Clínica del host. Con ella el H1 es su nombre y `task` pasa a la línea de
   * apoyo; sin ella (apex, o una página que crea una clínica nueva) el H1 es
   * `task` y la cabecera lleva la marca de Dentalix. Así «Dentalix» nunca sale
   * dos veces ni tapa a la clínica.
   */
  clinic: AuthClinic | null;
  /**
   * DX-019: la página es de la clínica del host (login, contraseña,
   * invitación). Si el servidor no la supo (`clinic` null en `*.localhost` o
   * un dominio propio que no resuelve), se usa la marca que pidió el
   * navegador. El registro de una clínica nueva no lo pasa.
   */
  fromHost?: boolean;
  /** Lo que se hace en esta página: «Inicia sesión», «Restablecer contraseña»… */
  task: string;
  /** Línea de apoyo cuando no hay clínica (con clínica, la línea es `task`). */
  description?: string;
  /** Frase del panel lateral (solo ≥ lg). */
  caption?: string;
  /**
   * Foto del panel lateral (solo ≥ lg), elegida por la página en el servidor
   * (`randomHeroImage()`) para que viaje como prop y no haya hydration
   * mismatch. Sin ella el panel es la superficie hundida con la frase.
   */
  heroImage?: HeroImage;
  children: React.ReactNode;
  /** Enlace secundario al pie del bloque («¿Ya tienes cuenta? Inicia sesión»). */
  footer?: React.ReactNode;
}

/**
 * El ancho desde el que se ve el panel lateral: el `lg` de Tailwind (64rem).
 * Las `media` de `<picture>` deben coincidir con él.
 */
const HERO_MEDIA = '(min-width: 1024px)';
/** GIF transparente de 1×1 en línea: lo que «descarga» la foto bajo lg (ninguna petición). */
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * DX-117 (FE-023): la foto del panel como `<picture>`. El navegador elige la
 * PRIMERA `<source>` cuya `media` (y `type`) encaja y no mira `src` del
 * `<img>`; por eso va primero la del móvil, un GIF en línea que no hace
 * ninguna petición — el `display: none` del panel y `loading="lazy"` no bastan:
 * hay navegadores que descargan igual la imagen de un contenedor oculto. Desde
 * lg, AVIF y si no WebP; el JPG solo para quien no entienda ninguna.
 */
function HeroPicture({ image }: { image: HeroImage }) {
  return (
    <picture>
      <source media={`not all and ${HERO_MEDIA}`} srcSet={BLANK_GIF} />
      <source media={HERO_MEDIA} type="image/avif" srcSet={image.avif} />
      <source media={HERO_MEDIA} type="image/webp" srcSet={image.webp} />
      {/* `<img>` y no `next/image`: foto local de public/auth, sin optimizador (images.unoptimized, DX-080). */}
      <img
        src={image.src}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
    </picture>
  );
}

/** Ritmo común de los formularios de auth: 16 px entre campos. */
export const AUTH_FORM_CLASS = 'flex flex-col gap-4';
/** El botón principal cierra el formulario a 8 px más del ritmo, a todo el ancho. */
export const AUTH_SUBMIT_CLASS = 'mt-2 w-full';
/** Enlace suelto (no dentro de una frase): objetivo de 44 px en táctil. */
export const AUTH_LINK_CLASS =
  'inline-flex min-h-10 items-center text-sm font-medium text-primary-text underline-offset-4 hover:underline pointer-coarse:min-h-11';

/**
 * Plantilla única de las páginas de acceso (login, registro, verificación,
 * contraseña olvidada y nueva, invitación). Cabecera de alto fijo (64 px) y
 * 48 px hasta el H1 (96 px desde lg) sea cual sea la longitud del formulario:
 * todas las páginas hermanas comparten la misma vertical. El bloque arranca
 * arriba, no centrado, para que el teclado del móvil no tape el botón.
 *
 * Panel lateral (≥ lg): una fotografía a sangre que rota en cada carga (decisión
 * del dueño, 2026-11-04), con un velo neutro y la frase en blanco encima. Sin
 * `heroImage`, una superficie hundida con la frase. Bajo lg el panel está
 * oculto y, además, la foto no se descarga (DX-117, FE-023): `HeroPicture`.
 */
export function AuthLayout({ clinic: serverClinic, fromHost = false, task, description, caption, heroImage, children, footer }: AuthLayoutProps) {
  const branding = useClinicBranding();
  const clinic: AuthClinic | null =
    serverClinic ?? (fromHost && branding.name ? { name: branding.name, logoUrl: branding.logoUrl } : null);
  const title = clinic ? clinic.name : task;
  const support = clinic ? task : description;

  return (
    <div className="flex min-h-dvh flex-1 bg-canvas">
      <div className="flex w-full min-w-0 flex-col px-4 sm:px-6 lg:w-1/2 lg:px-12">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4">
          {clinic ? (
            // El nombre ya es el H1: aquí solo su logo, decorativo.
            clinic.logoUrl ? (
              <ClinicLogo src={clinic.logoUrl} alt="" variant="shell" />
            ) : (
              <span />
            )
          ) : (
            <Logo size={28} withWordmark className="text-sm" />
          )}
          <ThemeToggle />
        </header>

        <main className="flex flex-1 flex-col pt-12 pb-12 lg:pt-24">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="t-display break-words text-ink">{title}</h1>
            {support ? <p className="mt-1 text-muted">{support}</p> : null}
            <div className="mt-8 flex flex-col gap-6">
              {children}
              {footer ? <div className="text-center text-sm text-muted">{footer}</div> : null}
            </div>
          </div>
        </main>
      </div>

      <div
        className={`relative hidden overflow-hidden border-l border-border-subtle lg:flex lg:w-1/2 lg:flex-col lg:justify-end lg:p-12 ${
          heroImage ? 'bg-black' : 'bg-surface-sunken'
        }`}
      >
        {heroImage ? (
          <>
            <HeroPicture image={heroImage} />
            {/* Velo neutro (negro con opacidad, sin color de marca): AA para la frase sobre cualquier foto. */}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
          </>
        ) : null}
        {caption ? (
          <div className="relative max-w-md">
            <div aria-hidden className={`mb-4 h-px w-12 ${heroImage ? 'bg-white/60' : 'bg-border'}`} />
            <p className={`t-display ${heroImage ? 'text-white' : 'text-muted'}`}>{caption}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
