/**
 * Iniciales para el avatar (máx. 2 letras, en mayúscula). Con apellido aparte
 * (pacientes): primera del nombre + primera del apellido, así «María José
 * Pérez» es «MP». Con un nombre completo (personal): primeras de las dos
 * primeras palabras.
 */
export function initials(name: string, lastName?: string): string {
  const first = (s: string | undefined) => (s?.trim().charAt(0) ?? '').toLocaleUpperCase('es');
  if (lastName !== undefined) return `${first(name)}${first(lastName)}`;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => first(w))
    .join('');
}
