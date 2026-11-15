'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { countryName } from '@/lib/locations/countries';
import type { SedePainters } from '@/lib/locations/sede-stamp';
import { documentText, documentTypeName, type ClinicDocumentTypeNames } from '@/lib/patients/doc-type';
import { CLINIC_LANGUAGE_LABEL, languageName } from '@/lib/patients/patient-languages';
import {
  countLines,
  effectiveChoices,
  getMergePreview,
  groupDiffers,
  MERGE_BLOCKER_COPY,
  MERGE_FIELD_GROUPS,
  mergeFieldsBody,
  mergePatients,
  type DuplicatePair,
  type DuplicatePatient,
  type MergeFieldGroup,
  type MergeFieldSource,
  type MergeFieldValues,
  type MergePreview,
  type MergeResult,
} from '@/lib/patients/patient-merge-api';
import { SectionError } from '@/components/errors/section-error';
import { FormModal } from '@/components/shared/form-modal';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { archiveLinksCopy } from './archive-links-notice';

export const mergeDialogCopy = {
  title: 'Fusionar pacientes',
  description:
    'Todo lo de la ficha que se absorbe pasa a la que se conserva. Donde los datos no coinciden, elige cuál se queda.',
  keptLegend: '¿Qué ficha se conserva?',
  keptHint: 'La otra ficha se retira: su enlace y su búsqueda llevarán a esta.',
  code: (code: string) => `Código ${code}`,
  created: (date: string) => `Alta ${date}`,
  lastAttention: (date: string) => `Última atención ${date}`,
  neverAttended: 'Sin atenciones',
  loading: 'Preparando la comparación…',
  loadError: 'No pudimos preparar la comparación de las dos fichas.',
  differentTitle: 'Datos que no coinciden',
  differentHint:
    'Por defecto se queda el dato de la ficha que se conserva; si esa ficha no lo tiene, el de la que se absorbe.',
  noDifferences: 'Las dos fichas tienen los mismos datos personales.',
  sameTitle: 'Coinciden',
  fromKept: 'De la ficha que se conserva',
  fromAbsorbed: 'De la ficha que se absorbe',
  empty: 'Sin dato',
  movesTitle: (name: string) => `Pasa a la ficha de ${name}`,
  movesListLabel: 'Lo que se mueve',
  movesNone: 'La ficha que se absorbe no tiene citas, historia clínica ni pagos: solo se juntan los datos.',
  movesNote: 'Nada se borra ni se reescribe: cada registro conserva su fecha y su autor.',
  linksTitle: (n: number) =>
    n === 1 ? 'Se anulará 1 enlace enviado al paciente' : `Se anularán ${n} enlaces enviados al paciente`,
  linksExplanation: 'Ya no podrá usarlos. Si hace falta, envíalos de nuevo desde la ficha que se conserva.',
  blockersTitle: 'Antes de fusionar hay que resolver esto',
  irreversibleTitle: 'La fusión no se puede deshacer',
  irreversible: (absorbed: string, kept: string) =>
    `La ficha de ${absorbed} se retira y queda unida para siempre a la de ${kept}. Nadie podrá separarlas después.`,
  confirm: 'Entiendo que la fusión no se puede deshacer',
  submit: 'Fusionar pacientes',
  hintBlocked: 'Resuelve lo que impide fusionar y vuelve a abrir la comparación.',
  hintConfirm: 'Marca la casilla de confirmación para fusionar.',
  submitError: 'No pudimos fusionar a los pacientes.',
  sex: { M: 'Masculino', F: 'Femenino', OTHER: 'Otro', UNSPECIFIED: 'Sin especificar' } as Record<string, string>,
};
const copy = mergeDialogCopy;

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/** Códigos del 409 de la fusión que vienen de un bloqueo: hay que releer la comparación. */
const BLOCKER_API_CODES = new Set([
  'MERGE_OVERLAPPING_APPOINTMENTS',
  'MERGE_OPENING_BALANCE_CONFLICT',
  'MERGE_OPEN_PAYMENT_PROMISES',
]);

type LinkKind = keyof typeof archiveLinksCopy.kinds;
const LINK_KINDS = Object.keys(archiveLinksCopy.kinds) as LinkKind[];

interface DisplayContext {
  stamp: SedePainters;
  docTypeNames: ClinicDocumentTypeNames;
}

