/**
 * Edad en años cumplidos; `null` si no hay fecha de nacimiento o si no se
 * puede leer.
 *
 * `birthDate` es una fecha civil (se guarda como medianoche UTC del día
 * elegido, ver `formatCivilDate`), así que se lee con getters UTC — usar
 * getters locales aquí hace que la edad caiga un día antes de la fecha real
 * al oeste de UTC.
 *
 * Vivía dentro de `patient-data-panel.tsx`. Se extrae aquí porque la cabecera
 * de la ficha (`patient-record-header.tsx`) muestra la misma edad: la
 * decisión clínica (dosis, dentición temporal vs. permanente, si hace falta
 * tutor) no puede depender de abrir una pestaña.
 */
export function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getUTCFullYear();
  const monthDiff = now.getMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getUTCDate())) age -= 1;
  return age;
}
