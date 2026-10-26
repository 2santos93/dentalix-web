'use client';
import { useCallback, useEffect, useState } from 'react';
import { civilDateInZone } from '@/lib/format/date';
import { getLocationSchedule } from '@/lib/locations/schedule-api';

export const expenseZoneError = 'No pudimos obtener la zona horaria de la sede. Reintenta la carga.';
const TIMEOUT_MS = 8000;

/** Fecha civil solo con el horario explícito de la sede; nunca se infiere del país. */
export function useExpenseToday(token: string, locationId: string | null | undefined, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const identity = `${token}|${locationId ?? ''}|${attempt}`;
  const [state, setState] = useState<{ identity: string; zone: string | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    const fail = () => {
      if (!cancelled) setState({ identity, zone: null, error: true });
    };
    const timeout = setTimeout(fail, TIMEOUT_MS);
    if (locationId) {
      void getLocationSchedule(token, locationId).then((schedule) => {
        if (cancelled) return;
        clearTimeout(timeout);
        const zone = schedule?.timezone ?? null;
        setState({ identity, zone, error: !zone || civilDateInZone(new Date(), zone) === null });
      }, () => {
        clearTimeout(timeout);
        fail();
      });
    }
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [token, locationId, enabled, identity]);
  const current = enabled && state?.identity === identity ? state : null;
  const today = current?.zone && !current.error ? civilDateInZone(new Date(), current.zone) : null;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { today, error: current?.error ? expenseZoneError : null, retry };
}
