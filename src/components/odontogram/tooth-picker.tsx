'use client';
import { OdontogramChart } from '@/components/odontogram/odontogram-chart';
import { isFdiToothNumber, isPermanentFdi } from '@/lib/odontogram/fdi';
import type { ToothSurface } from '@/lib/odontogram/odontogram-api';
import type { ToothState } from '@/lib/odontogram/projection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Copy as constants (i18n-ready, es-first) — matches tooth-record-panel.tsx.
const copy = {
  legend: 'Diente',
  chartHelp: 'Toca el diente en el odontograma. Si prefieres, escribe su código FDI.',
  inputLabel: 'Código FDI',
  inputPlaceholder: 'Ej. 11',
  inputHint: 'Permanentes 11-18/21-28/31-38/41-48 · temporales 51-55/61-65/71-75/81-85.',
  none: 'Ningún diente seleccionado.',
  selected: (fdi: string) => `Diente ${fdi} seleccionado.`,
  // Un código válido que el mapa no dibuja no es un error: se registra igual.
  // Decirlo evita que el usuario crea que el picker "no respondió".
  primaryNotOnChart: (fdi: string) =>
    `Diente ${fdi} seleccionado. Es temporal: el odontograma solo dibuja la dentición permanente, así que no queda marcado en el mapa.`,
  invalid: 'Todavía no es un código FDI válido.',
};

/**
 * The chart paints a patient's records; here it is being used purely to PICK a
 * number, so every tooth is drawn healthy. Hoisted to a module constant so the
 * chart doesn't see a new Map identity on every keystroke in the text field.
 */
const NO_STATES = new Map<string, ToothState>();

interface ToothPickerProps {
  /** The FDI code currently entered/picked — `''` for nothing yet. */
  value: string;
  onChange: (toothNumber: string) => void;
  /**
   * Clicking a face on the chart also names a surface. Optional: a consumer
   * with no surface concept just gets the tooth.
   */
  onPickSurface?: (surface: ToothSurface) => void;
  /** id of the text input, so a consumer can point a `<label>`/test at it. */
  inputId: string;
}

/**
 * Pick a tooth by touching it on the odontogram — the same map, the same FDI
 * numbers and the same selection affordance the Odontograma tab uses, because
 * it IS `OdontogramChart` (`selectedTooth` + `onSelectTooth`, already part of
 * its API).
 *
 * Why this exists: a treatment-plan item is a charge against a tooth, and the
 * only way to name that tooth used to be typing two digits from memory into a
 * free-text box — the exact transcription step that bills the wrong tooth, in
 * a product whose signature component is a clickable map of precisely those
 * numbers one tab away.
 *
 * The text field stays, as a deliberate second path, for two reasons: a user
 * who already knows the code is faster typing it, and the chart only draws the
 * 32 permanent teeth, so a primary tooth (51-85 — valid for the backend) has
 * no mark to click. Both directions write the same `value`, so they can never
 * disagree.
 */
export function ToothPicker({ value, onChange, onPickSurface, inputId }: ToothPickerProps) {
  const trimmed = value.trim();
  const onChart = isPermanentFdi(trimmed);
  const valid = isFdiToothNumber(trimmed);

  const status = !trimmed
    ? copy.none
    : onChart
      ? copy.selected(trimmed)
      : valid
        ? copy.primaryNotOnChart(trimmed)
        : copy.invalid;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="t-label mb-0.5 text-muted">{copy.legend}</legend>
      <p className="text-xs text-muted">{copy.chartHelp}</p>

      <OdontogramChart
        states={NO_STATES}
        selectedTooth={onChart ? trimmed : undefined}
        onSelectTooth={onChange}
        onSelectSurface={(fdi, surface) => {
          onChange(fdi);
          onPickSurface?.(surface);
        }}
      />

      <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor={inputId}>{copy.inputLabel}</Label>
        <Input
          id={inputId}
          value={value}
          inputMode="numeric"
          placeholder={copy.inputPlaceholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-xs text-muted">{copy.inputHint}</p>
      </div>

      {/* Lo que quedó elegido, dicho en palabras: el recuadro del diente en el
          mapa es una señal visual, y este es el eco que la hace verificable
          (y anunciable) antes de que el ítem se convierta en un cargo. */}
      <p role="status" aria-live="polite" className="text-sm font-medium text-ink">
        {status}
      </p>
    </fieldset>
  );
}