const joined = (parts: (string | null | undefined)[]) => {
  const text = parts.filter((p): p is string => Boolean(p && p.trim())).join(' · ');
  return text === '' ? null : text;
};

/** Cómo se lee el valor de un grupo en una ficha; `null` = sin dato. */
export function groupDisplay(
  group: MergeFieldGroup,
  f: MergeFieldValues,
  ctx: DisplayContext,
  cityName: string | null = null,
): string | null {
  switch (group) {
    case 'firstName':
      return f.firstName || null;
    case 'lastName':
      return f.lastName || null;
    case 'document':
      return documentText(documentTypeName(f.documentType, f.docTypeLabel, ctx.docTypeNames), f.docNumber);
    case 'birthDate':
      return f.birthDate ? ctx.stamp.civilDate(f.birthDate) : null;
    case 'sex':
      return copy.sex[f.sex] ?? f.sex;
    case 'phone':
      return f.phone;
    case 'email':
      return f.email;
    case 'address':
      return joined([f.address, cityName, countryName(f.countryCode)]);
    case 'maritalStatus':
      return f.maritalStatus;
    case 'occupation':
      return f.occupation;
    case 'physician':
      return joined([f.physicianName, f.physicianPhone]);
    case 'emergencyContact':
      return joined([
        f.emergencyContactName && f.emergencyContactRelationship
          ? `${f.emergencyContactName} (${f.emergencyContactRelationship})`
          : f.emergencyContactName || f.emergencyContactRelationship,
        f.emergencyContactPhone,
      ]);
    case 'notes':
      return f.notes;
    case 'preferredLanguage':
      return f.preferredLanguage ? languageName(f.preferredLanguage) : CLINIC_LANGUAGE_LABEL;
  }
}

/** La ficha más antigua es la que se propone conservar: suele ser la original. */
export function defaultKeptId(pair: DuplicatePair): string {
  const [a, b] = pair.patients;
  return new Date(b.createdAt).getTime() < new Date(a.createdAt).getTime() ? b.id : a.id;
}

type PreviewState =
  | { key: string; kind: 'loading' }
  | { key: string; kind: 'error'; message: string }
  | { key: string; kind: 'ready'; preview: MergePreview };

export interface MergePatientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  pair: DuplicatePair;
  stamp: SedePainters;
  docTypeNames: ClinicDocumentTypeNames;
  /** Fusión hecha: `keptName` es el nombre que queda en la ficha conservada. */
  onMerged: (result: MergeResult, keptName: string) => void;
  /** La API dijo que alguno ya no está vivo: la lista que se ve está desfasada. */
  onStale?: () => void;
}

/**
 * DX-266: el modal de la fusión. Compara las dos fichas grupo a grupo (el
 * documento, la dirección, el médico y el contacto de emergencia se eligen
 * enteros, como los guarda la API), enseña lo que se moverá, los enlaces que
 * se anularán y lo que impide fusionar, y pide confirmar que no se deshace.
 * Llega en su propio trozo de JS (`next/dynamic` en `DuplicatesView`).
 */
