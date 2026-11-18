/**
 * DX-560 · Las rutas de «Presentar», en un módulo sin dependencias: la ficha
 * (`PlanQuoteActions`) solo carga esto, no la pantalla ni su modelo.
 */

/** Las tres vistas (`?vista=`). */
export type PresentationMode = 'completa' | 'clinica' | 'economica';

export const PRESENTATION_VIEW_PARAM = 'vista';

/** `?aceptar=1` en la ficha: abre «Aceptar con firma» del plan de `?planId=`. */
export const ACCEPT_PARAM = 'aceptar';

/** Mismo nombre que `FINANCING_PARAM` (`installment-simulation`), sin cargar ese módulo. */
const FINANCING_QUERY = 'cuotas';

/**
 * Ruta de «Presentar» (fuera del shell). `financing` es el `?cuotas=` ya
 * codificado (`encodeFinancing`) de lo que se simuló en «Financiar».
 */
export function planPresentHref(
  patientId: string,
  planId: string,
  options: { financing?: string | null; mode?: PresentationMode } = {},
): string {
  const params = new URLSearchParams();
  if (options.mode && options.mode !== 'completa') params.set(PRESENTATION_VIEW_PARAM, options.mode);
  if (options.financing) params.set(FINANCING_QUERY, options.financing);
  const query = params.toString();
  return `/presentar/patients/${encodeURIComponent(patientId)}/treatment-plans/${encodeURIComponent(planId)}${
    query ? `?${query}` : ''
  }`;
}

/** Vuelta a la ficha, en la pestaña del plan con ese plan elegido (y, si se pide, la aceptación abierta). */
export function planTabHref(patientId: string, planId: string, options: { accept?: boolean } = {}): string {
  const params = new URLSearchParams({ tab: 'treatment-plans', planId });
  if (options.accept) params.set(ACCEPT_PARAM, '1');
  return `/patients/${encodeURIComponent(patientId)}?${params.toString()}`;
}
