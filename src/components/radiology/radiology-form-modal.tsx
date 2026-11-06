'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { addMonths } from '@/lib/appointments/calendar-grid';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listEquipment, type Equipment } from '@/lib/equipment/equipment-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import {
  RADIOLOGY_CATEGORY_LABELS,
  RADIOLOGY_KIND_LABELS,
  createRadiologyRecord,
  updateRadiologyRecord,
  type RadiologyLicenseCategory,
  type RadiologyRecord,
  type RadiologyRecordKind,
} from '@/lib/radiology/radiology-api';
import { proposedExpiresOn } from '@/lib/radiology/radiology-format';
import { listStaff, type StaffMember } from '@/lib/staff/staff-api';
import { FieldError } from '@/components/errors/field-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

export const radiologyFormCopy = {
  createTitle: 'Nuevo documento de rayos X',
  editTitle: (kind: RadiologyRecordKind) =>
    kind === 'LICENSE' ? 'Editar licencia' : 'Editar control de calidad',
  description:
    'La licencia de práctica o el informe de control de calidad de la sede, con su vencimiento.',
  kind: 'Tipo de documento',
  location: 'Sede',
  inactiveLocation: (name: string) => `${name} (inactiva)`,
  equipment: 'Equipo de rayos X (opcional)',
  equipmentNone: 'Toda la sede',
  equipmentError: 'No pudimos cargar los equipos',
  equipmentHint: 'Solo los equipos de tipo «Rayos X» activos de la sede.',
  equipmentMovedHint: 'Al cambiar de sede se quita el equipo, salvo que elijas uno de la sede nueva.',
  category: 'Categoría de la licencia',
  categoryPlaceholder: 'Elige la categoría',
  referenceLicense: 'Número o resolución',
  referenceQuality: 'Número del informe (opcional)',
  issuerLicense: 'Autoridad que la expidió',
  issuerQuality: 'Empresa que hizo el control',
  issuedOn: 'Fecha de expedición',
  expiresOn: 'Fecha de vencimiento (opcional)',
  expiresProposed: (date: string) => `Si la dejas vacía, vence el ${date}.`,
  expiresPending: 'Si la dejas vacía, se calcula con la fecha de expedición.',
  officer: 'Encargado de protección radiológica',
  officerNone: 'Sin indicar',
  officerOther: 'Otra persona (escribir el nombre)',
  officerName: 'Nombre del encargado',
  staffError: 'No pudimos cargar el personal',
  notes: 'Notas',
  create: 'Registrar documento',
  save: 'Guardar cambios',
  categoryRequired: 'Elige la categoría de la licencia.',
  referenceRequired: 'Escribe el número o la resolución de la licencia.',
  issuerRequired: 'Escribe quién expidió el documento.',
  issuedRequired: 'Elige la fecha de expedición.',
  issuedFuture: 'La fecha de expedición no puede ser futura.',
  expiresBefore: 'El vencimiento tiene que ser posterior a la expedición.',
  expiresTooFar: 'El vencimiento no puede ser a más de 10 años de la expedición.',
  officerNameRequired: 'Escribe el nombre del encargado o elige «Sin indicar».',
  genericError: 'No pudimos guardar el documento. Intenta de nuevo.',
};

const copy = radiologyFormCopy;
const OTHER = '__other__';

interface FieldErrors {
  category?: string;
  reference?: string;
  issuer?: string;
  issuedOn?: string;
  expiresOn?: string;
  officerName?: string;
}

interface RadiologyFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sedes de la clínica: se eligen las activas; al editar, la del documento aunque esté desactivada. */
  locations: ClinicLocation[];
  /** Sede propuesta al crear. */
  defaultLocationId: string;
  /** Sin documento: alta. Con documento: edición (el tipo no cambia). */
  record?: RadiologyRecord | null;
  onSaved: (record: RadiologyRecord) => void;
}

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/**
 * El vencimiento guardado se muestra solo si NO es el calculado: si coincide,
 * el campo queda vacío y cambiar la expedición o la categoría lo recalcula.
 */
function initialExpires(record: RadiologyRecord | null | undefined): string | null {
  if (!record) return null;
  const proposed = proposedExpiresOn(record.kind, record.category, record.issuedOn);
  return proposed === record.expiresOn ? null : record.expiresOn;
}

/**
 * Alta y edición de una licencia o un control de calidad de rayos X (DX-544,
 * solo ADMIN). Sin vencimiento, la API lo calcula; aquí se anuncia. La API
 * valida lo mismo y su mensaje sale aquí si lo rechaza. El padre lo monta con
 * una `key` por apertura.
 */
