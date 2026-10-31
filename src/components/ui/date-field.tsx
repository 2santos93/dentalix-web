'use client';
import * as React from 'react';
import {
  DateField as AriaDateField,
  DateInput,
  DateSegment,
  Label as AriaLabel,
  TimeField as AriaTimeField,
} from 'react-aria-components';
import { fieldLabelId } from '@/components/shared/form-field';
import { DateI18n, useDateLocale } from '@/components/ui/date-locale';
import type { CalendarDate } from '@internationalized/date';
import { calendarDateToIso, isoToCalendarDate, isoToTime, timeToIso } from '@/lib/dates/iso';
import { ageFrom } from '@/lib/patients/age';
import { cn } from '@/lib/utils';

/**
 * Campos de fecha y hora escritos por segmentos (react-aria), con el locale de
 * la sede y nunca el del navegador: en español `dd/mm/aaaa`, en en-US
 * `mm/dd/yyyy`. Entra ISO y sale ISO — `'YYYY-MM-DD'` / `'HH:mm'` — así que una
 * pantalla migra cambiando el `<Input type="date">` por el campo, sin tocar su
 * estado (DESIGN.md → Dates and times).
 */

/** Props comunes de los campos de fecha y hora. */
export interface DateBaseProps {
  /**
   * id del grupo de segmentos. Dentro de `FormField` es su `htmlFor`: el campo
   * se nombra solo con `aria-labelledby={fieldLabelId(id)}`.
   */
  id?: string;
  /** Pinta un `<input type="hidden">` con el valor ISO, para `<form>` y `FormData`. */
  name?: string;
  /** Etiqueta propia; dentro de `FormField` no hace falta (la pone el `FormField`). */
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** Estado inválido (borde de peligro). También vale `aria-invalid`. */
  isInvalid?: boolean;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  autoFocus?: boolean;
  className?: string;
}

/** El borde del grupo de segmentos: el mismo aspecto que `fieldClass`, por estado de react-aria. */
export const segmentGroupClass =
  'flex h-10 w-full min-w-0 items-center rounded-lg border border-border-input bg-surface px-3 text-sm text-ink transition-[border-color,box-shadow] hover:border-muted data-[focus-within]:border-primary-text data-[focus-within]:ring-3 data-[focus-within]:ring-primary/20 data-[disabled]:cursor-not-allowed data-[disabled]:border-border data-[disabled]:bg-surface-sunken data-[disabled]:text-muted data-[invalid]:border-danger data-[invalid]:data-[focus-within]:ring-danger/20 pointer-coarse:h-11 pointer-coarse:text-base';

/** Un segmento (día, mes, año, hora…): cifras tabulares; el enfocado, tintado de acento. */
export const segmentClass =
  'rounded-sm px-0.5 tabular-nums caret-transparent outline-none data-[placeholder]:text-faint data-[type=literal]:px-0 data-[type=literal]:text-faint focus:bg-primary-subtle focus:text-primary-subtle-text data-[disabled]:text-muted';

export const dateLabelClass = 'text-sm font-medium text-ink';

/** Nombre accesible: etiqueta propia, `aria-labelledby` explícito, o la del `FormField` del `id`. */
export function dateLabelling(props: DateBaseProps): { 'aria-labelledby'?: string; 'aria-label'?: string } {
  if (props.label) return {};
  if (props['aria-labelledby']) return { 'aria-labelledby': props['aria-labelledby'] };
  if (props['aria-label']) return { 'aria-label': props['aria-label'] };
  return props.id ? { 'aria-labelledby': fieldLabelId(props.id) } : {};
}

export function dateInvalid(props: DateBaseProps): boolean {
  return Boolean(props.isInvalid) || props['aria-invalid'] === true || props['aria-invalid'] === 'true';
}

/** Hidden input con el ISO, para que un `<form>` lo envíe como antes. */
export function HiddenIso({ name, value }: { name?: string; value: string | null }) {
  return name ? <input type="hidden" name={name} value={value ?? ''} /> : null;
}

