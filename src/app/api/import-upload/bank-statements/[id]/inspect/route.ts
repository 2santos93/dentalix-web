import { forwardImportUpload } from '@/lib/patient-imports/import-upload-proxy';

/**
 * DX-571: el extracto del banco (paso «inspect») de una cuenta de conciliación,
 * en streaming a la API por la misma razón que la importación de pacientes
 * (tope de 1 MB del proxy `/api/v1`, DX-259). El id solo pasa si es un UUID;
 * la cuenta, la clínica y el rol (solo ADMIN) los comprueba la API.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return forwardImportUpload(req, { bankStatement: { accountId: id, step: 'inspect' } });
}
