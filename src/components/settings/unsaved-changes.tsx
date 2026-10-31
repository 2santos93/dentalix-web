'use client';
import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

/**
 * Guarda de «cambios sin guardar» para TODA salida de una pantalla con un
 * borrador (DESIGN.md → Settings pages → Saving):
 *
 * - cerrar o recargar la pestaña → aviso nativo del navegador (`beforeunload`);
 * - un enlace de la app (sidebar, «‹ Ajustes», un enlace del contenido, la
 *   sub-navegación…) → `ConfirmDialog` «Tienes cambios sin guardar»;
 * - ⌘K (`requestNavigation`) → el mismo diálogo;
 * - «Atrás» del navegador → el mismo diálogo.
 *
 * Next (16, App Router) no tiene un evento global de «antes de navegar»: el
 * `onNavigate` de `<Link>` es por enlace y `router.push` no se puede cancelar.
 * Por eso la guarda escucha en la fase de captura de `window` — antes que el
 * manejador de `<Link>` (React escucha en la raíz) y antes que el `popstate`
 * del router — y, si hay cambios, corta el evento y pregunta.
 *
 * «Atrás»: mientras hay cambios, se apila una entrada centinela con la MISMA
 * URL. Pulsar «Atrás» solo baja a la entrada de debajo (misma pantalla, el
 * router no se entera) y se pregunta: «Seguir editando» vuelve a apilar el
 * centinela; «Salir sin guardar» hace el `history.back()` de verdad. Al salir
 * por un enlace, primero se baja en silencio por debajo del centinela y luego
 * se repite el clic: no queda una entrada duplicada de la pantalla.
 *
 * Varias fuentes (una página con varios formularios) se suman: basta una con
 * cambios. El anfitrión (`UnsavedChangesGuard`) va una sola vez en el layout
 * de la app.
 */

export const unsavedChangesCopy = {
  title: 'Tienes cambios sin guardar',
  description: 'Si sales ahora, los cambios de esta pantalla se pierden.',
  leave: 'Salir sin guardar',
  stay: 'Seguir editando',
};

/** Marca de la entrada centinela en `history.state`. */
export const GUARD_STATE_KEY = '__dxUnsaved';

// ── Almacén global (fuera de React: lo leen los escuchadores de `window`) ──

const dirtySources = new Set<symbol>();
const listeners = new Set<() => void>();
let host: ((href: string) => void) | null = null;

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** ¿Hay alguna pantalla con cambios sin guardar? */
export function hasUnsavedChanges(): boolean {
  return dirtySources.size > 0;
}

/**
 * Para navegaciones por código (⌘K): con cambios y el anfitrión montado,
 * pregunta y devuelve `true` (el anfitrión navega si se confirma); si no,
 * `false` y quien llama navega como siempre.
 */
export function requestNavigation(href: string): boolean {
  if (!hasUnsavedChanges() || !host) return false;
  host(href);
  return true;
}

/**
 * Registra una fuente de cambios mientras `dirty` sea cierto. Incluye el aviso
 * nativo al cerrar o recargar la pestaña.
 */
export function useUnsavedChanges(dirty: boolean): void {
  React.useEffect(() => {
    if (!dirty) return;
    const id = Symbol('unsaved');
    dirtySources.add(id);
    emit();
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      dirtySources.delete(id);
      emit();
    };
  }, [dirty]);
}

/** Solo para tests: vuelve al estado inicial. */
export function resetUnsavedChangesForTests() {
  dirtySources.clear();
  host = null;
  emit();
}

// ── Utilidades de historial y enlaces ──

interface NavigationApi {
  currentEntry?: { index: number } | null;
}

function navigationApi(): NavigationApi | null {
  const nav = (window as unknown as { navigation?: NavigationApi }).navigation;
  return nav && nav.currentEntry ? nav : null;
}

function currentIndex(): number | null {
  return navigationApi()?.currentEntry?.index ?? null;
}

function onSentinel(): boolean {
  return Boolean((window.history.state as Record<string, unknown> | null)?.[GUARD_STATE_KEY]);
}

function pushSentinel(): number | null {
  // Con `__NA` copiado de la entrada actual, el `pushState` parcheado por Next
  // la deja pasar tal cual (sin URL: misma dirección, el router no cambia).
  window.history.pushState({ ...((window.history.state as object | null) ?? {}), [GUARD_STATE_KEY]: true }, '');
  return currentIndex();
}

/**
 * El enlace de un clic, si es una navegación de la app que la guarda debe
 * parar: botón principal sin modificadores (⌘/Ctrl/Mayús/Alt abren otra
 * pestaña o ventana y no pierden nada), mismo origen, sin `target` ni
 * `download`, y a otra dirección (un ancla `#` de la misma pantalla no sale).
 */
export function guardedHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const fromPath = path.find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement && n.hasAttribute('href'));
  const anchor =
    fromPath ?? (event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null);
  if (!anchor) return null;
  if (anchor.hasAttribute('download')) return null;
  const target = anchor.getAttribute('target');
  if (target && target !== '_self') return null;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

// ── Anfitrión ──

