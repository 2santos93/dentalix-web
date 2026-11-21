'use client';
import { useEffect, useState } from 'react';
import { listCurrencies, type Currency } from '@/lib/reference/currencies-api';
import { FieldError } from '@/components/errors/field-error';
import { NativeSelect } from '@/components/ui/native-select';
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
  /** Ancho y colocación del campo (va al envoltorio de `NativeSelect`). */
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
  /**
   * DX-584: solo estas monedas, en este orden (las aceptadas por la clínica en
   * el cobro). `null`/vacía = todas. Si el valor actual no está, pasa a la primera.
   */
  only?: readonly string[] | null;
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
  only,
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

  const restricted = only && only.length > 0 ? only : null;
  // DX-584: un cobro no puede quedarse en una moneda que la clínica no acepta
  // (la API lo rechazaría): pasa a la primera aceptada, la que enseña el menú.
  const outside = restricted !== null && value !== '' && !restricted.includes(value);
  const firstAllowed = restricted?.[0] ?? '';
  useEffect(() => {
    if (outside && firstAllowed && !disabled) onChange(firstAllowed);
    // `onChange` cambia de identidad en cada render del padre: solo cuenta el valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outside, firstAllowed, disabled]);

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
  const allowed = restricted
    ? restricted.map(
        (code) =>
          loaded.find((c) => c.code === code) ??
          // Hasta que llega la lista (o si el catálogo ya no la tiene), el código.
          { code, name: code, symbol: '' },
      )
    : loaded;
  // Mientras el efecto la cambia (o deshabilitado), el select no miente sobre el valor.
  if (outside) allowed.unshift(loaded.find((c) => c.code === value) ?? { code: value, name: value, symbol: '' });
  const options = exclude?.length ? allowed.filter((c) => !exclude.includes(c.code)) : allowed;

  return (
    <NativeSelect
      selectClassName={className}
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={className}
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
    </NativeSelect>
  );
}
