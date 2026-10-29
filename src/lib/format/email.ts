/**
 * Un email como lo acepta `@IsEmail()` de la API (validator.js con sus
 * opciones por defecto): parte local de caracteres de átomo separados por
 * puntos sueltos, dominio de etiquetas alfanuméricas (sin guion al borde) y
 * un dominio de nivel superior de al menos dos letras. Así «ana@x» y «ana@»
 * se paran en el campo y no llegan como un 400 genérico. Más estricto en un
 * solo caso: no admite partes locales entre comillas («"ana"@x.co»).
 */
const LOCAL_PART = /^[a-z\d!#$%&'*+\-/=?^_`{|}~¡-퟿豈-﷏ﷰ-￯]+$/i;
const DOMAIN_LABEL = /^[a-z¡-￿\d-]+$/i;
const TLD = /^(?:[a-z¡-¨ª-퟿豈-﷏ﷰ-￯]{2,}|xn[a-z\d-]{2,})$/i;
/** Formas de ancho completo: validator.js las rechaza en el dominio. */
const FULL_WIDTH = /[！-～]/;

/** Bytes en UTF-8, como mide validator.js las dos partes. */
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function isEmailAddress(value: string): boolean {
  const at = value.lastIndexOf('@');
  if (at <= 0) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (utf8Bytes(local) > 64 || utf8Bytes(domain) > 254) return false;
  if (!local.split('.').every((part) => LOCAL_PART.test(part))) return false;
  const labels = domain.split('.');
  const tld = labels[labels.length - 1];
  if (labels.length < 2 || !TLD.test(tld)) return false;
  return labels.every(
    (label) =>
      label.length <= 63 &&
      DOMAIN_LABEL.test(label) &&
      !FULL_WIDTH.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-'),
  );
}
