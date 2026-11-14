import type { components } from '@/lib/api/schema';

type ExtraPermission = components['schemas']['ExtraPermission'];

/** DX-090: textos de «Permisos extra» en la ficha del miembro (sin React: también los lee la e2e). */
export const staffPermissionsCopy = {
  title: 'Permisos extra',
  hint: 'Lo que puede hacer además de lo que da su rol, por ejemplo cobrar si la clínica no tiene recepción. Rige al momento; su menú se actualiza cuando recargue la página.',
  adminHint: 'El ADMIN ya tiene todos los permisos.',
  legend: 'Permisos extra del miembro',
  labels: {
    PAYMENT_REGISTER: 'Registrar abonos y operar su caja',
    FINANCIAL_REPORTS_VIEW: 'Ver reportes financieros y la caja',
  } satisfies Record<ExtraPermission, string>,
  descriptions: {
    PAYMENT_REGISTER: 'Registra abonos, abre, cobra y cierra su turno de caja. No anula abonos.',
    FINANCIAL_REPORTS_VIEW: 'Consulta los reportes financieros y la caja de todo el personal, sin cambiar nada.',
  } satisfies Record<ExtraPermission, string>,
  includedInRole: 'Ya lo incluye su rol.',
  granted: (label: string) => `Permiso concedido: ${label}.`,
  revoked: (label: string) => `Permiso retirado: ${label}.`,
  saveError: 'No pudimos guardar el permiso. Intenta de nuevo.',
};
