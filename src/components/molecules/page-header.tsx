import * as React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /**
   * Optional block rendered under the title (and under `description`, when
   * both are present): a compact identity strip, a scope marker, anything
   * that qualifies the title without being a sentence about the page.
   *
   * `description` stays a plain string on purpose — it is the one-line
   * explanation eight pages already pass. This is the structured slot, added
   * for the patient record's header, where the qualifier is a list of values
   * plus a marker rather than prose.
   */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

/** Molecule: the title + optional description/meta + right-aligned actions row. */
export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* `min-w-0` + `break-words`: a long patient name must shrink and wrap
          inside its own column instead of pushing the actions off-screen. */}
      <div className="min-w-0 break-words">
        <h1 className="t-display text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        {meta ? <div className="mt-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
