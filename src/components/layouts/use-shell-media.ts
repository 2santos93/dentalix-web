'use client';
import * as React from 'react';

/** Tramos del shell (DESIGN.md → Navigation): teléfono < 768 ≤ tableta < 1024 ≤ escritorio. */
export const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023.98px)';

/**
 * `matchMedia` como estado. Arranca en `false` (igual que el render del
 * servidor) y se resuelve en un efecto: el primer render del cliente coincide
 * con el HTML y no rompe la hidratación.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener?.('change', update);
    return () => mql.removeEventListener?.('change', update);
  }, [query]);
  return matches;
}

/**
 * ¿Está abierto el teclado virtual? Heurística de `visualViewport`: con el
 * teclado fuera, la ventana visual encoge mucho respecto a la de layout
 * (más de 150 px) MIENTRAS un campo de texto tiene el foco. Las dos
 * condiciones juntas evitan falsos positivos por el zoom o por la barra del
 * navegador que entra y sale. Sin `visualViewport`, siempre `false`.
 */
export function useVirtualKeyboardOpen(): boolean {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const isTextField = (el: Element | null) =>
      !!el &&
      (el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable) ||
        (el instanceof HTMLInputElement &&
          !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color'].includes(el.type)));
    const update = () => {
      const shrunk = window.innerHeight - vv.height > 150;
      setOpen(shrunk && isTextField(document.activeElement));
    };
    vv.addEventListener('resize', update);
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);
    return () => {
      vv.removeEventListener('resize', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
    };
  }, []);
  return open;
}

/**
 * El botón «atrás» de Android (y el gesto de iOS) cierra la capa abierta en
 * vez de salir de la página: al abrirla se apila una entrada de historial, y
 * `popstate` la cierra. Si se cierra por otro camino (Esc, una fila que
 * navega), la entrada propia se retira con `history.back()` — salvo cuando el
 * cierre lo provoca una navegación, que ya reemplazó la entrada.
 */
export function useCloseOnBack(open: boolean, close: () => void): { skipBack: () => void } {
  const pushedRef = React.useRef(false);
  const skipRef = React.useRef(false);
  const closeRef = React.useRef(close);
  React.useEffect(() => {
    closeRef.current = close;
  }, [close]);
  React.useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...(window.history.state ?? {}), dxLayer: true }, '');
    pushedRef.current = true;
    const onPop = () => {
      pushedRef.current = false;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (pushedRef.current && !skipRef.current) window.history.back();
      pushedRef.current = false;
      skipRef.current = false;
    };
  }, [open]);
  return React.useMemo(() => ({ skipBack: () => (skipRef.current = true) }), []);
}
