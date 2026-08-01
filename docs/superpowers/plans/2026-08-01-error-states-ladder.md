# Escalera de estados de error — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir los tres estilos de error improvisados que conviven hoy en la app por una sola escalera de cuatro escalones, de modo que la severidad visual de un fallo corresponda a cuánto le impide realmente hacer al usuario.

**Architecture:** Cuatro componentes en `src/components/errors/`, uno por escalón, más un wrapper de toasts sobre `sonner`. Cada sitio de error existente se reclasifica según *qué quedó roto* (toda la sección / un control / nada visible / el envío de un formulario) y se migra al escalón que le toca. `AsyncSection` pasa a delegar en `SectionError` para que las tres pantallas que ya la usan hereden el cambio gratis.

**Tech Stack:** Next 16.2.11 (App Router), React 19.2.4, Tailwind v4 con tokens en `src/styles/tokens.css`, Jest + Testing Library, `sonner@^2.0.7`, `lucide-react`.

## Global Constraints

- **Next 16 no es el Next que conoces.** Antes de escribir código que toque `app/`, layouts, o límites cliente/servidor, leer la guía correspondiente en `node_modules/next/dist/docs/`. Lo exige `AGENTS.md`.
- **Rojo con cuentagotas.** `DESIGN.md` fija `danger` (`#BE123C`) como color de estado, no de decoración: «reserve solid danger for destructive confirmation, never as decoration». En los cuatro escalones el rojo se limita al icono y, como mucho, a un borde de 1px. Los títulos van en `text-ink`, y el botón de reintento es `primary`, nunca `danger`.
- **Ningún error puede empujar layout.** Un error que aparece después de que la página se asentó reserva su espacio o sustituye al elemento que falló. Nunca se inserta en flujo empujando el contenido de abajo.
- **Copy: prohibido «Intenta de nuevo.» cuando hay un control de reintento al lado.** Es redundante con el botón. Se borra de todas las constantes `copy` que acompañen a un botón «Reintentar».
- **Copy: el mensaje dice qué falló y qué sigue funcionando**, no solo que algo falló. «No pudimos cargar los profesionales» → el filtro; la agenda sigue usable.
- **Nunca significado solo por color** (WCAG 1.4.1). Todo error lleva icono además del color.
- **Roles ARIA fijados por escalón** (ver tabla abajo). No improvisar: ~20 tests existentes dependen de ellos.
- **`onRetry` de un toast nunca captura estado mutable del componente.** Un toast se construye en el `catch`; si su `onRetry` cierra sobre filtros o fechas, reintenta los de *ese* instante y puede sobreescribir datos correctos con datos viejos.

  Formas aceptables, en orden de preferencia:
  1. **Reusar el mecanismo de recarga existente:** `onRetry: () => setReloadKey((k) => k + 1)`. Los updaters funcionales tienen identidad estable, así que no hay estado obsoleto ni maquinaria extra.
  2. **Ref escrito en un efecto** (nunca en el cuerpo del render — la regla `react-hooks/refs` lo trata como error: «Cannot update ref during render»):
     ```tsx
     const refreshRef = useRef(refresh);
     useEffect(() => { refreshRef.current = refresh; });  // sin deps: corre tras cada render
     ```

  Excepción: closures cuyos argumentos **son** la operación (`handleStatusChange(id, status)`) no tienen el problema y se dejan tal cual.

  **Ningún toast puede quedarse sin `onRetry` para silenciar el linter.** Si un aviso no ofrece salida, el escalón 3 deja de cumplir su función. *(Convención introducida tras la revisión de T6 y corregida tras la de T8, donde la variante escrita en el render dejó el lint en rojo.)*
- Radios y alturas según `DESIGN.md`: 8px (`rounded-lg`) para controles, 12px (`rounded-xl`) para bloques de sección.
- Todo texto de UI en español, es-first, como constante `copy` en el módulo (convención vigente hasta que entre next-intl).

### La escalera

| # | Escalón | Cuándo | Componente | Rol ARIA |
|---|---|---|---|---|
| 1 | **Sección** | la sección no tiene nada que mostrar (`loadError` con early-return) | `<SectionError>` | `alert` |
| 2 | **Control** | un campo/filtro falló, el resto de la pantalla funciona | `<FieldError>` | `status` (polite) |
| 3 | **Segundo plano** | refresh o acción de fila falló, el contenido sigue en pantalla | `notifyError()` (toast) | región propia de sonner |
| 4 | **Formulario** | validación o submit — no es fallo de carga | `<InlineError>` | `alert` |

Los escalones 1 y 4 conservan `role="alert"` deliberadamente: mantienen verdes ~20 tests existentes y están justificados (en 1 el contenido desapareció; en 4 el usuario acaba de pulsar «Guardar» y necesita saberlo ya). El escalón 2 baja a `role="status"` porque no bloquea nada e interrumpir al lector de pantalla por un filtro es desproporcionado.

## File Structure

**Crear:**
- `src/components/errors/section-error.tsx` — escalón 1. Bloque contenido con la geometría de `EmptyState`.
- `src/components/errors/field-error.tsx` — escalón 2. Sustituye al control, mismo alto.
- `src/components/errors/inline-error.tsx` — escalón 4. Línea con icono junto al campo/submit.
- `src/components/errors/notify.ts` — escalón 3. `notifyError()` sobre sonner.
- `src/components/errors/toaster.tsx` — `<Toaster>` de sonner tematizado con next-themes.
- Un `.test.tsx` junto a cada uno de los cuatro componentes.

**Modificar:**
- `src/app/layout.tsx` — montar `<Toaster />`.
- `src/components/molecules/async-section.tsx:45-59` — delegar en `SectionError`.
- Los 26 sitios de error inventariados (tareas 6–11).
- `DESIGN.md` — documentar la escalera (tarea 12).

