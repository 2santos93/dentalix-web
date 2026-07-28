# Login split con hero de imágenes (estilo FluVipAI)

**Fecha:** 2026-07-27
**Estado:** Diseño aprobado
**Alcance:** `dentalix-web`

## Objetivo

Rediseñar la pantalla de login para que use un layout de **pantalla dividida**
(estilo FluVipAI): formulario a la izquierda e imagen de odontología a la
derecha. La imagen proviene de un **banco de fotos** que rota **aleatoriamente
en cada carga** de la página.

No cambia la lógica de autenticación, el `auth-store` ni el `LoginForm`
existente: solo el envoltorio visual (template) de la página `/login`.

## Layout

Split de pantalla completa (`min-h` completo, sin scroll en desktop):

- **Panel izquierdo (~45%)** — fondo `surface`:
  - Lockup de marca arriba (🦷 + nombre del tenant / "Dentalix").
  - `ThemeToggle` arriba a la derecha del panel.
  - Centro vertical: título (`branding.name ?? "Dentalix"`), subtítulo
    ("Inicia sesión en tu cuenta"), el `LoginForm` actual y el footer con el
    enlace a registro.
  - Ancho de contenido acotado (`max-w-sm`) y centrado dentro del panel.
- **Panel derecho (~55%)** — la imagen hero:
  - `<img>` (o `next/image`) a `object-cover` cubriendo todo el panel.
  - Degradado sutil de marca encima (de `primary/40` transparente) para dar
    cohesión y legibilidad del texto.
  - Frase corta sobreimpresa abajo-izquierda: "Tu clínica, siempre al día".

**Responsive:** por debajo de `lg`, el panel derecho se **oculta**
(`hidden lg:block`) y el panel izquierdo ocupa el 100% del ancho, centrando el
formulario — mismo comportamiento limpio actual en móvil.

**Dark mode:** el panel izquierdo usa los tokens de tema (funciona en light y
dark automáticamente). La imagen se muestra igual en ambos; el degradado de
marca mantiene el contraste del texto sobreimpreso.

## Banco de imágenes

- **5 fotos** de odontología (mezcla variada: sonrisas/pacientes, clínica/
  dentista, detalle clínico), licencia Unsplash (uso libre, sin atribución
  obligatoria).
- Descargadas y optimizadas (~1600px de ancho, calidad ~80) a
  `public/auth/hero-1.jpg` … `public/auth/hero-5.jpg` (servidas localmente; sin
  dependencia de CDN externo en runtime).
- Módulo `src/lib/auth/hero-images.ts`:
  ```ts
  export interface HeroImage { src: string; alt: string }
  export const HERO_IMAGES: HeroImage[] = [ /* 5 entradas */ ];
  // pura y testeable — normaliza cualquier índice al rango válido
  export function pickHeroImage(index: number): HeroImage;
  // wrapper aleatorio (usa Math.random) para el server component
  export function randomHeroImage(): HeroImage;
  ```

## Selección aleatoria en cada carga

`src/app/(auth)/login/page.tsx` ya es un *server component* `async` y es
**dinámico** (usa `await headers()`), por lo que se re-renderiza en cada
request. Se elige `randomHeroImage()` en el servidor y se pasa al template →
HTML server-rendered (sin hydration mismatch), imagen distinta en cada entrada.

## Componentes

- **Nuevo:** `src/components/templates/split-auth-layout.tsx`
  (`SplitAuthLayout`) — recibe `title`, `subtitle?`, `footer?`, `heroImage`,
  `heroCaption?` y `children`. Renderiza los dos paneles descritos arriba.
- **Nuevo:** `src/lib/auth/hero-images.ts` (banco + selección).
- **Modificado:** `src/app/(auth)/login/page.tsx` — usa `SplitAuthLayout` con
  `randomHeroImage()` en vez de `AuthLayout`.
- **Sin cambios:** `AuthLayout` (lo sigue usando `/register`), `LoginForm`,
  `auth-store`, `fetchBranding`, `parseTenantFromHost`.

## Alcance de páginas

Solo `/login` cambia a split. `/register` mantiene el `AuthLayout` de tarjeta
centrada por ahora. (Se puede unificar más adelante como decisión aparte.)

## Testing

- Unit: `src/lib/auth/hero-images.test.ts`
  - `pickHeroImage(index)` normaliza índices (0, dentro de rango, fuera de
    rango / negativos) y siempre devuelve una `HeroImage` válida del banco.
  - `HERO_IMAGES` tiene 5 entradas con `src` y `alt` no vacíos.
- El `login-form.test.tsx` existente no cambia (la lógica del form no cambia).
- Verificación visual manual (dev server) en desktop y en ancho móvil.

## Fuera de alcance

- Cambios en autenticación / tokens / redirecciones.
- Rediseño de `/register`.
- Subida de imágenes por tenant (branding de imagen); el banco es global.
- Optimización avanzada de imágenes / `next/image` remoto (las fotos son
  locales).
