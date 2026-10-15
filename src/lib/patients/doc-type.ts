import type { DocType } from './patients-api';

/**
 * Abreviatura del tipo de documento, tal como se lee en el documento real. La
 * usan la tira de identidad de la ficha y el estado de cuenta impreso; el panel
 * de datos muestra el nombre largo («Cédula de ciudadanía»).
 */
export const DOC_TYPE_SHORT: Record<DocType, string> = {
  CC: 'CC',
  TI: 'TI',
  CE: 'CE',
  PASSPORT: 'Pasaporte',
  OTHER: 'Documento',
};
