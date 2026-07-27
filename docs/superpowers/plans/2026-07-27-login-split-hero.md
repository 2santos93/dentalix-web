# Login split con hero de imágenes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `/login` a un layout de pantalla dividida (formulario a la izquierda, imagen de odontología a la derecha) con un banco de 5 fotos que rota aleatoriamente en cada carga.

**Architecture:** Se añade un template nuevo `SplitAuthLayout` (server-friendly) y un módulo `hero-images` (banco + selección pura/testeable). La página `/login` (server component `async`, ya dinámica por `headers()`) elige una imagen al azar en el servidor y la pasa al template. No cambia la lógica de autenticación, el `LoginForm` ni el `auth-store`.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, Tailwind CSS v4 (tokens en `src/styles/tokens.css`), Jest + Testing Library. Imágenes locales en `public/auth/` (licencia Unsplash, uso libre).

## Global Constraints

- **Next.js es una versión con breaking changes**: antes de escribir código que use APIs de Next, leer la guía relevante en `node_modules/next/dist/docs/` (ver `dentalix-web/AGENTS.md`). En este plan se usa `<img>` plano (no `next/image`) para servir archivos de `public/` sin configuración adicional.
- **Copy en español**, patrón de constantes `copy` (i18n-ready), igual que en `login-form.tsx` y `login/page.tsx`.
- **Tokens de tema**: usar utilidades de color de tema (`bg-surface`, `text-ink`, `text-muted`, `bg-primary`, `border-border`, etc.). Debe verse bien en light y dark.
- **Comandos desde** `dentalix-web/` (dev server en puerto 3001; tests con `npm test`).
- Commits frecuentes, un commit por tarea al final.

---

### Task 1: Banco de imágenes `hero-images` + descarga de fotos

Módulo puro con el banco y la selección, más los 5 archivos de imagen en `public/auth/`.

**Files:**
- Create: `src/lib/auth/hero-images.ts`
- Create: `src/lib/auth/hero-images.test.ts`
- Create (binarios, vía curl): `public/auth/hero-1.jpg` … `public/auth/hero-5.jpg`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface HeroImage { src: string; alt: string }`
  - `const HERO_IMAGES: HeroImage[]` — exactamente 5 entradas.
  - `function pickHeroImage(index: number): HeroImage` — normaliza cualquier entero (incluye negativos y fuera de rango) al rango `[0, HERO_IMAGES.length)` con `((index % n) + n) % n` y devuelve esa entrada.
  - `function randomHeroImage(): HeroImage` — `pickHeroImage(Math.floor(Math.random() * HERO_IMAGES.length))`.

- [ ] **Step 1: Descargar las 5 imágenes a `public/auth/`**

Desde `dentalix-web/`:

```bash
mkdir -p public/auth
urls=(
  "1588776814546-1ffcf47267a5"
  "1606811841689-23dfddce3e95"
  "1609840114035-3c981b782dfe"
  "1629909613654-28e377c37b09"
  "1445527815219-ecbfec67492e"
)
i=1
for id in "${urls[@]}"; do
  curl -sS --max-time 60 -o "public/auth/hero-$i.jpg" \
    "https://images.unsplash.com/photo-$id?w=1600&q=80&fm=jpg&fit=crop"
  i=$((i+1))
done
ls -la public/auth
```

- [ ] **Step 2: Verificar que las 5 son JPEG válidos y de buen peso**

Run:
```bash
for f in public/auth/hero-*.jpg; do echo "$f: $(file -b "$f") $(stat -f%z "$f") bytes"; done
```
Expected: 5 líneas, cada una "JPEG image data" y tamaño > 80000 bytes (a `w=1600&q=80` cada foto pesa ~150–400 KB). Si alguna falla o pesa muy poco, re-descargar ese `hero-N.jpg`.

- [ ] **Step 3: (Verificación visual opcional pero recomendada)**

Abrir cada `public/auth/hero-N.jpg` con la herramienta Read para confirmar que se ve la foto dental esperada:
- hero-1: odontólogo revisando radiografías.
- hero-2: dentista mostrando radiografía al paciente en el sillón.
- hero-3: alineador transparente / sonrisa.
- hero-4: consultorio odontológico moderno.
- hero-5: clínica odontológica con sillones.

- [ ] **Step 4: Escribir el test que falla**

Create `src/lib/auth/hero-images.test.ts`:

```ts
import { HERO_IMAGES, pickHeroImage, randomHeroImage } from './hero-images';

