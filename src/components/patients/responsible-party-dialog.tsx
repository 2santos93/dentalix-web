'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { listPatients, type DocType, type Patient } from '@/lib/patients/patients-api';
import {
  DOC_TYPES,
  docTypeOptionLabel,
  documentText,
  dtoDocTypeName,
  normalizeDocTypeLabel,
} from '@/lib/patients/doc-type';
import { DocTypeLabelField, docTypeLabelFieldError } from './doc-type-label-field';
import { useDocumentTypeNames } from '@/lib/patients/use-document-type-names';
import {
  createResponsibleParty,
  RELATIONSHIP_LABELS,
  RELATIONSHIPS,
  updateResponsibleParty,
  type ResponsibleParty,
  type ResponsibleRelationship,
} from '@/lib/patients/responsible-parties-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const responsibleDialogCopy = {
  createTitle: 'Añadir responsable',
  editTitle: 'Editar responsable',
  description:
    'Quién paga o recibe los avisos de este paciente. Sus datos se usan solo para el cobro y los avisos, con la autorización del paciente.',
  kindLegend: '¿Quién es?',
  kindPatient: 'Un paciente de la clínica',
  kindContact: 'Un contacto nuevo (sin ficha)',
  searchLabel: 'Buscar paciente',
  searchPlaceholder: 'Nombre o documento',
  searchHint: 'Escribe al menos 2 letras o el documento.',
  searching: 'Buscando…',
  noMatch: 'Ningún paciente coincide. Puedes añadirlo como contacto nuevo.',
  searchError: 'Búsqueda no disponible',
  change: 'Cambiar',
  pickRequired: 'Elige el paciente responsable.',
  fullName: 'Nombre completo',
  nameRequired: 'Escribe el nombre del responsable.',
  docType: 'Tipo de documento',
  docTypeNone: 'Sin documento',
  docNumber: 'Número de documento',
  email: 'Email',
  emailHint: 'A él le llegan los avisos del paciente si es menor o no tiene email.',
  phone: 'Teléfono',
  relationship: 'Parentesco',
  isPayer: 'Pagador principal',
  isPayerHint: 'Solo uno por paciente. Su estado de cuenta familiar suma los saldos de los pacientes de los que es pagador.',
  receivesNotices: 'Recibe los avisos',
  receivesNoticesHint: 'Recordatorios de cita, recibos y estado de cuenta de un menor o de un paciente sin email.',
  patientFieldsNote: 'Su nombre, documento, email y teléfono se cambian en su propia ficha.',
  saveError: 'No pudimos guardar el responsable.',
  add: 'Añadir',
};
const copy = responsibleDialogCopy;

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 8;

interface Draft {
  kind: 'PATIENT' | 'CONTACT';
  patient: Pick<
    Patient,
    'id' | 'firstName' | 'lastName' | 'docType' | 'docTypeLabel' | 'docTypeName' | 'docNumber'
  > | null;
  fullName: string;
  docType: DocType | '';
  /** R7: solo con tipo; un responsable paciente no lleva etiqueta. */
  docTypeLabel: string;
  docNumber: string;
  email: string;
  phone: string;
  relationship: ResponsibleRelationship;
  isPayer: boolean;
  receivesNotices: boolean;
}

function draftFrom(party: ResponsibleParty | null): Draft {
  return {
    kind: party?.kind ?? 'PATIENT',
    patient: party?.responsiblePatient ?? null,
    fullName: party?.kind === 'CONTACT' ? party.fullName : '',
    docType: party?.kind === 'CONTACT' ? (party.docType ?? '') : '',
    docTypeLabel: party?.kind === 'CONTACT' ? (party.docTypeLabel ?? '') : '',
    docNumber: party?.kind === 'CONTACT' ? (party.docNumber ?? '') : '',
    email: party?.kind === 'CONTACT' ? (party.email ?? '') : '',
    phone: party?.kind === 'CONTACT' ? (party.phone ?? '') : '',
    relationship: party?.relationship ?? 'MOTHER',
    isPayer: party?.isPayer ?? false,
    receivesNotices: party?.receivesNotices ?? true,
  };
}

/** «{nombre visible} {número}» del DTO; sin número, solo el nombre. */
function docLabel(p: Pick<Patient, 'docType' | 'docTypeLabel' | 'docTypeName' | 'docNumber'>): string {
  const name = dtoDocTypeName(p);
  return documentText(name, p.docNumber) ?? name;
}

interface ResponsiblePartyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** El paciente del que es responsable (no se le ofrece a sí mismo). */
  patientId: string;
  /** null = alta. */
  party: ResponsibleParty | null;
  onSaved: (party: ResponsibleParty) => void;
}

