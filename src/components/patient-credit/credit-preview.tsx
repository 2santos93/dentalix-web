import { creditPreviewCopy } from './credit-balance';

/** Vista previa del saldo resultante (DX-253), como registro etiqueta/cifra. */
export function CreditPreview({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <section
      aria-label={creditPreviewCopy.previewTitle}
      aria-live="polite"
      className="rounded-lg border border-border bg-surface-2"
    >
      <dl className="divide-y divide-hairline">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
            <dt className="min-w-0 break-words text-muted">{row.label}</dt>
            <dd className="shrink-0 font-medium tabular-nums text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
