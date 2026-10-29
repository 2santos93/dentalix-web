'use client';
import * as React from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getImplantCatalog,
  IMPLANT_KIND_LABELS,
  IMPLANT_KINDS,
  registerImplant,
  type ImplantCatalogEntry,
  type ImplantKind,
  type PatientImplant,
} from '@/lib/implants/implants-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Registrar implante',
  description:
    'Copia los datos de la etiqueta del envase. Una vez guardado no se edita: si hay un error, se anula con motivo y se registra de nuevo.',
  tooth: 'Diente (FDI)',
  toothHint: 'Por ejemplo 36. Permanentes 11–48 o temporales 51–85.',
  kind: 'Tipo de componente',
  manufacturer: 'Fabricante',
  system: 'Marca o sistema',
  reference: 'Referencia (REF)',
  lot: 'Lote',
  udi: 'UDI (opcional)',
  diameter: 'Diámetro (mm)',
  length: 'Longitud (mm)',
  sanitaryRegistration: 'Registro sanitario o certificación del producto',
  placedOn: 'Fecha de colocación',
  notes: 'Notas (opcional)',
  planItemNote: 'Se registra contra el ítem del plan desde el que lo abriste.',
  submit: 'Registrar implante',
  genericError: 'No pudimos registrar el implante. Intenta de nuevo.',
  requiredMissing: 'Completa diente, fabricante, referencia y lote.',
  invalidSize: 'El diámetro y la longitud se escriben en mm, solo con números (por ejemplo 4,1).',
};

interface RegisterImplantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Diente con el que abrir (acceso directo desde el odontograma o el plan). */
  initialTooth?: string | null;
  /** Ítem del plan que se ejecuta (acceso directo desde el plan). */
  treatmentPlanItemId?: string | null;
  onRegistered: (implant: PatientImplant) => void;
}

