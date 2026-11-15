import * as React from 'react';
import { ClinicFiscalLines } from '@/components/brand/clinic-fiscal-lines';
import { documentTexts, type DocumentFormat } from '@/lib/format/document-format';
import {
  CLINICAL_RECORD_COPY_SECTIONS,
  type ClinicalRecordCopyDocument as CopyDoc,
  type ClinicalRecordCopySection,
  type CopyAnamnesis,
  type CopyEvolution,
} from '@/lib/patients/clinical-record-copies-api';
import { TECHNIQUE_LABELS, formatDecimal } from '@/lib/anesthesia/anesthesia-api';
import { AGENT_KIND_LABELS, DOSE_UNIT_LABELS, GRADE_LABELS, ROUTE_LABELS } from '@/lib/sedation/sedation-api';
import { SIGNER_TYPE_LABELS } from '@/lib/consents/consents-api';
import { SURFACE_LABELS } from '@/lib/odontogram/surface-labels';
import { ORIGIN_LABELS } from '@/lib/odontogram/origin';
import { ALLERGY_SEVERITY_LABELS, CONDITION_STATUS_LABELS } from '@/lib/clinical/clinical-types';
import { statusLabel } from '@/lib/status/tones';

// Copy as constants (i18n-ready).
const copy = {
  title: 'Copia de la historia clínica',
  patient: 'Paciente',
  document: 'Documento',
  code: 'Código de paciente',
  birthDate: 'Fecha de nacimiento',
  period: 'Período',
  periodValue: (from: string, to: string) => `${from} al ${to}`,
  generated: 'Generada el',
  generatedBy: 'Generada por',
  deliveredTo: 'Entregada a',
  sede: 'Sede',
  emptyAll: 'Sin registros en el período',
  emptyAllHint: 'Ninguna de las secciones elegidas tiene registros entre estas fechas.',
  emptySection: 'Sin registros en el período.',
  author: (name: string | null) => name ?? 'Autor no disponible',
  license: (license: string) => `Reg. prof. ${license}`,
  appointment: (when: string) => `Cita del ${when}`,
  reason: 'Motivo',
  notes: 'Evolución',
  diagnoses: 'Diagnósticos',
  principal: 'Principal',
  related: 'Relacionado',
  tooth: (fdi: string) => `diente ${fdi}`,
  addenda: 'Adendas',
  addendum: (when: string, who: string | null) => `Adenda del ${when}${who ? ` · ${who}` : ''}`,
  addendumReason: 'Motivo:',
  anesthesia: 'Anestesia local',
  sedation: 'Sedación',
  anesthesiaLine: (carpules: number, mg: number, technique: string) =>
    `${formatDecimal(carpules)} carp. · ${formatDecimal(mg)} mg · ${technique}`,
  site: (site: string) => `Zona: ${site}`,
  lot: (lot: string) => `Lote ${lot}`,
  asa: (asa: string) => `ASA ${asa}`,
  discharged: (when: string) => `Alta: ${when}`,
  agentDose: (dose: number, unit: string) => `${formatDecimal(dose)} ${unit}`,
  n2o: (pct: number) => `N₂O ${formatDecimal(pct)} %`,
  version: (n: number) => `Versión ${n}`,
  fromPatient: 'Respondida por el paciente',
  allergies: 'Alergias',
  conditions: 'Antecedentes médicos',
  medications: 'Medicación',
  surgeries: 'Cirugías',
  pregnancy: 'Embarazo',
  familyHistory: 'Antecedentes familiares',
  anamnesisNotes: 'Observaciones',
  none: 'Ninguna',
  consentSigned: (when: string) => `Firmado el ${when}`,
  consentSigner: (type: string, name: string) => `${type}: ${name}`,
  consentProfessional: (name: string) => `Profesional: ${name}`,
  consentPending: 'Pendiente de la firma del profesional',
  prescriptionVoided: 'Anulada',
  posology: (dose: string, frequency: string, days: number) =>
    `${dose}, ${frequency.toLowerCase()}, durante ${days} ${days === 1 ? 'día' : 'días'}`,
  footer:
    'Copia fiel de los registros de la historia clínica en el período indicado, tal como constaban al generarla.',
};

