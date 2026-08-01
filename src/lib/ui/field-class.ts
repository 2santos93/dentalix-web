// Shared Tailwind class string for text-like form fields (input/select/
// textarea) across the app — extracted so every clinical form control looks
// consistent without copy-pasting the class list everywhere.
export const fieldClass =
  'flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';