**Sin tocar:** `src/components/errors/error-fallback.tsx` (límite de error de ruta, ya es correcto y tiene su test), `src/components/ui/badge.tsx` (usa `danger` como token semántico, no es un estado de error).

---

### Task 1: Infraestructura de toasts (escalón 3)

**Files:**
- Modify: `package.json` (añadir `sonner`)
- Create: `src/components/errors/toaster.tsx`
- Create: `src/components/errors/notify.ts`
- Create: `src/components/errors/notify.test.tsx`
- Modify: `src/app/layout.tsx:55` (dentro de `<ThemeProvider>`)

**Interfaces:**
- Consumes: nada.
- Produces: `notifyError(message: string, opts?: { onRetry?: () => void; retryLabel?: string }): void` y `<Toaster />` (default export nombrado `Toaster`).

- [ ] **Step 1: Leer la guía de Next 16 sobre componentes cliente en el root layout**

Antes de tocar `src/app/layout.tsx`, leer lo que aplique en `node_modules/next/dist/docs/` sobre client components y el root layout. `layout.tsx` es un Server Component `async` (usa `headers()`); `<Toaster />` debe ser `'use client'` y montarse como hijo, no convertir el layout en cliente.

- [ ] **Step 2: Instalar sonner**

```bash
npm install sonner@^2.0.7
```

Verificar que resuelve a 2.x y que no rompe el árbol de dependencias:

```bash
npm ls sonner && npm test 2>&1 | tail -5
```

Esperado: `sonner@2.x`, y los 340 tests siguen pasando.

- [ ] **Step 3: Escribir el test que falla**

Crear `src/components/errors/notify.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from './toaster';
import { notifyError } from './notify';

function Harness({ onRetry }: { onRetry?: () => void }) {
  return (
    <>
      <button onClick={() => notifyError('No se pudo cambiar el estado', { onRetry })}>
        disparar
      </button>
      <Toaster />
    </>
  );
}

describe('notifyError', () => {
  it('muestra el mensaje en un toast', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'disparar' }));

    expect(await screen.findByText('No se pudo cambiar el estado')).toBeInTheDocument();
  });

  it('ofrece una acción de reintento que invoca el callback', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(<Harness onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'disparar' }));
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('no duplica el toast si el mismo error se repite', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'disparar' }));
    await screen.findByText('No se pudo cambiar el estado');
    await user.click(screen.getByRole('button', { name: 'disparar' }));

    expect(screen.getAllByText('No se pudo cambiar el estado')).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Ejecutar el test y verificar que falla**

Run: `npx jest src/components/errors/notify.test.tsx`
Esperado: FAIL — `Cannot find module './toaster'`.

- [ ] **Step 5: Implementar `toaster.tsx`**

```tsx
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
```

- [ ] **Step 6: Implementar `notify.ts`**

```ts
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
```

- [ ] **Step 7: Montar `<Toaster />` en el root layout**

En `src/app/layout.tsx`, importar `Toaster` y renderizarlo como último hijo de `ThemeProvider`:

```tsx
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
```

- [ ] **Step 8: Ejecutar los tests**

Run: `npx jest src/components/errors/notify.test.tsx`
Esperado: PASS (3 tests).

Run: `npm test 2>&1 | tail -5`
Esperado: 343 tests, 0 fallos.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/components/errors/toaster.tsx src/components/errors/notify.ts src/components/errors/notify.test.tsx "src/app/layout.tsx"
git commit -m "feat(errors): toasts (sonner) para fallos que no bloquean la pantalla"
```

---

### Task 2: `<InlineError>` (escalón 4)

**Files:**
- Create: `src/components/errors/inline-error.tsx`
- Create: `src/components/errors/inline-error.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `<InlineError className?: string>{children: React.ReactNode}</InlineError>`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/errors/inline-error.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { InlineError } from './inline-error';

describe('InlineError', () => {
  it('anuncia el mensaje como alerta', () => {
    render(<InlineError>Documento ya registrado</InlineError>);

    expect(screen.getByRole('alert')).toHaveTextContent('Documento ya registrado');
  });

  it('acompaña el color con un icono, para no comunicar solo por color', () => {
    const { container } = render(<InlineError>Correo inválido</InlineError>);

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx jest src/components/errors/inline-error.test.tsx`
Esperado: FAIL — `Cannot find module './inline-error'`.

- [ ] **Step 3: Implementar**

```tsx
import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Escalón 4 de la escalera de errores: validación o fallo de envío de un
 * formulario. No es un fallo de carga — el usuario acaba de actuar y necesita
 * la respuesta junto al control que la provocó, en el mismo momento.
 *
 * El icono no es decoración: sin él el mensaje comunicaría únicamente por
 * color (WCAG 1.4.1).
 */
export function InlineError({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn('flex items-start gap-1.5 text-sm text-danger', className)}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
```

Si `@/lib/utils` no exporta `cn`, comprobar cómo lo importan `src/components/ui/button.tsx` y `agenda-view.tsx` y usar la misma ruta.

- [ ] **Step 4: Ejecutar el test**

Run: `npx jest src/components/errors/inline-error.test.tsx`
Esperado: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/errors/inline-error.tsx src/components/errors/inline-error.test.tsx
git commit -m "feat(errors): InlineError, presentación única para errores de formulario"
```

---

### Task 3: `<SectionError>` (escalón 1)

**Files:**
- Create: `src/components/errors/section-error.tsx`
- Create: `src/components/errors/section-error.test.tsx`

**Interfaces:**
- Consumes: `Button` de `@/components/ui/button`.
- Produces: `<SectionError title?: string; description: string; onRetry?: () => void; retryLabel?: string; className?: string />`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/errors/section-error.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionError } from './section-error';

describe('SectionError', () => {
  it('anuncia el fallo y describe qué pasó', () => {
    render(<SectionError description="No pudimos cargar la agenda." />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar la agenda.');
  });

  it('llama a onRetry al pulsar el botón', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(<SectionError description="Falló." onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omite el botón cuando no hay forma de reintentar', () => {
    render(<SectionError description="Falló." />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reserva el rojo para el icono y deja el título en tinta', () => {
    render(<SectionError title="Sin conexión" description="Falló." />);

    expect(screen.getByText('Sin conexión')).toHaveClass('text-ink');
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx jest src/components/errors/section-error.test.tsx`
Esperado: FAIL — `Cannot find module './section-error'`.

