'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<V extends string> {
  value: V;
  label: React.ReactNode;
  /** Nombre accesible cuando `label` no es texto (p. ej. solo un icono). */
  ariaLabel?: string;
  disabled?: boolean;
  /** Atributos extra del botón (`data-testid`, `title`…). */
  buttonProps?: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'role' | 'type'> &
    Record<`data-${string}`, string | undefined>;
}

export interface SegmentedControlProps<V extends string> {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SegmentedOption<V>[];
  /** Nombre del grupo para lectores de pantalla («Vista del calendario»). */
  'aria-label': string;
  size?: 'sm' | 'md';
  /** En móvil ocupa todo el ancho y reparte los segmentos; desde `sm` vuelve a su ancho natural. */
  fullWidthOnMobile?: boolean;
  /**
   * `radio` (por defecto): `radiogroup` + `radio`/`aria-checked`, una sola
   * parada de tabulación y las flechas eligen (patrón APG de radio group).
   * `toggle`: `group` + botones `aria-pressed`; las flechas mueven el foco y
   * Enter/Espacio eligen (patrón de barra de herramientas), para los
   * controles que las pruebas e2e ya buscan como botón («Día», «Lista», «Hoy»).
   */
  semantics?: 'radio' | 'toggle';
  disabled?: boolean;
  className?: string;
  id?: string;
  'data-testid'?: string;
}

/**
 * Control segmentado (DESIGN.md → Segmented control): elegir UNA de 2–5
 * opciones hermanas que cambian la vista (Mes/Semana/Día, periodo de la caja,
 * dentición). Un solo aspecto en todo el producto: carril hundido, segmento
 * elegido en superficie con tinta — nunca el acento relleno (One Accent Rule).
 * Para navegar entre secciones con contenido propio usa `Tabs`.
 */
export function SegmentedControl<V extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  fullWidthOnMobile = false,
  semantics = 'radio',
  disabled = false,
  className,
  id,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: SegmentedControlProps<V>) {
  const refs = React.useRef(new Map<V, HTMLButtonElement>());
  const enabled = options.filter((o) => !o.disabled && !disabled);
  // Roving tabindex: el elegido (o el primero habilitado) es la única parada.
  const tabStop = enabled.some((o) => o.value === value) ? value : enabled[0]?.value;

  function move(from: V, delta: number | 'first' | 'last') {
    if (enabled.length === 0) return;
    const index = enabled.findIndex((o) => o.value === from);
    const nextIndex =
      delta === 'first'
        ? 0
        : delta === 'last'
          ? enabled.length - 1
          : (Math.max(index, 0) + delta + enabled.length) % enabled.length;
    const next = enabled[nextIndex].value;
    refs.current.get(next)?.focus();
    // Radio: las flechas eligen (APG). Toggle: solo mueven el foco; Enter/Espacio eligen.
    if (semantics === 'radio' && next !== value) onValueChange(next);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: V) {
    const keys: Record<string, number | 'first' | 'last'> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: 'first',
      End: 'last',
    };
    const delta = keys[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    move(current, delta);
  }

  const isRadio = semantics === 'radio';
  return (
    <div
      id={id}
      role={isRadio ? 'radiogroup' : 'group'}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      className={cn(
        'inline-flex max-w-full shrink-0 items-stretch gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface-sunken p-0.5',
        size === 'sm' ? 'h-8' : 'h-10',
        fullWidthOnMobile && 'flex w-full sm:inline-flex sm:w-auto',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const isDisabled = disabled || option.disabled;
        const { className: extraClass, ...buttonProps } = option.buttonProps ?? {};
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) refs.current.set(option.value, el);
              else refs.current.delete(option.value);
            }}
            type="button"
            role={isRadio ? 'radio' : undefined}
            aria-checked={isRadio ? selected : undefined}
            aria-pressed={isRadio ? undefined : selected}
            aria-label={option.ariaLabel}
            data-state={selected ? 'on' : 'off'}
            disabled={isDisabled}
            tabIndex={option.value === tabStop ? 0 : -1}
            onClick={() => {
              if (!selected) onValueChange(option.value);
            }}
            onKeyDown={(e) => onKeyDown(e, option.value)}
            {...buttonProps}
            className={cn(
              'focus-ring inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
              size === 'sm' ? 'px-2.5 text-xs' : 'px-3 text-sm',
              fullWidthOnMobile && 'flex-1 sm:flex-none',
              selected
                ? 'bg-surface text-ink shadow-lift'
                : 'text-muted hover:bg-surface-active hover:text-ink',
              extraClass,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
