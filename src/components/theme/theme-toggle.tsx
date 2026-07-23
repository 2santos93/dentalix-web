'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  // Before mount the resolved theme is unknown (SSR), so render a same-size
  // inert placeholder: the markup matches on hydration and there's no layout shift.
  if (!mounted) {
    return (
      <span
        aria-hidden
        className="inline-flex h-6 w-11 shrink-0 rounded-full border border-border bg-bg"
      />
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Cambiar tema"
      title={isDark ? 'Modo oscuro' : 'Modo claro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isDark ? 'bg-primary' : 'bg-bg'
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[10px] shadow transition-transform ${
          isDark ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      >
        {isDark ? '🌙' : '☀️'}
      </span>
    </button>
  );
}