- [ ] **Step 3: Implementar**

```tsx
import * as React from 'react';
import { CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const sectionErrorCopy = {
  title: 'No se pudo cargar',
  retry: 'Reintentar',
};

interface SectionErrorProps {
  /** Titular corto. Por defecto, "No se pudo cargar". */
  title?: string;
  /** Qué falló, en una línea. Sin "Intenta de nuevo." si hay botón. */
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Escalón 1 de la escalera de errores: la sección no tiene nada que mostrar.
 * Ocupa el sitio donde iría el contenido, con la misma geometría que
 * `EmptyState` (mismo radio, mismo padding, mismo ritmo vertical) para que
 * "vacío" y "roto" se lean como dos caras del mismo sistema; el borde sólido
 * en lugar de discontinuo es lo que los distingue.
 *
 * El rojo se limita al chip del icono: un bloque rojo entero exagera la
 * severidad de un fetch fallido y contradice el uso de `danger` que fija
 * DESIGN.md. El botón es primario, no destructivo — reintentar no destruye nada.
 */
export function SectionError({
  title = sectionErrorCopy.title,
  description,
  onRetry,
  retryLabel = sectionErrorCopy.retry,
  className,
}: SectionErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-16 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mb-1 flex size-10 items-center justify-center rounded-full bg-danger/10 text-danger"
      >
        <CloudOff className="size-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{description}</p>
      {onRetry ? (
        <Button type="button" onClick={onRetry} className="mt-3">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx jest src/components/errors/section-error.test.tsx`
Esperado: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/errors/section-error.tsx src/components/errors/section-error.test.tsx
git commit -m "feat(errors): SectionError para secciones que se quedan sin contenido"
```

---

### Task 4: `<FieldError>` (escalón 2)

**Files:**
- Create: `src/components/errors/field-error.tsx`
- Create: `src/components/errors/field-error.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `<FieldError label: string; onRetry?: () => void; retryLabel?: string; className?: string />`

Este es el componente que arregla el caso de la captura original.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/errors/field-error.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FieldError } from './field-error';

