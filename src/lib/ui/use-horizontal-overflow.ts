'use client';
import * as React from 'react';

/**
 * ¿El contenido de este marco es más ancho que el marco? (DESIGN.md, «Tables
 * · Wider than its slot»). Se mide en el cliente porque no depende de un
 * breakpoint sino del ancho real del contenido: los mismos 528px sobran para
 * la tabla de pacientes y no le bastan a la del catálogo.
 *
 * Con `true`, quien lo usa convierte el marco en una región con nombre y
 * parada de tabulador (para llegar sin ratón a las últimas columnas) y le pone
 * las sombras de `.scroll-x-shadows`; con `false`, nada de eso.
 */
export function useHorizontalOverflow<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T>(null);
  const [overflows, setOverflows] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Sin margen: el navegador (y axe, `scrollable-region-focusable`) dan por
    // desplazable un marco con 1 px de más, y ese píxel también hay que poder
    // alcanzarlo con el teclado. Con `+ 1` el marco quedaba sin parada de
    // tabulador justo en ese caso (estado de cuenta a 390 px, DX-051).
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // El contenido también cambia de ancho sin que cambie el marco: al
    // filtrar, al paginar o al añadir una fila con un valor más largo.
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return [ref, overflows];
}
