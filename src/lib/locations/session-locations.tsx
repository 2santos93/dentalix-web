'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { listLocations, type ClinicLocation } from './locations-api';

interface SessionLocations {
  token: string | null;
  load: () => Promise<ClinicLocation[]>;
}
interface SessionLocationsContext {
  resource: SessionLocations;
  invalidate: () => void;
}
const LocationsContext = createContext<SessionLocationsContext | null>(null);

/**
 * Lector de sedes de la sesión: llamarlo devuelve la lista. `invalidate()`
 * olvida la lectura en memoria y avisa a todos los consumidores, que vuelven a
 * leer `GET /locations` (tras crear o editar una sede: el selector de sede y
 * el aviso D5 se actualizan sin recargar).
 */
export type SessionLocationsLoader = (() => Promise<ClinicLocation[]>) & { invalidate: () => void };

/** Una lectura de sedes para los consumidores del shell, solo en memoria. */
export function SessionLocationsProvider({ token, children }: { token: string | null; children: ReactNode }) {
  // Cada invalidación estrena lectura: el lector cambia de identidad y los
  // efectos que dependen de él vuelven a pedir la lista.
  const [generation, setGeneration] = useState(0);
  const resource = useMemo<SessionLocations>(() => {
    let request: Promise<ClinicLocation[]> | null = null;
    return {
      token,
      load: () => {
        if (!token) return Promise.resolve([]);
        request ??= listLocations(token).catch((error) => {
          request = null; // El fallo no deja un rechazo cacheado: Reintentar vuelve a leer.
          throw error;
        });
        return request;
      },
    };
    // `generation` no se lee: solo fuerza una caché nueva al invalidar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, generation]);
  const invalidate = useCallback(() => setGeneration((g) => g + 1), []);
  const value = useMemo(() => ({ resource, invalidate }), [resource, invalidate]);
  return <LocationsContext.Provider value={value}>{children}</LocationsContext.Provider>;
}

export function useSessionLocations(token: string | null): SessionLocationsLoader {
  const shared = useContext(LocationsContext);
  return useMemo(() => {
    const load = () => {
      if (shared?.resource.token === token) return shared.resource.load();
      return token ? listLocations(token) : Promise.resolve([]);
    };
    // Sin proveedor (o con otro token) no hay caché: cada lectura ya es nueva.
    return Object.assign(load, { invalidate: shared?.invalidate ?? (() => {}) });
  }, [shared, token]);
}
