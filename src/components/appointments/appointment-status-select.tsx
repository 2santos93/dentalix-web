'use client';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { AppointmentStatus } from '@/lib/appointments/appointments-api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from './appointment-display';

interface AppointmentStatusSelectProps {
  /** Nombre accesible sin el estado, p. ej. «Estado de la cita de 09:00–09:30». */
  label: string;
  value: AppointmentStatus;
  /** Estados que se pueden elegir (ver `statusOptionsFor`), en su orden. */
  options: AppointmentStatus[];
  /**
   * Solo se llama con una acción explícita (Enter o clic en una opción) y con
   * un estado distinto del actual. `trigger` es el propio control: si el padre
   * abre un diálogo en vez de guardar (p. ej. cancelar, DX-279), le devuelve
   * ahí el foco al cerrarlo.
   */
  onChange: (status: AppointmentStatus, trigger: HTMLButtonElement | null) => void;
  disabled?: boolean;
  id?: string;
  /** `chip`: píldora tintada de la fila de la agenda. `field`: campo de formulario del detalle. */
  variant?: 'chip' | 'field';
  'data-testid'?: string;
}

/**
 * DX-295: control para cambiar el estado de una cita. Con el `<select>` nativo,
 * ↓ (o una letra) sobre el control cerrado cambiaba la cita al momento, sin
 * confirmar. Aquí las flechas solo abren la lista y mueven la opción enfocada;
 * el estado se aplica con Enter o con un clic/toque en una opción, y Esc cierra
 * sin cambiar nada. Un combobox de Radix: el lector de pantalla anuncia el
 * estado actual (va en el nombre) y la opción enfocada al recorrer la lista.
 */
export function AppointmentStatusSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  id,
  variant = 'field',
  'data-testid': testId,
}: AppointmentStatusSelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Mientras se guarda, el control queda `disabled` y el navegador le quita el
  // foco: quien va con teclado perdía su sitio. Al terminar se le devuelve.
  const refocusAfterSave = useRef(false);
  useEffect(() => {
    if (disabled || !refocusAfterSave.current) return;
    refocusAfterSave.current = false;
    // Solo si el foco cayó en un ancestro (body o el contenedor del diálogo de
    // la cita); si está en otro sitio, p. ej. el diálogo de motivo, no se roba.
    const trigger = triggerRef.current;
    const active = document.activeElement;
    if (trigger && (!active || active.contains(trigger))) trigger.focus();
  }, [disabled]);

  // Radix cambia el valor al teclear una letra con el control cerrado (busca
  // la opción que empieza por ella): otro cambio sin confirmar. Se corta antes
  // de que llegue a Radix; Espacio sigue abriendo la lista.
  function blockTypeahead(event: KeyboardEvent<HTMLButtonElement>) {
    const modifier = event.ctrlKey || event.altKey || event.metaKey;
    if (!modifier && event.key.length === 1 && event.key !== ' ') event.preventDefault();
  }

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === value) return;
        refocusAfterSave.current = true;
        onChange(next as AppointmentStatus, triggerRef.current);
      }}
    >
      <SelectTrigger
        ref={triggerRef}
        id={id}
        aria-label={`${label}: ${STATUS_LABELS[value]}`}
        data-testid={testId}
        onKeyDown={blockTypeahead}
        className={cn(
          variant === 'field' && 'h-11 sm:h-10',
          variant === 'chip' &&
            `h-auto min-h-11 w-auto gap-1.5 rounded-full py-1 pl-3 pr-2 text-xs font-medium shadow-none focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:opacity-60 sm:min-h-0 ${STATUS_BADGE_CLASSES[value]}`,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent collisionPadding={16}>
        {options.map((status) => (
          <SelectItem key={status} value={status} className="min-h-11 sm:min-h-9">
            {STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