describe('FieldError', () => {
  it('se anuncia de forma cortés: no bloquea la pantalla', () => {
    render(<FieldError label="No se pudieron cargar" />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('No se pudieron cargar');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('expone el reintento como botón con nombre accesible', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(<FieldError label="No se pudieron cargar" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omite el botón cuando no hay reintento', () => {
    render(<FieldError label="No disponible" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx jest src/components/errors/field-error.test.tsx`
Esperado: FAIL — `Cannot find module './field-error'`.

- [ ] **Step 3: Implementar**

```tsx
import * as React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export const fieldErrorCopy = {
  retry: 'Reintentar',
};

interface FieldErrorProps {
  /** Etiqueta corta (≤4 palabras). El contexto lo da el `<label>` del campo. */
  label: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Para igualar la altura del control que sustituye (`h-9`, `h-10`…). */
  className?: string;
}

/**
 * Escalón 2 de la escalera de errores: falló UN control, no la pantalla.
 *
 * Sustituye al control en su sitio en lugar de añadir un mensaje debajo. Eso
 * resuelve tres cosas a la vez: no empuja el layout, no deja el control roto
 * con cara de normal, y pone el fallo y su solución en los mismos píxeles que
 * el usuario ya estaba mirando.
 *
 * `role="status"` y no `alert`: un filtro caído no justifica interrumpir a un
 * lector de pantalla a mitad de frase.
 */
export function FieldError({
  label,
  onRetry,
  retryLabel = fieldErrorCopy.retry,
  className,
}: FieldErrorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3',
        className,
      )}
    >
      <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-danger" />
      <span className="flex-1 truncate text-sm text-ink">{label}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          aria-label={retryLabel}
          title={retryLabel}
          className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RotateCw aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx jest src/components/errors/field-error.test.tsx`
Esperado: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/errors/field-error.tsx src/components/errors/field-error.test.tsx
git commit -m "feat(errors): FieldError, el fallo vive dentro del control que falló"
```

---

### Task 5: `AsyncSection` delega en `SectionError`

**Files:**
- Modify: `src/components/molecules/async-section.tsx:45-59`

**Interfaces:**
- Consumes: `SectionError` de la Tarea 3.
- Produces: `AsyncSection` con la misma API pública (props sin cambios), nueva presentación del estado de error.

Tres pantallas ya usan `AsyncSection` (`staff-view`, `catalog-view`, y una más — confirmar con `grep -rl AsyncSection src`). Al cambiar aquí heredan el escalón 1 sin tocarlas.

- [ ] **Step 1: Añadir la prop de descripción al test existente o crear uno**

Si `async-section.test.tsx` no existe, crearlo:

```tsx
import { render, screen } from '@testing-library/react';
import { AsyncSection } from './async-section';

describe('AsyncSection', () => {
  it('en error usa la presentación de sección con reintento', () => {
    render(
      <AsyncSection loading={false} error="No pudimos cargar el personal." onRetry={() => {}}>
        <p>contenido</p>
      </AsyncSection>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el personal.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y observar el estado actual**

Run: `npx jest src/components/molecules/async-section.test.tsx`
Esperado: PASS ya con la implementación vieja (el contrato observable no cambia). Sirve de red de seguridad para el refactor.

- [ ] **Step 3: Reemplazar la rama de error**

Sustituir el bloque `if (error) { ... }` (líneas 45-59) por:

```tsx
  if (error) {
    return <SectionError description={error} onRetry={onRetry} retryLabel={retryLabel} />;
  }
```

Añadir el import `import { SectionError } from '@/components/errors/section-error';` y eliminar el import de `Button` si deja de usarse (comprobar con el linter).

- [ ] **Step 4: Ejecutar los tests**

Run: `npx jest src/components/molecules/async-section.test.tsx src/components/staff src/components/catalog`
Esperado: PASS. Si algún test asertaba sobre el contenedor tinteado antiguo (`bg-danger/5`), actualizar la aserción al nuevo marcado — el contrato accesible (`role="alert"` + botón «Reintentar») no cambia.

- [ ] **Step 5: Commit**

```bash
git add src/components/molecules/async-section.tsx src/components/molecules/async-section.test.tsx
git commit -m "refactor(errors): AsyncSection delega su estado de error en SectionError"
```

---

### Task 6: Migrar `agenda-view.tsx` (el caso de la captura)

**Files:**
- Modify: `src/components/appointments/agenda-view.tsx:40-41,66-68,486-544`
- Modify: `src/components/appointments/agenda-view.test.tsx:473`

**Interfaces:**
- Consumes: `FieldError` (Tarea 4), `notifyError` (Tarea 1).
- Produces: nada para tareas posteriores.

Tres errores en este archivo, tres escalones distintos:

| Estado | Línea | Escalón | Destino |
|---|---|---|---|
| `staffError` | 506 | 2 — control | `<FieldError>` **sustituyendo al `<select>`** |
| `appointmentsRefreshError` | 527 | 3 — segundo plano | `notifyError()` |
| `statusChangeError` | 538 | 3 — segundo plano | `notifyError()` |

- [ ] **Step 1: Escribir el test que falla**

Añadir a `src/components/appointments/agenda-view.test.tsx`:

```tsx
  it('cuando falla la carga de profesionales, el filtro se sustituye por el error en su sitio', async () => {
    mockedListStaff.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

    render(<AgendaView token="tok" />);

    // El error ocupa el lugar del filtro, no una franja debajo.
    const region = await screen.findByRole('status');
    expect(region).toHaveTextContent(/no se pudieron cargar/i);
    expect(screen.queryByLabelText('Profesional')).not.toBeInTheDocument();

    // Y no interrumpe: la agenda sigue en pantalla y no hay alerta asertiva.
    expect(screen.getByRole('button', { name: /nueva cita/i })).toBeInTheDocument();
  });
```

Ajustar `mockedListStaff` y `ApiError` a los nombres que ya usa ese fichero de test.

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx jest src/components/appointments/agenda-view.test.tsx -t "sustituye"`
Esperado: FAIL — hoy el `<select>` sigue en el DOM y el error sale como `role="alert"` debajo.

- [ ] **Step 3: Actualizar las constantes de copy**

En `agenda-view.tsx`, dentro del objeto `copy` (líneas ~66-68):

```ts
  // Escalón 2 (control): etiqueta corta, el contexto lo da el propio filtro.
  staffFieldError: 'No se pudieron cargar',
  // Escalón 3 (segundo plano): sin "Intenta de nuevo." — el toast trae acción.
  genericAppointmentsError: 'No pudimos actualizar la agenda.',
  genericStatusChangeError: 'No pudimos cambiar el estado de la cita.',
```

Eliminar `genericStaffError` si deja de usarse; si el `catch` de staff sigue necesitando un mensaje de `ApiError`, conservarlo pero no renderizarlo en el filtro.

- [ ] **Step 4: Sustituir el `<select>` por `<FieldError>` cuando hay error**

En el bloque del toolbar (líneas ~486-499), envolver el `<select>`:

```tsx
          {staffError ? (
            <FieldError
              label={copy.staffFieldError}
              onRetry={() => setStaffReloadKey((k) => k + 1)}
              className="h-9"
            />
          ) : (
            <select
              aria-label={copy.providerLabel}
              disabled={staffLoading}
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className={cn(fieldClass, 'h-9 w-auto min-w-[11rem] text-sm')}
            >
              <option value="">{copy.allProviders}</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.fullName}
                </option>
              ))}
            </select>
          )}
```

Borrar por completo el bloque `{staffError && (...)}` de las líneas 506-519.

- [ ] **Step 5: Mover los dos errores de segundo plano a toast**

Borrar los bloques `{appointmentsRefreshError && (...)}` (527-536) y `{statusChangeError && (...)}` (538-544). En su lugar, llamar a `notifyError` desde los `catch` correspondientes:

```tsx
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : copy.genericStatusChangeError, {
        onRetry: () => handleStatusChange(id, status),
      });
    } finally {
```

Y análogamente en el `catch` del refresh de citas, con `onRetry: refreshAppointmentsInPlace`. Eliminar los `useState` de `appointmentsRefreshError` y `statusChangeError` y sus `setX(null)` si quedan huérfanos.

- [ ] **Step 6: Ejecutar los tests**

Run: `npx jest src/components/appointments/agenda-view.test.tsx`
Esperado: PASS. El test de la línea 473 (`getByRole('alert')`) probablemente falle: si aserta sobre `staffError`, cambiarlo a `getByRole('status')`; si aserta sobre un error de segundo plano, ese caso ahora es un toast — reescribirlo para renderizar `<Toaster />` en el harness o eliminarlo si queda cubierto por `notify.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/appointments/agenda-view.tsx src/components/appointments/agenda-view.test.tsx
git commit -m "fix(agenda): el fallo del filtro de profesionales vive en el filtro, no en una franja roja"
```

---

### Task 7: Migrar `appointment-form.tsx`

**Files:**
- Modify: `src/components/appointments/appointment-form.tsx:47-49,391-403,479-492`
- Modify: `src/components/appointments/appointment-form.test.tsx` (si alguna aserción cambia)

**Interfaces:**
- Consumes: `FieldError` (Tarea 4), `InlineError` (Tarea 2).

| Estado | Línea | Escalón | Destino |
|---|---|---|---|
| `patientsError` | 391 | 2 — control | `<FieldError>` bajo el buscador (el `<input>` se queda: escribir es válido) |
| `staffError` | 479 | 2 — control | `<FieldError>` **sustituyendo al `<select>`** |
| errores de validación de fecha/hora | varias | 4 — formulario | `<InlineError>` |

Ojo: `appointment-form.test.tsx` tiene cuatro aserciones `findByRole('alert')` (líneas 250, 287, 357, 446) y **todas son de validación de formulario** (escalón 4), así que siguen en `alert` y deben seguir verdes sin tocarlas.

- [ ] **Step 1: Escribir el test que falla**

```tsx
  it('cuando falla la carga de profesionales, sustituye el select por el error', async () => {
    mockedListStaff.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

    render(<AppointmentForm {...defaultProps} />);

    const region = await screen.findByRole('status');
    expect(region).toHaveTextContent(/no se pudieron cargar/i);
    expect(screen.queryByLabelText(/profesional/i)).not.toBeInTheDocument();
  });
```

Adaptar `defaultProps` y los mocks a los que ya usa el fichero.

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx jest src/components/appointments/appointment-form.test.tsx -t "sustituye el select"`
Esperado: FAIL.

- [ ] **Step 3: Actualizar copy**

```ts
  patientsFieldError: 'No se pudieron cargar',
  staffFieldError: 'No se pudieron cargar',
```

Eliminar `genericPatientsError` / `genericStaffError` de la ruta de render (conservarlos solo si el `catch` los sigue usando como fallback de `ApiError`).

- [ ] **Step 4: Migrar `patientsError` (líneas 391-403)**

```tsx
            {patientsError ? (
              <FieldError
                label={copy.patientsFieldError}
                onRetry={() => setPatientsReloadKey((k) => k + 1)}
                className="h-9 w-full"
              />
            ) : patientQuery.trim() === '' ? (
```

El resto de la cadena ternaria queda igual.

- [ ] **Step 5: Migrar `staffError` (líneas 462-492)**

Envolver el `<select id="appointment-provider">` igual que en la Tarea 6 (ternario `staffError ? <FieldError className="h-10 w-full" .../> : <select .../>`), y borrar el bloque `{staffError && (...)}` de 479-492.

- [ ] **Step 6: Sustituir los errores de validación por `<InlineError>`**

Localizar los `<p role="alert" className="...text-danger">` restantes del fichero (los de validación de fecha/hora y los del diálogo de paciente) y reemplazarlos por `<InlineError>{mensaje}</InlineError>`. El rol no cambia, así que las cuatro aserciones existentes siguen valiendo.

- [ ] **Step 7: Ejecutar los tests**

Run: `npx jest src/components/appointments/appointment-form.test.tsx`
Esperado: PASS, incluidas las cuatro aserciones `findByRole('alert')` preexistentes.

- [ ] **Step 8: Commit**

```bash
git add src/components/appointments/appointment-form.tsx src/components/appointments/appointment-form.test.tsx
git commit -m "fix(citas): errores del formulario de cita repartidos por severidad"
```

---

### Task 8: Migrar `treatment-plans-tab.tsx`

**Files:**
- Modify: `src/components/treatment-plans/treatment-plans-tab.tsx` (12 sitios `text-danger`, 6 con retry)
- Modify: `src/components/treatment-plans/payment-plan-section.tsx:31-32`

**Interfaces:**
- Consumes: `SectionError`, `InlineError`, `notifyError`.

Es el fichero con más sitios. Clasificación:

| Estado | Línea | Escalón | Destino |
|---|---|---|---|
| `loadError` | 1160 | 1 | `<SectionError>` |
| `refreshError` | 1182 | 3 | `notifyError({ onRetry: refreshPlansInPlace })` |
| `createPlanError` | 1211 | 4 | `<InlineError>` |
| `planDetailError` | 1285 | 1 | `<SectionError>` |
| `planDetailRefreshError` | 1303 | 3 | `notifyError({ onRetry: refreshPlanDetail })` |
| `planStatusError` | 1313 | 4 | `<InlineError>` |
| resto de `text-danger` | — | clasificar con la regla | ver abajo |

**Regla para los sitios no listados:** ¿el usuario acaba de pulsar algo y espera respuesta? → 4. ¿La sección quedó sin contenido? → 1. ¿El contenido sigue en pantalla y correcto? → 3. ¿Falló un único control? → 2.

- [ ] **Step 1: Inventariar los 12 sitios y anotar el escalón de cada uno**

```bash
grep -n -B4 -A8 "text-danger" src/components/treatment-plans/treatment-plans-tab.tsx
```

Escribir la clasificación como comentario en el PR o en el mensaje de commit. No adivinar: leer qué estado lo dispara.

- [ ] **Step 2: Escribir el test que falla**

Añadir a `treatment-plans-tab.test.tsx` (crear si no existe):

```tsx
  it('cuando no hay planes que mostrar, usa el estado de sección con reintento', async () => {
    mockedListPlans.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

    render(<TreatmentPlansTab {...defaultProps} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Error del servidor');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
```

- [ ] **Step 3: Ejecutar y verificar que falla o pasa por el motivo viejo**

Run: `npx jest src/components/treatment-plans`
Anotar el estado de partida.

- [ ] **Step 4: Migrar escalón 1 (`loadError`, `planDetailError`)**

```tsx
  if (loadError) {
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
```

- [ ] **Step 5: Migrar escalón 3 (`refreshError`, `planDetailRefreshError`)**

Borrar los bloques de render y llamar a `notifyError` desde el `catch`. `onRetry` **no** recibe la referencia capturada de la función de refresco — aplicar la constraint global sobre closures obsoletos, preferiblemente la opción 1 (`setReloadKey`) y, si no encaja, el ref escrito en un efecto. Nunca asignar el ref en el cuerpo del render: el lint lo rechaza.

Eliminar los `useState` huérfanos.

- [ ] **Step 6: Migrar escalón 4 (el resto)**

Sustituir cada `<p role="alert" className="...text-danger">{x}</p>` por `<InlineError>{x}</InlineError>`.

- [ ] **Step 7: Aplicar lo mismo a `payment-plan-section.tsx`**

`loadError` (línea ~31) es escalón 1 → `<SectionError>`. Quitar «Intenta de nuevo.» de la constante.

- [ ] **Step 8: Ejecutar los tests**

Run: `npx jest src/components/treatment-plans`
Esperado: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/treatment-plans
git commit -m "refactor(planes): estados de error de planes de tratamiento en la escalera"
```

---

### Task 9: Migrar odontograma e historia clínica

**Files:**
- Modify: `src/components/odontogram/odontogram-tab.tsx:168-198`
- Modify: `src/components/odontogram/tooth-record-panel.tsx`
- Modify: `src/components/odontogram/tooth-timeline.tsx`
- Modify: `src/components/patients/medical-history-panel.tsx`
- Modify: `src/components/patients/clinical-entries-list.tsx`

**Interfaces:**
- Consumes: `SectionError`, `InlineError`, `FieldError`, `notifyError`.

| Fichero | Estado | Escalón |
|---|---|---|
| `odontogram-tab` | `loadError` (168) | 1 |
| `odontogram-tab` | `refreshError` (187) | 3 |
| `tooth-record-panel` | error de catálogo | 2 (falló un selector, el panel sirve) |
| `tooth-record-panel` | errores de validación (tests 160, 173, 257) | 4 — **conservan `role="alert"`** |
| `tooth-timeline` | `genericLoadError` | 1 |
| `medical-history-panel` | `genericLoadError` | 1 |
| `medical-history-panel` | errores de guardado (tests 277-320) | 4 — conservan `alert` |
| `clinical-entries-list` | `genericLoadError` (test 123, 137) | 1 — conserva `alert` |

- [ ] **Step 1: Ejecutar los tests de partida y anotar cuáles pasan**

Run: `npx jest src/components/odontogram src/components/patients`
Esperado: PASS (estado base). Estas suites tienen 8 aserciones `findByRole('alert')` que deben seguir verdes al terminar.

- [ ] **Step 2: Migrar `odontogram-tab.tsx`**

`loadError` (168-176) → `<SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />`.
`refreshError` (187-198) → borrar el bloque, `notifyError(mensaje, { onRetry: () => setReloadKey((k) => k + 1) })` desde el `catch`. Aquí el closure solo toca el setter de `reloadKey`, que es estable, así que no necesita ref — pero si acabas pasando una función que lee estado mutable, aplica la constraint global sobre closures obsoletos.

- [ ] **Step 3: Migrar `tooth-timeline.tsx`, `medical-history-panel.tsx`, `clinical-entries-list.tsx`**

Sus `loadError` van a `<SectionError>`; sus errores de guardado/validación a `<InlineError>`. En ambos casos el rol sigue siendo `alert`, así que las aserciones existentes no cambian.

- [ ] **Step 4: Migrar `tooth-record-panel.tsx`**

El error del catálogo es escalón 2 → `<FieldError>` sustituyendo al selector de catálogo. Los tres errores de validación (`selecciona… catálogo`, `selecciona… cara`, `Datos inválidos`) son escalón 4 → `<InlineError>`, `role="alert"` intacto.

Cuidado: el test de la línea 89 (`'Error del servidor'`) sí puede ser el del catálogo. Comprobarlo antes de cambiarlo; si lo es, actualizar esa aserción a `getByRole('status')`.

- [ ] **Step 5: Quitar «Intenta de nuevo.» de las constantes**

```bash
grep -rn "Intenta de nuevo" src/components/odontogram src/components/patients
```

Eliminar la frase de todo mensaje que vaya acompañado de un control de reintento.

- [ ] **Step 6: Ejecutar los tests**

Run: `npx jest src/components/odontogram src/components/patients`
Esperado: PASS, con las 8 aserciones `alert` preexistentes verdes.

- [ ] **Step 7: Commit**

```bash
git add src/components/odontogram src/components/patients
git commit -m "refactor(clínica): odontograma e historia clínica en la escalera de errores"
```

---

### Task 10: Migrar dashboard, staff, catálogo, perfil, plataforma y pacientes

**Files:**
- Modify: `src/components/dashboard/dashboard-view.tsx:216-235`
- Modify: `src/components/staff/staff-view.tsx:310-314`
- Modify: `src/components/catalog/catalog-view.tsx:463-467`
- Modify: `src/components/profile/profile-view.tsx:145-156,203-207`
- Modify: `src/components/platform/platform-view.tsx`
- Modify: `src/app/(app)/patients/page.tsx`, `src/app/(app)/patients/[id]/page.tsx`
- Modify: `src/components/appointments/day-agenda.tsx`, `week-agenda.tsx`, `month-agenda.tsx`, `appointment-display.tsx`
- Modify: `src/components/profile/user-menu.tsx`

**Interfaces:**
- Consumes: `SectionError`, `InlineError`, `notifyError`.

| Fichero | Estado | Escalón | Nota |
|---|---|---|---|
| `dashboard-view` | `error` (227) | 1 | test 355/376 espera `alert` + botón «Reintentar» → sigue verde |
| `dashboard-view` | `rangeInvalid` (216) | 4 | validación de rango de fechas, no carga |
| `staff-view` | `rowError` (310) | 3 | fallo de acción de fila (rol/nombre/desactivar) → toast |
| `staff-view` | error de alta (test 224) | 4 | está dentro del `FormModal`, no es `rowError` |
| `catalog-view` | `actionError` (463) | 3 | fallo de toggle → toast |
| `profile-view` | `loadError` (145) | 1 | |
| `profile-view` | `avatarError` (203), `nameError` (215) | 4 | |
| `platform-view` | `loadError` | 1 | |
| `patients/page`, `patients/[id]/page` | `genericError` | 1 | |
| `day/week/month-agenda` | `genericLoadError` | 1 | tests 64 y 59 esperan `alert` → sigue verde |
| `appointment-display` | error | clasificar leyendo el estado | |
| `user-menu` | error | clasificar leyendo el estado | |

- [ ] **Step 1: Ejecutar los tests de partida**

Run: `npx jest src/components/dashboard src/components/staff src/components/catalog src/components/profile src/components/platform src/components/appointments "src/app"`
Anotar el número de tests verdes de partida.

- [ ] **Step 2: Migrar los escalones 1**

Cada `loadError` con early-return pasa a `<SectionError description={loadError} onRetry={...} />`. En `dashboard-view` el bloque 227-235 se sustituye dentro de la cadena ternaria existente.

- [ ] **Step 3: Migrar los escalones 3 (`staff-view.rowError`, `catalog-view.actionError`)**

Borrar los bloques de render; llamar a `notifyError` desde cada `catch` (`handleRoleChange`, `handleNameChange`, `handleDeactivate` en staff; el toggle en catálogo), pasando `onRetry` cuando la acción sea idempotente y repetible. Eliminar los `useState` de `rowError` / `actionError` y todos sus `setX(null)`.

**Cuidado con `staff-view`:** el test de la línea 224 (`el correo ya está en uso`) es el error de alta dentro del modal, NO `rowError`. Ese se queda como `<InlineError>` con `role="alert"`.

- [ ] **Step 4: Migrar los escalones 4**

Todos los `<p role="alert" className="...text-danger">` restantes → `<InlineError>`.

- [ ] **Step 5: Barrer la copy**

```bash
grep -rn "Intenta de nuevo" src
```

Esperado tras el barrido: cero resultados en mensajes que vayan con botón de reintento.

- [ ] **Step 6: Ejecutar la suite completa**

Run: `npm test 2>&1 | tail -8`
Esperado: 0 fallos. Los tests que se rompan por haber movido un error a toast se reescriben montando `<Toaster />` en el harness, o se eliminan si `notify.test.tsx` ya cubre ese comportamiento — pero nunca se borra una aserción sin sustituto.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "refactor(errores): resto de pantallas migradas a la escalera de severidad"
```

---

### Task 11: Unificar los errores de formulario compartidos

**Files:**
- Modify: `src/components/molecules/form-field.tsx`
- Modify: `src/components/molecules/form-modal.tsx`
- Modify: `src/components/molecules/confirm-dialog.tsx`
- Modify: `src/components/organisms/login-form.tsx`
- Modify: `src/components/auth/register-form.tsx`
- Modify: `src/components/patients/patient-form.tsx`
- Modify: `src/components/profile/change-password-form.tsx`

**Interfaces:**
- Consumes: `InlineError` (Tarea 2), **ampliado en el Step 2 de esta tarea**.
- Produces: `InlineError` con dos props nuevas — `id?: string` y `variant?: 'inline' | 'summary'`.

Estos siete no son fallos de carga: son el escalón 4 y ya viven donde deben. Lo que falta es que se vean como un solo sistema y que lleven icono.

**Dos cosas que el plan original se saltó y que se resuelven aquí** (descubiertas inspeccionando los siete sitios antes de despachar):

1. **No son un patrón, son dos.** Tres sitios son una línea de texto desnuda (`form-field.tsx`, `patient-form.tsx`, `change-password-form.tsx`). Los otros cuatro son una **caja de resumen** con borde y fondo tintado (`form-modal.tsx`, `confirm-dialog.tsx`, `login-form.tsx`, `register-form.tsx`): `rounded-lg border border-danger/20|30 bg-danger/10 px-3 py-2`. Son errores a nivel de formulario, no de un campo. Aplanar los cuatro a una línea desnuda haría que un fallo de envío se leyera igual que la validación de un campo suelto: pérdida real de jerarquía.

2. **`aria-describedby` se rompería en silencio.** `login-form.tsx:105` y `register-form.tsx:151` llevan `id={ERROR_ID}`, referenciado por `aria-describedby` desde **siete campos** (2 en login, 5 en registro). `InlineError` no acepta `id`, así que un reemplazo literal borraría la asociación y quien use lector de pantalla dejaría de oír el error al enfocar un campo. Regresión de accesibilidad.

- [ ] **Step 1: Ejecutar los tests de partida**

Run: `npx jest src/components/molecules src/components/organisms src/components/auth src/components/patients/patient-form.test.tsx src/components/profile`
Esperado: PASS.

- [ ] **Step 2: Ampliar `InlineError` con `id` y `variant`**

Excepcionalmente, esta tarea **sí modifica** `src/components/errors/inline-error.tsx`. Dos props que se ganan su sitio: `id` para no romper el cableado aria, y `variant` para que la caja de resumen se defina una vez en vez de repetir el bloque de clases en cuatro ficheros.

```tsx
export function InlineError({
  children,
  id,
  variant = 'inline',
  className,
}: {
  children: React.ReactNode;
  /** Para `aria-describedby` desde los campos del formulario. */
  id?: string;
  /**
   * `inline` — mensaje junto a un campo.
   * `summary` — resumen a nivel de formulario o modal: misma familia, más peso
   *   visual, porque resume el fallo de un envío y no la validación de un campo.
   */
  variant?: 'inline' | 'summary';
  className?: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        'flex items-start gap-1.5 text-sm text-danger',
        variant === 'summary' &&
          'rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-medium',
        className,
      )}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
```

Añadir tests a `inline-error.test.tsx` para: `id` se refleja en el DOM (es lo que sostiene `aria-describedby`), y `variant="summary"` añade el contenedor mientras `inline` no.

- [ ] **Step 3: Migrar los siete sitios, respetando los dos patrones**

Línea desnuda (`form-field.tsx`, `patient-form.tsx`, `change-password-form.tsx`):

```tsx
<InlineError>{error}</InlineError>
```

Caja de resumen (`form-modal.tsx`, `confirm-dialog.tsx`):

```tsx
<InlineError variant="summary">{error}</InlineError>
```

Caja de resumen con cableado aria (`login-form.tsx`, `register-form.tsx`) — **el `id` no es opcional aquí**:

```tsx
<InlineError id={ERROR_ID} variant="summary">{error}</InlineError>
```

Conservar cualquier `className` de posicionamiento pasándolo por `className`. `form-field.tsx` usa `text-xs`; pásalo por `className` si el cambio a `text-sm` desalinea el campo, y dilo.

Verificar explícitamente que los siete `aria-describedby` siguen resolviendo: cada `ERROR_ID` debe seguir existiendo en el DOM cuando hay error.

- [ ] **Step 3: Verificar que no queda ningún `text-danger` suelto en render de error**

```bash
grep -rn "text-danger" --include="*.tsx" src | grep -v test | grep -v "components/errors/" | grep -v "ui/badge.tsx"
```

Esperado: cero resultados, o solo usos que no sean mensajes de error (documentar cuáles y por qué en el commit).

- [ ] **Step 4: Ejecutar la suite completa**

Run: `npm test 2>&1 | tail -8`
Esperado: 0 fallos.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "refactor(formularios): una sola presentación para los errores de envío"
```

---

### Task 12: Documentar la escalera y verificar

**Files:**
- Modify: `DESIGN.md` (nueva sección tras «Chips / Badges»)

- [ ] **Step 1: Añadir la sección a `DESIGN.md`**

```markdown
### Estados de error

La severidad visual de un error corresponde a cuánto impide hacer, no a lo mal
que suene. Cuatro escalones, un componente cada uno, en `src/components/errors/`:

1. **Sección** (`<SectionError>`) — la sección no tiene nada que mostrar.
   Bloque contenido en el hueco del contenido, con la geometría de `EmptyState`
   (12px, `px-6 py-16`) y borde sólido en vez de discontinuo. Icono en chip
   `danger/10`, título en `ink`, botón de reintento **primario**. `role="alert"`.
2. **Control** (`<FieldError>`) — falló un campo o filtro; el resto funciona.
   **Sustituye al control**, misma altura: ni empuja layout ni deja el control
   roto con cara de normal. Borde `danger/40`, fondo `danger/5`, botón-icono ↻.
   `role="status"`, cortés.
3. **Segundo plano** (`notifyError()`) — un refresco o una acción de fila falló
   y el contenido sigue en pantalla y es correcto. Toast con acción de
   reintento. Nunca toca el layout ni deja rojo permanente.
4. **Formulario** (`<InlineError>`) — validación o envío. Línea con icono junto
   al control, `role="alert"`.

**Reglas transversales:** el rojo se limita al icono y a bordes de 1px, nunca
un bloque entero; todo error lleva icono además de color (WCAG 1.4.1); ningún
error empuja contenido; y la copy no dice «Intenta de nuevo» cuando hay un
botón que ya lo ofrece.
```

- [ ] **Step 2: Pasar el detector mecánico de Impeccable**

```bash
node ~/.claude/skills/impeccable/scripts/detect.mjs --json src/components/errors
```

Corregir lo que señale que sea real; anotar los falsos positivos.

- [ ] **Step 3: Verificación completa**

```bash
npm run lint && npx tsc --noEmit && npm test 2>&1 | tail -8
```

Esperado: lint limpio, sin errores de tipos, 0 tests fallando.

- [ ] **Step 4: Comprobarlo en el navegador**

Levantar la app y forzar el fallo del filtro de profesionales (DevTools → Network → bloquear la petición de staff) para confirmar de primera mano que: el filtro se sustituye en su sitio, el calendario no se mueve un píxel, y el reintento recupera el select.

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): documentar la escalera de estados de error"
```

---

## Self-Review

**Cobertura del spec:**
- Escalera de 4 severidades → Tareas 2, 3, 4 (componentes) + 6–11 (migración).
- Sonner → Tarea 1.
- Los 26 sitios inventariados → Tareas 5–11 (5 cubre las 3 vía `AsyncSection`; 6–11 el resto por familia).
- Copy sin «Intenta de nuevo.» → constraint global, verificado en 9.5, 10.5 y 11.3.
- Sin salto de layout → resuelto por diseño en los escalones 1 (ocupa el hueco), 2 (sustituye) y 3 (toast).
- Documentación → Tarea 12.

**Riesgo principal:** ~20 tests existentes asertan `getByRole('alert')`. Mitigado fijando los roles por escalón en las Global Constraints (1 y 4 conservan `alert`), lo que deja la rotura acotada a los pocos sitios que pasan a escalón 2 o 3, señalados uno a uno en las tablas de las tareas 6, 7, 9 y 10.

**Consistencia de tipos:** `SectionError` toma `description` (obligatoria) + `title` (opcional); `FieldError` toma `label`; `InlineError` toma `children`; `notifyError(message, { onRetry, retryLabel })`. Estos nombres se usan idénticos en las tareas 5–11.
