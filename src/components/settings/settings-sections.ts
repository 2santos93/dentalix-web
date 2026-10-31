import type { ComponentType } from 'react';
import {
  ArrowLeftRight,
  BadgePercent,
  BellRing,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardClock,
  ClipboardList,
  Clock,
  FileSignature,
  FileUp,
  Globe,
  Handshake,
  History,
  IdCard,
  Landmark,
  LifeBuoy,
  ListOrdered,
  NotebookPen,
  Pill,
  ScanBarcode,
  ShieldCheck,
  UserCheck,
  Wallet,
} from 'lucide-react';
import type { ClinicRole } from '@/lib/me/me-api';
import { canManageConsentTemplates } from '@/lib/consents/consents-api';
import { canManagePrescriptionSettings } from '@/lib/prescriptions/prescriptions-api';
import { canManageAppointmentTypes } from '@/lib/appointments/appointment-types-api';
import { canManagePayers } from '@/lib/payers/payers-api';
import { canManagePriceLists } from '@/lib/price-lists/price-lists-api';
import { canManageAgreements } from '@/lib/agreements/agreements-api';
import { canManageNoteTemplates } from '@/lib/clinical-notes/note-templates-api';
import { canManagePostOpTemplates } from '@/lib/postop/postop-api';
import { canManageReminders } from '@/lib/reminders/reminders-api';
import { canManageDiscounts } from '@/lib/discounts/discounts-api';
import { canManageCashSessions } from '@/lib/cash-sessions/cash-sessions-api';
import { canManageExchangeRates } from '@/lib/exchange/exchange-settings-api';
import { canManageAnamnesisSettings } from '@/lib/clinical/medical-alerts';
import { canManageDocumentTypeNames } from '@/lib/patients/document-type-names-api';
import { canManagePatientSettings } from '@/lib/patients/patient-settings-api';
import { canManageDomains } from '@/lib/domains/domains-api';
import { canImportPatients } from '@/lib/patient-imports/patient-imports-api';
import { canManageLocationCalendar } from '@/lib/locations/location-calendar';
import { canSearchImplantLots } from '@/lib/implants/implants-api';
import { canReadSupportAccesses } from '@/lib/support-accesses/support-accesses-api';
import { canReadAuditLog } from '@/lib/audit/audit-api';

export interface SettingsEntry {
  href: string;
  label: string;
  /** Una línea: para qué sirve la pantalla. */
  description: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Quién ve la entrada, con la misma función que decide la pantalla. Sin
   * `visible`, la ven todos (la leen todos y solo ADMIN cambia). Solo decide
   * qué se PINTA: el rol sale del token y la API sigue respondiendo 403.
   */
  visible?: (role: ClinicRole | null) => boolean;
}

export interface SettingsSection {
  id: string;
  title: string;
  entries: SettingsEntry[];
}

/** Enlace «← Ajustes» de la cabecera de cada pantalla de ajustes. */
export const SETTINGS_BACK = { href: '/settings', label: 'Ajustes' } as const;

