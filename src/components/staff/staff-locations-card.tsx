'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getStaffLocations,
  replaceStaffLocations,
  type ClinicRole,
} from '@/lib/staff/staff-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AsyncSection } from '@/components/shared/async-section';
import { InlineError } from '@/components/errors/inline-error';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Sedes',
  hint: 'En qué sedes trabaja. Fuera de ellas no verá ni podrá operar.',
  adminOnly: 'El ADMIN siempre tiene todas las sedes.',
  all: 'Todas las sedes',
  allHint: 'Incluye las sedes que se den de alta más adelante.',
  legend: 'Sedes en las que trabaja',
  // `all: false` sin ids: la API solo devuelve sedes activas, así que el
  // miembro quedó acotado a sedes que ya se desactivaron.
  noActiveAssigned:
    'Este miembro no tiene ninguna sede activa asignada; marca al menos una o «Todas las sedes».',
  save: 'Guardar sedes',
  saved: 'Sedes guardadas. Se aplican en la siguiente sesión del miembro (como mucho 15 minutos).',
  loading: 'Cargando sedes…',
  loadError: 'No pudimos cargar sus sedes.',
  saveError: 'No pudimos guardar las sedes. Intenta de nuevo.',
  noneSelected: 'Elige al menos una sede o marca «Todas las sedes».',
};

const checkboxClass = 'size-5 shrink-0 accent-[var(--color-primary)]';

interface StaffLocationsCardProps {
  token: string;
  userId: string;
  memberRole: ClinicRole;
}

/**
 * Tarjeta «Sedes» de la ficha del miembro (DX-089, solo ADMIN): en qué sedes
 * trabaja. «Todas las sedes» es el valor por defecto y la API lo guarda como
 * lista vacía; al desmarcarla se eligen las sedes una a una. Envío explícito,
 * como el resto de la ficha. El cambio llega al miembro al renovar su sesión.
 */
export function StaffLocationsCard({ token, userId, memberRole }: StaffLocationsCardProps) {
  if (memberRole === 'ADMIN') {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <h3 className="text-base font-semibold text-ink">{copy.title}</h3>
        <p className="text-sm text-muted">{copy.adminOnly}</p>
      </Card>
    );
  }
  return <EditableStaffLocations token={token} userId={userId} />;
}

function EditableStaffLocations({ token, userId }: { token: string; userId: string }) {
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Lo guardado (para saber si hay cambios) y lo que se está editando. Las
  // sedes marcadas se conservan al marcar «Todas»: desmarcarla las recupera.
  const [saved, setSaved] = useState<{ all: boolean; ids: string[] }>({ all: true, ids: [] });
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [current, clinicLocations] = await Promise.all([
          getStaffLocations(token, userId),
          listLocations(token),
        ]);
        if (cancelled) return;
        setLocations(clinicLocations);
        setSaved({ all: current.all, ids: current.locationIds });
        setAll(current.all);
        setSelected(current.locationIds);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, userId, reloadKey]);

  // La API solo acepta y devuelve sedes activas: las desactivadas no se ofrecen.
  const shown = locations.filter((l) => l.isActive);
  const noActiveAssigned = !saved.all && saved.ids.length === 0;

  const isUnchanged = all
    ? saved.all
    : !saved.all &&
      selected.length === saved.ids.length &&
      selected.every((id) => saved.ids.includes(id));

  function toggle(id: string) {
    setSaveError(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    // `[]` en la API significa «todas»: sin sedes marcadas no hay forma de
    // decir «ninguna», así que se pide elegir antes de enviar.
    if (!all && selected.length === 0) {
      setSaveError(copy.noneSelected);
      return;
    }
    setSaving(true);
    try {
      const result = await replaceStaffLocations(token, userId, all ? [] : selected);
      setSaved({ all: result.all, ids: result.locationIds });
      setAll(result.all);
      setSelected(result.all ? selected : result.locationIds);
      toast.success(copy.saved);
    } catch (err) {
      // 400 (sede que no es de la clínica) y 409 (el miembro pasó a ADMIN)
      // traen su mensaje en español; se queda junto al botón.
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="text-base font-semibold text-ink">{copy.title}</h3>
      <p className="text-sm text-muted">{copy.hint}</p>
      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={
          <p role="status" className="text-sm text-muted">
            {copy.loading}
          </p>
        }
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="staff-locations-all"
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink"
            >
              <input
                id="staff-locations-all"
                type="checkbox"
                checked={all}
                aria-describedby="staff-locations-all-hint"
                onChange={(e) => {
                  setSaveError(null);
                  setAll(e.target.checked);
                }}
                className={checkboxClass}
              />
              {copy.all}
            </label>
            <p id="staff-locations-all-hint" className="text-xs text-muted">
              {copy.allHint}
            </p>
          </div>

          {noActiveAssigned && <p className="text-sm text-warning-text">{copy.noActiveAssigned}</p>}

          <fieldset disabled={all} className="flex min-w-0 flex-col gap-1.5">
            <legend className="t-label mb-1 text-muted">{copy.legend}</legend>
            <div className="rounded-lg border border-border">
              {shown.map((l) => {
                const id = `staff-locations-${l.id}`;
                const checked = selected.includes(l.id);
                return (
                  <label
                    key={l.id}
                    htmlFor={id}
                    className={cn(
                      'flex min-h-11 items-center gap-3 border-b border-hairline px-3 py-2 text-sm text-ink last:border-0',
                      all ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-surface-2',
                    )}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(l.id)}
                      className={checkboxClass}
                    />
                    <span>{l.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {saveError && <InlineError variant="summary">{saveError}</InlineError>}

          <Button type="submit" loading={saving} disabled={isUnchanged} className="self-start">
            {copy.save}
          </Button>
        </form>
      </AsyncSection>
    </Card>
  );
}
