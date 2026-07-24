'use client';

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

/**
 * ARIA tabs for the patient-detail page ("Datos" / "Historia clínica" /
 * "Odontograma" / "Plan de tratamiento").
 *
 * Uses plain native `<button>` elements (no roving `tabIndex={-1}`) so ALL
 * tabs stay in the natural Tab order and activate on click AND on native
 * Enter/Space (built into `<button>` — no keydown handler needed).
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
  return (
    <div role="tablist" aria-label={tablistLabel} className="flex gap-2 border-b border-border">
      <button
        type="button"
        role="tab"
        id="tab-data"
        aria-selected={activeTab === 'data'}
        aria-controls="tabpanel-data"
        onClick={() => onTabChange('data')}
        className={`px-4 py-2 text-sm font-medium ${
          activeTab === 'data' ? 'border-b-2 border-primary text-ink' : 'text-muted hover:text-ink'
        }`}
      >
        {dataLabel}
      </button>
      <button
        type="button"
        role="tab"
        id="tab-clinical-history"
        aria-selected={activeTab === 'clinical-history'}
        aria-controls="tabpanel-clinical-history"
        onClick={() => onTabChange('clinical-history')}
        className={`px-4 py-2 text-sm font-medium ${
          activeTab === 'clinical-history'
            ? 'border-b-2 border-primary text-ink'
            : 'text-muted hover:text-ink'
        }`}
      >
        {clinicalHistoryLabel}
      </button>
      <button
        type="button"
        role="tab"
        id="tab-odontogram"
        aria-selected={activeTab === 'odontogram'}
        aria-controls="tabpanel-odontogram"
        onClick={() => onTabChange('odontogram')}
        className={`px-4 py-2 text-sm font-medium ${
          activeTab === 'odontogram' ? 'border-b-2 border-primary text-ink' : 'text-muted hover:text-ink'
        }`}
      >
        {odontogramLabel}
      </button>
      <button
        type="button"
        role="tab"
        id="tab-treatment-plans"
        aria-selected={activeTab === 'treatment-plans'}
        aria-controls="tabpanel-treatment-plans"
        onClick={() => onTabChange('treatment-plans')}
        className={`px-4 py-2 text-sm font-medium ${
          activeTab === 'treatment-plans' ? 'border-b-2 border-primary text-ink' : 'text-muted hover:text-ink'
        }`}
      >
        {treatmentPlansLabel}
      </button>
    </div>
  );
}
