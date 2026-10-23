import { forwardImportUpload } from '@/lib/patient-imports/import-upload-proxy';

/**
 * Hoja de saldos «Saldo migrado» de un lote validado (DX-262): en streaming a
 * `POST /patient-imports/:id/balances` de la API, por la misma razón que los
 * pasos del asistente (tope de 1 MB del proxy `/api/v1`, DX-259). El id solo
 * pasa si es un UUID; el lote, la clínica y el rol los comprueba la API.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return forwardImportUpload(req, { balancesOf: id });
}