/**
 * Alta y edición de un responsable (DX-203): buscar un paciente de la clínica
 * o escribir un contacto sin ficha; parentesco, pagador principal y avisos.
 * Los errores de la API (segundo pagador, 404, validación) salen en español en
 * el banner del modal, que sigue abierto para corregir.
 */
export function ResponsiblePartyDialog({
  open,
  onOpenChange,
  token,
  patientId,
  party,
  onSaved,
}: ResponsiblePartyDialogProps) {
  const ids = useId();
  const editing = party !== null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(party));
  const docTypeNames = useDocumentTypeNames(token);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchKey, setSearchKey] = useState(0);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const labelRef = React.useRef<HTMLInputElement>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const searchActive = !editing && draft.kind === 'PATIENT' && !draft.patient;
  const searchable = debouncedQuery.length >= 2;

  useEffect(() => {
    if (!searchActive || !searchable) return;
    let cancelled = false;
    async function search() {
      setSearching(true);
      try {
        const res = await listPatients(token, { query: debouncedQuery, pageSize: SEARCH_PAGE_SIZE });
        if (cancelled) return;
        setResults(res.items.filter((p) => p.id !== patientId));
        setSearchFailed(false);
      } catch {
        if (!cancelled) setSearchFailed(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }
    void search();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, debouncedQuery, searchActive, searchable, searchKey]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setFieldError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing && draft.kind === 'PATIENT' && !draft.patient) {
      setFieldError(copy.pickRequired);
      return;
    }
    if (draft.kind === 'CONTACT' && !draft.fullName.trim()) {
      setFieldError(copy.nameRequired);
      return;
    }
    const labelFieldError =
      draft.kind === 'CONTACT' && draft.docType ? docTypeLabelFieldError(draft.docTypeLabel) : null;
    if (labelFieldError) {
      setLabelError(labelFieldError);
      labelRef.current?.focus();
      return;
    }
    setSaving(true);
    setSaveError(null);
    const flags = {
      relationship: draft.relationship,
      isPayer: draft.isPayer,
      receivesNotices: draft.receivesNotices,
    };
    const contact =
      draft.kind === 'CONTACT'
        ? {
            fullName: draft.fullName.trim(),
            docType: draft.docType || null,
            // Pre-flight I1: el contacto viaja entero, así que la etiqueta
            // también (la actual, o null); omitirla no la conservaría.
            docTypeLabel: draft.docType ? normalizeDocTypeLabel(draft.docTypeLabel) : null,
            docNumber: draft.docNumber.trim() || null,
            email: draft.email.trim() || null,
            phone: draft.phone.trim() || null,
          }
        : {};
    try {
      const saved = editing
        ? await updateResponsibleParty(token, patientId, party.id, { ...flags, ...contact })
        : await createResponsibleParty(token, patientId, {
            ...flags,
            ...(draft.kind === 'PATIENT' && draft.patient
              ? { responsiblePatientId: draft.patient.id }
              : contact),
          });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err, { fallback: copy.saveError }));
    } finally {
      setSaving(false);
    }
  }

  const nameId = `${ids}-name`;
  const searchId = `${ids}-search`;

  return (
    <FormModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={(e) => void submit(e)}
      submitLabel={editing ? undefined : copy.add}
      submitting={saving}
      error={saveError}
    >
      {!editing ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">{copy.kindLegend}</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            {(
              [
                ['PATIENT', copy.kindPatient],
                ['CONTACT', copy.kindContact],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-sm text-ink sm:min-h-0">
                <input
                  type="radio"
                  name={`${ids}-kind`}
                  value={value}
                  checked={draft.kind === value}
                  onChange={() => set('kind', value)}
                  className="size-4 accent-[var(--color-primary)]"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {draft.kind === 'PATIENT' ? (
        draft.patient ? (
          <div
            role="status"
            className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Check aria-hidden className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {draft.patient.firstName} {draft.patient.lastName}
                </p>
                <p className="truncate text-xs text-muted tabular-nums">{docLabel(draft.patient)}</p>
              </div>
            </div>
            {!editing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => {
                  set('patient', null);
                  setQuery('');
                }}
              >
                <X aria-hidden className="size-3.5" /> {copy.change}
              </Button>
            ) : null}
          </div>
        ) : (
          <FormField htmlFor={searchId} label={copy.searchLabel} error={fieldError}>
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <Input
                id={searchId}
                type="search"
                autoComplete="off"
                placeholder={copy.searchPlaceholder}
                value={query}
                maxLength={100}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setFieldError(null);
                }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? fieldErrorId(searchId) : undefined}
                className="pl-9"
              />
              {searching ? (
                <Loader2 aria-hidden className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
              ) : null}
            </div>
            {searchFailed ? (
              <FieldError
                label={copy.searchError}
                onRetry={() => setSearchKey((k) => k + 1)}
                className="h-10 w-full"
              />
            ) : !searchable ? (
              <p className="text-xs text-muted">{copy.searchHint}</p>
            ) : searching && results.length === 0 ? (
              <p role="status" className="text-xs text-muted">
                {copy.searching}
              </p>
            ) : results.length === 0 ? (
              <p role="status" className="text-xs text-muted">
                {copy.noMatch}
              </p>
            ) : (
              <ul
                aria-label={copy.searchLabel}
                className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border bg-surface p-1"
              >
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => set('patient', p)}
                      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="truncate text-sm text-ink">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">{docLabel(p)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </FormField>
        )
      ) : (
        <>
          <FormField htmlFor={nameId} label={copy.fullName} error={fieldError}>
            <Input
              id={nameId}
              value={draft.fullName}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => set('fullName', e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? fieldErrorId(nameId) : undefined}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField htmlFor={`${ids}-doctype`} label={copy.docType}>
              <select
                id={`${ids}-doctype`}
                value={draft.docType}
                onChange={(e) => {
                  const next = e.target.value as DocType | '';
                  const seeded = draftFrom(party);
                  set('docType', next);
                  // La etiqueta de un tipo no vale para otro (R7); volver al
                  // tipo guardado recupera la suya, no la borra.
                  set('docTypeLabel', next !== '' && next === seeded.docType ? seeded.docTypeLabel : '');
                  setLabelError(null);
                }}
                className={cn(fieldClass, 'h-10')}
              >
                <option value="">{copy.docTypeNone}</option>
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {docTypeOptionLabel(t, docTypeNames)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField htmlFor={`${ids}-docnumber`} label={copy.docNumber}>
              <Input
                id={`${ids}-docnumber`}
                value={draft.docNumber}
                maxLength={60}
                autoComplete="off"
                onChange={(e) => set('docNumber', e.target.value)}
              />
            </FormField>
            {draft.docType ? (
              <DocTypeLabelField
                id={`${ids}-doctypelabel`}
                inputRef={labelRef}
                value={draft.docTypeLabel}
                onChange={(value) => {
                  set('docTypeLabel', value);
                  setLabelError(null);
                }}
                error={labelError}
                className="sm:col-span-2"
              />
            ) : null}
            <FormField htmlFor={`${ids}-email`} label={copy.email} hint={copy.emailHint}>
              <Input
                id={`${ids}-email`}
                type="email"
                inputMode="email"
                value={draft.email}
                maxLength={254}
                autoComplete="off"
                onChange={(e) => set('email', e.target.value)}
              />
            </FormField>
            <FormField htmlFor={`${ids}-phone`} label={copy.phone}>
              <Input
                id={`${ids}-phone`}
                type="tel"
                inputMode="tel"
                value={draft.phone}
                maxLength={40}
                autoComplete="off"
                onChange={(e) => set('phone', e.target.value)}
              />
            </FormField>
          </div>
        </>
      )}
      {editing && draft.kind === 'PATIENT' ? (
        <p className="text-xs text-muted">{copy.patientFieldsNote}</p>
      ) : null}

      <FormField htmlFor={`${ids}-relationship`} label={copy.relationship}>
        <select
          id={`${ids}-relationship`}
          value={draft.relationship}
          onChange={(e) => set('relationship', e.target.value as ResponsibleRelationship)}
          className={cn(fieldClass, 'h-10')}
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {RELATIONSHIP_LABELS[r]}
            </option>
          ))}
        </select>
      </FormField>

      {(
        [
          ['isPayer', copy.isPayer, copy.isPayerHint],
          ['receivesNotices', copy.receivesNotices, copy.receivesNoticesHint],
        ] as const
      ).map(([key, label, hint]) => (
        <div key={key} className="flex items-start gap-3">
          <input
            id={`${ids}-${key}`}
            type="checkbox"
            checked={draft[key]}
            onChange={(e) => set(key, e.target.checked)}
            aria-describedby={`${ids}-${key}-hint`}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <label htmlFor={`${ids}-${key}`} className="text-sm font-medium text-ink">
              {label}
            </label>
            <p id={`${ids}-${key}-hint`} className="text-xs text-muted">
              {hint}
            </p>
          </div>
        </div>
      ))}
    </FormModal>
  );
}
