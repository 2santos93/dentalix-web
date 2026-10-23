/**
 * DX-259 (OPS-038): el avatar sube por el proxy `/api/v1` de la web, que
 * copia como mucho 1 MB del cuerpo (`API_PROXY_MAX_BODY_BYTES`). Una foto más
 * pesada (las del móvil pasan de 2 MB) se reduce en el navegador a 512 px de
 * lado y JPEG antes de subirla: el avatar se pinta a 40–96 px, así que no se
 * pierde nada a la vista.
 */

/** Por debajo de esto el fichero sube tal cual (deja sitio al multipart). */
export const AVATAR_UPLOAD_MAX_BYTES = 900 * 1024;
/** Lado mayor de la foto reducida. */
export const AVATAR_MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;

/** No se pudo dejar la foto por debajo del tope (formato ilegible, etc.). */
export class AvatarResizeError extends Error {
  constructor() {
    super('Avatar could not be resized');
    this.name = 'AvatarResizeError';
  }
}

/** Reduce `file` a `maxDimension` px de lado en JPEG; null si el navegador no puede. */
export type AvatarEncoder = (file: File, maxDimension: number) => Promise<Blob | null>;

/** Lienzo del navegador: fondo blanco (un PNG transparente no queda negro). */
export const canvasEncoder: AvatarEncoder = async (file, maxDimension) => {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  } finally {
    bitmap.close();
  }
};

/**
 * El fichero a subir como avatar: el mismo si ya cabe; si no, la versión
 * reducida en JPEG. `AvatarResizeError` si no se puede dejar por debajo del
 * tope.
 */
export async function prepareAvatarFile(file: File, encode: AvatarEncoder = canvasEncoder): Promise<File> {
  if (file.size <= AVATAR_UPLOAD_MAX_BYTES) return file;
  let blob: Blob | null;
  try {
    blob = await encode(file, AVATAR_MAX_DIMENSION);
  } catch {
    throw new AvatarResizeError();
  }
  if (!blob || blob.size === 0 || blob.size > AVATAR_UPLOAD_MAX_BYTES) throw new AvatarResizeError();
  const base = file.name.replace(/\.[^.]*$/, '') || 'avatar';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
