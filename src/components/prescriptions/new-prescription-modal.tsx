'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Plus } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  checkPrescriptionSafety,
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
import { PrescriptionSafetyPanel, type SafetyState } from './prescription-safety-panel';

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
  submit: 'Emitir receta',
  genericError: 'No pudimos emitir la receta. Intenta de nuevo.',
  reasonMissing: 'Escribe el motivo para emitir pese a los avisos.',
  // 409 de la API sin un texto que se pueda enseñar: aun así son avisos de
  // seguridad, y no un «los datos cambiaron».
  serverSafetyFallback:
    'La API detectó avisos de seguridad que no estaban confirmados. Revísalos antes de emitir.',
};

// El 409 de la API lista los avisos (nombran fármacos de la anamnesis): con
// varios pasa de los 240 caracteres del helper y se perdería el detalle que
// quien prescribe necesita para confirmar (revisión D-1).
const SERVER_SAFETY_MAX_LENGTH = 2000;
/** Espera tras la última tecla antes de pedir los avisos al servidor. */
export const SAFETY_CHECK_DEBOUNCE_MS = 400;

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
 * Receta segura (DX-300): mientras se escribe, el modal pide al SERVIDOR los
 * avisos de seguridad (alergias con las casillas de la anamnesis,
 * interacciones, embarazo, antirresortivos, dosis infantil por peso) y los
 * muestra agrupados por gravedad. No se emite mientras se calculan ni si la
 * comprobación falló; los bloqueantes exigen confirmación y motivo, y la API
 * los vuelve a calcular al emitir (409 sin ellos).
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
  const [safety, setSafety] = useState<SafetyState>({ kind: 'idle' });
  // Para qué contenido es `safety`: un resultado de otra versión del
  // formulario no vale para emitir.
  const [safetyFor, setSafetyFor] = useState<string | null>(null);
  const [safetyRetry, setSafetyRetry] = useState(0);

  const [templateId, setTemplateId] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([emptyItemDraft()]);
  const [dispensationDate, setDispensationDate] = useState('');
  const [notes, setNotes] = useState('');
  const [license, setLicense] = useState('');
  // La confirmación vale para UN conjunto de avisos bloqueantes: si cambian
  // (otro fármaco que también choca), hay que volver a confirmar.
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
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

  // Lo que la comprobación necesita de cada medicamento (sin vacíos).
  const safetyItems = useMemo(
    () =>
      items
        .filter((item) => item.activeIngredient.trim() !== '')
        .map((item) => ({
          activeIngredient: item.activeIngredient.trim(),
          ...(item.concentration.trim() ? { concentration: item.concentration.trim() } : {}),
          ...(item.dose.trim() ? { dose: item.dose.trim() } : {}),
          ...(item.frequency.trim() ? { frequency: item.frequency.trim() } : {}),
        })),
    [items],
  );
  const safetyKey = JSON.stringify(safetyItems);

  useEffect(() => {
    if (!open) return;
    if (safetyItems.length === 0) {
      const id = setTimeout(() => {
        setSafety({ kind: 'idle' });
        setSafetyFor(safetyKey);
      }, 0);
      return () => clearTimeout(id);
    }
    let cancelled = false;
    const id = setTimeout(() => {
      setSafety({ kind: 'loading' });
      setSafetyFor(null);
      checkPrescriptionSafety(token, patientId, safetyItems)
        .then((preview) => {
          if (cancelled) return;
          setSafety({ kind: 'ready', preview });
          setSafetyFor(safetyKey);
        })
        .catch(() => {
          if (!cancelled) setSafety({ kind: 'error' });
        });
    }, SAFETY_CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // `safetyKey` resume `safetyItems`: solo se vuelve a pedir si cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, patientId, safetyKey, safetyRetry]);

  const blockingAlerts =
    safety.kind === 'ready' ? safety.preview.alerts.filter((a) => a.severity === 'BLOCKING') : [];
  const alertKey =
    blockingAlerts.length > 0
      ? blockingAlerts.map((a) => `${a.code}|${a.activeIngredient ?? ''}|${a.message}`).join(';')
      : null;
  const confirmed = alertKey !== null && confirmedKey === alertKey;
  // Comprobación al día con lo escrito: sin ella no se emite.
  const safetyReady = safetyFor === safetyKey && safety.kind !== 'loading' && safety.kind !== 'error';
  // Sin motivo el botón sigue activo: al pulsarlo, el campo dice qué falta.
  const safetyBlocksSubmit = !safetyReady || (alertKey !== null && !confirmed);

  const country = issuer?.country ?? 'CO';
  const maxItems = issuer?.maxItems ?? 10;
  const tooMany = items.length > maxItems;
  const needsLicense = issuer !== null && issuer.professionalLicense === null;

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
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
    if (!issuer || tooMany || !safetyReady || (alertKey !== null && !confirmed)) return;
    setError(null);
    if (alertKey !== null && reason.trim() === '') {
      setReasonError(copy.reasonMissing);
      document.getElementById('rx-safety-reason')?.focus();
      return;
    }

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
      ...(alertKey !== null && confirmed
        ? { safetyOverride: true, safetyOverrideReason: reason.trim() }
        : {}),
    };
    try {
      const issued = await issuePrescription(token, patientId, input);
      onOpenChange(false);
      onIssued(issued);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // La anamnesis cambió entre la vista previa y la emisión: la API dice
        // qué avisos faltan por confirmar y se vuelven a pedir.
        setError(
          apiErrorMessage(err, {
            fallback: copy.serverSafetyFallback,
            byStatus: { 409: copy.serverSafetyFallback },
            maxLength: SERVER_SAFETY_MAX_LENGTH,
          }),
        );
        setConfirmedKey(null);
        setSafetyRetry((k) => k + 1);
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
      submitDisabled={!ready || tooMany || safetyBlocksSubmit}
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

          <p className="text-xs text-muted">{copy.requiredNote}</p>
          <div className="flex flex-col gap-3">
            {items.map((item, index) => (
              <PrescriptionItemFields
                key={index}
                index={index}
                item={item}
                idPrefix="rx-item"
                mode={{ kind: 'prescription', country }}
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

          <PrescriptionSafetyPanel
            state={safety}
            country={country}
            onRetry={() => setSafetyRetry((k) => k + 1)}
            confirmed={confirmed}
            onConfirmedChange={(checked) => setConfirmedKey(checked ? alertKey : null)}
            reason={reason}
            onReasonChange={(value) => {
              setReason(value);
              setReasonError(null);
              setError(null);
            }}
            reasonError={reasonError}
          />
        </>
      )}
    </FormModal>
  );
}
