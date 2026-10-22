'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '@/lib/api/client';
import { getRdaReadinessBatch, type RdaReadiness } from '@/lib/patients/clinical-api';
import { getActiveLocationId, onLocationChange } from '@/lib/locations/location-store';

export type RdaState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'forbidden' }
  | { status: 'loaded'; data: RdaReadiness };

type Session = { identity: string; requested: Set<string>; active: boolean };

/** Un lote de hasta50 por grupo de evoluciones nuevas; tabla y tarjetas comparten estado. */
export function useRdaReadiness(token: string, patientId: string, entryIds: readonly string[]) {
  const locationId = useSyncExternalStore(onLocationChange, getActiveLocationId, () => null);
  const identity = JSON.stringify([token, patientId, locationId]);
  const [snapshot, setSnapshot] = useState<{ identity: string; byId: Record<string, RdaState> }>({ identity, byId: {} });
  const session = useRef<Session | null>(null);

  const load = useCallback((ids: string[], current: Session) => {
    ids.forEach((id) => current.requested.add(id));
    function update(states: Record<string, RdaState>) {
      if (!current.active || session.current !== current) return;
      setSnapshot((prev) => ({ identity, byId: { ...(prev.identity === identity ? prev.byId : {}), ...states } }));
    }
    update(Object.fromEntries(ids.map((id) => [id, { status: 'loading' }])));
    getRdaReadinessBatch(token, patientId, ids).then((rows) => {
      const byId = new Map(rows.map(({ entryId, ...data }) => [entryId, data]));
      update(Object.fromEntries(ids.map((id) => [id, byId.has(id) ? { status: 'loaded', data: byId.get(id)! } : { status: 'error' }])));
    }).catch((err: unknown) => {
      const status = err instanceof ApiError && err.status === 403 ? 'forbidden' : 'error';
      update(Object.fromEntries(ids.map((id) => [id, { status }])));
    });
  }, [token, patientId, identity]);

  useEffect(() => {
    const current: Session = { identity, requested: new Set(), active: true };
    session.current = current;
    return () => { current.active = false; };
  }, [identity]);

  const key = [...new Set(entryIds)].join(',');
  useEffect(() => {
    function loadNew() {
      const current = session.current;
      if (!current || !current.active || current.identity !== identity) return;
      const ids = (key ? key.split(',') : []).filter((id) => !current.requested.has(id));
      for (let i = 0; i < ids.length; i += 50) load(ids.slice(i, i + 50), current);
    }
    loadNew();
  }, [key, identity, load]);

  const stateOf = useCallback((id: string): RdaState => snapshot.identity === identity ? snapshot.byId[id] ?? { status: 'loading' } : { status: 'loading' }, [snapshot, identity]);
  const retry = useCallback((id: string) => {
    const current = session.current;
    if (current?.active && current.identity === identity && (key ? key.split(',') : []).includes(id)) load([id], current);
  }, [identity, key, load]);
  return { stateOf, retry };
}
