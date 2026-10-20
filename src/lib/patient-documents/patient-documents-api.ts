import { apiFetch } from '@/lib/api/client';
import { uploadWithProgress } from '@/lib/api/upload';
import type { ClinicRole } from '@/lib/me/me-api';

// Documentos del paciente (DX-151): radiografías, fotos, remisiones,
// consentimientos firmados en papel e informes.
//
// TODO(DX-151 T7): sustituir por components['schemas'][…] tras npm run codegen
// (PatientDocumentDto, PatientDocumentCategory, PatientDocumentUrlDto). Los
// nombres exportados se mantienen.
export type PatientDocumentCategory = 'XRAY' | 'PHOTO' | 'REFERRAL' | 'SIGNED_CONSENT' | 'REPORT' | 'OTHER';

export interface PatientDocument {
  id: string;
  patientId: string;
  locationId: string;
  category: PatientDocumentCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  /** Fecha clínica `YYYY-MM-DD` (la de la toma), o null. */
  clinicalDate: string | null;
  toothNumbers: string[];
  notes: string | null;
  uploadedById: string;
  uploadedByName: string;
  uploadedAt: string;
  /** PDF, JPEG y PNG se ven en la web; DOCX, DICOM y HEIC solo se descargan. */
  inlineViewable: boolean;
  voidedAt: string | null;
  voidedById: string | null;
  voidedByName: string | null;
  voidReason: string | null;
}

export type PatientDocumentDisposition = 'inline' | 'attachment';

export interface PatientDocumentUrl {
  url: string;
  expiresAt: string;
  disposition: PatientDocumentDisposition;
}

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

/** `POST /patients/:id/documents` multipart, con progreso (0..1). */
export function uploadPatientDocument(
  token: string,
  patientId: string,
  input: UploadPatientDocumentInput,
  opts: { onProgress?: (fraction: number) => void } = {},
): Promise<PatientDocument> {
  const form = new FormData();
  form.append('file', input.file, input.file.name);
  form.append('category', input.category);
  if (input.clinicalDate) form.append('clinicalDate', input.clinicalDate);
  if (input.toothNumbers && input.toothNumbers.length > 0) {
    form.append('toothNumbers', input.toothNumbers.join(','));
  }
  const notes = input.notes?.trim();
  if (notes) form.append('notes', notes);
  return uploadWithProgress<PatientDocument>(documentsPath(patientId), form, {
    token,
    onProgress: opts.onProgress,
  });
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
