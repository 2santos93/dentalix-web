import { apiFetch } from '@/lib/api/client';
import { uploadToStorage } from '@/lib/api/upload';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// Documentos del paciente (DX-151): radiografías, fotos, remisiones,
// consentimientos firmados en papel e informes. Las formas salen del Swagger
// de la API.
export type PatientDocumentCategory = components['schemas']['PatientDocumentCategory'];

/**
 * `inlineViewable`: PDF, JPEG y PNG se ven en la web; DOCX, DICOM y HEIC solo
 * se descargan. `clinicalDate` es la fecha de la toma (`YYYY-MM-DD`) o null.
 */
export type PatientDocument = components['schemas']['PatientDocumentDto'];

export type PatientDocumentUrl = components['schemas']['PatientDocumentUrlDto'];

export type PatientDocumentDisposition = PatientDocumentUrl['disposition'];

export const PATIENT_DOCUMENT_CATEGORY_LABELS: Record<PatientDocumentCategory, string> = {
  XRAY: 'Radiografía',
  PHOTO: 'Foto',
  REFERRAL: 'Remisión',
  SIGNED_CONSENT: 'Consentimiento firmado',
  REPORT: 'Informe',
  OTHER: 'Otro',
};

export const PATIENT_DOCUMENT_CATEGORIES = Object.keys(
  PATIENT_DOCUMENT_CATEGORY_LABELS,
) as PatientDocumentCategory[];

/** Máximo por fichero: el mismo que la API (413 por encima). */
export const MAX_PATIENT_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** Lista blanca de la API (detección por contenido): extensión → tipo. */
const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dcm: 'application/dicom',
};

const ALLOWED_MIME_TYPES = new Set([...Object.values(ALLOWED_EXTENSIONS), 'image/jpg']);

/** Valor del `accept` del selector de ficheros. */
export const PATIENT_DOCUMENT_ACCEPT = [
  ...Object.keys(ALLOWED_EXTENSIONS).map((ext) => `.${ext}`),
  ...Array.from(new Set(Object.values(ALLOWED_EXTENSIONS))),
].join(',');

export const patientDocumentFileCopy = {
  allowed: 'PDF, JPG, PNG, HEIC (se convierte a JPG), Word (.docx) y DICOM, hasta 20 MB por archivo.',
  tooLarge: 'El archivo supera el máximo de 20 MB.',
  unsupported: 'Tipo de archivo no admitido. Sube PDF, JPG, PNG, HEIC, Word (.docx) o DICOM.',
  empty: 'El archivo está vacío.',
};

function extensionOf(name: string): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(name);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Pre-chequeo en el navegador, ANTES de pedir nada a la API: tamaño y tipo.
 * Devuelve el error en español o null. La API vuelve a comprobarlo todo por
 * contenido. Un DICOM sin extensión ni tipo (`IM000001`) pasa: lo decide ella.
 */
export function validatePatientDocumentFile(file: { name: string; type: string; size: number }): string | null {
  if (file.size > MAX_PATIENT_DOCUMENT_BYTES) return patientDocumentFileCopy.tooLarge;
  if (file.size === 0) return patientDocumentFileCopy.empty;
  const ext = extensionOf(file.name);
  const mime = file.type.toLowerCase();
  const extOk = ext !== null && ext in ALLOWED_EXTENSIONS;
  const mimeOk = mime !== '' && ALLOWED_MIME_TYPES.has(mime);
  if (extOk || mimeOk || (ext === null && mime === '')) return null;
  return patientDocumentFileCopy.unsupported;
}

