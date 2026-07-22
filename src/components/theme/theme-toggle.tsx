'use client';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label="Cambiar tema"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="rounded-md border border-border bg-surface px-3 py-2 text-ink hover:bg-bg"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
