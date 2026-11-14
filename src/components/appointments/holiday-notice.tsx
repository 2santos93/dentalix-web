'use client';
import { useEffect, useState } from 'react';
import { getHolidayOnDay } from '@/lib/locations/location-calendar-api';
import { Callout } from '@/components/ui/callout';

const copy = {
  holiday: (name: string) => `Ese día es festivo en la sede: ${name}. Puedes agendar igual.`,
  failed: 'No pudimos comprobar si ese día es festivo.',
};

type Lookup = { key: string; name: string | null } | { key: string; failed: true };

/**
 * DX-358: avisa de que el día elegido es festivo en la sede. Solo avisa, nunca
 * bloquea: la clínica decide si atiende ese día. Si la consulta falla, lo dice
 * sin impedir nada.
 */
export function HolidayNotice({
  token,
  locationId,
  date,
}: {
  token: string;
  locationId: string | null | undefined;
  date: string;
}) {
  const key = locationId && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${locationId}|${date}` : null;
  const [lookup, setLookup] = useState<Lookup | null>(null);

  useEffect(() => {
    if (!key || !locationId) return;
    let cancelled = false;
    getHolidayOnDay(token, locationId, date)
      .then(({ name }) => {
        if (!cancelled) setLookup({ key, name });
      })
      .catch(() => {
        if (!cancelled) setLookup({ key, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [token, key, locationId, date]);

  // Lo leído para otro día o sede ya no vale.
  if (!key || lookup?.key !== key) return null;
  if ('failed' in lookup) {
    return (
      <p role="status" className="text-xs text-muted">
        {copy.failed}
      </p>
    );
  }
  return lookup.name ? (
    <Callout tone="warning" data-testid="holiday-notice">
      {copy.holiday(lookup.name)}
    </Callout>
  ) : null;
}
