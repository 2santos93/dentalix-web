'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Plus } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  COUNTRY_LABELS,
  getPrescriptionIssuer,
  issuePrescription,
  listPrescriptionTemplates,
  type IssuePrescriptionInput,
  type Prescription,
  type PrescriptionIssuer,
  type PrescriptionTemplate,
} from '@/lib/prescriptions/prescriptions-api';
import {
  draftFromTemplateItem,
  emptyItemDraft,
  itemDraftErrors,
  itemInputFromDraft,
  type ItemDraft,
  type ItemDraftErrors,
} from '@/lib/prescriptions/prescription-draft';
import { findAllergyMatches } from '@/lib/prescriptions/allergy-match';
import { getMedicalHistory } from '@/lib/patients/clinical-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { PrescriptionItemFields } from './prescription-item-fields';

const copy = {
  title: 'Nueva receta',
  description: 'Desde una plantilla o en blanco. Una vez emitida no se puede editar: solo anular.',
  issuer: (location: string, country: string, days: number) =>
    `Se emite desde ${location} (${country}) · validez de ${days} días naturales.`,
  issuerError: 'No pudimos preparar la receta.',
  loading: 'Preparando la receta',
  templateLabel: 'Partir de una plantilla',
  templateBlank: 'En blanco',
  templatesError: 'Plantillas no disponibles',
  templateCount: (n: number) => (n === 1 ? '1 medicamento' : `${n} medicamentos`),
  requiredNote: 'Todos los campos son obligatorios salvo los marcados como opcionales.',
  addItem: 'Añadir medicamento',
  tooManyItems: (max: number) =>
    max === 1
      ? 'En España cada receta lleva un solo medicamento: quita los demás o emite una receta por cada uno.'
      : `Una receta admite como mucho ${max} medicamentos.`,
  dateLabel: { CO: 'Fecha de la receta', ES: 'Fecha prevista de dispensación' },
  dateHint: 'Si la dejas vacía, hoy.',
  notesLabel: 'Indicaciones generales (opcional)',
  licenseLabel: { CO: 'Tu registro profesional', ES: 'Tu nº de colegiado' },
  licenseHint: 'Tu perfil de esta clínica aún no lo tiene: se guardará en la receta y en tu perfil.',
  licenseMissing: { CO: 'Falta tu registro profesional.', ES: 'Falta tu nº de colegiado.' },
  allergiesError: 'Alergias no comprobadas',
  allergyTitle: 'Alerta de alergia',
  allergyBody: (detail: string) => `El paciente tiene registrada alergia a: ${detail}.`,
  allergyConfirm:
    'Confirmo que conozco la alergia y prescribo igualmente bajo mi responsabilidad.',
  submit: 'Emitir receta',
  genericError: 'No pudimos emitir la receta. Intenta de nuevo.',
  // 409 de la API sin un texto que se pueda enseñar: aun así es una alerta de
  // alergia, y no un «los datos cambiaron».
  serverAllergyFallback:
    'La API detectó una posible alergia a alguno de estos principios activos. Revisa la anamnesis del paciente antes de confirmar.',
};

// La alerta de la API lista los alérgenos (texto libre de la anamnesis): con
// varios pasa de los 240 caracteres del helper y se perdería el detalle que
// quien prescribe necesita para confirmar (revisión D-1).
const SERVER_ALLERGY_MAX_LENGTH = 2000;

interface NewPrescriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Recibe la receta recién emitida (el modal ya se cerró). */
  onIssued: (prescription: Prescription) => void;
}

/**
 * «Nueva receta» (DX-013): desde una plantilla o en blanco, con uno o varios
 * medicamentos (en ES, uno). Antes de enviar valida en el cliente los campos
 * obligatorios según el país de la sede (mismas reglas que la API): marca cada
 * campo inválido junto al control y lleva el foco al primero. Lo que el
 * formulario no conoce (documento o nacimiento del paciente) lo dice la API en
 * un 400, que `FormModal` muestra en un resumen visible y con el foco.
 *
 * Alerta de alergia: el modal compara EN VIVO cada principio activo con las
 * alergias de la anamnesis y, si coincide, exige marcar una confirmación
 * explícita antes de emitir; la API vuelve a comprobarlo (409 sin
 * `allergyOverride`) y guarda la confirmación en la receta.
 *
 * El padre lo monta con una `key` nueva en cada apertura.
 */
