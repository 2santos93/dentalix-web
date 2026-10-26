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
};