describe('hero-images', () => {
  it('tiene exactamente 5 imágenes con src y alt no vacíos', () => {
    expect(HERO_IMAGES).toHaveLength(5);
    for (const img of HERO_IMAGES) {
      expect(img.src).toMatch(/^\/auth\/hero-\d+\.jpg$/);
      expect(img.alt.length).toBeGreaterThan(0);
    }
  });

  it('pickHeroImage devuelve la entrada en un índice válido', () => {
    expect(pickHeroImage(0)).toBe(HERO_IMAGES[0]);
    expect(pickHeroImage(3)).toBe(HERO_IMAGES[3]);
  });

  it('pickHeroImage normaliza índices fuera de rango y negativos', () => {
    expect(pickHeroImage(HERO_IMAGES.length)).toBe(HERO_IMAGES[0]);
    expect(pickHeroImage(HERO_IMAGES.length + 1)).toBe(HERO_IMAGES[1]);
    expect(pickHeroImage(-1)).toBe(HERO_IMAGES[HERO_IMAGES.length - 1]);
  });

  it('randomHeroImage devuelve siempre una entrada del banco', () => {
    for (let i = 0; i < 20; i++) {
      expect(HERO_IMAGES).toContain(randomHeroImage());
    }
  });
});
```

- [ ] **Step 5: Ejecutar el test para verificar que falla**

Run: `npm test -- hero-images`
Expected: FAIL — "Cannot find module './hero-images'".

- [ ] **Step 6: Implementar el módulo**

Create `src/lib/auth/hero-images.ts`:

```ts
/**
 * Banco de imágenes hero del login (panel derecho del split).
 * Fotos locales en `public/auth/` (licencia Unsplash, uso libre).
 * La selección aleatoria ocurre en el server component de `/login`, que es
 * dinámico (usa `headers()`), así que rota en cada carga sin hydration mismatch.
 */
export interface HeroImage {
  src: string;
  alt: string;
}

export const HERO_IMAGES: HeroImage[] = [
  { src: '/auth/hero-1.jpg', alt: 'Odontólogo revisando radiografías dentales' },
  { src: '/auth/hero-2.jpg', alt: 'Dentista mostrando una radiografía a su paciente' },
  { src: '/auth/hero-3.jpg', alt: 'Paciente con un alineador dental transparente' },
  { src: '/auth/hero-4.jpg', alt: 'Consultorio odontológico moderno' },
  { src: '/auth/hero-5.jpg', alt: 'Clínica dental con sillones y equipo profesional' },
];

/** Normaliza cualquier índice entero al rango válido del banco. */
export function pickHeroImage(index: number): HeroImage {
  const n = HERO_IMAGES.length;
  const normalized = ((Math.trunc(index) % n) + n) % n;
  return HERO_IMAGES[normalized];
}

/** Elige una imagen al azar (para el server component en cada request). */
export function randomHeroImage(): HeroImage {
  return pickHeroImage(Math.floor(Math.random() * HERO_IMAGES.length));
}
```

- [ ] **Step 7: Ejecutar el test para verificar que pasa**

Run: `npm test -- hero-images`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/hero-images.ts src/lib/auth/hero-images.test.ts public/auth
git commit -m "feat(login): banco de imágenes hero + selección aleatoria"
```

---

### Task 2: Template `SplitAuthLayout`

El envoltorio visual de dos paneles. Reutiliza `ThemeToggle` y el estilo de marca del `AuthLayout` actual.

**Files:**
- Create: `src/components/templates/split-auth-layout.tsx`
- Reference (patrón a seguir): `src/components/templates/auth-layout.tsx`

