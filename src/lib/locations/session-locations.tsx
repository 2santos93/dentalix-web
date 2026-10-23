'use client';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { listLocations, type ClinicLocation } from './locations-api';

interface SessionLocations {
  token: string | null;
  load: () => Promise<ClinicLocation[]>;
}
const LocationsContext = createContext<SessionLocations | null>(null);

/** Una lectura de sedes para los consumidores del shell, solo en memoria. */
export function SessionLocationsProvider({ token, children }: { token: string | null; children: ReactNode }) {
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
  }, [token]);
  return <LocationsContext.Provider value={resource}>{children}</LocationsContext.Provider>;
}

export function useSessionLocations(token: string | null): () => Promise<ClinicLocation[]> {
  const shared = useContext(LocationsContext);
  return useCallback(() => {
    if (shared?.token === token) return shared.load();
    return token ? listLocations(token) : Promise.resolve([]);
  }, [shared, token]);
}