export function RadiologyFormModal({
  open,
  onOpenChange,
  token,
  locations,
  defaultLocationId,
  record,
  onSaved,
}: RadiologyFormModalProps) {
  const editing = !!record;
  const [kind, setKind] = useState<RadiologyRecordKind>(record?.kind ?? 'LICENSE');
  const [locationId, setLocationId] = useState(record?.locationId ?? defaultLocationId);
  const [equipmentId, setEquipmentId] = useState(record?.equipmentId ?? '');
  const [category, setCategory] = useState<RadiologyLicenseCategory | ''>(record?.category ?? '');
  const [reference, setReference] = useState(record?.reference ?? '');
  const [issuer, setIssuer] = useState(record?.issuer ?? '');
  const [issuedOn, setIssuedOn] = useState<string | null>(record?.issuedOn ?? null);
  const [expiresOn, setExpiresOn] = useState<string | null>(initialExpires(record));
  const [officerChoice, setOfficerChoice] = useState(
    record?.officerUserId ?? (record?.officerName ? OTHER : ''),
  );
  const [officerName, setOfficerName] = useState(record?.officerName ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [xrays, setXrays] = useState<Equipment[] | null>(null);
  const [xraysFailed, setXraysFailed] = useState(false);
  const [xraysKey, setXraysKey] = useState(0);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [staffFailed, setStaffFailed] = useState(false);
  const [staffKey, setStaffKey] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const stamp = useSedeStamp(token, [locationId]);

  const location = locations.find((l) => l.id === locationId);
  const locationOptions = locations.filter((l) => l.isActive || l.id === record?.locationId);
  const today = location?.timeZone ? sedeToday(location.timeZone) : undefined;
  const isLicense = kind === 'LICENSE';
  const proposed = proposedExpiresOn(kind, isLicense && category !== '' ? category : null, issuedOn);
  const proposedLabel = proposed ? stamp.maybe.civilDate(proposed, locationId) : null;
  const moved = editing && locationId !== record.locationId;

  useEffect(() => {
    if (!open || !locationId) return;
    let cancelled = false;
    listEquipment(token, { locationId, status: 'ACTIVE', pageSize: 100 })
      .then((res) => {
        if (cancelled) return;
        setXrays(res.items.filter((e) => e.category === 'XRAY'));
        setXraysFailed(false);
      })
      .catch(() => {
        if (!cancelled) setXraysFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, locationId, open, xraysKey]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listStaff(token)
      .then((rows) => {
        if (cancelled) return;
        setStaff(rows);
        setStaffFailed(false);
      })
      .catch(() => {
        if (!cancelled) setStaffFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, open, staffKey]);

  function clear(field: keyof FieldErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function changeLocation(next: string) {
    setLocationId(next);
    setEquipmentId('');
    setXrays(null);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (isLicense && category === '') next.category = copy.categoryRequired;
    if (isLicense && reference.trim() === '') next.reference = copy.referenceRequired;
    if (issuer.trim() === '') next.issuer = copy.issuerRequired;
    if (!issuedOn) next.issuedOn = copy.issuedRequired;
    else if (today && issuedOn > today) next.issuedOn = copy.issuedFuture;
    if (expiresOn && issuedOn) {
      if (expiresOn <= issuedOn) next.expiresOn = copy.expiresBefore;
      else if (expiresOn > addMonths(issuedOn, 120)) next.expiresOn = copy.expiresTooFar;
    }
    if (officerChoice === OTHER && officerName.trim() === '') next.officerName = copy.officerNameRequired;
    return next;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean) || !issuedOn) return;
    const fields = {
      equipmentId: equipmentId === '' ? null : equipmentId,
      category: isLicense ? (category as RadiologyLicenseCategory) : null,
      reference: orNull(reference),
      issuer: issuer.trim(),
      issuedOn,
      expiresOn,
      officerUserId: officerChoice !== '' && officerChoice !== OTHER ? officerChoice : null,
      officerName: officerChoice === OTHER ? officerName.trim() : null,
      notes: orNull(notes),
    };
    setSubmitting(true);
    try {
      const saved = record
        ? await updateRadiologyRecord(token, record.id, {
            ...fields,
            ...(locationId !== record.locationId ? { locationId } : {}),
          })
        : await createRadiologyRecord(token, { kind, locationId, ...fields });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={record ? copy.editTitle(record.kind) : copy.createTitle}
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
        {editing ? null : (
          <FormField htmlFor="radiology-kind" label={copy.kind}>
            <NativeSelect
              id="radiology-kind"
              value={kind}
              disabled={submitting}
              onChange={(e) => {
                setKind(e.target.value as RadiologyRecordKind);
                setErrors({});
              }}
            >
              {(Object.keys(RADIOLOGY_KIND_LABELS) as RadiologyRecordKind[]).map((key) => (
                <option key={key} value={key}>
                  {RADIOLOGY_KIND_LABELS[key]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        <FormField htmlFor="radiology-location" label={copy.location}>
          <NativeSelect
            id="radiology-location"
            value={locationId}
            disabled={submitting}
            onChange={(e) => changeLocation(e.target.value)}
          >
            {locationOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.isActive ? l.name : copy.inactiveLocation(l.name)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          htmlFor="radiology-equipment"
          label={copy.equipment}
          hint={moved ? copy.equipmentMovedHint : copy.equipmentHint}
          hintId="radiology-equipment-hint"
          className={editing ? undefined : 'sm:col-span-2'}
        >
          {xraysFailed ? (
            <FieldError label={copy.equipmentError} onRetry={() => setXraysKey((k) => k + 1)} />
          ) : (
            <NativeSelect
              id="radiology-equipment"
              value={equipmentId}
              disabled={submitting || xrays === null}
              aria-describedby="radiology-equipment-hint"
              onChange={(e) => setEquipmentId(e.target.value)}
            >
              <option value="">{copy.equipmentNone}</option>
              {record?.equipmentId && record.equipmentId === equipmentId && !xrays?.some((x) => x.id === equipmentId) ? (
                <option value={record.equipmentId}>{record.equipmentName ?? copy.equipment}</option>
              ) : null}
              {(xrays ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {isLicense ? (
          <FormField htmlFor="radiology-category" label={copy.category} error={errors.category}>
            <NativeSelect
              id="radiology-category"
              value={category}
              disabled={submitting}
              onChange={(e) => {
                setCategory(e.target.value as RadiologyLicenseCategory | '');
                clear('category');
              }}
              aria-invalid={errors.category ? true : undefined}
              aria-describedby={errors.category ? fieldErrorId('radiology-category') : undefined}
            >
              <option value="">{copy.categoryPlaceholder}</option>
              {(Object.keys(RADIOLOGY_CATEGORY_LABELS) as RadiologyLicenseCategory[]).map((key) => (
                <option key={key} value={key}>
                  {RADIOLOGY_CATEGORY_LABELS[key]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : null}
        <FormField
          htmlFor="radiology-reference"
          label={isLicense ? copy.referenceLicense : copy.referenceQuality}
          error={errors.reference}
          className={isLicense ? undefined : 'sm:col-span-2'}
        >
          <Input
            id="radiology-reference"
            value={reference}
            maxLength={80}
            disabled={submitting}
            onChange={(e) => {
              setReference(e.target.value);
              clear('reference');
            }}
            aria-invalid={errors.reference ? true : undefined}
            aria-describedby={errors.reference ? fieldErrorId('radiology-reference') : undefined}
          />
        </FormField>
      </div>

      <FormField
        htmlFor="radiology-issuer"
        label={isLicense ? copy.issuerLicense : copy.issuerQuality}
        error={errors.issuer}
      >
        <Input
          id="radiology-issuer"
          value={issuer}
          maxLength={120}
          disabled={submitting}
          onChange={(e) => {
            setIssuer(e.target.value);
            clear('issuer');
          }}
          aria-invalid={errors.issuer ? true : undefined}
          aria-describedby={errors.issuer ? fieldErrorId('radiology-issuer') : undefined}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="radiology-issued" label={copy.issuedOn} error={errors.issuedOn}>
          <DatePicker
            id="radiology-issued"
            name="issuedOn"
            max={today}
            value={issuedOn}
            disabled={submitting}
            onChange={(value) => {
              setIssuedOn(value);
              clear('issuedOn');
            }}
            aria-invalid={errors.issuedOn ? true : undefined}
            aria-describedby={errors.issuedOn ? fieldErrorId('radiology-issued') : undefined}
          />
        </FormField>
        <FormField
          htmlFor="radiology-expires"
          label={copy.expiresOn}
          hint={proposedLabel ? copy.expiresProposed(proposedLabel) : copy.expiresPending}
          hintId="radiology-expires-hint"
          error={errors.expiresOn}
        >
          <DatePicker
            id="radiology-expires"
            name="expiresOn"
            value={expiresOn}
            disabled={submitting}
            onChange={(value) => {
              setExpiresOn(value);
              clear('expiresOn');
            }}
            aria-invalid={errors.expiresOn ? true : undefined}
            aria-describedby={errors.expiresOn ? fieldErrorId('radiology-expires') : 'radiology-expires-hint'}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="radiology-officer" label={copy.officer}>
          {staffFailed ? (
            <FieldError label={copy.staffError} onRetry={() => setStaffKey((k) => k + 1)} />
          ) : (
            <NativeSelect
              id="radiology-officer"
              value={officerChoice}
              disabled={submitting || staff === null}
              onChange={(e) => {
                setOfficerChoice(e.target.value);
                clear('officerName');
              }}
            >
              <option value="">{copy.officerNone}</option>
              {record?.officerUserId &&
              record.officerUserId === officerChoice &&
              !staff?.some((m) => m.userId === officerChoice) ? (
                <option value={record.officerUserId}>{record.officerMemberName ?? copy.officer}</option>
              ) : null}
              {(staff ?? []).map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.fullName}
                </option>
              ))}
              <option value={OTHER}>{copy.officerOther}</option>
            </NativeSelect>
          )}
        </FormField>
        {officerChoice === OTHER ? (
          <FormField htmlFor="radiology-officer-name" label={copy.officerName} error={errors.officerName}>
            <Input
              id="radiology-officer-name"
              value={officerName}
              maxLength={120}
              disabled={submitting}
              onChange={(e) => {
                setOfficerName(e.target.value);
                clear('officerName');
              }}
              aria-invalid={errors.officerName ? true : undefined}
              aria-describedby={errors.officerName ? fieldErrorId('radiology-officer-name') : undefined}
            />
          </FormField>
        ) : null}
      </div>

      <FormField htmlFor="radiology-notes" label={copy.notes}>
        <Textarea
          id="radiology-notes"
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