type Pending =
  | { kind: 'href'; href: string; anchor: HTMLAnchorElement | null }
  | { kind: 'back' };

/** Si la vuelta al sitio de antes del centinela no avisa, se sigue igual. */
const REWIND_TIMEOUT_MS = 1000;

/**
 * Monta los escuchadores mientras haya cambios y pinta la confirmación. Una
 * sola vez, en el layout de la app.
 */
export function UnsavedChangesGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const dirty = React.useSyncExternalStore(subscribe, hasUnsavedChanges, () => false);
  const [pending, setPending] = React.useState<Pending | null>(null);
  /** Se confirmó «Salir sin guardar»: la salida en curso no se para. */
  const releasedRef = React.useRef(false);
  /** Índice de la entrada centinela (API Navigation; `null` sin ella). */
  const sentinelIndexRef = React.useRef<number | null>(null);
  const armedRef = React.useRef(false);
  /** Vuelta silenciosa por debajo del centinela en curso: su `popstate` es nuestro. */
  const rewindRef = React.useRef<(() => void) | null>(null);

  // Otra pantalla, u otra vez sin cambios: la guarda vuelve a estar activa.
  React.useEffect(() => {
    releasedRef.current = false;
  }, [pathname]);
  React.useEffect(() => {
    if (!dirty) releasedRef.current = false;
  }, [dirty]);

  React.useEffect(() => {
    host = (href) => setPending({ kind: 'href', href, anchor: null });
    return () => {
      host = null;
    };
  }, []);

  const arm = React.useCallback(() => {
    if (onSentinel()) {
      sentinelIndexRef.current = currentIndex();
    } else {
      sentinelIndexRef.current = pushSentinel();
    }
    armedRef.current = true;
  }, []);

  React.useEffect(() => {
    if (!dirty) return;
    arm();

    function onClick(event: MouseEvent) {
      if (releasedRef.current || !hasUnsavedChanges()) return;
      const href = guardedHref(event);
      if (!href) return;
      // Antes que `<Link>` y que el `onClick` de quien lo pinta (cerrar «Más»):
      // nada se mueve hasta que la persona decida.
      event.preventDefault();
      event.stopPropagation();
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      setPending({ kind: 'href', href, anchor });
    }

    function onPopState(event: PopStateEvent) {
      if (rewindRef.current) {
        // Nuestra vuelta silenciosa: ni el router ni las capas se enteran.
        event.stopImmediatePropagation();
        rewindRef.current();
        return;
      }
      if (releasedRef.current || !hasUnsavedChanges() || !armedRef.current) return;
      const index = currentIndex();
      const sentinel = sentinelIndexRef.current;
      // ¿Se bajó por debajo del centinela? Con la API Navigation, por índice
      // (una capa abierta encima — ⌘K, «Más» — vuelve al centinela y no
      // cuenta); sin ella, por la marca del estado.
      const left =
        index !== null && sentinel !== null
          ? index < sentinel
          : !(event.state as Record<string, unknown> | null)?.[GUARD_STATE_KEY];
      if (!left) return;
      // El router de Next no se entera: la URL es la misma de la pantalla.
      event.stopImmediatePropagation();
      armedRef.current = false;
      setPending({ kind: 'back' });
    }

    window.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState, true);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState, true);
      armedRef.current = false;
    };
  }, [dirty, arm]);

  /**
   * Baja en silencio a la entrada de debajo del centinela (y de una capa
   * abierta encima) y luego `run`: la salida se apila donde estaba la
   * pantalla, sin dejar una entrada duplicada que haga falta pasar con «Atrás».
   */
  function rewindThen(run: () => void) {
    const index = currentIndex();
    const sentinel = sentinelIndexRef.current;
    let steps = 0;
    if (armedRef.current && index !== null && sentinel !== null) {
      steps = index - sentinel + 1;
    } else if (armedRef.current && onSentinel()) {
      // Sin API Navigation solo se sabe seguro si no hay una capa encima.
      steps = (window.history.state as Record<string, unknown> | null)?.dxLayer ? 0 : 1;
    }
    if (steps <= 0) {
      run();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      rewindRef.current = null;
      run();
    };
    rewindRef.current = finish;
    window.history.go(-steps);
    window.setTimeout(finish, REWIND_TIMEOUT_MS);
  }

  function stay() {
    if (pending?.kind === 'back' && hasUnsavedChanges()) arm();
    setPending(null);
  }

  function leave() {
    const target = pending;
    setPending(null);
    if (!target) return;
    releasedRef.current = true;
    if (target.kind === 'back') {
      window.history.back();
      return;
    }
    rewindThen(() => {
      // El mismo clic otra vez (ya sin guarda): el `<Link>` navega y quien lo
      // pinta hace lo suyo (la hoja «Más» se cierra). Sin enlace (⌘K), el router.
      if (target.anchor?.isConnected) target.anchor.click();
      else router.push(target.href);
    });
  }

  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) stay();
      }}
      title={unsavedChangesCopy.title}
      description={unsavedChangesCopy.description}
      confirmLabel={unsavedChangesCopy.leave}
      cancelLabel={unsavedChangesCopy.stay}
      onConfirm={leave}
      destructive
    />
  );
}
