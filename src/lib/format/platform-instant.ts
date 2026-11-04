/**
 * El instante de la consola de plataforma (DX-354b, E8): `/admin` es personal de
 * Dentalix, sin clínica ni sedes, así que no existe «el formato de la sede». En
 * lugar de caer a la zona o al idioma del navegador, el instante se escribe en
 * ISO 8601 con su zona dicha en voz alta: `2026-11-03 14:05 UTC` (dígitos
 * latinos, sin `Intl`, sin locale y sin getters locales de `Date`). No es un
 * «otro formato» silencioso: lleva la palabra «UTC».
 *
 * Solo lo importa `components/platform/**` (`sede-clock-guard`); cualquier otra
 * pantalla pinta con la sede de su dato.
 */
export function platformInstant(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // `toISOString` es siempre UTC: «2026-11-03T14:05:00.000Z». Los años fuera de 0000–9999 salen con signo y no se pintan.
  const utc = d.toISOString();
  if (!/^\d{4}-/.test(utc)) return '—';
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
}
