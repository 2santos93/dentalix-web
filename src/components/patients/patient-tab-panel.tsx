'use client';
import type { ReactNode } from 'react';
import type { PatientDetailTabKey } from './patient-detail-tabs';

/**
 * A tabpanel that is ALWAYS in the DOM (so every tab's `aria-controls` resolves
 * to a real element, instead of three of the four dangling at any moment) but
 * only mounts its children while it is the active one.
 *
 * That split is deliberate: `OdontogramTab`, `MedicalHistoryPanel`,
 * `ClinicalEntriesList` and `TreatmentPlansTab` all fetch on mount, so
 * rendering every panel eagerly would turn opening a patient into four round
 * trips. The panel element is a bare `<div>` — cheap enough to always exist,
 * and `hidden` keeps it out of both the layout and the accessibility tree.
 *
 * `keepMounted` (DX-151) keeps the children mounted — hidden — while the panel
 * is inactive: the «Documentos» upload queue uses it while it has files not yet
 * uploaded, so switching tabs neither loses the queue nor drops the result of
 * an upload still in flight.
 *
 * `tabIndex={-1}` makes the panel programmatically focusable so activating a
 * tab can drop focus into the content it just revealed.
 */
export function PatientTabPanel({
  tab,
  activeTab,
  register,
  className,
  keepMounted = false,
  children,
}: {
  tab: PatientDetailTabKey;
  activeTab: PatientDetailTabKey;
  register: (tab: PatientDetailTabKey, el: HTMLDivElement | null) => void;
  className?: string;
  keepMounted?: boolean;
  children: ReactNode;
}) {
  const active = activeTab === tab;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tab}`}
      aria-labelledby={`tab-${tab}`}
      ref={(el) => register(tab, el)}
      tabIndex={-1}
      hidden={!active}
      aria-hidden={active ? undefined : true}
      // The layout classes only apply while the panel is showing: a `display`
      // utility (`flex`) would otherwise win over `hidden`'s `display: none`.
      className={active ? className : undefined}
    >
      {active || keepMounted ? children : null}
    </div>
  );
}
