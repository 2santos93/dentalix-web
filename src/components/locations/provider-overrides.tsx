'use client';
import * as React from 'react';
import { useState } from 'react';
import { CalendarX2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  deleteProviderOverride,
  setProviderOverride,
  type ProviderOverride,
  type RosterLocation,
} from '@/lib/locations/provider-schedule-api';
import {
  describeRanges,
  validateOverrideRanges,
  type DraftRange,
} from '@/lib/locations/provider-schedule';
import { civilDateLabel } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

const copy = {
  title: 'Excepciones por fecha',
  description:
    'Un día concreto en una sede con otro horario, o sin trabajar. Prevalece sobre el horario semanal. Las vacaciones se siguen marcando como bloqueo en la agenda.',
  empty: 'Sin excepciones próximas.',
  add: 'Añadir excepción',
  modalTitle: 'Nueva excepción',
  modalDescription: 'Si ya había una para esa sede y fecha, se sustituye.',
  location: 'Sede',
  date: 'Fecha',
  off: 'No trabaja ese día en esta sede',
  from: (n: number) => `Desde, tramo ${n}`,
  to: (n: number) => `Hasta, tramo ${n}`,
  addRange: 'Agregar tramo',
  removeRange: (n: number) => `Quitar tramo ${n}`,
  note: 'Nota (opcional)',
  notePlaceholder: 'P. ej. cubre a la Dra. Ruiz',
  submit: 'Guardar excepción',
  missingDate: 'Elige la fecha de la excepción.',
  saveError: 'No pudimos guardar la excepción. Intenta de nuevo.',
  saved: 'Excepción guardada.',
  replaced: 'Excepción guardada: sustituye a la que había ese día.',
  offLabel: 'No trabaja',
  remove: (date: string, location: string) => `Quitar la excepción del ${date} en ${location}`,
  removeTitle: 'Quitar la excepción',
  removeDescription: 'Ese día vuelve a regir el horario semanal.',
  removeConfirm: 'Quitar excepción',
  removeError: 'No pudimos quitar la excepción. Intenta de nuevo.',
  removed: 'Excepción quitada.',
};

const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

function dateLabel(date: string): string {
  return civilDateLabel(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

interface ProviderOverridesProps {
  token: string;
  providerId: string;
  locations: RosterLocation[];
  overrides: ProviderOverride[];
  canEdit: boolean;
  onChange: (overrides: ProviderOverride[]) => void;
}

/** Lista de excepciones por fecha de un profesional (DX-233) y su alta/baja. */
export function ProviderOverrides({
  token,
  providerId,
  locations,
  overrides,
  canEdit,
  onChange,
}: ProviderOverridesProps) {
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [off, setOff] = useState(true);
  const [ranges, setRanges] = useState<DraftRange[]>([{ start: '08:00', end: '13:00' }]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [removing, setRemoving] = useState<ProviderOverride | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  function openModal() {
    setLocationId(locations[0]?.id ?? '');
    setDate('');
    setOff(true);
    setRanges([{ start: '08:00', end: '13:00' }]);
    setNote('');
    setError(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!date) {
      setError(copy.missingDate);
      return;
    }
    const checked = validateOverrideRanges(off ? [] : ranges);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await setProviderOverride(token, providerId, {
        locationId,
        date,
        ranges: checked.ranges,
        note: note.trim() === '' ? null : note.trim(),
      });
      const { replaced, ...override } = saved;
      onChange(
        [...overrides.filter((o) => o.id !== override.id && !(o.locationId === override.locationId && o.date === override.date)), override].sort(
          (a, b) => a.date.localeCompare(b.date),
        ),
      );
      toast.success(replaced ? copy.replaced : copy.saved);
      setOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemovePending(true);
    try {
      await deleteProviderOverride(token, providerId, removing.id);
      onChange(overrides.filter((o) => o.id !== removing.id));
      toast.success(copy.removed);
      setRemoving(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, copy.removeError));
    } finally {
      setRemovePending(false);
    }
  }

  return (
    <section aria-labelledby="provider-overrides-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <h3 id="provider-overrides-title" className="text-base font-semibold text-ink">
            {copy.title}
          </h3>
          <p className="text-sm text-muted">{copy.description}</p>
        </div>
        {canEdit ? (
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={openModal}>
            <Plus className="size-4" aria-hidden /> {copy.add}
          </Button>
        ) : null}
      </div>

      {overrides.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">
          <CalendarX2 className="size-4 shrink-0" aria-hidden /> {copy.empty}
        </p>
      ) : (
        <ul aria-label={copy.title} className="divide-y divide-hairline rounded-xl border border-border bg-surface">
          {overrides.map((o) => {
            const label = dateLabel(o.date);
            return (
              <li key={o.id} className="flex min-h-11 items-center gap-3 px-4 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="shrink-0 text-sm font-medium tabular-nums text-ink first-letter:uppercase">
                    {label}
                  </span>
                  <span className="min-w-0 text-sm text-ink">
                    {o.locationName} ·{' '}
                    <span className={o.off ? 'text-warning' : 'tabular-nums'}>
                      {o.off ? copy.offLabel : describeRanges(o.ranges)}
                    </span>
                  </span>
                  {o.note ? <span className="min-w-0 truncate text-xs text-muted">{o.note}</span> : null}
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-9 shrink-0 p-0"
                    aria-label={copy.remove(label, o.locationName)}
                    onClick={() => {
                      setRemoveError(null);
                      setRemoving(o);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={copy.modalTitle}
        description={copy.modalDescription}
        onSubmit={submit}
        submitLabel={copy.submit}
        submitting={saving}
        error={error}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="override-location" label={copy.location}>
            <select
              id="override-location"
              className={fieldClass}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField htmlFor="override-date" label={copy.date}>
            <Input
              id="override-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="tabular-nums"
            />
          </FormField>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary)]"
            checked={off}
            onChange={(e) => setOff(e.target.checked)}
          />
          {copy.off}
        </label>
        {!off ? (
          <div className="flex flex-col gap-2">
            {ranges.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <Input
                  type="time"
                  step={300}
                  required
                  aria-label={copy.from(i + 1)}
                  value={r.start}
                  onChange={(e) => setRanges((prev) => prev.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                  className="h-9 w-[6.75rem] px-2 tabular-nums"
                />
                <span aria-hidden className="text-muted">–</span>
                <Input
                  type="time"
                  step={300}
                  required
                  aria-label={copy.to(i + 1)}
                  value={r.end}
                  onChange={(e) => setRanges((prev) => prev.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                  className="h-9 w-[6.75rem] px-2 tabular-nums"
                />
                {ranges.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-9 p-0"
                    aria-label={copy.removeRange(i + 1)}
                    onClick={() => setRanges((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setRanges((prev) => [...prev, { start: '15:00', end: '19:00' }])}
            >
              <Plus className="size-3.5" aria-hidden /> {copy.addRange}
            </Button>
          </div>
        ) : null}
        <FormField htmlFor="override-note" label={copy.note}>
          <Input
            id="override-note"
            maxLength={200}
            placeholder={copy.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      </FormModal>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o) setRemoving(null);
        }}
        title={copy.removeTitle}
        description={copy.removeDescription}
        confirmLabel={copy.removeConfirm}
        onConfirm={() => void confirmRemove()}
        confirming={removePending}
        error={removeError}
      />
    </section>
  );
}
