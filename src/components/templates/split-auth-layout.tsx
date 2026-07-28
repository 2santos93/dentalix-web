import * as React from 'react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import type { HeroImage } from '@/lib/auth/hero-images';

interface SplitAuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  heroImage: HeroImage;
  heroCaption?: string;
}

/**
 * Template: login en pantalla dividida (estilo FluVipAI).
 * Panel izquierdo = marca + formulario; panel derecho = foto de odontología
 * con degradado de marca y una frase. El panel derecho se oculta por debajo
 * de `lg` (el formulario ocupa todo el ancho en móvil).
 */
export function SplitAuthLayout({
  title,
  subtitle,
  children,
  footer,
  heroImage,
  heroCaption,
}: SplitAuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-1">
      {/* Panel izquierdo: marca + formulario */}
      <div className="relative flex w-full flex-col px-6 py-8 lg:w-[45%] lg:px-12">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-base"
            >
              🦷
            </span>
            Dentalix
          </span>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
            <div className="mt-8 flex flex-col gap-6">
              {children}
              {footer ? (
                <div className="text-center text-sm text-muted">{footer}</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Panel derecho: foto de odontología + degradado de marca */}
      <div className="relative hidden lg:block lg:w-[55%]">
        {/* eslint-disable-next-line @next/next/no-img-element -- random per-request src, object-cover fill; next/image adds no value here */}
        <img
          src={heroImage.src}
          alt={heroImage.alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/60 via-primary/20 to-transparent"
        />
        {heroCaption ? (
          <p className="absolute bottom-10 left-10 right-10 text-2xl font-semibold leading-snug text-white drop-shadow-md">
            {heroCaption}
          </p>
        ) : null}
      </div>
    </div>
  );
}
