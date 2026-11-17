'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import { listAppointments, type ListAppointment } from '@/lib/appointments/appointments-api';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { getPlan, listPlans, type TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import {
  canManageDentalLabs,
  createLabOrder,
  DENTAL_LABS_SETTINGS_HREF,
  LAB_LIMITS as L,
  labOrderNumberLabel,
  listDentalLabs,
  serviceOptionLabel,
  suggestLabOrderDueDate,
  updateLabOrder,
  type CreateLabOrderInput,
  type DentalLab,
  type LabOrder,
  type UpdateLabOrderInput,
} from '@/lib/lab-orders/lab-orders-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { FieldError } from '@/components/errors/field-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { ToothChipsInput } from '@/components/patient-documents/tooth-chips-input';
import { Callout } from '@/components/ui/callout';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

export const labOrderFormCopy = {
  createTitle: 'Nueva orden de laboratorio',
  editTitle: (n: string) => `Editar la orden ${n}`,
  correctTitle: (n: string) => `Corregir la orden ${n}`,
  description:
    'La prescripción para el laboratorio dental. Se guarda como borrador; al enviarla ya no cambia: se corrige con una orden nueva.',
  correctDescription: (n: string) =>
    `La orden ${n} ya se envió y no cambia. Esta orden nueva la sustituye y queda ligada a ella («Corrige la orden ${n}»).`,
  planItem: 'Ítem del plan (opcional)',
  planItemHint: 'Precarga el diente y la prestación.',
  noPlanItem: 'Sin ítem del plan',
  planItemOption: (tooth: string, procedure: string) => (tooth ? `Diente ${tooth} · ${procedure}` : procedure),
  planItemsError: 'Plan sin cargar',
  lab: 'Laboratorio',
  chooseLab: 'Elige un laboratorio',
  labsError: 'Laboratorios sin cargar',
  noLabsTitle: 'La clínica aún no tiene laboratorios dentales',
  noLabsAdmin: 'Añade el laboratorio y sus servicios en Ajustes › Laboratorios dentales.',
  noLabsOther: 'Pide a administración que añada el laboratorio en Ajustes › Laboratorios dentales.',
  goToSettings: 'Ir a Laboratorios dentales',
  service: 'Servicio (opcional)',
  serviceHint: 'Con servicio, la fecha prometida se calcula con su plazo en días hábiles de la sede.',
  noService: 'Sin servicio',
  workDescription: 'Trabajo',
  workPlaceholder: 'Por ejemplo, Corona de zirconio',
  teeth: 'Dientes (opcional)',
  dueOn: 'Fecha prometida (opcional)',
  dueSuggested: (days: number) =>
    `Sugerida: ${days === 1 ? '1 día hábil' : `${days} días hábiles`} desde hoy con el horario de la sede. Se puede cambiar.`,
  dueHint: 'El día en que el laboratorio promete devolver el trabajo.',
  shade: 'Color o tono (opcional)',
  shadePlaceholder: 'Por ejemplo, A2',
  material: 'Material (opcional)',
  materialPlaceholder: 'Por ejemplo, Zirconio monolítico',
  instructions: 'Instrucciones (opcional)',
  appointment: 'Cita de colocación (opcional)',
  appointmentHint: 'Las próximas citas del paciente (60 días).',
  noAppointment: 'Sin cita',
  appointmentsError: 'Citas sin cargar',
  submitCreate: 'Guardar borrador',
  submitEdit: 'Guardar cambios',
  submitCorrect: 'Crear orden corregida',
  labRequired: 'Elige el laboratorio.',
  descriptionRequired: 'Escribe el trabajo que se pide.',
  teethInvalid: 'Revisa el código del diente o bórralo.',
  genericError: 'No pudimos guardar la orden. Intenta de nuevo.',
};

const copy = labOrderFormCopy;

export type LabOrderFormMode =
  | { kind: 'create'; planItemId: string | null }
  | { kind: 'edit'; order: LabOrder }
  | { kind: 'correct'; order: LabOrder };

interface LabOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  mode: LabOrderFormMode;
  onSaved: (order: LabOrder) => void;
}

interface PlanItemOption {
  id: string;
  tooth: string;
  procedure: string;
}

