/**
 * DX-387: el teléfono que se muestra en la cabecera, la ficha, los
 * responsables, las listas y las sedes: `phoneInternational ?? phone`. El
 * formato lo calcula la API con su adaptador y la región de la sede; si no lo
 * pudo leer (o la API es anterior), el guardado tal cual. La web no formatea
 * nunca un número (guarda de DX-329).
 */
export function displayPhone(item: { phone: string | null; phoneInternational?: string | null }): string | null {
  return item.phoneInternational ?? (item.phone || null);
}