**Interfaces:**
- Consumes: `HeroImage` de `@/lib/auth/hero-images`; `ThemeToggle` de `@/components/theme/theme-toggle`.
- Produces:
  ```ts
  interface SplitAuthLayoutProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    heroImage: HeroImage;
    heroCaption?: string;
  }
  export function SplitAuthLayout(props: SplitAuthLayoutProps): JSX.Element
  ```

- [ ] **Step 1: Crear el componente**

Create `src/components/templates/split-auth-layout.tsx`:

```tsx
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
        <img
          src={heroImage.src}
          alt={heroImage.alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-primary/50 via-primary/10 to-transparent"
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
```

- [ ] **Step 2: Verificar que compila (typecheck)**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados con `split-auth-layout.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/split-auth-layout.tsx
git commit -m "feat(login): template SplitAuthLayout de pantalla dividida"
```

---

### Task 3: Conectar `/login` al nuevo layout

Cambiar la página de login para usar `SplitAuthLayout` + `randomHeroImage()`.

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Reference: `src/components/organisms/login-form.tsx` (no cambia)

**Interfaces:**
- Consumes: `SplitAuthLayout` de `@/components/templates/split-auth-layout`; `randomHeroImage` de `@/lib/auth/hero-images`.
- Produces: página `/login` renderizada con split + imagen aleatoria por request.

- [ ] **Step 1: Reescribir `login/page.tsx`**

Reemplazar el contenido de `src/app/(auth)/login/page.tsx` por:

```tsx
import Link from 'next/link';
import { headers } from 'next/headers';
import { LoginForm } from '@/components/organisms/login-form';
import { SplitAuthLayout } from '@/components/templates/split-auth-layout';
import { randomHeroImage } from '@/lib/auth/hero-images';
import { fetchBranding } from '@/lib/branding';
import { parseTenantFromHost } from '@/lib/tenant';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  defaultTitle: 'Dentalix',
  subtitle: 'Inicia sesión en tu cuenta',
  registerPrompt: '¿No tienes cuenta?',
  registerLink: 'Regístrate',
  heroCaption: 'Tu clínica, siempre al día',
};

export default async function LoginPage() {
  const h = await headers();
  const tenant = h.get('x-tenant') ?? parseTenantFromHost(h.get('host'));
  const branding = await fetchBranding(tenant);
  const heroImage = randomHeroImage();

  return (
    <SplitAuthLayout
      title={branding.name ?? copy.defaultTitle}
      subtitle={copy.subtitle}
      heroImage={heroImage}
      heroCaption={copy.heroCaption}
      footer={
        <>
          {copy.registerPrompt}{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {copy.registerLink}
          </Link>
        </>
      }
    >
      <LoginForm />
    </SplitAuthLayout>
  );
}
```

- [ ] **Step 2: Ejecutar la suite completa**

Run: `npm test`
Expected: PASS (incluye `hero-images` y el `login-form.test.tsx` existente, que no cambia).

- [ ] **Step 3: Verificación visual en el dev server**

Run: `npm run dev` (puerto 3001) y abrir `http://localhost:3001/login`.
Verificar:
- Desktop: formulario a la izquierda, foto dental a la derecha con degradado y la frase "Tu clínica, siempre al día".
- Recargar varias veces → la imagen del panel derecho cambia (rotación aleatoria).
- Ancho móvil (DevTools ~375px): el panel de imagen se oculta y el formulario ocupa todo el ancho, centrado.
- Alternar tema (toggle arriba a la derecha): el panel izquierdo se ve bien en light y dark.
- `/register` sigue mostrando la tarjeta centrada de siempre (sin cambios).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/login/page.tsx"
git commit -m "feat(login): usar SplitAuthLayout con imagen hero aleatoria"
```

---

## Notas de verificación final

- La rotación "en cada carga" funciona porque `/login` es dinámica (`await headers()`), así que el server la re-renderiza por request. Al ser render en servidor, no hay hydration mismatch (el cliente recibe HTML ya con la imagen elegida).
- Si en el futuro Next cachea la ruta, forzar dinamismo con `export const dynamic = 'force-dynamic'` en `login/page.tsx` (no necesario hoy).
