'use client';
import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { getMedicalHistory } from '@/lib/patients/clinical-api';
import type { MedicalHistory, SafetyFlags } from '@/lib/clinical/clinical-types';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: 'Alertas médicas',
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const history = await getMedicalHistory(token, patientId);
        if (cancelled) return;
        setData(history);
      } catch {
        // Fail soft: an alert banner must never block the ficha from
        // rendering — just show nothing.
        if (!cancelled) setData(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId]);

  if (!data || !data.hasCriticalAlert) return null;

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
