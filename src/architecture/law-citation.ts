/**
 * Patrones de citas legales que vigilan las guardas de arquitectura y los
 * tests de textos (DX-323, DX-325, DX-369). Las siglas que otra guarda vigila
 * se arman por partes para que este fichero no se delate a sí mismo.
 */

/** Nombres de regímenes de protección de datos y salud, y leyes o decretos con número. */
export const LAW_NAME = new RegExp(
  String.raw`\b(?:h[aá]beas\s+data|lgpd|gdpr|rgpd|hipaa|ccpa|lopdgdd|lopd|lfpdppp|pipeda)\b` +
    String.raw`|\b(?:ley|decreto|reglamento)\s+(?:org[aá]nica\s+|estatutaria\s+|\(ue\)\s+)?(?:n\.?[º°o]\s*)?\d`,
  'i',
);

const NUM = String.raw`(?:n\.?[º°o]\.?\s*|no\.\s*)?`;

/** Regímenes por su sigla y normas con número, en español, inglés y portugués. */
export const LAW_CITATION = new RegExp(
  String.raw`\b(?:h[aá]beas\s+data|lgpd|gdpr|rgpd|hipaa|ccpa|lopdgdd|lopd|lfpdppp|pipeda)\b` +
    String.raw`|\b(?:ley|decreto|reglamento|real\s+decreto|law|lei)\s+(?:org[aá]nica\s+|estatutaria\s+|\(ue\)\s+)?${NUM}\d` +
    String.raw`|\bresoluci[oó]n\s+${NUM}\d+\s*(?:de\s+\d{4}|\/\d{4})` +
    String.raw`|\bley\s+de\s+protecci[oó]n\s+de\s+datos|\bregulation\s+\(eu\)|\bart[ií]culo\s+\d` +
    String.raw`|\b(?:Res|[Aa]rt)\.\s*\d|\bDec\.\s*\d{3,}`,
  'i',
);

/** Autoridades de datos o sanitarias por su sigla o nombre; sensible a mayúsculas. */
export const LAW_AUTHORITY = new RegExp(
  String.raw`\b(?:SIC|IN` +
    String.raw`VIMA|AEPD|AEMPS|ANMAT|COFEPRIS|ANVISA|DIGEMID|INHRR|SACS|ANPD|CNIL)\b` +
    String.raw`|\bRD\s*\d|Superintendencia`,
);

/** Si la línea cita una norma o una autoridad. */
export function citesLaw(line: string): boolean {
  return LAW_CITATION.test(line) || LAW_AUTHORITY.test(line);
}
