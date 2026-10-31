'use client';
import * as React from 'react';
import type { CalendarDate } from '@internationalized/date';
import {
  Button as AriaButton,
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateFieldContext,
  DateInput,
  DatePicker as AriaDatePicker,
  DateRangePicker as AriaDateRangePicker,
  DateRangePickerStateContext,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Label as AriaLabel,
  Modal,
  ModalOverlay,
  Popover,
  RangeCalendar as AriaRangeCalendar,
  useSlottedContext,
  type CalendarCellRenderProps,
} from 'react-aria-components';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fieldLabelId } from '@/components/shared/form-field';
import { DateI18n, useDateLocale } from '@/components/ui/date-locale';
import {
  HiddenIso,
  SegmentKeys,
  completeIso,
  useDayDraft,
  useIsoDraft,
  dateInvalid,
  dateLabelClass,
  dateLabelling,
  segmentClass,
  segmentGroupClass,
  type DateBaseProps,
} from '@/components/ui/date-field';
import {
  DEFAULT_RANGE_PRESETS,
  isoToCalendarDate,
  todayDate,
  type DateRangePreset,
  type IsoRange,
} from '@/lib/dates/iso';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';

/**
 * Selectores de fecha para agendar y filtrar: segmentos escritos (siempre se
 * puede teclear) + botón de calendario. El calendario abre en un popover en
 * escritorio y en una hoja inferior en teléfonos (<640px). Entra ISO, sale ISO.
 */

const navButtonClass =
  'inline-flex size-10 items-center justify-center rounded-lg text-ink outline-none transition-colors hover:bg-surface-sunken data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-primary-text data-[disabled]:opacity-40 pointer-coarse:size-11 [&_svg]:size-4';

const triggerButtonClass =
  '-mr-2 ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-surface-sunken hover:text-ink data-[focus-visible]:outline-2 data-[focus-visible]:outline-primary-text data-[disabled]:pointer-events-none pointer-coarse:size-10 [&_svg]:size-4';

/** Clases de una celda del calendario: 40px (44px táctil), hoy con anillo, elegido en acento. */
function cellClass(
  { isSelected, isOutsideMonth, isDisabled, isUnavailable, isFocusVisible, isSelectionStart, isSelectionEnd }: CalendarCellRenderProps,
  { isToday, range }: { isToday: boolean; range: boolean },
): string {
  const edge = !range || isSelectionStart || isSelectionEnd;
  return cn(
    'relative flex size-10 cursor-default items-center justify-center rounded-lg text-sm tabular-nums text-ink outline-none transition-colors pointer-coarse:size-11',
    'hover:bg-surface-sunken',
    isOutsideMonth && 'text-faint opacity-60 hover:bg-transparent',
    isToday && !isSelected && 'font-semibold text-primary-text ring-1 ring-inset ring-primary-text',
    isSelected && edge && 'bg-primary font-semibold text-primary-foreground hover:bg-primary-hover',
    isSelected && !edge && 'rounded-none bg-primary-subtle text-primary-subtle-text hover:bg-primary-subtle',
    // react-aria también marca deshabilitados los días de otro mes: esos solo se atenúan.
    !isOutsideMonth && (isDisabled || isUnavailable) && 'cursor-not-allowed text-faint line-through opacity-50 hover:bg-transparent',
    isFocusVisible && 'outline-2 outline-offset-2 outline-primary-text',
  );
}

function CalendarHeader() {
  return (
    <header className="flex items-center justify-between gap-2 pb-2">
      <AriaButton slot="previous" className={navButtonClass}>
        <ChevronLeft aria-hidden />
      </AriaButton>
      <Heading className="text-sm font-semibold text-ink first-letter:uppercase" />
      <AriaButton slot="next" className={navButtonClass}>
        <ChevronRight aria-hidden />
      </AriaButton>
    </header>
  );
}

function CalendarBody({ range }: { range: boolean }) {
  const { timeZone } = useDateLocale();
  // «Hoy» en la zona de la sede, no en la del navegador.
  const today = React.useMemo(() => todayDate(timeZone).toString(), [timeZone]);
  return (
    <CalendarGrid weekdayStyle="short" className="border-separate border-spacing-y-0.5">
      <CalendarGridHeader>
        {(day) => (
          <CalendarHeaderCell className="size-10 text-xs font-medium text-muted first-letter:uppercase pointer-coarse:size-11">
            {day}
          </CalendarHeaderCell>
        )}
      </CalendarGridHeader>
      <CalendarGridBody>
        {(date) => (
          <CalendarCell
            date={date}
            className={(state) => cellClass(state, { isToday: state.date.toString() === today, range })}
          />
        )}
      </CalendarGridBody>
    </CalendarGrid>
  );
}

