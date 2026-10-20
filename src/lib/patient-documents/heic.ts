/**
 * Fotos HEIC del iPhone (DX-151). El navegador no las pinta, así que se pasan a
 * JPG ANTES de subirlas; `heic2any` (~1 MB de WASM) se carga solo cuando hay
 * una en la cola. Si llega una HEIC a la API se guarda y solo se descarga.
 */
export const HEIC_CONVERSION_ERROR = 'No pudimos convertir la foto HEIC; expórtala como JPG.';

/** Error de conversión con su texto ya en español para la fila de la cola. */
export class HeicConversionError extends Error {
  constructor(public readonly cause: unknown) {
    super(HEIC_CONVERSION_ERROR);
    this.name = 'HeicConversionError';
  }
}

const HEIC_MIME = /^image\/hei[cf](-sequence)?$/i;
const HEIC_EXT = /\.hei[cf]$/i;

export function isHeicFile(file: { name: string; type: string }): boolean {
  return HEIC_MIME.test(file.type) || HEIC_EXT.test(file.name);
}

/** `IMG_0001.HEIC` → `IMG_0001.jpg`. */
function jpegName(name: string): string {
  const base = name.replace(HEIC_EXT, '');
  return `${base || 'foto'}.jpg`;
}

/** Convierte una HEIC a un `File` JPG con el mismo nombre (`.jpg`). */
export async function convertHeicToJpeg(file: File): Promise<File> {
  try {
    const { default: heic2any } = await import('heic2any');
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(result) ? result[0] : result;
    if (!blob) throw new Error('heic2any sin resultado');
    return new File([blob], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch (err) {
    throw new HeicConversionError(err);
  }
}
