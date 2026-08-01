/**
 * Sede activa de la sesión. Vive en localStorage (no en React) porque el
 * cliente HTTP la necesita en CADA request y no puede leer estado de React —
 * mismo criterio que el host de tenant, que también se resuelve fuera del
 * árbol de componentes.
 *
 * `null` = "Todas las sedes": no se manda la cabecera y el backend devuelve la
 * vista consolidada de la clínica.
 */
const KEY = 'dentalix.activeLocationId';
const EVENT = 'dentalix:location-changed';

export function getActiveLocationId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(KEY);
}

export function setActiveLocationId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id) window.localStorage.setItem(KEY, id);
  else window.localStorage.removeItem(KEY);
  // Aviso a los componentes montados: `storage` solo dispara en OTRAS pestañas,
  // así que hace falta un evento propio para refrescar esta.
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Suscripción a cambios de sede (esta pestaña y las demás). */
export function onLocationChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
