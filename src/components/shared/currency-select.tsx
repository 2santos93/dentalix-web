'use client';
import { useEffect, useState } from 'react';
import { listCurrencies, type Currency } from '@/lib/reference/currencies-api';
import { FieldError } from '@/components/errors/field-error';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  // Escalón 2 (FieldError): ≤4 palabras, el `<label>` del campo da el contexto.
  loadError: 'Monedas no disponibles',
};

/**
 * De dónde sale la lista, exactamente una fuente: con sesión, `GET /currencies`
 * con el token; sin sesión (registro, R18), un `loader` como
 * `listPublicCurrencies` (referencia estable).
 */
export type CurrencySource =
  | { token: string; loader?: undefined }
  | { loader: () => Promise<Currency[]>; token?: undefined };

type CurrencySelectProps = CurrencySource & {
  id: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
  /** Accessible name for call sites with no adjacent `<label>` (e.g. a `FormField`-less select next to a button). Optional — omit when a `<label htmlFor>` already provides one. */
  ariaLabel?: string;
  /** p. ej. la razón de que esté deshabilitado. */
  ariaDescribedBy?: string;
  placeholder?: string;
  /** Para `aria-invalid`/`aria-required` desde el `FormField` que lo envuelve. */
  invalid?: boolean;
  required?: boolean;
  /** Códigos que no se ofrecen (p. ej. la moneda base de las tasas, que da la API). */
  exclude?: readonly string[];
  /** Primera opción elegible con valor `''` (p. ej. «Sin segunda moneda»), para un campo opcional. */
  noneLabel?: string;
};

export function CurrencySelect({
  id,
  token,
  loader,
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
  ariaDescribedBy,
  placeholder,
  invalid,
  required,
  exclude,
  noneLabel,
}: CurrencySelectProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const request = loader ? loader() : listCurrencies(token);
    request
      .then((data) => {
        if (!cancelled) setCurrencies(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, loader, attempt]);

  // Escalón 2 de la escalera de errores (DX-063): sin la lista, el select solo
  // ofrecería la moneda actual con cara de normal. Se sustituye en su sitio por
  // un FieldError de la misma altura; el valor elegido sigue en el padre.
  if (failed) {
    return (
      <FieldError
        label={copy.loadError}
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
        className={cn('h-10 w-full', className)}
        retryId={id}
      />
    );
  }

  // Until the list loads, keep `value` selectable so the control is never
  // empty and never loses the current selection.
  const loaded =
    currencies.length > 0 ? currencies : value ? [{ code: value, name: value, symbol: '' }] : [];
  const options = exclude?.length ? loaded.filter((c) => !exclude.includes(c.code)) : loaded;

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(fieldClass, 'h-10', className)}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      aria-required={required || undefined}
    >
      {/* Igual que el resto de selects obligatorios: el marcador no se puede volver a elegir. */}
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {noneLabel ? <option value="">{noneLabel}</option> : null}
      {options.filter((c) => !placeholder || c.code).map((c) => (
        <option key={c.code} value={c.code}>
          {c.symbol ? `${c.name} (${c.symbol})` : c.name}
        </option>
      ))}
    </select>
  );
}
