'use client';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Coins,
  FileText,
  Grid3x3,
  Palette,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Logo } from '@/components/ui/logo';

// Copy as constants (i18n-ready) — es first, matches the rest of the app until
// next-intl wiring lands. Solo afirmaciones que el producto cumple hoy: sin
// testimonios, precios, cifras de clientes ni un país concreto.
const copy = {
  brand: 'Dentalix',
  login: 'Iniciar sesión',
  register: 'Crea tu clínica',
  heroEyebrow: 'Software odontológico multi-clínica',
  heroTitle: 'El software que mantiene tu clínica dental al día.',
  heroSubtitle:
    'Pacientes, historia clínica, odontograma interactivo y agenda — en una plataforma segura, multi-clínica y con tu propia marca.',
  heroNote: 'Con la marca de tu clínica · varias monedas · listo en minutos.',
  featuresTitle: 'Todo el núcleo clínico, en un solo lugar',
  featuresSubtitle:
    'Las herramientas del día a día de tu consultorio, diseñadas para el trabajo real de la clínica.',
  whyTitle: 'Por qué Dentalix',
  ctaTitle: 'Crea tu clínica en minutos',
  ctaSubtitle: 'Registra tu consultorio y empieza a gestionar pacientes hoy mismo.',
  footerTagline: 'Tu clínica, siempre al día.',
};

interface Point {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const FEATURES: readonly Point[] = [
  {
    icon: Grid3x3,
    title: 'Odontograma interactivo',
    desc: 'Registra y consulta, diente por diente y cara por cara, qué se diagnosticó y qué se hizo — con línea de tiempo por pieza.',
  },
  {
    icon: FileText,
    title: 'Historia clínica confiable',
    desc: 'Anamnesis versionada y evoluciones inmutables. Nada se borra: cada corrección queda registrada con su fecha.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda por profesional',
    desc: 'Citas por profesional y por rango, con estados y control de choques de horario. Tu día, claro de un vistazo.',
  },
  {
    icon: Coins,
    title: 'Multi-moneda',
    desc: 'Cada pago guarda su moneda y la tasa del día. Mira tus ventas del mes en la moneda que elijas, convertidas por fecha.',
  },
];

const DIFFERENTIATORS: readonly Point[] = [
  {
    icon: Palette,
    title: 'Con tu marca',
    desc: 'Tu logo, tu color y tu propia dirección web. La plataforma se ve como tu clínica, no como la nuestra.',
  },
  {
    icon: Building2,
    title: 'Multi-clínica seguro',
    desc: 'Cada clínica aislada de las demás en la propia base de datos. Un mismo equipo, varias sedes, sin cruces.',
  },
  {
    icon: ShieldCheck,
    title: 'Seguridad y trazabilidad',
    desc: 'Registro de auditoría de accesos y cambios, historia clínica inmutable, consentimientos versionados y conexión cifrada.',
  },
];

/**
 * Lista de puntos con regla fina encima de cada uno — no tarjetas iguales de
 * icono + título + texto (DESIGN.md → Don'ts). El icono va en tinta apagada:
 * el acento queda para la acción principal.
 */
function PointList({ points, columns }: { points: readonly Point[]; columns: string }) {
  return (
    <ul className={`grid gap-x-8 gap-y-8 ${columns}`}>
      {points.map(({ icon: Icon, title, desc }) => (
        <li key={title} className="flex flex-col border-t border-border pt-5">
          <Icon aria-hidden className="mb-3 size-5 text-muted" />
          <h3 className="t-title text-ink">{title}</h3>
          <p className="mt-1 text-muted">{desc}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Landing pública de Dentalix (apex host). Tipográfica y plana, en los tokens
 * del design system: sin fotografía, sin bloques de acento, una acción
 * principal por pantalla. La decisión de mostrarla (vs. redirigir a /login en
 * hosts de tenant) vive en el server component de la raíz.
 */
export function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-canvas">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo size={28} withWordmark className="text-base" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button asChild variant="secondary">
              <Link href="/login">{copy.login}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero: tipográfico, una sola columna a la medida de lectura. */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="flex max-w-3xl flex-col items-start">
            <p className="t-label mb-4 text-muted">{copy.heroEyebrow}</p>
            <h1 className="t-display text-ink sm:text-4xl sm:leading-tight lg:text-5xl">
              {copy.heroTitle}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">{copy.heroSubtitle}</p>
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  {copy.register}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">{copy.login}</Link>
              </Button>
            </div>
            <p className="t-caption mt-5">{copy.heroNote}</p>
          </div>
        </section>

        <section className="border-t border-border-subtle">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <div className="max-w-2xl">
              <h2 className="t-display text-ink">{copy.featuresTitle}</h2>
              <p className="mt-2 text-muted">{copy.featuresSubtitle}</p>
            </div>
            <div className="mt-10">
              <PointList points={FEATURES} columns="sm:grid-cols-2 lg:grid-cols-4" />
            </div>
          </div>
        </section>

        <section className="border-t border-border-subtle bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <h2 className="t-display text-ink">{copy.whyTitle}</h2>
            <div className="mt-10">
              <PointList points={DIFFERENTIATORS} columns="md:grid-cols-3" />
            </div>
          </div>
        </section>

        {/* Cierre: en su propia pantalla, la única acción principal a la vista. */}
        <section className="border-t border-border-subtle">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-end md:justify-between md:py-24">
            <div className="max-w-2xl">
              <h2 className="t-display text-ink">{copy.ctaTitle}</h2>
              <p className="mt-2 text-muted">{copy.ctaSubtitle}</p>
            </div>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/register">
                {copy.register}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted">
            <Logo size={20} decorative />
            <span className="font-semibold text-ink">{copy.brand}</span>
            <span>· {copy.footerTagline}</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center text-muted hover:text-ink pointer-coarse:min-h-11"
            >
              {copy.login}
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-10 items-center font-medium text-primary-text hover:underline pointer-coarse:min-h-11"
            >
              {copy.register}
            </Link>
          </div>
        </div>
        <p className="t-caption pb-6 text-center">
          © {year} {copy.brand}
        </p>
      </footer>
    </div>
  );
}
