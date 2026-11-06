'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listChairs, type Chair } from '@/lib/chairs/chairs-api';
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_RISK_LABELS,
  createEquipment,
  updateEquipment,
  type Equipment,
  type EquipmentCategory,
  type EquipmentRiskClass,
  type UpdateEquipmentInput,
} from '@/lib/equipment/equipment-api';
import { parseIntervalMonths } from '@/lib/equipment/equipment-format';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { FieldError } from '@/components/errors/field-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

export const equipmentFormCopy = {
  createTitle: 'Nuevo equipo',
  editTitle: 'Editar equipo',
  description:
    'Los datos de la hoja de vida del equipo. La periodicidad programa el mantenimiento preventivo.',
  location: 'Sede',
  chair: 'Sillón (opcional)',
  chairNone: 'Sin sillón',
  chairsError: 'No pudimos cargar los sillones',
  chairMovedHint: 'Al cambiar de sede se quita el sillón, salvo que elijas uno de la sede nueva.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Autoclave sala 1',
  category: 'Tipo',
  brand: 'Marca',
  model: 'Modelo',
  serialNumber: 'Número de serie',
  sanitaryRegistration: 'Registro sanitario',
  sanitaryRegistrationHint: 'El registro del producto, tal como figura en su documentación.',
  riskClass: 'Clasificación de riesgo (opcional)',
  riskNone: 'Sin clasificar',
  acquiredOn: 'Fecha de adquisición',
  interval: 'Mantenimiento preventivo cada (meses)',
  intervalHint: 'De 1 a 120. Vacío: sin programa de preventivo.',
  notes: 'Notas',
  create: 'Crear equipo',
  save: 'Guardar cambios',
  nameRequired: 'Escribe el nombre del equipo (hasta 120 caracteres).',
  intervalInvalid: 'Escribe un número entero de 1 a 120, o déjalo vacío.',
  acquiredFuture: 'La fecha de adquisición no puede ser futura.',
  genericError: 'No pudimos guardar el equipo. Intenta de nuevo.',
};

const copy = equipmentFormCopy;

interface FieldErrors {
  name?: string;
  interval?: string;
  acquiredOn?: string;
}

interface EquipmentFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sedes activas de la clínica (la del equipo se mantiene al editar). */
  locations: ClinicLocation[];
  /** Sede propuesta al crear. */
  defaultLocationId: string;
  /** Sin equipo: alta. Con equipo: edición. */
  equipment?: Equipment | null;
  onSaved: (equipment: Equipment) => void;
}

/** Texto vacío → `null` (el «borrar» de un opcional). */
const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/**
 * Alta y edición de un equipo biomédico (DX-542, solo ADMIN). La API valida lo
 * mismo y su mensaje sale aquí si lo rechaza (sillón de otra sede, fecha
 * futura…). El padre lo monta con una `key` por apertura.
 */