/** Hoy (YYYY-MM-DD) en la zona del navegador: tope del selector de fecha. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Vacío → `undefined`; texto que no es un número → `null` (no se envía). */
function parseMm(text: string): number | undefined | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function textOrUndefined(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

/**
 * Formulario «Registrar implante» (DX-191). El autocompletar de fabricantes y
 * sistemas sale de lo que la clínica ya registró; si no carga, los campos
 * siguen siendo de texto libre (las sugerencias son una ayuda, no un dato).
 * Los errores de validación del servidor (en español) se muestran arriba.
 */
export function RegisterImplantModal({
  open,
  onOpenChange,
  token,
  patientId,
  initialTooth,
  treatmentPlanItemId,
  onRegistered,
}: RegisterImplantModalProps) {
  const ids = useId();
  const [tooth, setTooth] = useState(initialTooth ?? '');
  const [kind, setKind] = useState<ImplantKind>('IMPLANT');
  const [manufacturer, setManufacturer] = useState('');
  const [system, setSystem] = useState('');
  const [reference, setReference] = useState('');
  const [lot, setLot] = useState('');
  const [udi, setUdi] = useState('');
  const [diameter, setDiameter] = useState('');
  const [length, setLength] = useState('');
  const [sanitaryRegistration, setSanitaryRegistration] = useState('');
  const [placedOn, setPlacedOn] = useState(todayLocal);
  const [notes, setNotes] = useState('');
  const [catalog, setCatalog] = useState<ImplantCatalogEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getImplantCatalog(token)
      .then((entries) => {
        if (!cancelled) setCatalog(entries);
      })
      // Sin sugerencias el formulario funciona igual: no hay nada que reintentar.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  const systems = useMemo(
    () =>
      catalog.find((c) => c.manufacturer.toLowerCase() === manufacturer.trim().toLowerCase())
        ?.systems ?? [],
    [catalog, manufacturer],
  );

  const missingRequired =
    tooth.trim() === '' || manufacturer.trim() === '' || reference.trim() === '' || lot.trim() === '';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (missingRequired) {
      setError(copy.requiredMissing);
      return;
    }
    // Una medida mal escrita no se descarta en silencio: es la ficha del
    // implante que se busca cuando el fabricante retira un lote.
    const diameterMm = parseMm(diameter);
    const lengthMm = parseMm(length);
    if (diameterMm === null || lengthMm === null) {
      setError(copy.invalidSize);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await registerImplant(token, patientId, {
        toothNumber: tooth.trim(),
        kind,
        manufacturer: manufacturer.trim(),
        system: textOrUndefined(system),
        reference: reference.trim(),
        lot: lot.trim(),
        udi: textOrUndefined(udi),
        diameterMm,
        lengthMm,
        sanitaryRegistration: textOrUndefined(sanitaryRegistration),
        notes: textOrUndefined(notes),
        placedOn,
        treatmentPlanItemId: treatmentPlanItemId ?? undefined,
      });
      onOpenChange(false);
      onRegistered(created);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const id = (name: string) => `${ids}-${name}`;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      size="lg"
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <FormField htmlFor={id('tooth')} label={copy.tooth} hint={copy.toothHint}>
          <input
            id={id('tooth')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            required
            value={tooth}
            onChange={(e) => setTooth(e.target.value)}
            className={cn(fieldClass, 'tabular-nums')}
          />
        </FormField>
        <FormField htmlFor={id('kind')} label={copy.kind}>
          <select
            id={id('kind')}
            value={kind}
            onChange={(e) => setKind(e.target.value as ImplantKind)}
            className={fieldClass}
          >
            {IMPLANT_KINDS.map((value) => (
              <option key={value} value={value}>
                {IMPLANT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField htmlFor={id('manufacturer')} label={copy.manufacturer}>
          <input
            id={id('manufacturer')}
            list={id('manufacturers')}
            autoComplete="off"
            maxLength={120}
            required
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            className={fieldClass}
          />
          <datalist id={id('manufacturers')}>
            {catalog.map((c) => (
              <option key={c.manufacturer} value={c.manufacturer} />
            ))}
          </datalist>
        </FormField>
        <FormField htmlFor={id('system')} label={copy.system}>
          <input
            id={id('system')}
            list={id('systems')}
            autoComplete="off"
            maxLength={120}
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            className={fieldClass}
          />
          <datalist id={id('systems')}>
            {systems.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </FormField>
        <FormField htmlFor={id('reference')} label={copy.reference}>
          <input
            id={id('reference')}
            autoComplete="off"
            maxLength={80}
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={cn(fieldClass, 'tabular-nums')}
          />
        </FormField>
        <FormField htmlFor={id('lot')} label={copy.lot}>
          <input
            id={id('lot')}
            autoComplete="off"
            maxLength={80}
            required
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            className={cn(fieldClass, 'tabular-nums')}
          />
        </FormField>
        <FormField htmlFor={id('diameter')} label={copy.diameter}>
          <input
            id={id('diameter')}
            inputMode="decimal"
            autoComplete="off"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            className={cn(fieldClass, 'tabular-nums')}
          />
        </FormField>
        <FormField htmlFor={id('length')} label={copy.length}>
          <input
            id={id('length')}
            inputMode="decimal"
            autoComplete="off"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            className={cn(fieldClass, 'tabular-nums')}
          />
        </FormField>
        <FormField htmlFor={id('sanitary')} label={copy.sanitaryRegistration}>
          <input
            id={id('sanitary')}
            autoComplete="off"
            maxLength={80}
            value={sanitaryRegistration}
            onChange={(e) => setSanitaryRegistration(e.target.value)}
            className={fieldClass}
          />
        </FormField>
        <FormField htmlFor={id('placed-on')} label={copy.placedOn}>
          <input
            id={id('placed-on')}
            type="date"
            max={todayLocal()}
            required
            value={placedOn}
            onChange={(e) => setPlacedOn(e.target.value)}
            className={cn(fieldClass, 'tabular-nums')}
          />
        </FormField>
        <FormField htmlFor={id('udi')} label={copy.udi} className="sm:col-span-2">
          <input
            id={id('udi')}
            autoComplete="off"
            maxLength={255}
            value={udi}
            onChange={(e) => setUdi(e.target.value)}
            className={cn(fieldClass, 'tabular-nums')}
          />
        </FormField>
        <FormField htmlFor={id('notes')} label={copy.notes} className="sm:col-span-2">
          <textarea
            id={id('notes')}
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={cn(fieldClass, 'h-auto font-[inherit]')}
          />
        </FormField>
      </div>
      {treatmentPlanItemId ? <p className="text-xs text-muted">{copy.planItemNote}</p> : null}
    </FormModal>
  );
}
