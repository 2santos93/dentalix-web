/**
 * Textos de la imputación de abonos (DX-051) que comparten el plan de
 * tratamiento (ADMIN) y el «Ver por ítem» del estado de cuenta (recepción):
 * mismos datos de `GET /treatment-plans/:id/balance`, misma redacción.
 */
export const allocationCopy = {
  // Lo cobrado que todavía no cubre ningún ítem del plan.
  unallocated: 'Sin imputar',
  unallocatedHelp: 'Abonos que todavía no cubren ningún ítem.',
  // Abonos sin tasa para su fecha: no tienen base y no se imputan (R15).
  unconvertedNotice: (n: number) =>
    n === 1
      ? '1 abono todavía sin convertir a la moneda del plan: no se imputa a ítems.'
      : `${n} abonos todavía sin convertir a la moneda del plan: no se imputan a ítems.`,
};