/**
 * Enter en un segmento envía el formulario que lo contiene, como en cualquier
 * `<input>` (envío implícito). Los segmentos de react-aria son `spinbutton`
 * sobre un `span` y su teclado para la propagación, así que el navegador no lo
 * hace solo: va en fase de captura, en un envoltorio del campo.
 */
export function submitOnEnterFromSegment(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  const target = event.target as HTMLElement;
  if (target.getAttribute('role') !== 'spinbutton') return;
  const form = target.closest('form');
  if (!form) return;
  event.preventDefault();
  form.requestSubmit();
}

/**
 * Envoltorio sin caja (`display: contents`) que da a los segmentos el envío
 * implícito con Enter. No cambia el layout del padre.
 */
export function SegmentKeys({ children }: { children: React.ReactNode }) {
  return (
    <div className="contents" onKeyDownCapture={submitOnEnterFromSegment}>
      {children}
    </div>
  );
}

/**
 * Un día con año completo (4 cifras). Mientras se teclea «2026», react-aria
 * da por completa la fecha con el año 2, 20, 202: esos valores no salen.
 */
export function isCompleteDate(date: { year: number } | null | undefined): boolean {
  return Boolean(date) && date!.year >= 1000;
}

/** `CalendarDate` → ISO solo si el año está completo; si no, `null`. */
export function completeIso(date: { year: number; month: number; day: number } | null | undefined): string | null {
  return isCompleteDate(date) ? calendarDateToIso(date) : null;
}

interface DraftConvert<V, Iso> {
  toDraft: (iso: Iso) => V;
  toIso: (draft: V) => Iso;
  key: (iso: Iso) => string;
}

/**
 * Lo que pinta el campo (borrador) separado de lo que se emite: el borrador
 * guarda el año a medio teclear («0002») sin que la pantalla lo reciba; afuera
 * solo sale una fecha completa o `null`. Si el `value` de fuera cambia por otra
 * vía (reinicio, otra fecha), el borrador lo sigue.
 */
export function useIsoDraft<V, Iso>(value: Iso, onChange: (value: Iso) => void, convert: DraftConvert<V, Iso>) {
  const valueKey = convert.key(value);
  const [draft, setDraft] = React.useState<V>(() => convert.toDraft(value));
  const [seen, setSeen] = React.useState(valueKey);
  const [emitted, setEmitted] = React.useState<string | null>(null);
  if (valueKey !== seen) {
    setSeen(valueKey);
    if (valueKey !== emitted) setDraft(convert.toDraft(value));
  }
  const change = (next: V) => {
    setDraft(next);
    const iso = convert.toIso(next);
    const key = convert.key(iso);
    setEmitted(key);
    if (key !== valueKey) onChange(iso);
  };
  return [draft, change] as const;
}

const dayDraft: DraftConvert<CalendarDate | null, string | null> = {
  toDraft: (iso) => isoToCalendarDate(iso),
  toIso: (draft) => completeIso(draft),
  key: (iso) => iso ?? '',
};

/** Borrador de un día civil ISO (`DateField`, `DatePicker`). */
export function useDayDraft(value: string | null, onChange: (value: string | null) => void) {
  return useIsoDraft(value, onChange, dayDraft);
}

/** «26 años»; «1 año»; «menos de 1 año»; nada si la fecha es futura o no se lee. */
export function ageLabel(age: number | null): string {
  if (age === null || age < 0) return '';
  if (age === 0) return 'menos de 1 año';
  return age === 1 ? '1 año' : `${age} años`;
}

export interface DateFieldProps extends DateBaseProps {
  /** Día civil 'YYYY-MM-DD', o `null` vacío. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Primer y último día admitidos, 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
  /**
   * Fecha de nacimiento: muestra la edad calculada al lado («26 años») como
   * verificación inmediata de lo escrito.
   */
  showAge?: boolean;
}

/**
 * Fecha escrita por segmentos, sin calendario: para fechas que la persona ya
 * sabe (nacimiento, emisión de un documento). Para elegir un día de agenda o
 * un filtro, `DatePicker`.
 */
