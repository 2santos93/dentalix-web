'use client';

import { TabBar } from '@/components/ui/tabs';

export type PatientDetailTabKey =
  | 'data'
  | 'clinical-history'
  | 'odontogram'
  | 'perio'
  | 'treatment-plans'
  | 'account-statement'
  | 'consents'
  | 'prescriptions'
  | 'implants'
  | 'documents'
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
  /** Etiqueta de la pestaña «Autorizaciones» (DX-037). */
  dataConsentsLabel?: string;
  /** «Consentimientos» (DX-006): sin etiqueta no existe (recepción no la ve). */
  consentsLabel?: string;
  /** «Periodontograma» (DX-007): sin etiqueta no existe (recepción no la ve). */
  perioLabel?: string;
  /** «Recetas» (DX-013): sin etiqueta no existe (recepción no la ve). */
  prescriptionsLabel?: string;
  /** «Implantes» (DX-191): los cuatro roles (recepción entrega la tarjeta). */
  implantsLabel?: string;
  /** «Documentos» (DX-151): los cuatro roles leen y suben. */
  documentsLabel?: string;
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
  'implants',
  'documents',
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
 * Built on `TabBar` (`ui/tabs`, Radix): the real tab pattern, because the
 * markup claims it — roving tabindex (one tab stop), Left/Right wrap,
 * Home/End jump to the ends, and MANUAL activation: the arrows only move focus; Enter/Space (native to
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
  implantsLabel,
  documentsLabel,
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
    implants: implantsLabel,
    documents: documentsLabel,
    'access-log': accessLogLabel,
  };
  // Las pestañas que de verdad se pintan, en orden: las flechas recorren estas.
  const tabs = TAB_ORDER.filter((tab) => labels[tab] !== undefined);

  // Doce pestañas no caben en 390px: `TabBar` desplaza la franja de lado,
  // desvanece los bordes cuando hay más y mantiene la activa a la vista (p. ej.
  // al abrir `?tab=account-statement`); la página nunca crece en horizontal.
  return (
    <TabBar
      aria-label={tablistLabel}
      value={activeTab}
      onValueChange={onTabChange}
      items={tabs.map((tab) => ({
        value: tab,
        label: labels[tab],
        id: `tab-${tab}`,
        controls: `tabpanel-${tab}`,
      }))}
    />
  );
}
