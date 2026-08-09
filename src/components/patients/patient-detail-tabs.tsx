'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

export type PatientDetailTabKey = 'data' | 'clinical-history' | 'odontogram' | 'treatment-plans';

interface PatientDetailTabsProps {
  activeTab: PatientDetailTabKey;
  onTabChange: (tab: PatientDetailTabKey) => void;
  tablistLabel: string;
  dataLabel: string;
  clinicalHistoryLabel: string;
  odontogramLabel: string;
  treatmentPlansLabel: string;
}

/** Left-to-right reading order of the tablist — the order the arrow keys walk. */
const TAB_ORDER: PatientDetailTabKey[] = [
  'data',
  'clinical-history',
  'odontogram',
  'treatment-plans',
];

/**
 * The tab keys double as the `?tab=` search-param values (see
 * `patients/[id]/page.tsx`), so the page needs a way to tell a real key from
 * whatever a hand-edited or stale URL carries. Lives here, next to the union
 * it guards, so adding a tab can't leave the parser behind.
 */
export function isPatientDetailTabKey(value: string | null | undefined): value is PatientDetailTabKey {
  return value != null && (TAB_ORDER as string[]).includes(value);
}

/**
 * ARIA tabs for the patient-detail page ("Datos" / "Historia clínica" /
 * "Odontograma" / "Plan de tratamiento").
 *
 * Implements the real tab pattern, because the markup claims it: `role="tab"`
 * makes a screen reader announce "Datos, pestaña, 1 de 4", which is a promise
 * that the arrow keys move between the four. So:
 *
 * - Roving tabindex: exactly ONE tab is in the Tab order (the focused one, or
 *   the selected one before any interaction), so Tab enters the tablist and
 *   the next Tab leaves it for the panel instead of walking all four.
 * - Left/Right wrap around, Home/End jump to the ends, and DOM focus follows.
 * - MANUAL activation: the arrows only move focus; Enter/Space (native to
 *   `<button>`) and click select. Automatic activation is the APG default, but
 *   three of the four panels fetch on mount (see `patients/[id]/page.tsx`), so
 *   arrowing across the tablist would fire three requests the user never asked
 *   for — exactly the case where the APG prescribes manual activation.
 *
 * The page moves focus into the newly selected panel on activation; that does
 * not fight the arrows, because arrowing never activates anything.
 */
export function PatientDetailTabs({
  activeTab,
  onTabChange,
  tablistLabel,
  dataLabel,
  clinicalHistoryLabel,
  odontogramLabel,
  treatmentPlansLabel,
}: PatientDetailTabsProps) {
  const labels: Record<PatientDetailTabKey, string> = {
    data: dataLabel,
    'clinical-history': clinicalHistoryLabel,
    odontogram: odontogramLabel,
    'treatment-plans': treatmentPlansLabel,
  };

  // `null` until the user interacts: the tabbable tab then falls back to the
  // selected one. Kept as a derived value instead of an effect syncing state
  // to `activeTab` (same shape as `OdontogramChart`'s roving tabindex).
  const [focusedTab, setFocusedTab] = useState<PatientDetailTabKey | null>(null);
  const focused = focusedTab ?? activeTab;
  const buttons = useRef(new Map<PatientDetailTabKey, HTMLButtonElement>());

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = TAB_ORDER.indexOf(focused);
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (current + 1) % TAB_ORDER.length;
        break;
      case 'ArrowLeft':
        nextIndex = (current - 1 + TAB_ORDER.length) % TAB_ORDER.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = TAB_ORDER.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = TAB_ORDER[nextIndex];
    setFocusedTab(next);
    buttons.current.get(next)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={tablistLabel}
      onKeyDown={handleKeyDown}
      className="flex gap-2 border-b border-border"
    >
      {TAB_ORDER.map((tab) => {
        const selected = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`tab-${tab}`}
            ref={(el) => {
              if (el) buttons.current.set(tab, el);
              else buttons.current.delete(tab);
            }}
            tabIndex={focused === tab ? 0 : -1}
            aria-selected={selected}
            aria-controls={`tabpanel-${tab}`}
            // Keeps the roving stop on whatever the user actually reached,
            // including a mouse click or a Shift+Tab back from the panel.
            onFocus={() => setFocusedTab(tab)}
            onClick={() => onTabChange(tab)}
            className={`px-4 py-2 text-sm font-medium ${
              selected ? 'border-b-2 border-primary text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {labels[tab]}
          </button>
        );
      })}
    </div>
  );
}
