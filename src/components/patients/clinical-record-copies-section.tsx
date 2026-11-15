'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Printer } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  clinicalRecordCopyPrintHref,
  listClinicalRecordCopies,
  sectionsSummary,
  type ClinicalRecordCopySummary,
} from '@/lib/patients/clinical-record-copies-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { AsyncSection } from '@/components/shared/async-section';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { ClinicalRecordCopyDialog, clinicalRecordCopyCopy } from './clinical-record-copy-dialog';

// Copy as constants (i18n-ready).
const copy = {
  heading: 'Copias de la historia clínica',
  description: 'Cada copia generada queda aquí, con su período y a quién se entregó.',
  action: clinicalRecordCopyCopy.action,
  loadError: 'No pudimos cargar las copias generadas.',
  emptyTitle: 'Aún no se ha generado ninguna copia',
  emptyDescription:
    'Cuando el paciente pida una copia de su historia, genérala con el período y las secciones que necesite.',
  listLabel: 'Copias generadas',
  period: (from: string, to: string) => `Período: ${from} – ${to}`,
  generated: (when: string, who: string | null, sede: string) =>
    `Generada el ${when}${who ? ` por ${who}` : ''} · ${sede}`,
  deliveredTo: (name: string) => `Entregada a ${name}`,
  reprint: 'Volver a imprimir',
  reprintFor: (when: string) => `Volver a imprimir la copia generada el ${when}`,
};

interface ClinicalRecordCopiesSectionProps {
  token: string;
  patientId: string;
}

/**
 * DX-456: la entrada a la copia de la historia clínica en la ficha y el
 * listado de las generaciones anteriores. Se monta solo para los roles
 * clínicos y ADMIN (los de la pestaña de historia); la API lo vuelve a exigir.
 */
export function ClinicalRecordCopiesSection({ token, patientId }: ClinicalRecordCopiesSectionProps) {
  const [copies, setCopies] = useState<ClinicalRecordCopySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const stamp = useSedeStamp(
    token,
    (copies ?? []).map((c) => c.location.id),
  );
  const headingId = React.useId();

  useEffect(() => {
    let cancelled = false;
    listClinicalRecordCopies(token, patientId).then(
      (rows) => {
        if (cancelled) return;
        setCopies(rows);
        setError(null);
      },
      (err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: copy.loadError }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader
        titleId={headingId}
        title={copy.heading}
        description={copy.description}
        actions={
          <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="max-sm:min-h-11">
            <FileText aria-hidden />
            {copy.action}
          </Button>
        }
      />
      <SedeStampNote stamp={stamp} />
      <AsyncSection
        loading={copies === null && error === null}
        error={error}
        onRetry={() => {
          setError(null);
          setCopies(null);
          setReloadKey((k) => k + 1);
        }}
        isEmpty={copies !== null && copies.length === 0}
        emptyTitle={copy.emptyTitle}
        emptyDescription={copy.emptyDescription}
        emptyIcon={<FileText aria-hidden />}
      >
        <ul aria-label={copy.listLabel} className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border bg-surface">
          {(copies ?? []).map((c) => {
            const when = stamp.dateTime(c.generatedAt, c.location.id);
            // Un nombre accesible nunca lleva «—»: sin formato, sin fecha.
            const spoken = stamp.maybe.dateTime(c.generatedAt, c.location.id);
            return (
              <li
                key={c.id}
                data-testid="clinical-record-copy"
                className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="t-body font-medium text-ink tabular-nums">
                    {copy.period(stamp.civilDate(c.from, c.location.id), stamp.civilDate(c.to, c.location.id))}
                  </p>
                  <p className="text-sm text-muted break-words">{sectionsSummary(c.sections)}</p>
                  <p className="text-sm text-muted break-words tabular-nums">
                    {copy.generated(when, c.generatedBy.name, c.location.name)}
                  </p>
                  {c.deliveredTo ? (
                    <p className="text-sm text-ink break-words">{copy.deliveredTo(c.deliveredTo)}</p>
                  ) : null}
                </div>
                <Button asChild variant="ghost" className="self-start max-sm:min-h-11 sm:self-center">
                  <Link href={clinicalRecordCopyPrintHref(patientId, c.id)} aria-label={spoken ? copy.reprintFor(spoken) : undefined}>
                    <Printer aria-hidden />
                    {copy.reprint}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </AsyncSection>
      <ClinicalRecordCopyDialog
        open={open}
        onOpenChange={setOpen}
        token={token}
        patientId={patientId}
        onGenerated={() => setReloadKey((k) => k + 1)}
      />
    </section>
  );
}
