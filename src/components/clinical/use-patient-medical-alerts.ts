'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  getPatientMedicalAlerts,
  type PatientMedicalAlerts,
} from '@/lib/clinical/medical-alerts';

export interface PatientMedicalAlertsState {
  data: PatientMedicalAlerts | null;
  /** No se pudieron comprobar: nunca se pinta como «sin alertas». */
  failed: boolean;
  /** Sube en cada recarga: sirve de `key` para releer lo que depende de la anamnesis. */
  version: number;
  reload: () => void;
}

/**
 * Banderas médicas de un paciente para la ficha (DX-247): la cabecera (que
 * también encabeza el plan y el odontograma) y la línea de revisión de la
 * anamnesis las comparten, así un «Sin cambios hoy» las refresca a la vez.
 */
export function usePatientMedicalAlerts(
  token: string | null,
  patientId: string,
): PatientMedicalAlertsState {
  const [data, setData] = useState<PatientMedicalAlerts | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Sin sesión todavía (la página redirige): no se pregunta nada.
    if (!token) return;
    let cancelled = false;
    getPatientMedicalAlerts(token, patientId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, failed, version: reloadKey, reload };
}