export function EquipmentFormModal({
  open,
  onOpenChange,
  token,
  locations,
  defaultLocationId,
  equipment,
  onSaved,
}: EquipmentFormModalProps) {
  const editing = !!equipment;
  const [locationId, setLocationId] = useState(equipment?.locationId ?? defaultLocationId);
  const [chairId, setChairId] = useState(equipment?.chairId ?? '');
  const [name, setName] = useState(equipment?.name ?? '');
  const [category, setCategory] = useState<EquipmentCategory>(equipment?.category ?? 'AUTOCLAVE');
  const [brand, setBrand] = useState(equipment?.brand ?? '');
  const [model, setModel] = useState(equipment?.model ?? '');
  const [serialNumber, setSerialNumber] = useState(equipment?.serialNumber ?? '');
  const [sanitaryRegistration, setSanitaryRegistration] = useState(equipment?.sanitaryRegistration ?? '');
  const [riskClass, setRiskClass] = useState<EquipmentRiskClass | ''>(equipment?.riskClass ?? '');
  const [acquiredOn, setAcquiredOn] = useState<string | null>(equipment?.acquiredOn ?? null);
  const [intervalText, setIntervalText] = useState(
    equipment?.maintenanceIntervalMonths ? String(equipment.maintenanceIntervalMonths) : '',
  );
  const [notes, setNotes] = useState(equipment?.notes ?? '');
  const [chairs, setChairs] = useState<Chair[] | null>(null);
  const [chairsFailed, setChairsFailed] = useState(false);
  const [chairsKey, setChairsKey] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const location = locations.find((l) => l.id === locationId);
  const today = location?.timeZone ? sedeToday(location.timeZone) : undefined;

  useEffect(() => {
    if (!open || !locationId) return;
    let cancelled = false;
    listChairs(token, locationId)
      .then((rows) => {
        if (cancelled) return;
        setChairs(rows);
        setChairsFailed(false);
      })
      .catch(() => {
        if (!cancelled) setChairsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, locationId, open, chairsKey]);

  function changeLocation(next: string) {
    setLocationId(next);
    setChairId('');
    setChairs(null);
  }

  function validate(): { next: FieldErrors; interval: number | null | undefined } {
    const next: FieldErrors = {};
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 120) next.name = copy.nameRequired;
    const interval = parseIntervalMonths(intervalText);
    if (interval === undefined) next.interval = copy.intervalInvalid;
    if (acquiredOn && today && acquiredOn > today) next.acquiredOn = copy.acquiredFuture;
    return { next, interval };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const { next, interval } = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean) || interval === undefined) return;
    const fields = {
      chairId: chairId === '' ? null : chairId,
      name: name.trim(),
      category,
      brand: orNull(brand),
      model: orNull(model),
      serialNumber: orNull(serialNumber),
      sanitaryRegistration: orNull(sanitaryRegistration),
      riskClass: riskClass === '' ? null : riskClass,
      acquiredOn,
      maintenanceIntervalMonths: interval,
      notes: orNull(notes),
    };
    setSubmitting(true);
    try {
      let saved: Equipment;
      if (equipment) {
        const body: UpdateEquipmentInput = {
          ...fields,
          ...(locationId !== equipment.locationId ? { locationId } : {}),
        };
        saved = await updateEquipment(token, equipment.id, body);
      } else {
        saved = await createEquipment(token, { locationId, ...fields });
      }
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const moved = editing && locationId !== equipment.locationId;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
      size="lg"
      touchTargets
      ownValidation
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="equipment-location" label={copy.location}>
          <NativeSelect
            id="equipment-location"
            value={locationId}
            disabled={submitting}
            onChange={(e) => changeLocation(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          htmlFor="equipment-chair"
          label={copy.chair}
          hint={moved ? copy.chairMovedHint : undefined}
          hintId="equipment-chair-hint"
        >
          {chairsFailed ? (
            <FieldError label={copy.chairsError} onRetry={() => setChairsKey((k) => k + 1)} />
          ) : (
            <NativeSelect
              id="equipment-chair"
              value={chairId}
              disabled={submitting || chairs === null}
              aria-describedby={moved ? 'equipment-chair-hint' : undefined}
              onChange={(e) => setChairId(e.target.value)}
            >
              <option value="">{copy.chairNone}</option>
              {equipment?.chairId && equipment.chairId === chairId && !chairs?.some((c) => c.id === chairId) ? (
                <option value={equipment.chairId}>{equipment.chairName ?? copy.chair}</option>
              ) : null}
              {(chairs ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>

      <FormField htmlFor="equipment-name" label={copy.name} error={errors.name}>
        <Input
          id="equipment-name"
          value={name}
          maxLength={120}
          placeholder={copy.namePlaceholder}
          disabled={submitting}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? fieldErrorId('equipment-name') : undefined}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="equipment-category" label={copy.category}>
          <NativeSelect
            id="equipment-category"
            value={category}
            disabled={submitting}
            onChange={(e) => setCategory(e.target.value as EquipmentCategory)}
          >
            {(Object.keys(EQUIPMENT_CATEGORY_LABELS) as EquipmentCategory[]).map((key) => (
              <option key={key} value={key}>
                {EQUIPMENT_CATEGORY_LABELS[key]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="equipment-risk" label={copy.riskClass}>
          <NativeSelect
            id="equipment-risk"
            value={riskClass}
            disabled={submitting}
            onChange={(e) => setRiskClass(e.target.value as EquipmentRiskClass | '')}
          >
            <option value="">{copy.riskNone}</option>
            {(Object.keys(EQUIPMENT_RISK_LABELS) as EquipmentRiskClass[]).map((key) => (
              <option key={key} value={key}>
                {EQUIPMENT_RISK_LABELS[key]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="equipment-brand" label={copy.brand}>
          <Input
            id="equipment-brand"
            value={brand}
            maxLength={80}
            disabled={submitting}
            onChange={(e) => setBrand(e.target.value)}
          />
        </FormField>
        <FormField htmlFor="equipment-model" label={copy.model}>
          <Input
            id="equipment-model"
            value={model}
            maxLength={80}
            disabled={submitting}
            onChange={(e) => setModel(e.target.value)}
          />
        </FormField>
        <FormField htmlFor="equipment-serial" label={copy.serialNumber}>
          <Input
            id="equipment-serial"
            value={serialNumber}
            maxLength={80}
            disabled={submitting}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </FormField>
        <FormField
          htmlFor="equipment-registration"
          label={copy.sanitaryRegistration}
          hint={copy.sanitaryRegistrationHint}
          hintId="equipment-registration-hint"
        >
          <Input
            id="equipment-registration"
            value={sanitaryRegistration}
            maxLength={80}
            disabled={submitting}
            aria-describedby="equipment-registration-hint"
            onChange={(e) => setSanitaryRegistration(e.target.value)}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="equipment-acquired" label={copy.acquiredOn} error={errors.acquiredOn}>
          <DatePicker
            id="equipment-acquired"
            name="acquiredOn"
            max={today}
            value={acquiredOn}
            disabled={submitting}
            onChange={(value) => {
              setAcquiredOn(value);
              if (errors.acquiredOn) setErrors((prev) => ({ ...prev, acquiredOn: undefined }));
            }}
            aria-invalid={errors.acquiredOn ? true : undefined}
            aria-describedby={errors.acquiredOn ? fieldErrorId('equipment-acquired') : undefined}
          />
        </FormField>
        <FormField
          htmlFor="equipment-interval"
          label={copy.interval}
          hint={copy.intervalHint}
          hintId="equipment-interval-hint"
          error={errors.interval}
        >
          <Input
            id="equipment-interval"
            inputMode="numeric"
            autoComplete="off"
            value={intervalText}
            disabled={submitting}
            className="tabular-nums"
            onChange={(e) => {
              setIntervalText(e.target.value);
              if (errors.interval) setErrors((prev) => ({ ...prev, interval: undefined }));
            }}
            aria-invalid={errors.interval ? true : undefined}
            aria-describedby={errors.interval ? fieldErrorId('equipment-interval') : 'equipment-interval-hint'}
          />
        </FormField>
      </div>

      <FormField htmlFor="equipment-notes" label={copy.notes}>
        <Textarea
          id="equipment-notes"
          value={notes}
          maxLength={2000}
          autoGrow
          className="max-h-60"
          disabled={submitting}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>
    </FormModal>
  );
}