/**
 * Título de la hoja inferior: la etiqueta propia, el `aria-label`, o el texto
 * de la etiqueta del `FormField` (leído del DOM tras montar, en cliente).
 */
const noSubscription = () => () => {};

function OverlayTitle({ field, fallback }: { field: DateBaseProps; fallback: string }) {
  const own = field.label ?? field['aria-label'] ?? null;
  const labelId = field['aria-labelledby'] ?? (field.id ? fieldLabelId(field.id) : null);
  // Lectura del DOM como fuente externa: React la vuelve a mirar al montar,
  // cuando la etiqueta del `FormField` ya existe.
  const fromDom = React.useSyncExternalStore(
    noSubscription,
    () => (own || !labelId ? null : document.getElementById(labelId)?.textContent?.trim() || null),
    () => null,
  );
  return <p className="text-sm font-semibold first-letter:uppercase">{own ?? fromDom ?? fallback}</p>;
}

/**
 * La capa del calendario: popover anclado al campo en escritorio; hoja
 * inferior con título y cierre en teléfonos.
 */
function CalendarOverlay({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const wide = useMediaQuery('(min-width: 640px)');
  if (wide) {
    return (
      <Popover
        placement="bottom start"
        offset={6}
        className="z-50 rounded-xl border border-border bg-surface p-3 text-ink shadow-overlay outline-none"
      >
        <Dialog className="outline-none">{children}</Dialog>
      </Popover>
    );
  }
  return (
    <ModalOverlay isDismissable className="dlg-overlay fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm">
      <Modal className="fixed inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-xl border-t border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink shadow-overlay outline-none">
        <Dialog className="flex flex-col items-center gap-2 outline-none">
          <div className="flex w-full items-center justify-between">
            {title}
            <AriaButton slot="close" aria-label="Cerrar" className={navButtonClass}>
              <X aria-hidden />
            </AriaButton>
          </div>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export interface DatePickerProps extends DateBaseProps {
  /** Día civil 'YYYY-MM-DD', o `null`. */
  value: string | null;
  onChange: (value: string | null) => void;
  min?: string;
  max?: string;
}

/** Un día para agendar o filtrar: escrito por segmentos o elegido en el calendario. */
export function DatePicker(props: DatePickerProps) {
  const { id, value, onChange, min, max, label, required, disabled, autoFocus, className } = props;
  const date = React.useMemo(() => isoToCalendarDate(value), [value]);
  const [draft, setDraft] = useDayDraft(value, onChange);
  const minValue = React.useMemo(() => isoToCalendarDate(min) ?? undefined, [min]);
  const maxValue = React.useMemo(() => isoToCalendarDate(max) ?? undefined, [max]);
  return (
    <DateI18n>
      <SegmentKeys>
        <AriaDatePicker
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
          <Group className={segmentGroupClass}>
            <DateInput className="flex items-center">
              {(segment) => <DateSegment segment={segment} className={segmentClass} />}
            </DateInput>
            <AriaButton className={triggerButtonClass}>
              <CalendarDays aria-hidden />
            </AriaButton>
          </Group>
          <CalendarOverlay title={<OverlayTitle field={props} fallback="Elegir fecha" />}>
            <AriaCalendar>
              <CalendarHeader />
              <CalendarBody range={false} />
            </AriaCalendar>
          </CalendarOverlay>
        </AriaDatePicker>
      </SegmentKeys>
      <HiddenIso name={props.name} value={date ? value : null} />
    </DateI18n>
  );
}

/**
 * Un extremo del rango con su propio nombre («Desde»/«Hasta»), en vez del
 * genérico de react-aria («Fecha de inicio»): así lo leen el lector de
 * pantalla y `fillDateRange` en e2e.
 */
function RangeInput({ slot, label }: { slot: 'start' | 'end'; label: string }) {
  const context = useSlottedContext(DateFieldContext, slot);
  return (
    <DateFieldContext.Provider value={{ ...context, 'aria-label': label }}>
      <DateInput className="flex items-center" data-range-part={slot}>
        {(segment) => <DateSegment segment={segment} className={segmentClass} />}
      </DateInput>
    </DateFieldContext.Provider>
  );
}

/** Los atajos de periodo, en la capa del calendario. Elegir uno aplica y cierra. */
function RangePresets({ presets, onPick }: { presets: readonly DateRangePreset[]; onPick: (range: IsoRange) => void }) {
  const state = React.useContext(DateRangePickerStateContext);
  const { timeZone } = useDateLocale();
  return (
    <div role="group" aria-label="Atajos de periodo" className="flex flex-wrap gap-1.5 pb-2 sm:max-w-[18rem]">
      {presets.map((preset) => (
        <AriaButton
          key={preset.id}
          onPress={() => {
            onPick(preset.range(todayDate(timeZone)));
            state?.close();
          }}
          className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-[0.8125rem] font-medium text-ink outline-none transition-colors hover:border-border-input hover:bg-surface-sunken data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-primary-text pointer-coarse:h-10"
        >
          {preset.label}
        </AriaButton>
      ))}
    </div>
  );
}

type RangeDraft = { start: CalendarDate; end: CalendarDate } | null;

function toRangeDraft(value: IsoRange | null): RangeDraft {
  const start = isoToCalendarDate(value?.from);
  const end = isoToCalendarDate(value?.to);
  return start && end ? { start, end } : null;
}

/** El rango sale solo con los dos años completos; si no, `null`. */
const rangeDraft = {
  toDraft: toRangeDraft,
  toIso: (next: RangeDraft): IsoRange | null => {
    const from = completeIso(next?.start);
    const to = completeIso(next?.end);
    return from && to ? { from, to } : null;
  },
  key: (iso: IsoRange | null) => (iso ? `${iso.from}/${iso.to}` : ''),
};

export interface DateRangePickerProps extends DateBaseProps {
  /** Periodo con ambos días incluidos, 'YYYY-MM-DD', o `null`. */
  value: IsoRange | null;
  onChange: (value: IsoRange | null) => void;
  min?: string;
  max?: string;
  /** Nombres de los `<input type="hidden">` de cada extremo (para `<form>`). */
  startName?: string;
  endName?: string;
  /** Nombres accesibles de cada extremo. Por defecto «Desde» y «Hasta». */
  startLabel?: string;
  endLabel?: string;
  /**
   * Atajos (Hoy, Últimos 7 días, Este mes, Mes anterior) en la capa del
   * calendario: `true` para los de serie, o una lista propia.
   */
  presets?: boolean | readonly DateRangePreset[];
}

/** Un periodo «desde–hasta» en un solo campo, con calendario de rango y atajos. */
export function DateRangePicker(props: DateRangePickerProps) {
  const {
    id,
    value,
    onChange,
    min,
    max,
    label,
    required,
    disabled,
    autoFocus,
    className,
    startLabel = 'Desde',
    endLabel = 'Hasta',
  } = props;
  const range = React.useMemo(() => toRangeDraft(value), [value]);
  const [draft, setDraft] = useIsoDraft(value, onChange, rangeDraft);
  const minValue = React.useMemo(() => isoToCalendarDate(min) ?? undefined, [min]);
  const maxValue = React.useMemo(() => isoToCalendarDate(max) ?? undefined, [max]);
  const presets = props.presets === true ? DEFAULT_RANGE_PRESETS : props.presets || null;
  return (
    <DateI18n>
      <SegmentKeys>
        <AriaDateRangePicker
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
          <Group className={cn(segmentGroupClass, 'gap-1')}>
            <RangeInput slot="start" label={startLabel} />
            <span aria-hidden className="px-1 text-faint">
              –
            </span>
            <RangeInput slot="end" label={endLabel} />
            <AriaButton className={triggerButtonClass}>
              <CalendarDays aria-hidden />
            </AriaButton>
          </Group>
          <CalendarOverlay title={<OverlayTitle field={props} fallback="Elegir periodo" />}>
            {presets ? <RangePresets presets={presets} onPick={onChange} /> : null}
            <AriaRangeCalendar>
              <CalendarHeader />
              <CalendarBody range />
            </AriaRangeCalendar>
          </CalendarOverlay>
        </AriaDateRangePicker>
      </SegmentKeys>
      <HiddenIso name={props.startName} value={range ? value!.from : null} />
      <HiddenIso name={props.endName} value={range ? value!.to : null} />
    </DateI18n>
  );
}
