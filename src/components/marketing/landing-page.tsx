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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';

// Copy as constants (i18n-ready) — es first, matches the rest of the app until
// next-intl wiring lands.
const copy = {
  brand: 'Dentalix',
  login: 'Iniciar sesión',
  register: 'Crea tu clínica',
  heroEyebrow: 'Software odontológico multi-clínica',
  heroTitle: 'El software que mantiene tu clínica dental al día.',
  heroSubtitle:
    'Pacientes, historia clínica, odontograma interactivo y agenda — en una plataforma segura, multi-clínica y con tu propia marca.',
  heroNote: 'White-label por clínica · multi-moneda · listo en minutos.',
  heroImageAlt: 'Consultorio odontológico moderno',
  featuresTitle: 'Todo el núcleo clínico, en un solo lugar',
  featuresSubtitle:
    'Las herramientas del día a día de tu consultorio, diseñadas para el trabajo real de la clínica.',
  whyTitle: 'Por qué Dentalix',
  ctaTitle: 'Crea tu clínica en minutos',
  ctaSubtitle: 'Registra tu consultorio y empieza a gestionar pacientes hoy mismo.',
  footerTagline: 'Tu clínica, siempre al día.',
};

const FEATURES = [
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
    desc: 'Citas por doctor y por rango, con estados y control de choques de horario. Tu día, claro de un vistazo.',
  },
  {
    icon: Coins,
    title: 'Multi-moneda',
    desc: 'Cada pago guarda su moneda y la tasa del día. Mira tus ventas del mes en la moneda que elijas, convertidas por fecha.',
  },
] as const;

const DIFFERENTIATORS = [
  {
    icon: Palette,
    title: 'White-label',
    desc: 'Tu logo, tu color y tu subdominio. La plataforma se ve como tu marca, no como la nuestra.',
  },
  {
    icon: Building2,
    title: 'Multi-clínica seguro',
    desc: 'Aislamiento total entre clínicas a nivel de base de datos (RLS). Un mismo equipo, varias sedes, sin cruces.',
  },
  {
    icon: ShieldCheck,
    title: 'Listo para cumplir',
    desc: 'Auditoría de accesos, historia clínica inmutable y cifrado. Pensado para Habeas Data, LGPD, GDPR e HIPAA.',
  },
] as const;

/**
 * Landing pública de Dentalix (apex host). Reutiliza los tokens del design
 * system, el `ThemeToggle` y el `Button`; responsive y AA en light/dark. La
 * decisión de mostrarla (vs. redirigir a /login en hosts de tenant) vive en
 * el server component de la raíz.
 */
export function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-border/60 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-base font-semibold">
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-base"
            >
              🦷
            </span>
            {copy.brand}
          </span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button asChild variant="secondary" size="sm">
              <Link href="/login">{copy.login}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-2">
          <div className="flex flex-col items-start">
            <span className="mb-4 inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-primary">
              {copy.heroEyebrow}
            </span>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              {copy.heroTitle}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">{copy.heroSubtitle}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  {copy.register}
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">{copy.login}</Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-muted">{copy.heroNote}</p>
          </div>

          {/* Imagen con degradado de marca (oculta en móvil pequeño). */}
          <div className="relative hidden aspect-[4/3] overflow-hidden rounded-2xl border border-border shadow-sm md:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset, object-cover fill; next/image adds no value here */}
            <img
              src="/auth/hero-4.jpg"
              alt={copy.heroImageAlt}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-tr from-primary/40 via-accent/10 to-transparent"
            />
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {copy.featuresTitle}
            </h2>
            <p className="mt-4 text-muted">{copy.featuresSubtitle}</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex flex-col rounded-xl border border-border bg-surface p-6"
              >
                <span
                  aria-hidden
                  className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                  <Icon className="size-5" />
                </span>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Por qué Dentalix */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-20">
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              {copy.whyTitle}
            </h2>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {DIFFERENTIATORS.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex flex-col items-start">
                  <span
                    aria-hidden
                    className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent"
                  >
                    <Icon className="size-5" />
                  </span>
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-muted">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA de cierre */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
          <div className="flex flex-col items-center rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {copy.ctaTitle}
            </h2>
            <p className="mt-4 max-w-xl text-primary-foreground/80">{copy.ctaSubtitle}</p>
            <Button asChild size="lg" variant="secondary" className="mt-8">
              <Link href="/register">
                {copy.register}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="text-base">
              🦷
            </span>
            <span className="font-semibold text-ink">{copy.brand}</span>
            <span>· {copy.footerTagline}</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/login" className="text-muted hover:text-ink">
              {copy.login}
            </Link>
            <Link href="/register" className="font-medium text-primary hover:underline">
              {copy.register}
            </Link>
          </div>
        </div>
        <p className="pb-6 text-center text-xs text-muted">
          © {year} {copy.brand}
        </p>
      </footer>
    </div>
  );
}
