/**
 * Textos de la imputación de abonos (DX-051) que comparten el plan de
 * tratamiento (ADMIN), su modal «Imputar abono» y el «Ver por ítem» del estado
 * de cuenta (recepción): mismos datos, misma redacción.
 */
export const allocationCopy = {
  // Columnas de las tablas de ítems del «Ver por ítem» y del modal «Imputar abono».
  colProcedure: 'Procedimiento',
  colTooth: 'Diente',
  colStatus: 'Estado',
  // DX-291: un cargo administrativo no tiene diente.
  noTooth: 'Sin diente',
  // Lo cobrado que todavía no cubre ningún ítem del plan.
  unallocated: 'Sin imputar',
  unallocatedHelp: 'Abonos que todavía no cubren ningún ítem.',
  // Abonos sin tasa para su fecha: no tienen base y no se imputan (R15).
  unconvertedNotice: (n: number) =>
    n === 1
      ? '1 abono todavía sin convertir a la moneda del plan: no se imputa a ítems.'
      : `${n} abonos todavía sin convertir a la moneda del plan: no se imputan a ítems.`,
  // DX-399: la regla con que se imputó un abono y lo que queda sin imputar.
  ruleAuto: 'Automática (más antiguo primero)',
  ruleAutoHelp: 'Se reparte sola: primero lo realizado y del abono más antiguo al más reciente.',
  ruleManual: 'Manual',
  ruleManualHelp: 'Un administrador fijó a qué ítems va; el reparto automático no lo toca.',
  onAccount: 'A cuenta',
  onAccountHelp: 'Todavía no cubre ningún ítem del plan.',
};

/** La regla de una imputación: `manual` es el abono fijado a mano por un ADMIN (DX-051). */
export function allocationRule(manual: boolean): { label: string; help: string } {
  return manual
    ? { label: allocationCopy.ruleManual, help: allocationCopy.ruleManualHelp }
    : { label: allocationCopy.ruleAuto, help: allocationCopy.ruleAutoHelp };
}