/** Un bloque que no se parte entre dos hojas. */
function Block({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <article data-testid={testId} className="copy-block border-t border-[#e5e7eb] py-3 first:border-t-0">
      {children}
    </article>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[#4b5563] tabular-nums">{children}</p>;
}

function SectionShell({
  id,
  rows,
  children,
}: {
  id: ClinicalRecordCopySection;
  rows: number;
  children: React.ReactNode;
}) {
  const label = CLINICAL_RECORD_COPY_SECTIONS.find((s) => s.id === id)?.label ?? id;
  return (
    <section className="copy-section mt-6" aria-label={label} data-testid={`copy-section-${id}`}>
      <h2 className="copy-section-title border-b border-[#111827] pb-1 text-base font-semibold">{label}</h2>
      {rows === 0 ? <p className="py-3 text-sm text-[#4b5563]">{copy.emptySection}</p> : children}
    </section>
  );
}

type Texts = ReturnType<typeof documentTexts>;

function Evolution({ e, t }: { e: CopyEvolution; t: Texts }) {
  return (
    <Block testId="copy-evolution">
      <p className="font-semibold tabular-nums">{t.dateTime(e.entryDate)}</p>
      <Meta>
        {[
          copy.author(e.authorName),
          e.authorLicense ? copy.license(e.authorLicense) : null,
          e.locationName,
          e.appointmentStart ? copy.appointment(t.dateTime(e.appointmentStart)) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Meta>
      {e.reason ? (
        <p className="mt-1 text-sm">
          <span className="font-medium">{copy.reason}: </span>
          {e.reason}
        </p>
      ) : null}
      <p className="mt-1 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{e.notes}</p>
      {e.diagnoses.length > 0 ? (
        <ul className="mt-1 text-sm" aria-label={copy.diagnoses}>
          {e.diagnoses.map((d, i) => (
            <li key={i}>
              {d.icd10Code} · {d.label} ({d.kind === 'PRINCIPAL' ? copy.principal : copy.related}
              {d.toothFdi ? `, ${copy.tooth(d.toothFdi)}` : ''})
            </li>
          ))}
        </ul>
      ) : null}
      {e.addenda.length > 0 ? (
        <ol className="mt-2 flex flex-col gap-2 border-l border-[#9ca3af] pl-3" aria-label={copy.addenda}>
          {e.addenda.map((a, i) => (
            <li key={i} className="text-sm" data-testid="copy-addendum">
              <p className="text-xs font-medium text-[#4b5563] tabular-nums">
                {copy.addendum(t.dateTime(a.createdAt), a.authorName)}
              </p>
              <p>
                <span className="font-medium">{copy.addendumReason} </span>
                {a.reason}
              </p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{a.text}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </Block>
  );
}

function Anamnesis({ a, t }: { a: CopyAnamnesis; t: Texts }) {
  const answered = a.conditions.filter((c) => c.estado !== 'NO');
  const line = (label: string, value: React.ReactNode) => (
    <p className="text-sm">
      <span className="font-medium">{label}: </span>
      {value}
    </p>
  );
  return (
    <Block testId="copy-anamnesis">
      <p className="font-semibold tabular-nums">
        {t.dateTime(a.recordedAt)} · {copy.version(a.version)}
      </p>
      <Meta>{[copy.author(a.authorName), a.source === 'PATIENT_FORM' ? copy.fromPatient : null].filter(Boolean).join(' · ')}</Meta>
      {line(
        copy.allergies,
        a.allergies.length === 0
          ? copy.none
          : a.allergies
              .map((x) => `${x.alergeno} (${ALLERGY_SEVERITY_LABELS[x.severidad]}${x.reaccion ? `, ${x.reaccion}` : ''})`)
              .join('; '),
      )}
      {line(
        copy.conditions,
        answered.length === 0
          ? copy.none
          : answered
              .map((c) => `${c.etiqueta}: ${CONDITION_STATUS_LABELS[c.estado]}${c.nota ? ` (${c.nota})` : ''}`)
              .join('; '),
      )}
      {line(
        copy.medications,
        a.medications.length === 0
          ? copy.none
          : a.medications.map((m) => [m.nombre, m.dosis, m.frecuencia].filter(Boolean).join(' ')).join('; '),
      )}
      {a.surgeries.length > 0
        ? line(copy.surgeries, a.surgeries.map((s) => [s.descripcion, s.fecha].filter(Boolean).join(', ')).join('; '))
        : null}
      {a.pregnancy ? line(copy.pregnancy, CONDITION_STATUS_LABELS[a.pregnancy]) : null}
      {a.familyHistory ? line(copy.familyHistory, a.familyHistory) : null}
      {a.notes ? line(copy.anamnesisNotes, a.notes) : null}
    </Block>
  );
}

interface ClinicalRecordCopyDocumentProps {
  document: CopyDoc;
  /** Formato de la sede de la copia; `null` = «—» en fechas (nunca otro formato). */
  format: DocumentFormat | null;
}

/**
 * DX-456: el papel de la copia de la historia clínica (A4 o Carta). Cabecera
 * con clínica, sede, paciente y fecha de generación; cada sección elegida en
 * el orden del documento; cada registro en un bloque que no se parte entre
 * hojas. Nunca pinta ids internos. «Página X de Y» lo pone la regla `@page`.
 */
export function ClinicalRecordCopyDocument({ document: doc, format }: ClinicalRecordCopyDocumentProps) {
  const t = documentTexts(format);
  const { content, copy: summary } = doc;
  const wants = (s: ClinicalRecordCopySection) => summary.sections.includes(s);
  const anesthesiaRows = (content.anesthesia?.length ?? 0) + (content.sedation?.length ?? 0);

  return (
    <div className="clinical-record-print-root bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:p-0">
      <header className="copy-header flex flex-col gap-3 border-b-2 border-[#111827] pb-4" data-testid="copy-header">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-semibold [overflow-wrap:anywhere]">{doc.clinic.name}</p>
            <ClinicFiscalLines
              fiscal={{
                legalName: doc.clinic.legalName,
                taxIdLabel: doc.clinic.taxIdLabel,
                taxId: doc.clinic.taxId,
                address: null,
                email: null,
                phone: null,
              }}
            />
            <p className="text-sm [overflow-wrap:anywhere]">
              {copy.sede}: {doc.location.name}
              {doc.location.address ? ` · ${doc.location.address}` : ''}
            </p>
          </div>
          <h1 className="text-xl font-semibold sm:text-right">{copy.title}</h1>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-[#4b5563]">{copy.patient}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]" data-testid="copy-patient">
              {doc.patient.name}
            </dd>
          </div>
          {doc.patient.document ? (
            <div>
              <dt className="text-xs font-medium text-[#4b5563]">{copy.document}</dt>
              <dd className="font-medium">{doc.patient.document}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-medium text-[#4b5563]">{copy.code}</dt>
            <dd className="font-medium tabular-nums">{doc.patient.patientCode}</dd>
          </div>
          {doc.patient.birthDate ? (
            <div>
              <dt className="text-xs font-medium text-[#4b5563]">{copy.birthDate}</dt>
              <dd className="font-medium tabular-nums">{t.civilDate(doc.patient.birthDate)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-medium text-[#4b5563]">{copy.period}</dt>
            <dd className="font-medium tabular-nums" data-testid="copy-period">
              {copy.periodValue(t.civilDate(summary.from), t.civilDate(summary.to))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[#4b5563]">{copy.generated}</dt>
            <dd className="font-medium tabular-nums" data-testid="copy-generated">
              {t.dateTime(summary.generatedAt)}
            </dd>
          </div>
          {summary.generatedBy.name ? (
            <div>
              <dt className="text-xs font-medium text-[#4b5563]">{copy.generatedBy}</dt>
              <dd className="font-medium">{summary.generatedBy.name}</dd>
            </div>
          ) : null}
          {summary.deliveredTo ? (
            <div>
              <dt className="text-xs font-medium text-[#4b5563]">{copy.deliveredTo}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">{summary.deliveredTo}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {doc.empty ? (
        <div className="py-12 text-center" data-testid="copy-empty">
          <p className="text-base font-semibold">{copy.emptyAll}</p>
          <p className="mt-1 text-sm text-[#4b5563]">{copy.emptyAllHint}</p>
        </div>
      ) : (
        <>
          {wants('EVOLUTIONS') ? (
            <SectionShell id="EVOLUTIONS" rows={content.evolutions?.length ?? 0}>
              {(content.evolutions ?? []).map((e, i) => (
                <Evolution key={i} e={e} t={t} />
              ))}
            </SectionShell>
          ) : null}

          {wants('DIAGNOSES') ? (
            <SectionShell id="DIAGNOSES" rows={content.diagnoses?.length ?? 0}>
              {(content.diagnoses ?? []).map((d, i) => (
                <Block key={i}>
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">{t.date(d.entryDate)}</span> · {d.icd10Code} · {d.label} (
                    {d.kind === 'PRINCIPAL' ? copy.principal : copy.related}
                    {d.toothFdi ? `, ${copy.tooth(d.toothFdi)}` : ''})
                  </p>
                  <Meta>{copy.author(d.authorName)}</Meta>
                </Block>
              ))}
            </SectionShell>
          ) : null}

          {wants('ANAMNESIS') ? (
            <SectionShell id="ANAMNESIS" rows={content.anamnesis?.length ?? 0}>
              {(content.anamnesis ?? []).map((a, i) => (
                <Anamnesis key={i} a={a} t={t} />
              ))}
            </SectionShell>
          ) : null}

          {wants('ODONTOGRAM') ? (
            <SectionShell id="ODONTOGRAM" rows={content.odontogram?.length ?? 0}>
              {(content.odontogram ?? []).map((r, i) => (
                <Block key={i}>
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">{t.date(r.recordedAt)}</span> ·{' '}
                    {copy.tooth(r.toothNumber)} · {r.label ?? '—'}
                    {r.surfaces.length > 0 ? ` · ${r.surfaces.map((s) => SURFACE_LABELS[s]).join(', ')}` : ''}
                  </p>
                  <Meta>
                    {[ORIGIN_LABELS[r.origin], copy.author(r.authorName)].join(' · ')}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </Meta>
                </Block>
              ))}
            </SectionShell>
          ) : null}

          {wants('ANESTHESIA_SEDATION') ? (
            <SectionShell id="ANESTHESIA_SEDATION" rows={anesthesiaRows}>
              {(content.anesthesia ?? []).map((a, i) => (
                <Block key={`a${i}`}>
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">{t.dateTime(a.administeredAt)}</span> · {copy.anesthesia} ·{' '}
                    {a.anestheticName}
                  </p>
                  <p className="text-sm">
                    {[
                      copy.anesthesiaLine(a.carpules, a.doseMg, TECHNIQUE_LABELS[a.technique]),
                      a.site ? copy.site(a.site) : null,
                      a.lot ? copy.lot(a.lot) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <Meta>{[copy.author(a.authorName), a.locationName].filter(Boolean).join(' · ')}</Meta>
                </Block>
              ))}
              {(content.sedation ?? []).map((s, i) => (
                <Block key={`s${i}`}>
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">{t.dateTime(s.assessedAt)}</span> · {copy.sedation} ·{' '}
                    {GRADE_LABELS[s.grade]}
                    {s.asaClass ? ` · ${copy.asa(s.asaClass)}` : ''}
                  </p>
                  {s.agents.length > 0 ? (
                    <ul className="text-sm">
                      {s.agents.map((g, j) => (
                        <li key={j}>
                          {[
                            t.time(g.administeredAt),
                            g.drugName ?? AGENT_KIND_LABELS[g.kind],
                            g.dose !== null && g.doseUnit ? copy.agentDose(g.dose, DOSE_UNIT_LABELS[g.doseUnit]) : null,
                            g.n2oPercent !== null ? copy.n2o(g.n2oPercent) : null,
                            ROUTE_LABELS[g.route],
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Meta>
                    {[
                      copy.author(s.authorName),
                      s.locationName,
                      s.dischargedAt ? copy.discharged(t.dateTime(s.dischargedAt)) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Meta>
                </Block>
              ))}
            </SectionShell>
          ) : null}

          {wants('CONSENTS') ? (
            <SectionShell id="CONSENTS" rows={content.consents?.length ?? 0}>
              {(content.consents ?? []).map((c, i) => (
                <Block key={i}>
                  <p className="text-sm font-medium">{c.title}</p>
                  <Meta>
                    {[
                      copy.consentSigned(t.dateTime(c.signedAt)),
                      copy.consentSigner(SIGNER_TYPE_LABELS[c.signerType], c.signerName),
                      copy.consentProfessional(c.professionalName),
                      c.complete ? null : copy.consentPending,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Meta>
                </Block>
              ))}
            </SectionShell>
          ) : null}

          {wants('PRESCRIPTIONS') ? (
            <SectionShell id="PRESCRIPTIONS" rows={content.prescriptions?.length ?? 0}>
              {(content.prescriptions ?? []).map((p, i) => (
                <Block key={i}>
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">{t.dateTime(p.issuedAt)}</span> · {p.professionalName} ·{' '}
                    {p.locationName}
                    {p.status === 'VOIDED' ? ` · ${copy.prescriptionVoided}` : ''}
                  </p>
                  <ul className="text-sm">
                    {p.items.map((it, j) => (
                      <li key={j}>
                        <span className="font-medium">
                          {it.activeIngredient} {it.concentration}
                        </span>
                        {it.brandName ? ` (${it.brandName})` : ''} · {it.pharmaceuticalForm} ·{' '}
                        {copy.posology(it.dose, it.frequency, it.durationDays)}
                        {it.instructions ? `. ${it.instructions}` : ''}
                      </li>
                    ))}
                  </ul>
                  {p.notes ? <Meta>{p.notes}</Meta> : null}
                </Block>
              ))}
            </SectionShell>
          ) : null}

          {wants('APPOINTMENTS') ? (
            <SectionShell id="APPOINTMENTS" rows={content.appointments?.length ?? 0}>
              {(content.appointments ?? []).map((a, i) => (
                <Block key={i}>
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">
                      {t.date(a.start)} · {t.time(a.start)}–{t.time(a.end)}
                    </span>{' '}
                    · {statusLabel('appointment', a.status)}
                    {a.typeName ? ` · ${a.typeName}` : ''}
                  </p>
                  <Meta>
                    {[a.providerName, a.locationName, a.reason].filter(Boolean).join(' · ')}
                  </Meta>
                </Block>
              ))}
            </SectionShell>
          ) : null}
        </>
      )}

      <p className="mt-8 border-t border-[#e5e7eb] pt-3 text-xs text-[#4b5563]">{copy.footer}</p>
    </div>
  );
}
