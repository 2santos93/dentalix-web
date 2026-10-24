'use client';
import * as React from 'react';
import { Info } from 'lucide-react';

const copy = {
  label: (column: string) => `Cómo se calcula: ${column}`,
};

const WIDTH = 256;
const GUTTER = 8;

/**
 * «Cómo se calcula» de una columna (DX-014): un botón con icono que enseña la
 * definición del indicador al pasar el ratón, al enfocarlo con el teclado o al
 * tocarlo, y la anuncia como su descripción (`aria-describedby`, también
 * oculta). Escape la cierra. La burbuja va en `position: fixed` junto al botón
 * —la tabla recorta lo que se sale de su marco—, sin salirse de la ventana.
 */
export function HowCalculated({ column, text }: { column: string; text: string }) {
  const id = React.useId();
  const button = React.useRef<HTMLButtonElement>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  function show() {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(GUTTER, rect.right - WIDTH), window.innerWidth - WIDTH - GUTTER);
    setPosition({ top: rect.bottom + 6, left: Math.max(GUTTER, left) });
  }
  const hide = () => setPosition(null);

  React.useEffect(() => {
    if (!position) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [position]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={copy.label(column)}
        aria-describedby={id}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (position ? hide() : show())}
        onKeyDown={(event) => {
          if (event.key === 'Escape') hide();
        }}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Info aria-hidden className="size-3.5" />
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!position}
        style={position ? { top: position.top, left: position.left, width: WIDTH } : undefined}
        className="fixed z-50 rounded-lg border border-border bg-surface p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-[0_8px_28px_-8px_rgb(15_23_42/0.18)]"
      >
        {text}
      </span>
    </>
  );
}
