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
import { Checkbox } from '@/components/ui/checkbox';
import { Callout } from '@/components/ui/callout';
import { SectionHeader } from '@/components/ui/section-header';
import { AsyncSection } from '@/components/shared/async-section';
import { InlineError } from '@/components/errors/inline-error';
import { DATA_SECTION_CLASS } from '@/components/patients/data-section';

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

interface StaffLocationsCardProps {
  token: string;
  userId: string;
  memberRole: ClinicRole;
}

/**
 * Sección «Sedes» de la ficha del miembro (plana, como las demás secciones
 * del perfil; conserva el nombre por compatibilidad) (DX-089, solo ADMIN): en qué sedes
 * trabaja. «Todas las sedes» es el valor por defecto y la API lo guarda como
 * lista vacía; al desmarcarla se eligen las sedes una a una. Envío explícito,
 * como el resto de la ficha. El cambio llega al miembro al renovar su sesión.
 */
export function StaffLocationsCard({ token, userId, memberRole }: StaffLocationsCardProps) {
  if (memberRole === 'ADMIN') {
    return (
      <section aria-labelledby="staff-locations-title" className={DATA_SECTION_CLASS}>
        <SectionHeader titleId="staff-locations-title" title={copy.title} description={copy.adminOnly} />
      </section>
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
    <section aria-labelledby="staff-locations-title" className={DATA_SECTION_CLASS}>
      <SectionHeader titleId="staff-locations-title" title={copy.title} description={copy.hint} />
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
          <Checkbox
            id="staff-locations-all"
            checked={all}
            label={<span className="font-medium">{copy.all}</span>}
            description={copy.allHint}
            onChange={(e) => {
              setSaveError(null);
              setAll(e.target.checked);
            }}
          />

          {noActiveAssigned && <Callout tone="warning">{copy.noActiveAssigned}</Callout>}

          <fieldset disabled={all} className="flex min-w-0 flex-col gap-1">
            <legend className="t-label mb-1 text-muted">{copy.legend}</legend>
            <div className="flex flex-col divide-y divide-border-subtle">
              {shown.map((l) => (
                <Checkbox
                  key={l.id}
                  id={`staff-locations-${l.id}`}
                  checked={selected.includes(l.id)}
                  disabled={all}
                  label={l.name}
                  onChange={() => toggle(l.id)}
                />
              ))}
            </div>
          </fieldset>

          {saveError && <InlineError variant="summary">{saveError}</InlineError>}

          <Button type="submit" loading={saving} disabled={isUnchanged} className="self-start max-sm:w-full">
            {copy.save}
          </Button>
        </form>
      </AsyncSection>
    </section>
  );
}