export function NewPrescriptionModal({
  open,
  onOpenChange,
  token,
  patientId,
  onIssued,
}: NewPrescriptionModalProps) {
  const [issuer, setIssuer] = useState<PrescriptionIssuer | null>(null);
  const [issuerError, setIssuerError] = useState<string | null>(null);
  const [issuerKey, setIssuerKey] = useState(0);
  const [templates, setTemplates] = useState<PrescriptionTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [templatesKey, setTemplatesKey] = useState(0);
  const [allergies, setAllergies] = useState<string[] | null>(null);
  const [allergiesFailed, setAllergiesFailed] = useState(false);
  const [allergiesKey, setAllergiesKey] = useState(0);

  const [templateId, setTemplateId] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([emptyItemDraft()]);
  const [dispensationDate, setDispensationDate] = useState('');
  const [notes, setNotes] = useState('');
  const [license, setLicense] = useState('');
  // La confirmación vale para UN conjunto de coincidencias: si cambian (otro
  // fármaco que también choca), hay que volver a confirmar.
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [serverAllergy, setServerAllergy] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<ItemDraftErrors[]>([]);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPrescriptionIssuer(token)
      .then((data) => {
        if (cancelled) return;
        setIssuer(data);
        setIssuerError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setIssuerError(apiErrorMessage(err, copy.issuerError));
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, issuerKey]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listPrescriptionTemplates(token)
      .then((data) => {
        if (cancelled) return;
        setTemplates(data);
        setTemplatesFailed(false);
      })
      .catch(() => {
        if (!cancelled) setTemplatesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, templatesKey]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMedicalHistory(token, patientId)
      .then((history) => {
        if (cancelled) return;
        setAllergies((history?.allergies ?? []).map((a) => a.alergeno));
        setAllergiesFailed(false);
      })
      .catch(() => {
        if (!cancelled) setAllergiesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, allergiesKey]);

  const matchesByItem = useMemo(
    () => items.map((item) => findAllergyMatches([item.activeIngredient], allergies ?? [])),
    [items, allergies],
  );
  const allMatches = matchesByItem.flat();
  const alertKey =
    allMatches.length > 0
      ? allMatches.map((m) => `${m.activeIngredient.trim().toLowerCase()}|${m.allergen}`).join(';')
      : serverAllergy
        ? `server:${serverAllergy}`
        : null;
  const confirmed = alertKey !== null && confirmedKey === alertKey;
  const alertDetail =
    allMatches.length > 0
      ? copy.allergyBody(allMatches.map((m) => `${m.allergen} (${m.activeIngredient.trim()})`).join(', '))
      : serverAllergy;

  const country = issuer?.country ?? 'CO';
  const maxItems = issuer?.maxItems ?? 10;
  const tooMany = items.length > maxItems;
  const needsLicense = issuer !== null && issuer.professionalLicense === null;

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setServerAllergy(null);
    setError(null);
    // Al corregir un campo su error se va; los de los demás siguen.
    setItemErrors((prev) =>
      prev.map((errors, i) => {
        if (i !== index) return errors;
        const next = { ...errors };
        for (const field of Object.keys(patch) as (keyof ItemDraft)[]) delete next[field];
        return next;
      }),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setItemErrors((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    setServerAllergy(null);
    setError(null);
    setItemErrors([]);
    setLicenseError(null);
    const template = templates?.find((t) => t.id === id);
    if (!template) {
      setItems([emptyItemDraft()]);
      return;
    }
    setItems(template.items.map(draftFromTemplateItem));
    if (template.notes) setNotes(template.notes);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!issuer || tooMany || (alertKey !== null && !confirmed)) return;
    setError(null);

    const nextItemErrors = items.map((item) => itemDraftErrors(item, country));
    const nextLicenseError = needsLicense && !license.trim() ? copy.licenseMissing[country] : null;
    // Ids en el orden en que se ven: el primero recibe el foco.
    const invalidIds = [
      ...nextItemErrors.flatMap((errors, index) =>
        Object.keys(errors).map((field) => `rx-item-${index}-${field}`),
      ),
      ...(nextLicenseError ? ['rx-license'] : []),
    ];
    if (invalidIds.length > 0) {
      // flushSync: el campo ya lleva aria-invalid y su mensaje cuando recibe
      // el foco, así el lector de pantalla lo anuncia.
      flushSync(() => {
        setItemErrors(nextItemErrors);
        setLicenseError(nextLicenseError);
      });
      const first = document.getElementById(invalidIds[0]);
      // `?.` porque jsdom no implementa scrollIntoView.
      first?.scrollIntoView?.({ block: 'center' });
      first?.focus({ preventScroll: true });
      return;
    }
    setItemErrors([]);
    setLicenseError(null);

    setSubmitting(true);
    const input: IssuePrescriptionInput = {
      items: items.map(itemInputFromDraft),
      ...(dispensationDate ? { dispensationDate } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(needsLicense && license.trim() ? { professionalLicense: license.trim() } : {}),
      ...(alertKey !== null && confirmed ? { allergyOverride: true } : {}),
    };
    try {
      const issued = await issuePrescription(token, patientId, input);
      onOpenChange(false);
      onIssued(issued);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // La API detectó una alergia que aquí no se vio (p. ej. la anamnesis
        // no cargó): mismo bloque de confirmación, con su mensaje.
        setServerAllergy(
          apiErrorMessage(err, {
            fallback: copy.serverAllergyFallback,
            byStatus: { 409: copy.serverAllergyFallback },
            maxLength: SERVER_ALLERGY_MAX_LENGTH,
          }),
        );
      } else {
        setError(apiErrorMessage(err, copy.genericError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const ready = issuer !== null;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={!ready || tooMany || (alertKey !== null && !confirmed)}
      error={error}
      size="lg"
    >
      {issuerError && !ready ? (
        <SectionError
          description={issuerError}
          onRetry={() => {
            setIssuerError(null);
            setIssuerKey((k) => k + 1);
          }}
        />
      ) : !ready ? (
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            {copy.issuer(issuer.locationName, COUNTRY_LABELS[issuer.country], issuer.validityDays)}
          </p>

          <FormField htmlFor="rx-template" label={copy.templateLabel}>
            {templatesFailed ? (
              <FieldError
                label={copy.templatesError}
                onRetry={() => {
                  setTemplatesFailed(false);
                  setTemplatesKey((k) => k + 1);
                }}
              />
            ) : (
              <select
                id="rx-template"
                value={templateId}
                disabled={templates === null}
                onChange={(e) => applyTemplate(e.target.value)}
                className={cn(fieldClass, 'h-10')}
              >
                <option value="">{copy.templateBlank}</option>
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {copy.templateCount(t.items.length)}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          {allergiesFailed ? (
            <FieldError
              label={copy.allergiesError}
              className="w-full"
              onRetry={() => {
                setAllergiesFailed(false);
                setAllergiesKey((k) => k + 1);
              }}
            />
          ) : null}

          <p className="text-xs text-muted">{copy.requiredNote}</p>
          <div className="flex flex-col gap-3">
            {items.map((item, index) => (
              <PrescriptionItemFields
                key={index}
                index={index}
                item={item}
                idPrefix="rx-item"
                mode={{ kind: 'prescription', country }}
                allergyMatches={matchesByItem[index]}
                errors={itemErrors[index]}
                onChange={(patch) => updateItem(index, patch)}
                onRemove={items.length > 1 ? () => removeItem(index) : undefined}
              />
            ))}
          </div>
          {tooMany ? <InlineError>{copy.tooManyItems(maxItems)}</InlineError> : null}
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            disabled={items.length >= maxItems}
            onClick={() => setItems((prev) => [...prev, emptyItemDraft()])}
          >
            <Plus aria-hidden />
            {copy.addItem}
          </Button>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField htmlFor="rx-date" label={copy.dateLabel[country]} hint={copy.dateHint}>
              <Input
                id="rx-date"
                type="date"
                value={dispensationDate}
                onChange={(e) => {
                  setDispensationDate(e.target.value);
                  setError(null);
                }}
                className="tabular-nums"
              />
            </FormField>
            {needsLicense ? (
              <FormField
                htmlFor="rx-license"
                label={copy.licenseLabel[country]}
                hint={copy.licenseHint}
                error={licenseError}
              >
                <Input
                  id="rx-license"
                  value={license}
                  maxLength={60}
                  aria-invalid={licenseError ? true : undefined}
                  aria-describedby={licenseError ? fieldErrorId('rx-license') : undefined}
                  onChange={(e) => {
                    setLicense(e.target.value);
                    setLicenseError(null);
                    setError(null);
                  }}
                />
              </FormField>
            ) : null}
          </div>
          <FormField htmlFor="rx-notes" label={copy.notesLabel}>
            <textarea
              id="rx-notes"
              rows={2}
              value={notes}
              maxLength={1000}
              onChange={(e) => {
                setNotes(e.target.value);
                setError(null);
              }}
              className={cn(fieldClass, 'h-auto font-[inherit]')}
            />
          </FormField>

          {alertKey !== null ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-ink"
            >
              <p className="font-semibold text-danger">{copy.allergyTitle}</p>
              <p>{alertDetail}</p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-danger)]"
                  checked={confirmed}
                  onChange={(e) => setConfirmedKey(e.target.checked ? alertKey : null)}
                />
                <span>{copy.allergyConfirm}</span>
              </label>
            </div>
          ) : null}
        </>
      )}
    </FormModal>
  );
}
