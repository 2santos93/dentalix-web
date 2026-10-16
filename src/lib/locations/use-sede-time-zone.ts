'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_SEDE_TIME_ZONE, civilDateInZone } from '@/lib/format/date';
import { listLocations, type ClinicLocation } from './locations-api';
import { getActiveLocationId, onLocationChange } from './location-store';

function isUsableZone(timeZone: string | undefined): timeZone is string {
  return Boolean(timeZone) && civilDateInZone(new Date(), timeZone as string) !== null;
}

/**
 * La zona con la que se cuentan los días en pantalla (DX-097): la de la sede
 * activa; en «Todas las sedes», la de la sede principal (la primera de
 * `GET /locations`), que es la que la clínica toma como referencia. Cada sede
 * sigue cortando SU día en su zona en la API; esto solo decide qué día es «hoy»
 * para los atajos y los rótulos. Sin dato utilizable, la zona por defecto de
 * la sede —nunca la del navegador—.
 */
export function pickSedeTimeZone(locations: readonly ClinicLocation[], activeLocationId: string | null): string {
  const active = activeLocationId ? locations.find((l) => l.id === activeLocationId) : undefined;
  const reference = active ?? locations[0];
  return isUsableZone(reference?.timeZone) ? reference.timeZone : DEFAULT_SEDE_TIME_ZONE;
}

/**
 * Hoy (`YYYY-MM-DD`) en la zona de la sede (DX-097): la fecha por defecto de
 * los formularios de abono. Sin zona todavía, la zona por defecto de la sede,
 * nunca la del navegador.
 */
export function sedeToday(timeZone: string | null, now: Date = new Date()): string {
  return (
    civilDateInZone(now, timeZone ?? DEFAULT_SEDE_TIME_ZONE) ??
    (civilDateInZone(now, DEFAULT_SEDE_TIME_ZONE) as string)
  );
}

/**
 * Zona IANA de la sede activa, leída de la API (nunca del navegador). `null`
 * mientras carga, para que la pantalla no consulte «hoy» con un día que luego
 * cambie. Si la lista de sedes falla, la zona por defecto: la pantalla sigue
 * funcionando y la API sigue cortando cada día en la zona real de cada sede.
 * Se recalcula al cambiar de sede.
 */
export function useSedeTimeZone(token: string): string | null {
  const [locations, setLocations] = useState<ClinicLocation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(() => getActiveLocationId());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listLocations(token)
      .then((data) => {
        if (!cancelled) setLocations(data);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => onLocationChange(() => setActiveId(getActiveLocationId())), []);

  return locations ? pickSedeTimeZone(locations, activeId) : null;
}
