import { forwardImportUpload } from '@/lib/patient-imports/import-upload-proxy';

/**
 * Paso 2 de la importación de pacientes (DX-107): el archivo y el mapeo, en
 * streaming a `POST /patient-imports` (dry-run) de la API. Fuera de `/api/v1`
 * a propósito: ver `import-upload-proxy.ts` (tope de 1 MB del proxy, DX-259).
 */
export function POST(req: Request): Promise<Response> {
  return forwardImportUpload(req, 'validate');
}
