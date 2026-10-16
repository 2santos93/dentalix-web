'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export type PatientDetailTabKey =
  | 'data'
  | 'clinical-history'
  | 'odontogram'
  | 'perio'
  | 'treatment-plans'
  | 'account-statement'
  | 'consents'
  | 'prescriptions'
  | 'data-consents'
  | 'access-log';

interface PatientDetailTabsProps {
  activeTab: PatientDetailTabKey;
  onTabChange: (tab: PatientDetailTabKey) => void;
  tablistLabel: string;
  dataLabel: string;
  /**
   * «Historia clínica», «Odontograma» y «Plan de tratamiento»: dato CLÍNICO
   * (CLINICAL_ROLES en la API). Sin etiqueta la pestaña no existe: la página no
   * las pasa a recepción, que recibiría un 403 (DX-057).
   */
  clinicalHistoryLabel?: string;
  odontogramLabel?: string;
  treatmentPlansLabel?: string;
  /**
   * Etiqueta de la pestaña «Estado de cuenta». Sin ella la pestaña no existe:
   * es un dato financiero (PAYMENT_ROLES en la API), así que la página solo la
   * pasa a los roles que pueden leerlo.
   */
  accountStatementLabel?: string;
  /** Etiqueta de la pestaña «Autorizaciones» (Ley 1581, DX-037). */
  dataConsentsLabel?: string;
  /** «Consentimientos» (DX-006): sin etiqueta no existe (recepción no la ve). */
  consentsLabel?: string;
  /** «Periodontograma» (DX-007): sin etiqueta no existe (recepción no la ve). */
  perioLabel?: string;
  /** «Recetas» (DX-013): sin etiqueta no existe (recepción no la ve). */
  prescriptionsLabel?: string;
  /** «Accesos» (DX-009): quién vio o cambió la ficha. Solo ADMIN. */
  accessLogLabel?: string;
}

/** Left-to-right reading order of the tablist — the order the arrow keys walk. */
const TAB_ORDER: PatientDetailTabKey[] = [
  'data',
  'clinical-history',
  'odontogram',
  'perio',
  'treatment-plans',
  'account-statement',
  'consents',
  'prescriptions',
  'data-consents',
  'access-log',
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
 * "Odontograma" / "Plan de tratamiento", plus "Estado de cuenta" for the roles
 * that can read payments).
 *
 * Implements the real tab pattern, because the markup claims it: `role="tab"`
 * makes a screen reader announce "Datos, pestaña, 1 de 4", which is a promise
 * that the arrow keys move between the visible tabs. So:
 *
 * - Roving tabindex: exactly ONE tab is in the Tab order (the focused one, or
 *   the selected one before any interaction), so Tab enters the tablist and
 *   the next Tab leaves it for the panel instead of walking all of them.
 * - Left/Right wrap around, Home/End jump to the ends, and DOM focus follows.
 * - MANUAL activation: the arrows only move focus; Enter/Space (native to
 *   `<button>`) and click select. Automatic activation is the APG default, but
 *   most panels fetch on mount (see `patients/[id]/page.tsx`), so
 *   arrowing across the tablist would fire requests the user never asked
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
  accountStatementLabel,
  dataConsentsLabel,
  consentsLabel,
  perioLabel,
  prescriptionsLabel,
  accessLogLabel,
}: PatientDetailTabsProps) {
  const labels: Record<PatientDetailTabKey, string | undefined> = {
    data: dataLabel,
    'clinical-history': clinicalHistoryLabel,
    odontogram: odontogramLabel,
    perio: perioLabel,
    'treatment-plans': treatmentPlansLabel,
    'account-statement': accountStatementLabel,
    'data-consents': dataConsentsLabel,
    consents: consentsLabel,
    prescriptions: prescriptionsLabel,
    'access-log': accessLogLabel,
  };
  // Las pestañas que de verdad se pintan, en orden: las flechas recorren estas.
  const tabs = TAB_ORDER.filter((tab) => labels[tab] !== undefined);

  // `null` until the user interacts: the tabbable tab then falls back to the
  // selected one. Kept as a derived value instead of an effect syncing state
  // to `activeTab` (same shape as `OdontogramChart`'s roving tabindex).
  const [focusedTab, setFocusedTab] = useState<PatientDetailTabKey | null>(null);
  const focused = focusedTab ?? activeTab;
  const buttons = useRef(new Map<PatientDetailTabKey, HTMLButtonElement>());

  // En móvil el tablist se desplaza de lado: la pestaña activa (p. ej. al
  // abrir `?tab=account-statement`) tiene que quedar a la vista, no escondida
  // a la derecha. `?.` porque jsdom no implementa scrollIntoView.
  useEffect(() => {
    buttons.current.get(activeTab)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeTab]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.indexOf(focused);
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (current + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (current - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = tabs[nextIndex];
    setFocusedTab(next);
    buttons.current.get(next)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={tablistLabel}
      onKeyDown={handleKeyDown}
      // Con cinco pestañas no caben en 390px: el tablist se desplaza de lado
      // dentro de su franja y la página nunca crece en horizontal.
      className="flex gap-2 overflow-x-auto border-b border-border"
    >
      {tabs.map((tab) => {
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
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${
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
