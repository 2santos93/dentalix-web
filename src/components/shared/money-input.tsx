'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatAmount, formatCurrency } from '@/lib/format/currency';
import { moneyInputCopy, parseMoneyInput } from '@/lib/format/money';
import { cn } from '@/lib/utils';

/**
 * Tras cuánto sin teclear se actualiza la vista previa. Es una región
 * `aria-live`: si cambiara con cada tecla, el lector leería «Se guardará: 1»,
 * «… 15», «… 150»…; así lo anuncia una vez, cuando la persona para.
 */
export const MONEY_PREVIEW_DELAY_MS = 500;

type NativeProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode' | 'defaultValue'
>;

interface MoneyInputProps extends NativeProps {
  /** Lo escrito, tal cual: se interpreta con `parseMoneyInput` al enviar. */
  value: string;
  onValueChange: (text: string) => void;
  /** Moneda del importe: da los decimales y el formato de la vista previa. */
  currency: string;
  /** Clases del contenedor (campo + vista previa); `className` va al campo. */
  containerClassName?: string;
}

/** La línea bajo el campo para un texto ya «asentado». */
function previewText(text: string, currency: string): string {
  if (text.trim() === '') return '';
  const parsed = parseMoneyInput(text, currency);
  if (!parsed.ok) return parsed.message;
  const formatted = currency ? formatCurrency(parsed.value, currency) : formatAmount(parsed.value);
  return moneyInputCopy.preview(formatted);
}

/**
 * Campo de importe (DX-241): el único sitio de la app donde se escribe dinero.
 * Texto con teclado decimal (`type="number"` descarta en silencio la coma de un
 * teclado en español), y debajo lo que se va a guardar ya interpretado —
 * «Se guardará: 150,50 US$» — o por qué no se entiende. Quien lo usa lee el
 * importe con `parseMoneyInput(value, currency)` al enviar y, si no vale, pasa
 * su error al `FormField` (escalón 4, junto al campo) con `aria-invalid`: la
 * vista previa calla entonces para no repetirlo.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    { value, onValueChange, currency, containerClassName, className, id, 'aria-describedby': describedBy, ...props },
    ref,
  ) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const previewId = `${inputId}-preview`;
    const [settled, setSettled] = useState(value);

    useEffect(() => {
      const timer = setTimeout(() => setSettled(value), MONEY_PREVIEW_DELAY_MS);
      return () => clearTimeout(timer);
    }, [value]);

    const invalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true';
    const preview = invalid ? '' : previewText(settled, currency);

    return (
      <div className={cn('flex min-w-0 flex-col gap-1', containerClassName)}>
        <Input
          ref={ref}
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          aria-describedby={[describedBy, previewId].filter(Boolean).join(' ')}
          className={cn('tabular-nums', className)}
          {...props}
        />
        <p id={previewId} aria-live="polite" className="min-h-4 text-xs text-muted tabular-nums">
          {preview}
        </p>
      </div>
    );
  },
);
MoneyInput.displayName = 'MoneyInput';