export function MergePatientsDialog({
  open,
  onOpenChange,
  token,
  pair,
  stamp,
  docTypeNames,
  onMerged,
  onStale,
}: MergePatientsDialogProps) {
  const [keptId, setKeptId] = useState(() => defaultKeptId(pair));
  const absorbedId = pair.patients.find((p) => p.id !== keptId)!.id;
  const [reloadKey, setReloadKey] = useState(0);
  const key = `${keptId}:${reloadKey}`;
  const [state, setState] = useState<PreviewState>({ key, kind: 'loading' });
  const [choices, setChoices] = useState<Partial<Record<MergeFieldGroup, MergeFieldSource>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMergePreview(token, keptId, absorbedId)
      .then((preview) => {
        if (!cancelled) setState({ key, kind: 'ready', preview });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ key, kind: 'error', message: apiErrorMessage(err, { fallback: copy.loadError }) });
      });
    return () => {
      cancelled = true;
    };
  }, [token, keptId, absorbedId, key]);

  const current: PreviewState = state.key === key ? state : { key, kind: 'loading' };
  const preview = current.kind === 'ready' ? current.preview : null;
  const blocked = (preview?.blockers.length ?? 0) > 0;

  function chooseKept(id: string) {
    if (id === keptId) return;
    // Otro conservado: las elecciones y la confirmación eran sobre la otra ficha.
    setKeptId(id);
    setChoices({});
    setConfirmed(false);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || blocked || !confirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      // Lo propuesto sin tocar también viaja: p. ej. el correo que solo tenía la absorbida.
      const chosen = effectiveChoices(preview.kept.fields, preview.absorbed.fields, choices);
      const fields = mergeFieldsBody(chosen);
      const result = await mergePatients(token, { keptId, absorbedId, ...(fields ? { fields } : {}) });
      const keptName = fullName({
        firstName: chosen.firstName === 'ABSORBED' ? preview.absorbed.fields.firstName : preview.kept.fields.firstName,
        lastName: chosen.lastName === 'ABSORBED' ? preview.absorbed.fields.lastName : preview.kept.fields.lastName,
      });
      onMerged(result, keptName);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: copy.submitError }));
      if (err instanceof ApiError && err.code && BLOCKER_API_CODES.has(err.code)) {
        // Apareció un bloqueo desde que se abrió: la comparación lo enseña.
        setReloadKey((k) => k + 1);
      } else if (err instanceof ApiError && err.code === 'MERGE_PATIENT_INACTIVE') {
        onStale?.();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const keptPatient = pair.patients.find((p) => p.id === keptId)!;
  const absorbedPatient = pair.patients.find((p) => p.id === absorbedId)!;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      size="lg"
      touchTargets
      onSubmit={submit}
      submitLabel={copy.submit}
      destructive
      submitting={submitting}
      submitDisabled={!preview || blocked || !confirmed}
      submitHint={preview ? (blocked ? copy.hintBlocked : confirmed ? null : copy.hintConfirm) : null}
      hideSubmit={current.kind === 'error'}
      error={error}
      ownValidation
    >
      <RadioGroup
        id="merge-kept"
        legend={copy.keptLegend}
        hint={copy.keptHint}
        value={keptId}
        onValueChange={chooseKept}
        disabled={submitting}
        optionsClassName="grid gap-2 sm:grid-cols-2"
      >
        {pair.patients.map((p) => (
          <RadioCard
            key={p.id}
            id={p.id === pair.patients[0].id ? 'merge-kept' : undefined}
            value={p.id}
            title={fullName(p)}
            description={<PatientMeta patient={p} stamp={stamp} />}
          />
        ))}
      </RadioGroup>

      {current.kind === 'loading' ? (
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">{copy.loading}</span>
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : current.kind === 'error' ? (
        <SectionError description={current.message} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : (
        <PreviewBody
          preview={current.preview}
          keptName={fullName(keptPatient)}
          keptLabel={`${fullName(keptPatient)} (${copy.code(keptPatient.patientCode).toLowerCase()})`}
          absorbedLabel={`${fullName(absorbedPatient)} (${copy.code(absorbedPatient.patientCode).toLowerCase()})`}
          choices={choices}
          onChoose={(group, source) => setChoices((prev) => ({ ...prev, [group]: source }))}
          confirmed={confirmed}
          onConfirmedChange={setConfirmed}
          disabled={submitting}
          ctx={{ stamp, docTypeNames }}
        />
      )}
    </FormModal>
  );
}

function PatientMeta({ patient, stamp }: { patient: DuplicatePatient; stamp: SedePainters }) {
  return (
    <span className="tnum">
      {[
        copy.code(patient.patientCode),
        copy.created(stamp.date(patient.createdAt)),
        patient.lastAttentionAt ? copy.lastAttention(stamp.date(patient.lastAttentionAt)) : copy.neverAttended,
      ].join(' · ')}
    </span>
  );
}

interface PreviewBodyProps {
  preview: MergePreview;
  keptName: string;
  /** Nombre y código: con dos fichas del mismo nombre, el código las distingue. */
  keptLabel: string;
  absorbedLabel: string;
  choices: Partial<Record<MergeFieldGroup, MergeFieldSource>>;
  onChoose: (group: MergeFieldGroup, source: MergeFieldSource) => void;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  disabled: boolean;
  ctx: DisplayContext;
}

function PreviewBody({
  preview,
  keptName,
  keptLabel,
  absorbedLabel,
  choices,
  onChoose,
  confirmed,
  onConfirmedChange,
  disabled,
  ctx,
}: PreviewBodyProps) {
  const kept = preview.kept.fields;
  const absorbed = preview.absorbed.fields;
  const chosen = effectiveChoices(kept, absorbed, choices);
  const different = MERGE_FIELD_GROUPS.filter((g) => groupDiffers(g.columns, kept, absorbed));
  const same = MERGE_FIELD_GROUPS.filter(
    (g) =>
      !groupDiffers(g.columns, kept, absorbed) && groupDisplay(g.group, kept, ctx, preview.kept.cityName) !== null,
  );
  const moves = countLines(preview.absorbed);
  const links = preview.absorbedLiveLinks;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {preview.blockers.length > 0 ? (
        <Callout tone="danger" title={copy.blockersTitle}>
          <ul className="flex flex-col gap-1 pl-4">
            {preview.blockers.map((b) => (
              <li key={b} className="list-disc">
                {MERGE_BLOCKER_COPY[b] ?? b}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <section aria-labelledby="merge-different" className="flex min-w-0 flex-col gap-3">
        <div>
          <h3 id="merge-different" className="t-title">
            {copy.differentTitle}
          </h3>
          {different.length > 0 ? <p className="text-sm text-muted">{copy.differentHint}</p> : null}
        </div>
        {different.length === 0 ? (
          <p className="text-sm text-muted">{copy.noDifferences}</p>
        ) : (
          different.map(({ group, label }) => {
            const keptText = groupDisplay(group, kept, ctx, preview.kept.cityName);
            const absorbedText = groupDisplay(group, absorbed, ctx, preview.absorbed.cityName);
            return (
              <RadioGroup
                key={group}
                id={`merge-field-${group}`}
                legend={label}
                value={chosen[group] ?? 'KEPT'}
                onValueChange={(v) => onChoose(group, v as MergeFieldSource)}
                disabled={disabled}
                optionsClassName="grid gap-2 sm:grid-cols-2"
              >
                <RadioCard
                  id={`merge-field-${group}`}
                  value="KEPT"
                  title={<FieldValue text={keptText} />}
                  description={copy.fromKept}
                />
                <RadioCard value="ABSORBED" title={<FieldValue text={absorbedText} />} description={copy.fromAbsorbed} />
              </RadioGroup>
            );
          })
        )}
        {same.length > 0 ? (
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">{copy.sameTitle}:</span> {same.map((g) => g.label).join(', ')}.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="merge-moves" className="flex min-w-0 flex-col gap-2">
        <h3 id="merge-moves" className="t-title">
          {copy.movesTitle(keptName)}
        </h3>
        {moves.length === 0 ? (
          <p className="text-sm text-muted">{copy.movesNone}</p>
        ) : (
          <>
            <ul aria-label={copy.movesListLabel} className="grid gap-x-6 gap-y-1 pl-4 text-sm sm:grid-cols-2">
              {moves.map((line) => (
                <li key={line} className="tnum list-disc">
                  {line}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">{copy.movesNote}</p>
          </>
        )}
      </section>

      {links.total > 0 ? (
        <Callout tone="warning" title={<span className="tnum">{copy.linksTitle(links.total)}</span>}>
          <ul aria-label={archiveLinksCopy.listLabel} className="flex flex-col gap-1 pl-4">
            {LINK_KINDS.filter((kind) => links[kind] > 0).map((kind) => (
              <li key={kind} className="tnum list-disc">
                {archiveLinksCopy.kinds[kind](links[kind])}
              </li>
            ))}
          </ul>
          <p className="mt-2">{copy.linksExplanation}</p>
        </Callout>
      ) : null}

      {preview.blockers.length === 0 ? (
        <div className="flex flex-col gap-2">
          <Callout tone="warning" title={copy.irreversibleTitle}>
            {copy.irreversible(absorbedLabel, keptLabel)}
          </Callout>
          <Checkbox
            label={copy.confirm}
            checked={confirmed}
            disabled={disabled}
            onChange={(e) => onConfirmedChange(e.target.checked)}
          />
        </div>
      ) : null}
    </div>
  );
}

function FieldValue({ text }: { text: string | null }) {
  return text === null ? (
    <span className="font-normal text-muted italic">{copy.empty}</span>
  ) : (
    <span className="[overflow-wrap:anywhere]">{text}</span>
  );
}
