'use client';
import { useEffect, useState } from 'react';
import { CloudOff, TriangleAlert } from 'lucide-react';
import { getMedicalHistory } from '@/lib/patients/clinical-api';
import type { MedicalHistory, SafetyFlags } from '@/lib/clinical/clinical-types';
import { Button } from '@/components/ui/button';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Alertas médicas',
  unknown: 'No pudimos comprobar las alertas médicas de este paciente.',
  retry: 'Reintentar',
  // Tres estados, no dos. «Consultamos y no hay alertas» y «todavía no hay
  // anamnesis» son hechos clínicos DISTINTOS: el primero es una comprobación
  // hecha, el segundo es una comprobación que nadie ha hecho aún. Fundirlos en
  // una sola frase le dice a quien va a inyectar que ya se preguntó, cuando no
  // se preguntó nunca.
  none: 'Sin alertas médicas registradas',
  noHistory: 'Sin anamnesis registrada — nadie ha preguntado todavía por alergias ni condiciones.',
};

// flag -> etiqueta. `embarazo` gets the extra "(N semanas)" suffix handled
// separately below since it needs `semanasEmbarazo`.
const SAFETY_FLAG_LABELS: Record<Exclude<keyof SafetyFlags, 'semanasEmbarazo'>, string> = {
  embarazo: 'Embarazo',
  anticoagulantes: 'Anticoagulantes',
  bifosfonatos: 'Bifosfonatos',
  diabetes: 'Diabetes',
  profilaxisAntibiotica: 'Requiere profilaxis antibiótica',
  alergiaAnestesico: 'Alergia a anestésico',
  alergiaPenicilina: 'Alergia a penicilina',
  alergiaLatex: 'Alergia a látex',
};

function buildAlertLines(data: MedicalHistory): string[] {
  const lines: string[] = [];
  const flags = data.safetyFlags;
  (Object.keys(SAFETY_FLAG_LABELS) as (keyof typeof SAFETY_FLAG_LABELS)[]).forEach((flag) => {
    if (!flags[flag]) return;
    const label = SAFETY_FLAG_LABELS[flag];
    lines.push(
      flag === 'embarazo' && flags.semanasEmbarazo != null
        ? `${label} (${flags.semanasEmbarazo} semanas)`
        : label,
    );
  });
  data.allergies
    .filter((allergy) => allergy.esAlerta)
    .forEach((allergy) => {
      lines.push(`${allergy.alergeno} (${allergy.severidad})`);
    });
  return lines;
}

interface ClinicalAlertBannerProps {
  token: string;
  patientId: string;
}

export function ClinicalAlertBanner({ token, patientId }: ClinicalAlertBannerProps) {
  const [data, setData] = useState<MedicalHistory | null>(null);
  // Se sigue aparte de `data`: si el fallo se guardara como `data = null`,
  // "no pudimos preguntar" y "no hay alergias registradas" serían el mismo
  // estado, y esta franja decide una anestesia. No saber nunca puede
  // renderizarse como no haber nada que saber.
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const history = await getMedicalHistory(token, patientId);
        if (cancelled) return;
        setData(history);
        setFailed(false);
      } catch {
        // Sigue siendo fail soft: no bloquea ni rompe la ficha. Lo que cambia
        // es que el fallo se declara — antes se callaba, y un 500 o un token
        // caducado se leían como un paciente sin alertas.
        if (cancelled) return;
        setData(null);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  // Mientras carga no se afirma nada: la línea "sin alertas" durante el fetch
  // sería la misma mentira que arreglamos, solo que más corta.
  if (loading) return null;

  if (failed) {
    return (
      // Escalón 2: sustituye a la franja en su sitio, no llena la página
      // (escalón 1) ni se descarta como un toast (escalón 3) — el estado
      // "no sabemos" tiene que seguir ahí mientras siga siendo cierto.
      // `role="status"` y no `alert`: un fetch caído no es una alerta médica,
      // y no debe interrumpir al lector de pantalla a mitad de frase.
      // Severidad neutra por la misma razón: el rojo está reservado para las
      // alertas reales de abajo.
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm text-ink"
      >
        <CloudOff aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <span className="flex-1">{copy.unknown}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setReloadKey((k) => k + 1)}
          className="shrink-0"
        >
          {copy.retry}
        </Button>
      </div>
    );
  }

  // `data === null` con la petición resuelta = el paciente no tiene ninguna
  // versión de anamnesis. No es lo mismo que tenerla y salir limpia.
  if (!data) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.noHistory}
      </p>
    );
  }

  if (!data.hasCriticalAlert) {
    // Se afirma la ausencia en vez de dejarla deducir del silencio.
    // Tipografía subordinada — no compite con la franja roja.
    return (
      <p role="status" className="text-sm text-muted">
        {copy.none}
      </p>
    );
  }

  const lines = buildAlertLines(data);

  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-danger">
      <div className="flex items-center gap-2 font-semibold">
        <TriangleAlert className="h-5 w-5" aria-hidden="true" />
        {copy.title}
      </div>
      <ul className="mt-1 list-inside list-disc text-sm">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
