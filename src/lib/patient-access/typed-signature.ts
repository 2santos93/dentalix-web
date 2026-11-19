/**
 * DX-101-bis: la firma «Escribir mi nombre» del portal (el camino por teclado,
 * sin dibujar). El nombre se pinta en un lienzo con una tipografía manuscrita
 * DEL SISTEMA (nada que descargar) y se entrega como PNG, el mismo formato que
 * el lienzo de dibujo (`SignaturePad`): tinta fija sobre fondo transparente,
 * que es lo que la API comprueba («con tinta», ≤ 200 KB, ≤ 4096×1024).
 */

/** Tinta de la firma: la misma que `SignaturePad` (se imprime igual en claro y oscuro). */
export const TYPED_SIGNATURE_INK = '#111827';

/**
 * Tipografías manuscritas habituales (Windows, macOS/iOS, Android/Linux), y al
 * final la genérica `cursive`: el navegador siempre resuelve alguna.
 */
export const TYPED_SIGNATURE_FONT_FAMILY =
  '"Segoe Script", "Snell Roundhand", "Bradley Hand", "Brush Script MT", "Dancing Script", cursive';

const HEIGHT = 160;
const MAX_WIDTH = 1200;
const PADDING = 24;
const MAX_FONT_SIZE = 64;
const MIN_FONT_SIZE = 20;

export function typedSignatureFont(size: number): string {
  return `italic ${size}px ${TYPED_SIGNATURE_FONT_FAMILY}`;
}

/**
 * El PNG (`data:image/png;base64,…`) del nombre escrito a mano, o `null` si el
 * nombre está vacío o el navegador no tiene lienzo 2D (la pantalla ofrece
 * entonces «Dibujar»). Un nombre largo encoge la letra hasta caber en
 * `MAX_WIDTH`; el lienzo mide lo justo para el texto.
 */
export function renderTypedSignature(name: string, doc: Document = document): string | null {
  const text = name.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const canvas = doc.createElement('canvas');
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;

  let size = MAX_FONT_SIZE;
  ctx.font = typedSignatureFont(size);
  let width = ctx.measureText(text).width;
  while (width + PADDING * 2 > MAX_WIDTH && size > MIN_FONT_SIZE) {
    size -= 4;
    ctx.font = typedSignatureFont(size);
    width = ctx.measureText(text).width;
  }

  canvas.width = Math.min(MAX_WIDTH, Math.max(320, Math.ceil(width + PADDING * 2)));
  canvas.height = HEIGHT;
  // Cambiar el tamaño del lienzo reinicia el contexto: la letra se fija de nuevo.
  ctx.font = typedSignatureFont(size);
  ctx.fillStyle = TYPED_SIGNATURE_INK;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, PADDING, HEIGHT / 2, canvas.width - PADDING * 2);
  try {
    const url = canvas.toDataURL('image/png');
    return url.startsWith('data:image/png') ? url : null;
  } catch {
    return null;
  }
}
