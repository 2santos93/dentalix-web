'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getPatientAcquisition, type PatientAcquisition } from '@/lib/patients/patient-sources-api';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { SectionError } from '@/components/errors/section-error';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SectionHeader } from '@/components/ui/section-header';
import { DATA_SECTION_CLASS } from './data-section';

export const patientAcquisitionCopy = {
  title: 'Origen',
  source: 'Cómo nos conoció',
  inactive: '(desactivada)',
  referredBy: 'Recomendado por',
  referredByName: 'Profesional que lo derivó',
  referrals: 'Ha recomendado a',
  referralsCount: (n: number) => (n === 1 ? '1 paciente' : `${n} pacientes`),
  recent: (shown: number, total: number) =>
    shown < total ? `Los ${shown} más recientes` : shown === 1 ? 'El paciente' : 'Los pacientes',
  loadError: 'No pudimos cargar el origen del paciente.',
};

const linkClass =
  'font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text';

/**
 * «Origen» en la pestaña Datos de la ficha (DX-172): cómo nos conoció, quién
 * lo recomendó (enlace a su ficha) o el profesional que lo derivó, y a cuántos
 * pacientes ha recomendado él, con los más recientes. Llega en su propio trozo
 * de JS (`patient-lazy-tabs`) y hace UNA petición (`GET /patients/:id/acquisition`)
 * al montarse con la pestaña. Sin nada que contar no pinta nada; la página lo
 * monta con `key={patient.updatedAt}` para releerlo tras «Editar».
 */
export function PatientAcquisitionSection({
  token,
  patientId,
  stamp,
}: {
  token: string;
  patientId: string;
  stamp: SedePainters;
}) {
  const c = patientAcquisitionCopy;
  const [data, setData] = useState<PatientAcquisition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    getPatientAcquisition(token, patientId).then(
      (res) => {
        if (!alive) return;
        setData(res);
        setError(null);
      },
      (err: unknown) => {
        if (alive) setError(apiErrorMessage(err, { fallback: c.loadError }));
      },
    );
    return () => {
      alive = false;
    };
  }, [token, patientId, reloadKey, c.loadError]);

  if (error) {
    return (
      <section aria-label={c.title} className={DATA_SECTION_CLASS}>
        <SectionHeader as="h2" title={c.title} />
        <SectionError
          description={error}
          onRetry={() => {
            setError(null);
            setReloadKey((k) => k + 1);
          }}
        />
      </section>
    );
  }
  if (!data) return null;
  const { source, referredByPatient, referredByName, referrals } = data;
  if (!source && referrals.count === 0) return null;

  return (
    <section aria-label={c.title} className={DATA_SECTION_CLASS} data-testid="patient-acquisition">
      <SectionHeader as="h2" title={c.title} />
      <DescriptionList columns={3}>
        {source ? (
          <DescriptionItem label={c.source}>
            {source.isActive ? source.name : `${source.name} ${c.inactive}`}
          </DescriptionItem>
        ) : null}
        {referredByPatient ? (
          <DescriptionItem label={c.referredBy}>
            <Link href={`/patients/${referredByPatient.id}`} className={linkClass}>
              {referredByPatient.fullName}
            </Link>
          </DescriptionItem>
        ) : null}
        {referredByName ? <DescriptionItem label={c.referredByName}>{referredByName}</DescriptionItem> : null}
        {referrals.count > 0 ? (
          <DescriptionItem label={c.referrals} wide>
            <div className="flex flex-col gap-1.5">
              <span className="tabular-nums" data-testid="patient-referrals-count">
                {c.referralsCount(referrals.count)}
              </span>
              {referrals.recent.length > 0 ? (
                <ul
                  aria-label={c.recent(referrals.recent.length, referrals.count)}
                  className="flex flex-col gap-1 text-sm"
                >
                  {referrals.recent.map((r) => (
                    <li key={r.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      <Link href={`/patients/${r.id}`} className={`${linkClass} [overflow-wrap:anywhere]`}>
                        {r.fullName}
                      </Link>
                      <span className="t-caption tabular-nums text-muted">{stamp.date(r.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </DescriptionItem>
        ) : null}
      </DescriptionList>
    </section>
  );
}
