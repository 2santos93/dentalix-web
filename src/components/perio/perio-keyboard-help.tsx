import * as React from 'react';

const copy = {
  heading: 'Teclado',
  route:
    'Recorrido en S: vestibular superior del 18 al 28, palatino del 28 al 18, lingual inferior del 48 al 38 y vestibular inferior del 38 al 48. Se saltan los dientes omitidos.',
};

/** Cada tecla de la rejilla (DX-403): si se añade un atajo, va aquí. */
export const PERIO_KEYS: readonly { keys: readonly string[]; label: string; does: string }[] = [
  {
    keys: ['0–9'],
    label: 'Dígitos del 0 al 9',
    does: 'Fija el valor y salta al sitio siguiente del recorrido.',
  },
  { keys: ['+', '0–9'], label: 'Más y un dígito', does: '10 a 19 mm.' },
  { keys: ['-', '0–5'], label: 'Menos y un dígito', does: 'Recesión negativa (margen sobre la UAC).' },
  { keys: ['Retroceso', 'Supr'], label: 'Retroceso o Suprimir', does: 'Borra el valor de la celda.' },
  { keys: ['B'], label: 'B', does: 'Sangrado.' },
  { keys: ['S'], label: 'S', does: 'Supuración.' },
  { keys: ['P'], label: 'P', does: 'Placa.' },
  { keys: ['C'], label: 'C', does: 'Cálculo.' },
  {
    keys: ['←', '→'],
    label: 'Flechas izquierda y derecha',
    does: 'Sitio vecino en la misma fila.',
  },
  {
    keys: ['↑', '↓'],
    label: 'Flechas arriba y abajo',
    does: 'Misma columna en la fila de arriba o de abajo, también entre arcadas.',
  },
];

const FLAGS_NOTE =
  'B, S, P y C funcionan en el sondaje: justo después de un dígito marcan el sitio recién sondeado; si llegaste con las flechas, la celda en la que estás. Pulsar el número de un diente lo omite o lo incluye.';

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-sunken px-1.5 font-sans text-[0.6875rem] font-medium tabular-nums text-ink">
      {children}
    </kbd>
  );
}

/** Ayuda de teclado del periodontograma: todas las teclas, el recorrido y las marcas. */
export function PerioKeyboardHelp() {
  return (
    <section aria-labelledby="perio-keyboard-help" className="flex max-w-[110ch] flex-col gap-2">
      <h3 id="perio-keyboard-help" className="text-xs font-semibold text-ink">
        {copy.heading}
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2 xl:grid-cols-3">
        {PERIO_KEYS.map((item) => (
          <div key={item.label} className="flex min-w-0 items-baseline gap-2">
            <dt className="flex shrink-0 gap-1">
              <span className="sr-only">{item.label}</span>
              {item.keys.map((k) => (
                <Key key={k}>
                  <span aria-hidden>{k}</span>
                </Key>
              ))}
            </dt>
            <dd className="min-w-0">{item.does}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">{FLAGS_NOTE}</p>
      <p className="text-xs text-muted">{copy.route}</p>
    </section>
  );
}
