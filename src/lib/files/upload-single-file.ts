import { storageOrNetwork, uploadToStorage, type StorageUploadTarget } from '@/lib/api/upload';
import { convertHeicToJpeg, isHeicFile } from '@/lib/patient-documents/heic';
import { sha256HexOf } from '@/lib/patient-documents/patient-documents-api';

/** Lo que la API necesita para autorizar la subida de UN fichero. */
export interface SingleFileUploadRequest {
  name: string;
  mimeType?: string;
  size: number;
  /** SHA-256 en hex: el almacén rechaza un contenido con otra huella. */
  sha256: string;
}

/** La autorización: el `uploadId` que luego se entrega y el POST prefirmado. */
export interface SingleFileUploadTicket {
  uploadId: string;
  target: StorageUploadTarget;
}

/** Qué admite un campo de un fichero (p. ej. el soporte de un gasto). */
export interface SingleFileRules {
  maxBytes: number;
  /** Extensiones en minúscula y sin punto. */
  extensions: readonly string[];
  mimeTypes: readonly string[];
  messages: { tooLarge: string; empty: string; unsupported: string };
}

function extensionOf(name: string): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(name);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Pre-chequeo en el navegador, ANTES de pedir nada a la API: tamaño y tipo por
 * extensión o tipo MIME. Devuelve el error en español o null. La API vuelve a
 * comprobarlo todo por contenido.
 */
export function validateSingleFile(
  file: { name: string; type: string; size: number },
  rules: SingleFileRules,
): string | null {
  if (file.size === 0) return rules.messages.empty;
  if (file.size > rules.maxBytes) return rules.messages.tooLarge;
  const ext = extensionOf(file.name);
  const mime = file.type.toLowerCase();
  if ((ext !== null && rules.extensions.includes(ext)) || rules.mimeTypes.includes(mime)) return null;
  return rules.messages.unsupported;
}

/**
 * Las fotos HEIC del iPhone se pasan a JPG antes de subirlas (el navegador no
 * las pinta). El resto, tal cual. Lanza `HeicConversionError` si no se puede.
 */
export function prepareSingleFile(file: File): Promise<File> {
  return isHeicFile(file) ? convertHeicToJpeg(file) : Promise.resolve(file);
}

export interface UploadSingleFileOptions {
  /** Fracción enviada al almacén (0..1). */
  onProgress?: (fraction: number) => void;
  /** Cancela la subida al almacén: rechaza con `AbortError`. */
  signal?: AbortSignal;
}

/**
 * Sube UN fichero directo al almacén (DX-259) y devuelve su `uploadId`:
 *
 * 1. `requestTicket` pide a la API el POST prefirmado con tamaño y SHA-256.
 * 2. El fichero va al bucket por XHR, sin pasar por el proxy ni por la API.
 *
 * Nada queda asociado hasta que quien llama entrega el `uploadId` (el alta de
 * un gasto, por ejemplo); lo no entregado lo limpia el ciclo de vida del bucket.
 * Si el almacén cortó la subida, `storageOrNetwork` distingue almacén de red.
 */
export async function uploadSingleFile(
  file: File,
  requestTicket: (request: SingleFileUploadRequest) => Promise<SingleFileUploadTicket>,
  opts: UploadSingleFileOptions = {},
): Promise<string> {
  const ticket = await requestTicket({
    name: file.name,
    ...(file.type ? { mimeType: file.type } : {}),
    size: file.size,
    sha256: await sha256HexOf(file),
  });
  try {
    await uploadToStorage(ticket.target, file, { onProgress: opts.onProgress, signal: opts.signal });
  } catch (err) {
    throw await storageOrNetwork(err);
  }
  return ticket.uploadId;
}