export function DateField(props: DateFieldProps) {
  const { id, value, onChange, min, max, showAge, label, required, disabled, autoFocus, className } = props;
  const date = React.useMemo(() => isoToCalendarDate(value), [value]);
  const [draft, setDraft] = useDayDraft(value, onChange);
  const minValue = React.useMemo(() => isoToCalendarDate(min) ?? undefined, [min]);
  const maxValue = React.useMemo(() => isoToCalendarDate(max) ?? undefined, [max]);
  const age = showAge ? ageLabel(ageFrom(date ? value : null)) : '';
  return (
    <DateI18n>
      <SegmentKeys>
        <AriaDateField
          id={id}
          value={draft}
          onChange={setDraft}
          minValue={minValue}
          maxValue={maxValue}
          isRequired={required}
          isDisabled={disabled}
          isInvalid={dateInvalid(props)}
          validationBehavior="aria"
          // dd/mm/aaaa: siempre dos cifras, como la máscara que la persona espera ver.
          shouldForceLeadingZeros
          granularity="day"
          autoFocus={autoFocus}
          aria-describedby={props['aria-describedby']}
          {...dateLabelling(props)}
          className={cn('flex flex-col gap-1.5', className)}
        >
          {label ? <AriaLabel className={dateLabelClass}>{label}</AriaLabel> : null}
          <div className="flex items-center gap-3">
            <DateInput className={segmentGroupClass}>
              {(segment) => <DateSegment segment={segment} className={segmentClass} />}
            </DateInput>
            {showAge ? (
              <span
                className="min-w-16 shrink-0 text-sm text-muted tabular-nums"
                aria-live="polite"
                data-testid="date-field-age"
              >
                {age}
              </span>
            ) : null}
          </div>
        </AriaDateField>
      </SegmentKeys>
      <HiddenIso name={props.name} value={date ? value : null} />
    </DateI18n>
  );
}

export interface TimeFieldProps extends DateBaseProps {
  /** Hora de reloj 'HH:mm' (24 h, aunque la sede pinte 12 h), o `null`. */
  value: string | null;
  onChange: (value: string | null) => void;
  min?: string;
  max?: string;
}

/** Hora escrita por segmentos, con el reloj 12/24 h de la sede. */
export function TimeField(props: TimeFieldProps) {
  const { id, value, onChange, min, max, label, required, disabled, autoFocus, className } = props;
  const { hourCycle } = useDateLocale();
  const time = React.useMemo(() => isoToTime(value), [value]);
  const minValue = React.useMemo(() => isoToTime(min) ?? undefined, [min]);
  const maxValue = React.useMemo(() => isoToTime(max) ?? undefined, [max]);
  return (
    <DateI18n>
      <SegmentKeys>
        <AriaTimeField
          id={id}
          value={time}
          onChange={(next) => onChange(timeToIso(next))}
          minValue={minValue}
          maxValue={maxValue}
          hourCycle={hourCycle === 'h12' ? 12 : hourCycle === 'h23' ? 24 : undefined}
          granularity="minute"
          isRequired={required}
          isDisabled={disabled}
          isInvalid={dateInvalid(props)}
          validationBehavior="aria"
          // dd/mm/aaaa: siempre dos cifras, como la máscara que la persona espera ver.
          shouldForceLeadingZeros
          autoFocus={autoFocus}
          aria-describedby={props['aria-describedby']}
          {...dateLabelling(props)}
          className={cn('flex flex-col gap-1.5', className)}
        >
          {label ? <AriaLabel className={dateLabelClass}>{label}</AriaLabel> : null}
          <DateInput className={segmentGroupClass}>
            {(segment) => <DateSegment segment={segment} className={segmentClass} />}
          </DateInput>
        </AriaTimeField>
      </SegmentKeys>
      <HiddenIso name={props.name} value={time ? timeToIso(time) : null} />
    </DateI18n>
  );
}
