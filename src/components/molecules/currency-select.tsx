'use client';
import { useEffect, useState } from 'react';
import { listCurrencies, type Currency } from '@/lib/reference/currencies-api';
import { cn } from '@/lib/utils';

// Same native-control fieldClass convention as patient-form.tsx / treatment-plans-tab.tsx.
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

interface CurrencySelectProps {
  id: string;
  token: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
  /** Accessible name for call sites with no adjacent `<label>` (e.g. a `FormField`-less select next to a button). Optional — omit when a `<label htmlFor>` already provides one. */
  ariaLabel?: string;
}

export function CurrencySelect({ id, token, value, onChange, disabled, className, ariaLabel }: CurrencySelectProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCurrencies(token)
      .then((data) => {
        if (!cancelled) setCurrencies(data);
      })
      .catch(() => {
        /* fail soft — keep the current value selectable below */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Until the list loads (or if it fails), keep `value` selectable so the
  // control is never empty and never loses the current selection.
  const options = currencies.length > 0 ? currencies : [{ code: value, name: value, symbol: '' }];

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(fieldClass, className)}
      aria-label={ariaLabel}
    >
      {options.map((c) => (
        <option key={c.code} value={c.code}>
          {c.symbol ? `${c.name} (${c.symbol})` : c.name}
        </option>
      ))}
    </select>
  );
}