/** «512 KB», «1,5 MB». */
export function formatFileSize(bytes: number): string {
  const n = (v: number) => v.toLocaleString('es-CO', { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${n(bytes / 1024)} KB`;
  return `${n(bytes / (1024 * 1024))} MB`;
}

/** Leer y subir: los cuatro roles. */
export function canUploadPatientDocuments(role: ClinicRole | null): boolean {
  return role !== null;
}

/**
 * Anula quien lo subió o un ADMIN, y solo uno vivo. Solo decide qué se PINTA:
 * la API vuelve a comprobarlo (403/409).
 */
export function canVoidPatientDocument(
  role: ClinicRole | null,
  doc: { voidedAt: string | null; uploadedById: string },
  userId: string | null,
): boolean {
  if (role === null || doc.voidedAt !== null) return false;
  return role === 'ADMIN' || (userId !== null && doc.uploadedById === userId);
}

function documentsPath(patientId: string, suffix = ''): string {
  return `/patients/${encodeURIComponent(patientId)}/documents${suffix}`;
}

export interface PatientDocumentFilters {
  category?: PatientDocumentCategory | null;
  tooth?: string | null;
}

/** `GET /patients/:id/documents?category=&tooth=` — más reciente primero, anulados incluidos. */
export function listPatientDocuments(
  token: string,
  patientId: string,
  filters: PatientDocumentFilters = {},
): Promise<PatientDocument[]> {
  const search = new URLSearchParams();
  if (filters.category) search.set('category', filters.category);
  if (filters.tooth) search.set('tooth', filters.tooth);
  const query = search.toString();
  return apiFetch<PatientDocument[]>(documentsPath(patientId, query ? `?${query}` : ''), { token });
}

export interface UploadPatientDocumentInput {
  file: File;
  category: PatientDocumentCategory;
  clinicalDate?: string | null;
  toothNumbers?: string[];
  notes?: string | null;
}

/** La autorización de subida directa al almacén (DX-259). */
export type PatientDocumentUploadTicket = components['schemas']['PatientDocumentUploadDto'];

/** SHA-256 del fichero en hex: el almacén rechaza un contenido con otra huella. */
export async function sha256HexOf(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sube un documento a la ficha DIRECTAMENTE al almacén (DX-259), con
 * progreso (0..1) de la subida:
 *
 * 1. `POST …/documents/upload-url` (por el proxy `/api/v1`, cuerpo pequeño):
 *    tamaño y SHA-256; la API responde el POST prefirmado del bucket (clave,
 *    tope de 20 MB y huella firmados) y el id del documento.
 * 2. El fichero va al bucket por XHR, sin pasar por el proxy de Next ni por
 *    la API.
 * 3. `POST …/documents/:id/complete` con la categoría, dientes, fecha y
 *    notas: la API comprueba tamaño, huella y tipo por contenido y crea el
 *    documento (o responde 400 en español y lo borra).
 */
export async function uploadPatientDocument(
  token: string,
  patientId: string,
  input: UploadPatientDocumentInput,
  opts: { onProgress?: (fraction: number) => void } = {},
): Promise<PatientDocument> {
  const { file } = input;
  const request: components['schemas']['CreatePatientDocumentUploadDto'] = {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    sha256: await sha256HexOf(file),
  };
  const ticket = await apiFetch<PatientDocumentUploadTicket>(documentsPath(patientId, '/upload-url'), {
    method: 'POST',
    token,
    body: request,
  });
  // El último tramo (comprobar y crear) es rápido: la barra llega a 1 al final.
  await uploadToStorage(ticket, file, { onProgress: (p) => opts.onProgress?.(Math.min(p, 0.99)) });
  const notes = input.notes?.trim();
  const fields: components['schemas']['CompletePatientDocumentUploadDto'] = {
    category: input.category,
    fileName: file.name,
    mimeType: file.type,
    ...(input.clinicalDate ? { clinicalDate: input.clinicalDate } : {}),
    ...(input.toothNumbers && input.toothNumbers.length > 0 ? { toothNumbers: input.toothNumbers } : {}),
    ...(notes ? { notes } : {}),
  };
  const doc = await apiFetch<PatientDocument>(
    documentsPath(patientId, `/${encodeURIComponent(ticket.documentId)}/complete`),
    { method: 'POST', token, body: fields },
  );
  opts.onProgress?.(1);
  return doc;
}

/**
 * URL firmada y de vida corta: `inline` para verla (PDF, JPG, PNG) y
 * `attachment` para descargarla. Cada una queda auditada en la API.
 */
export function getPatientDocumentUrl(
  token: string,
  patientId: string,
  id: string,
  disposition: PatientDocumentDisposition,
): Promise<PatientDocumentUrl> {
  const route = disposition === 'inline' ? 'inline' : 'download';
  return apiFetch<PatientDocumentUrl>(
    documentsPath(patientId, `/${encodeURIComponent(id)}/url/${route}`),
    { token },
  );
}

/** `POST /patients/:id/documents/:docId/void` — motivo obligatorio. */
export function voidPatientDocument(
  token: string,
  patientId: string,
  id: string,
  reason: string,
): Promise<PatientDocument> {
  return apiFetch<PatientDocument>(documentsPath(patientId, `/${encodeURIComponent(id)}/void`), {
    method: 'POST',
    body: { reason },
    token,
  });
}

/** Imagen que el visor pinta con `<img>`; el resto inline (PDF), en `<iframe>`. */
export function isImageDocument(doc: { mimeType: string }): boolean {
  return doc.mimeType === 'image/jpeg' || doc.mimeType === 'image/png';
}
