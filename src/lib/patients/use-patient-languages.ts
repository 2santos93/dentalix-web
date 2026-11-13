'use client';
import { useEffect, useState } from 'react';
import { getPatientLanguages, type PatientLanguages } from './patient-languages';

/**
 * DX-497: los idiomas que la clínica ofrece para el desplegable del alta.
 * `null` mientras carga o si falla: el alta sigue sin el campo (el paciente
 * nace con «Idioma de la clínica» y se cambia después en su ficha).
 */
export function usePatientLanguages(token: string | null | undefined): PatientLanguages | null {
  const [languages, setLanguages] = useState<PatientLanguages | null>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    Promise.resolve()
      .then(() => getPatientLanguages(token))
      .then(
        (loaded) => {
          if (alive && loaded) setLanguages(loaded);
        },
        () => {
          // Sin la lista: el alta no ofrece el campo.
        },
      );
    return () => {
      alive = false;
    };
  }, [token]);
  return languages;
}