/**
 * Índice de Ajustes (DX-282): la única entrada a las pantallas de ajustes de la
 * clínica. Antes vivían en el menú de cuenta, que con 21 entradas ya no cabía
 * en una pantalla de recepción (FE-062).
 *
 * Añadir un ajuste es añadir una línea a la sección que toca. Un test comprueba
 * que toda carpeta de `src/app/(app)/settings` (salvo el perfil) tiene su
 * entrada aquí.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'clinica',
    title: 'Clínica y sedes',
    entries: [
      // G1: alta y edición de sedes (moneda, zona, formato); DX-319: datos legales.
      {
        href: '/settings/sedes',
        label: 'Sedes',
        description: 'Alta de sedes, su país, moneda, zona horaria y formato, sus datos legales y su política de cancelación.',
        icon: Building2,
      },
      // DX-316.
      {
        href: '/settings/calendario',
        label: 'Calendario de la sede',
        description: 'Días hábiles y festivos de cada sede, para los plazos en días hábiles.',
        icon: CalendarDays,
        visible: canManageLocationCalendar,
      },
      // SEC-009.
      {
        href: '/settings/dominios',
        label: 'Dominios propios',
        description: 'Un dominio de la clínica desde el que el equipo entra a Dentalix.',
        icon: Globe,
        visible: canManageDomains,
      },
      // DX-328.
      {
        href: '/settings/mayoria-de-edad',
        label: 'Mayoría de edad',
        description: 'Desde qué edad el paciente recibe sus propios avisos y recibos.',
        icon: UserCheck,
        visible: canManagePatientSettings,
      },
      // DX-327.
      {
        href: '/settings/tipos-de-documento',
        label: 'Nombres de documentos',
        description: 'Cómo se llama cada tipo de documento en tu clínica. Se usa en fichas, recibos, recetas y consentimientos, y al importar pacientes.',
        icon: IdCard,
        visible: canManageDocumentTypeNames,
      },
    ],
  },
  {
    id: 'agenda',
    title: 'Agenda',
    entries: [
      // Aplica a la sede activa del selector de sede.
      {
        href: '/settings/horarios',
        label: 'Horarios',
        description: 'Horario de atención de la sede y turnos de cada profesional.',
        icon: Clock,
      },
      // DX-121.
      {
        href: '/settings/tipos-de-cita',
        label: 'Tipos de cita',
        description: 'Duración y color de cada tipo de cita.',
        icon: CalendarClock,
        visible: canManageAppointmentTypes,
      },
      // DX-026.
      {
        href: '/settings/recordatorios',
        label: 'Recordatorios',
        description: 'Recordatorios por email antes de cada cita, por sede.',
        icon: BellRing,
        visible: canManageReminders,
      },
    ],
  },
  {
    id: 'cobro',
    title: 'Cobro',
    entries: [
      // DX-027.
      {
        href: '/settings/caja',
        label: 'Caja',
        description: 'Cómo se abre y se cierra la caja por turno.',
        icon: Wallet,
        visible: canManageCashSessions,
      },
      // DX-374.
      {
        href: '/settings/tasa-de-cambio',
        label: 'Tasa de cambio',
        description: 'Si la tasa del día la da un proveedor o la registra la clínica, y las tasas registradas.',
        icon: ArrowLeftRight,
        visible: canManageExchangeRates,
      },
      // DX-204.
      {
        href: '/settings/descuentos',
        label: 'Descuentos',
        description: 'Cuánto puede descontar cada rol y cuándo hay que decir el motivo.',
        icon: BadgePercent,
        visible: canManageDiscounts,
      },
      // DX-153.
      {
        href: '/settings/pagadores',
        label: 'Pagadores',
        description: 'Aseguradoras, planes prepago y demás entidades que pagan por el paciente.',
        icon: Landmark,
        visible: canManagePayers,
      },
      // DX-105.
      {
        href: '/settings/convenios',
        label: 'Convenios',
        description: 'Condiciones pactadas con un pagador: descuento o lista de precios.',
        icon: Handshake,
        visible: canManageAgreements,
      },
      {
        href: '/settings/listas-de-precios',
        label: 'Listas de precios',
        description: 'Precios propios por sede o por convenio.',
        icon: ListOrdered,
        visible: canManagePriceLists,
      },
    ],
  },
  {
    id: 'historia',
    title: 'Historia clínica',
    entries: [
      // DX-247.
      {
        href: '/settings/historia-clinica',
        label: 'Historia clínica',
        description: 'Cuánto vale la anamnesis antes de pedir que se revise.',
        icon: ClipboardClock,
        visible: canManageAnamnesisSettings,
      },
      // DX-170.
      {
        href: '/settings/plantillas-de-evolucion',
        label: 'Plantillas de evolución',
        description: 'Preguntas guía para redactar las evoluciones.',
        icon: NotebookPen,
        visible: canManageNoteTemplates,
      },
      // DX-006.
      {
        href: '/settings/consentimientos',
        label: 'Consentimientos',
        description: 'Plantillas de consentimiento informado que firma el paciente.',
        icon: FileSignature,
        visible: canManageConsentTemplates,
      },
      // DX-013, DX-324.
      {
        href: '/settings/recetas',
        label: 'Recetas',
        description: 'Plantillas y datos que imprime la receta.',
        icon: Pill,
        visible: canManagePrescriptionSettings,
      },
      // DX-222.
      {
        href: '/settings/indicaciones',
        label: 'Indicaciones postoperatorias',
        description: 'Plantillas de indicaciones que se entregan tras un procedimiento.',
        icon: ClipboardList,
        visible: canManagePostOpTemplates,
      },
      // DX-191.
      {
        href: '/settings/implantes',
        label: 'Implantes',
        description: 'Buscar implantes colocados por lote y exportarlos.',
        icon: ScanBarcode,
        visible: canSearchImplantLots,
      },
    ],
  },
  {
    id: 'datos',
    title: 'Datos y seguridad',
    entries: [
      // DX-037: todos la leen; solo ADMIN publica.
      {
        href: '/settings/privacidad',
        label: 'Privacidad de datos',
        description: 'Política de tratamiento de datos que acepta el paciente.',
        icon: ShieldCheck,
      },
      // DX-107.
      {
        href: '/settings/importar-pacientes',
        label: 'Importar pacientes',
        description: 'Traer pacientes y saldos desde una hoja CSV o Excel.',
        icon: FileUp,
        visible: canImportPatients,
      },
      // SEC-008.
      {
        href: '/settings/accesos-de-soporte',
        label: 'Accesos de soporte',
        description: 'Cuándo y por qué entró el soporte de Dentalix a la clínica.',
        icon: LifeBuoy,
        visible: canReadSupportAccesses,
      },
      // DX-009: AUDIT_READ_ROLES (lleva IP y user agent). Antes en la barra
      // lateral; desde M2 aquí, junto a los accesos de soporte.
      {
        href: '/settings/auditoria',
        label: 'Auditoría',
        description: 'Quién vio o cambió qué y cuándo: altas, consultas y cambios de la clínica.',
        icon: History,
        visible: canReadAuditLog,
      },
    ],
  },
];

/** Las secciones con lo que `role` puede abrir; sin entradas, la sección no sale. */
export function visibleSettingsSections(role: ClinicRole | null): SettingsSection[] {
  return SETTINGS_SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => !entry.visible || entry.visible(role)),
  })).filter((section) => section.entries.length > 0);
}