/** Los ítems de los planes vivos del paciente, sin cargos por inasistencia. */
async function loadPlanItems(token: string, patientId: string): Promise<PlanItemOption[]> {
  const [plans, catalog] = await Promise.all([
    listPlans(token, patientId),
    listCatalogItems(token, { kind: 'PROCEDURE' }),
  ]);
  const live = plans.filter((p) => p.status !== 'CANCELLED' && p.status !== 'REJECTED');
  const details = await Promise.all(live.map((p) => getPlan(token, p.id)));
  const byId = new Map<string, DentalCatalogItem>(catalog.map((c) => [c.id, c]));
  return details
    .flatMap((plan) => plan.items ?? [])
    .filter((item: TreatmentPlanItem) => !item.cancellationFeeAppointmentId)
    .map((item) => ({
      id: item.id,
      tooth: item.toothNumber,
      procedure: byId.get(item.catalogItemId)?.labelEs ?? item.catalogItemId,
    }));
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const OPEN_APPOINTMENT = new Set<ListAppointment['status']>(['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_CHAIR']);

/** Las próximas citas vivas del paciente (la API filtra la agenda por rango). */
async function loadAppointments(token: string, patientId: string): Promise<ListAppointment[]> {
  const now = Date.now();
  const list = await listAppointments(token, {
    from: new Date(now - 60 * 60 * 1000).toISOString(),
    to: new Date(now + SIXTY_DAYS_MS).toISOString(),
  });
  return list
    .filter((a) => a.patientId === patientId && OPEN_APPOINTMENT.has(a.status))
    .sort((a, b) => a.start.localeCompare(b.start));
}

function nullIfBlank(text: string): string | null {
  const t = text.trim();
  return t === '' ? null : t;
}

function sameTeeth(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/**
 * «Nueva orden», «Editar» (un borrador) y «Corregir» (una enviada: orden nueva
 * con `replacesOrderId`) de la sección «Laboratorio» (DX-017). DENTIST y
 * ADMIN. El ítem del plan precarga dientes y trabajo; el servicio pide la fecha
 * prometida sugerida (días hábiles de la sede) mientras no se cambie a mano.
 * Un fallo del envío llega en el banner del formulario (escalón 4); un selector
 * que no carga se queda en su sitio con su reintento (escalón 2).
 */
export function LabOrderFormDialog({ open, onOpenChange, token, patientId, mode, onSaved }: LabOrderFormDialogProps) {
  const ids = useId();
  const base = mode.kind === 'create' ? null : mode.order;
  const isAdmin = canManageDentalLabs(getTokenRole(token));
  const [labs, setLabs] = useState<DentalLab[] | null>(null);
  const [labsFailed, setLabsFailed] = useState(false);
  const [labsReload, setLabsReload] = useState(0);
  const [planItems, setPlanItems] = useState<PlanItemOption[] | null>(null);
  const [planItemsFailed, setPlanItemsFailed] = useState(false);
  const [planItemsReload, setPlanItemsReload] = useState(0);
  const [appointments, setAppointments] = useState<ListAppointment[] | null>(null);
  const [appointmentsFailed, setAppointmentsFailed] = useState(false);
  const [appointmentsReload, setAppointmentsReload] = useState(0);

  const [planItemId, setPlanItemId] = useState<string>(
    mode.kind === 'create' ? (mode.planItemId ?? '') : (base?.treatmentPlanItem?.id ?? ''),
  );
  const [prefilledFromItem, setPrefilledFromItem] = useState(false);
  const [labId, setLabId] = useState(base?.lab.id ?? '');
  const [serviceId, setServiceId] = useState(base?.service?.id ?? '');
  const [description, setDescription] = useState(base?.description ?? '');
  const [teeth, setTeeth] = useState<string[]>(base?.toothNumbers ?? []);
  const [teethInvalid, setTeethInvalid] = useState(false);
  // Al corregir, la fecha se vuelve a sugerir desde hoy; al editar, la guardada.
  const [dueOn, setDueOn] = useState<string | null>(mode.kind === 'edit' ? (base?.dueOn ?? null) : null);
  const [dueTouched, setDueTouched] = useState(mode.kind === 'edit');
  const [suggestedDays, setSuggestedDays] = useState<number | null>(null);
  const [shade, setShade] = useState(base?.shade ?? '');
  const [material, setMaterial] = useState(base?.material ?? '');
  const [instructions, setInstructions] = useState(base?.instructions ?? '');
  const [appointmentId, setAppointmentId] = useState(base?.appointment?.id ?? '');
  const [labError, setLabError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stamp = useSedeStamp(token, base ? [base.locationId] : undefined);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listDentalLabs(token)
      .then((list) => {
        if (cancelled) return;
        setLabs(list);
        setLabsFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLabsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, labsReload]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadPlanItems(token, patientId)
      .then((list) => {
        if (cancelled) return;
        setPlanItems(list);
        setPlanItemsFailed(false);
      })
      .catch(() => {
        if (!cancelled) setPlanItemsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, planItemsReload]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadAppointments(token, patientId)
      .then((list) => {
        if (cancelled) return;
        setAppointments(list);
        setAppointmentsFailed(false);
      })
      .catch(() => {
        if (!cancelled) setAppointmentsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, appointmentsReload]);

  // El ítem del acceso directo del plan: precarga dientes y trabajo una vez
  // que llegan los ítems (si no se escribió ya algo).
  const shortcutItem =
    mode.kind === 'create' && mode.planItemId && !prefilledFromItem
      ? (planItems?.find((i) => i.id === mode.planItemId) ?? null)
      : null;
  if (shortcutItem) {
    setPrefilledFromItem(true);
    if (teeth.length === 0 && shortcutItem.tooth) setTeeth([shortcutItem.tooth]);
    if (description.trim() === '') setDescription(shortcutItem.procedure.slice(0, L.descriptionMax));
  }

  // La fecha prometida sugerida para el servicio, mientras no se toque a mano.
  useEffect(() => {
    if (!open || !serviceId || dueTouched) return;
    let cancelled = false;
    suggestLabOrderDueDate(token, { serviceId, locationId: base?.locationId ?? null })
      .then((s) => {
        if (cancelled) return;
        setDueOn(s.dueOn);
        setSuggestedDays(s.leadTimeBusinessDays);
      })
      .catch(() => {
        // Sin sugerencia la fecha sigue siendo un campo libre (y el servidor
        // pone la sugerida si se guarda sin ella).
        if (!cancelled) setSuggestedDays(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, serviceId, dueTouched, base?.locationId]);

  const lab = labs?.find((l) => l.id === labId) ?? null;
  // El laboratorio y el servicio de una orden guardada siguen en el selector
  // aunque se hayan desactivado después (no se pierde lo que ya tenía).
  const labOptions = labs ?? [];
  const services = (lab?.services ?? []).filter((s) => s.active || s.id === base?.service?.id);

  function choosePlanItem(id: string) {
    setPlanItemId(id);
    const item = planItems?.find((i) => i.id === id);
    if (!item) return;
    if (item.tooth && !teeth.includes(item.tooth)) setTeeth((prev) => [...prev, item.tooth].slice(0, L.teethMax));
    if (description.trim() === '') {
      setDescription(item.procedure.slice(0, L.descriptionMax));
      setDescriptionError(null);
    }
  }

  function chooseLab(id: string) {
    setLabId(id);
    setLabError(null);
    // El servicio es del laboratorio: al cambiarlo, se elige otra vez.
    setServiceId('');
    setSuggestedDays(null);
  }

  function chooseService(id: string) {
    setServiceId(id);
    if (!id) setSuggestedDays(null);
    // Un servicio nuevo vuelve a sugerir, salvo al editar una fecha ya puesta.
    if (mode.kind !== 'edit') setDueTouched(false);
  }

  function buildCreate(): CreateLabOrderInput {
    return {
      labId,
      serviceId: serviceId || null,
      description: description.trim(),
      toothNumbers: teeth,
      shade: nullIfBlank(shade),
      material: nullIfBlank(material),
      instructions: nullIfBlank(instructions),
      dueOn,
      treatmentPlanItemId: planItemId || null,
      appointmentId: appointmentId || null,
      ...(mode.kind === 'correct' ? { replacesOrderId: mode.order.id, locationId: mode.order.locationId } : {}),
    };
  }

  /** Solo lo que cambió (la API responde 400 a un PATCH vacío). */
  function buildPatch(order: LabOrder): UpdateLabOrderInput {
    const patch: UpdateLabOrderInput = {};
    if (labId !== order.lab.id) patch.labId = labId;
    if ((serviceId || null) !== (order.service?.id ?? null)) patch.serviceId = serviceId || null;
    if (description.trim() !== order.description) patch.description = description.trim();
    if (!sameTeeth(teeth, order.toothNumbers)) patch.toothNumbers = teeth;
    if (nullIfBlank(shade) !== order.shade) patch.shade = nullIfBlank(shade);
    if (nullIfBlank(material) !== order.material) patch.material = nullIfBlank(material);
    if (nullIfBlank(instructions) !== order.instructions) patch.instructions = nullIfBlank(instructions);
    if (dueOn !== order.dueOn) patch.dueOn = dueOn;
    if ((planItemId || null) !== (order.treatmentPlanItem?.id ?? null)) patch.treatmentPlanItemId = planItemId || null;
    if ((appointmentId || null) !== (order.appointment?.id ?? null)) patch.appointmentId = appointmentId || null;
    return patch;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let invalid = false;
    if (!labId) {
      setLabError(copy.labRequired);
      invalid = true;
    }
    if (description.trim() === '') {
      setDescriptionError(copy.descriptionRequired);
      invalid = true;
    }
    if (invalid) return;
    if (teethInvalid) {
      setError(copy.teethInvalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let saved: LabOrder;
      if (mode.kind === 'edit') {
        const patch = buildPatch(mode.order);
        if (Object.keys(patch).length === 0) {
          onOpenChange(false);
          return;
        }
        saved = await updateLabOrder(token, mode.order.id, patch);
      } else {
        saved = await createLabOrder(token, patientId, buildCreate());
      }
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const number = base ? labOrderNumberLabel(base.number) : '';
  const title =
    mode.kind === 'create' ? copy.createTitle : mode.kind === 'edit' ? copy.editTitle(number) : copy.correctTitle(number);
  const noLabs = labs !== null && labs.length === 0 && !base;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={mode.kind === 'correct' ? copy.correctDescription(number) : copy.description}
      onSubmit={handleSubmit}
      submitLabel={mode.kind === 'create' ? copy.submitCreate : mode.kind === 'edit' ? copy.submitEdit : copy.submitCorrect}
      submitting={submitting}
      submitDisabled={noLabs}
      error={error}
      touchTargets
      ownValidation
    >
      <div className="flex flex-col gap-4">
        {noLabs ? (
          <Callout tone="warning" title={copy.noLabsTitle}>
            <p>{isAdmin ? copy.noLabsAdmin : copy.noLabsOther}</p>
            {isAdmin ? (
              <Link href={DENTAL_LABS_SETTINGS_HREF} className="mt-1 inline-block font-medium text-primary-text underline-offset-4 hover:underline">
                {copy.goToSettings}
              </Link>
            ) : null}
          </Callout>
        ) : null}

        <FormField htmlFor={`${ids}-item`} label={copy.planItem} hint={planItemsFailed ? undefined : copy.planItemHint}>
          {planItemsFailed ? (
            <FieldError
              label={copy.planItemsError}
              retryId={`${ids}-item`}
              className="h-10"
              onRetry={() => {
                setPlanItemsFailed(false);
                setPlanItemsReload((k) => k + 1);
              }}
            />
          ) : (
            <NativeSelect
              id={`${ids}-item`}
              value={planItemId}
              disabled={submitting || planItems === null}
              onChange={(e) => choosePlanItem(e.target.value)}
            >
              <option value="">{copy.noPlanItem}</option>
              {(planItems ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {copy.planItemOption(i.tooth, i.procedure)}
                </option>
              ))}
              {/* El ítem de la orden guardada aunque su plan ya no esté vivo. */}
              {base?.treatmentPlanItem && planItems && !planItems.some((i) => i.id === base.treatmentPlanItem?.id) ? (
                <option value={base.treatmentPlanItem.id}>
                  {copy.planItemOption(base.treatmentPlanItem.toothNumber, base.treatmentPlanItem.procedureName)}
                </option>
              ) : null}
            </NativeSelect>
          )}
        </FormField>

        <FormField htmlFor={`${ids}-lab`} label={copy.lab} error={labError}>
          {labsFailed ? (
            <FieldError
              label={copy.labsError}
              retryId={`${ids}-lab`}
              className="h-10"
              onRetry={() => {
                setLabsFailed(false);
                setLabsReload((k) => k + 1);
              }}
            />
          ) : (
            <NativeSelect
              id={`${ids}-lab`}
              value={labId}
              disabled={submitting || labs === null}
              aria-invalid={labError ? true : undefined}
              aria-describedby={labError ? fieldErrorId(`${ids}-lab`) : undefined}
              onChange={(e) => chooseLab(e.target.value)}
            >
              <option value="">{copy.chooseLab}</option>
              {labOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              {base && labs && !labs.some((l) => l.id === base.lab.id) ? (
                <option value={base.lab.id}>{base.lab.name}</option>
              ) : null}
            </NativeSelect>
          )}
        </FormField>

        <FormField htmlFor={`${ids}-service`} label={copy.service} hint={copy.serviceHint}>
          <NativeSelect
            id={`${ids}-service`}
            value={serviceId}
            disabled={submitting || !labId}
            onChange={(e) => chooseService(e.target.value)}
          >
            <option value="">{copy.noService}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {serviceOptionLabel(s)}
              </option>
            ))}
            {base?.service && labId === base.lab.id && !services.some((s) => s.id === base.service?.id) ? (
              <option value={base.service.id}>{serviceOptionLabel(base.service)}</option>
            ) : null}
          </NativeSelect>
        </FormField>

        <FormField htmlFor={`${ids}-description`} label={copy.workDescription} error={descriptionError}>
          <Input
            id={`${ids}-description`}
            value={description}
            maxLength={L.descriptionMax}
            placeholder={copy.workPlaceholder}
            autoComplete="off"
            disabled={submitting}
            aria-invalid={descriptionError ? true : undefined}
            aria-describedby={descriptionError ? fieldErrorId(`${ids}-description`) : undefined}
            onChange={(e) => {
              setDescription(e.target.value);
              setDescriptionError(null);
            }}
          />
        </FormField>

        <ToothChipsInput
          id={`${ids}-teeth`}
          label={copy.teeth}
          value={teeth}
          onChange={setTeeth}
          onInvalidChange={setTeethInvalid}
          disabled={submitting}
          max={L.teethMax}
        />

        <FormField
          htmlFor={`${ids}-due`}
          label={copy.dueOn}
          hint={!dueTouched && suggestedDays !== null && dueOn ? copy.dueSuggested(suggestedDays) : copy.dueHint}
        >
          <DatePicker
            id={`${ids}-due`}
            value={dueOn}
            disabled={submitting}
            onChange={(value) => {
              setDueOn(value);
              setDueTouched(true);
            }}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor={`${ids}-shade`} label={copy.shade}>
            <Input
              id={`${ids}-shade`}
              value={shade}
              maxLength={L.shadeMax}
              placeholder={copy.shadePlaceholder}
              autoComplete="off"
              disabled={submitting}
              onChange={(e) => setShade(e.target.value)}
            />
          </FormField>
          <FormField htmlFor={`${ids}-material`} label={copy.material}>
            <Input
              id={`${ids}-material`}
              value={material}
              maxLength={L.materialMax}
              placeholder={copy.materialPlaceholder}
              autoComplete="off"
              disabled={submitting}
              onChange={(e) => setMaterial(e.target.value)}
            />
          </FormField>
        </div>

        <FormField htmlFor={`${ids}-instructions`} label={copy.instructions}>
          <Textarea
            id={`${ids}-instructions`}
            rows={3}
            autoGrow
            value={instructions}
            maxLength={L.instructionsMax}
            disabled={submitting}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </FormField>

        <FormField
          htmlFor={`${ids}-appointment`}
          label={copy.appointment}
          hint={appointmentsFailed ? undefined : copy.appointmentHint}
        >
          {appointmentsFailed ? (
            <FieldError
              label={copy.appointmentsError}
              retryId={`${ids}-appointment`}
              className="h-10"
              onRetry={() => {
                setAppointmentsFailed(false);
                setAppointmentsReload((k) => k + 1);
              }}
            />
          ) : (
            <NativeSelect
              id={`${ids}-appointment`}
              value={appointmentId}
              disabled={submitting || appointments === null}
              onChange={(e) => setAppointmentId(e.target.value)}
            >
              <option value="">{copy.noAppointment}</option>
              {(appointments ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {stamp.dateTime(a.start, a.locationId)}
                </option>
              ))}
              {base?.appointment && appointments && !appointments.some((a) => a.id === base.appointment?.id) ? (
                <option value={base.appointment.id}>{stamp.dateTime(base.appointment.start, base.locationId)}</option>
              ) : null}
            </NativeSelect>
          )}
        </FormField>
      </div>
    </FormModal>
  );
}
