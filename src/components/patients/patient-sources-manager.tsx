'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Eye, EyeOff, Lock, Megaphone, Pencil, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { collapseSpaces } from '@/lib/format/text';
import {
  createPatientSource,
  listPatientSources,
  PATIENT_SOURCE_KIND_HINTS,
  PATIENT_SOURCE_KIND_LABELS,
  PATIENT_SOURCE_KINDS,
  PATIENT_SOURCE_NAME_MAX,
  PATIENT_SOURCE_NAME_MIN,
  updatePatientSource,
  type PatientSource,
  type PatientSourceKind,
} from '@/lib/patients/patient-sources-api';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import type { RowAction } from '@/components/shared/row-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';

export const patientSourcesCopy = {
  forbiddenTitle: 'Solo administración cambia el origen de pacientes.',
  forbiddenHint: 'Recepción y el equipo eligen de esta lista al dar de alta o editar un paciente.',
  newSource: 'Nueva fuente',
  count: (n: number) => (n === 1 ? '1 fuente' : `${n} fuentes`),
  tableLabel: 'Fuentes de «¿Cómo nos conoció?»',
  colName: 'Fuente',
  colKind: 'Qué pide el alta',
  colStatus: 'Estado',
  active: 'Activa',
  inactive: 'Desactivada',
  predefined: 'Predefinida',
  rename: 'Renombrar',
  deactivate: 'Desactivar',
  activate: 'Activar',
  empty: 'Todavía no hay fuentes.',
  emptyHint: 'Añade los canales por los que llegan los pacientes: redes, buscadores, recomendaciones…',
  loadError: 'No pudimos cargar las fuentes.',
  activateError: (name: string) => `No pudimos activar «${name}».`,
  createTitle: 'Nueva fuente',
  renameTitle: 'Renombrar la fuente',
  formDescription: 'Lo que se elige en «¿Cómo nos conoció?» al dar de alta un paciente.',
  name: 'Nombre',
  namePlaceholder: 'Valla en la avenida',
  nameLength: `Escribe entre ${PATIENT_SOURCE_NAME_MIN} y ${PATIENT_SOURCE_NAME_MAX} caracteres.`,
  kind: 'Tipo',
  kindFixed: (kind: string) => `Tipo: ${kind}. El tipo no se cambia: crea otra fuente si necesitas uno distinto.`,
  create: 'Añadir fuente',
  save: 'Guardar',
  saveError: 'No pudimos guardar la fuente. Intenta de nuevo.',
  created: (name: string) => `Fuente «${name}» añadida.`,
  renamed: (name: string) => `Fuente renombrada a «${name}».`,
  activated: (name: string) => `Fuente «${name}» activada: vuelve a ofrecerse en el alta.`,
  deactivated: (name: string) => `Fuente «${name}» desactivada.`,
  deactivateTitle: (name: string) => `¿Desactivar «${name}»?`,
  deactivateDescription:
    'Deja de ofrecerse al dar de alta o editar un paciente. Los pacientes que ya la tienen la conservan, y el informe de captación la sigue contando. Puedes activarla de nuevo cuando quieras.',
  deactivateConfirm: 'Desactivar',
  deactivateError: 'No pudimos desactivar la fuente. Intenta de nuevo.',
};
const copy = patientSourcesCopy;

type Editing = { mode: 'create' } | { mode: 'rename'; source: PatientSource };

/** El orden de la API (las predefinidas por `sortOrder`, las propias detrás) y, a igualdad, por nombre. */
function byOrder(a: PatientSource, b: PatientSource): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es');
}

function SourceFormModal({
  token,
  editing,
  onOpenChange,
  onSaved,
}: {
  token: string;
  editing: Editing;
  onOpenChange: (open: boolean) => void;
  onSaved: (source: PatientSource, created: boolean) => void;
}) {
  const ids = useId();
  const nameId = `${ids}-name`;
  const current = editing.mode === 'rename' ? editing.source : null;
  const [name, setName] = useState(current?.name ?? '');
  const [kind, setKind] = useState<PatientSourceKind>('CHANNEL');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = collapseSpaces(name);
    if ([...clean].length < PATIENT_SOURCE_NAME_MIN || [...clean].length > PATIENT_SOURCE_NAME_MAX) {
      setNameError(copy.nameLength);
      document.getElementById(nameId)?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (current) {
        onSaved(
          clean === current.name ? current : await updatePatientSource(token, current.id, { name: clean }),
          false,
        );
      } else {
        onSaved(await createPatientSource(token, { name: clean, kind }), true);
      }
      onOpenChange(false);
    } catch (err) {
      // 409 «Ya existe una fuente con ese nombre.»: el problema es el nombre.
      const message = apiErrorMessage(err, { fallback: copy.saveError });
      if (err instanceof ApiError && err.status === 409) {
        setNameError(message);
        document.getElementById(nameId)?.focus();
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      open
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      title={current ? copy.renameTitle : copy.createTitle}
      description={copy.formDescription}
      onSubmit={(e) => void submit(e)}
      submitLabel={current ? copy.save : copy.create}
      submitting={saving}
      error={error}
      ownValidation
      touchTargets
    >
      <FormField htmlFor={nameId} label={copy.name} error={nameError}>
        <Input
          id={nameId}
          value={name}
          maxLength={PATIENT_SOURCE_NAME_MAX}
          placeholder={copy.namePlaceholder}
          autoComplete="off"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? fieldErrorId(nameId) : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
        />
      </FormField>
      {current ? (
        <p className="text-sm text-muted" data-testid="patient-source-kind-fixed">
          {copy.kindFixed(PATIENT_SOURCE_KIND_LABELS[current.kind])}
        </p>
      ) : (
        <RadioGroup
          id={`${ids}-kind`}
          legend={copy.kind}
          value={kind}
          onValueChange={(value) => setKind(value as PatientSourceKind)}
        >
          {PATIENT_SOURCE_KINDS.map((k) => (
            <RadioOption
              key={k}
              value={k}
              label={PATIENT_SOURCE_KIND_LABELS[k]}
              description={PATIENT_SOURCE_KIND_HINTS[k]}
            />
          ))}
        </RadioGroup>
      )}
    </FormModal>
  );
}

/**
 * Ajustes › Origen de pacientes (DX-172): el catálogo de «¿Cómo nos conoció?».
 * Alta (nombre y tipo) y renombrado en un modal; desactivar —con
 * confirmación, porque saca la fuente del alta— y activar desde el «⋯». El
 * tipo no se cambia y no hay borrado: los pacientes y el informe conservan la
 * fuente. Solo ADMIN (la API responde 403 al resto).
 */
export function PatientSourcesManager({ token, allowed }: { token: string; allowed: boolean }) {
  const [sources, setSources] = useState<PatientSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deactivating, setDeactivating] = useState<PatientSource | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPatientSources(token, true);
        if (cancelled) return;
        setSources([...data].sort(byOrder));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: copy.loadError }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, allowed, reloadKey]);

  if (!allowed) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }

  function upsert(saved: PatientSource) {
    setSources((prev) => [...prev.filter((s) => s.id !== saved.id), saved].sort(byOrder));
  }

  async function activate(source: PatientSource) {
    setPendingId(source.id);
    setNotice(null);
    try {
      const saved = await updatePatientSource(token, source.id, { isActive: true });
      upsert(saved);
      setNotice(copy.activated(saved.name));
    } catch {
      // Escalón 3: la lista sigue siendo cierta (no cambió nada).
      notifyError(copy.activateError(source.name), { onRetry: () => void activate(source) });
    } finally {
      setPendingId(null);
    }
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    setConfirming(true);
    setDeactivateError(null);
    try {
      const saved = await updatePatientSource(token, deactivating.id, { isActive: false });
      upsert(saved);
      setNotice(copy.deactivated(saved.name));
      setDeactivating(null);
    } catch (err) {
      setDeactivateError(apiErrorMessage(err, { fallback: copy.deactivateError }));
    } finally {
      setConfirming(false);
    }
  }

  function rowActions(source: PatientSource): RowAction[] {
    return [
      { label: copy.rename, icon: <Pencil />, onSelect: () => setEditing({ mode: 'rename', source }) },
      source.isActive
        ? {
            label: copy.deactivate,
            icon: <EyeOff />,
            onSelect: () => {
              setDeactivateError(null);
              setDeactivating(source);
            },
          }
        : {
            label: copy.activate,
            icon: <Eye />,
            disabled: pendingId === source.id,
            onSelect: () => void activate(source),
          },
    ];
  }

  const columns: DataListColumn<PatientSource>[] = [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: (s) => (
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="break-words font-medium">{s.name}</span>
          {s.systemKey ? <span className="t-caption text-muted">{copy.predefined}</span> : null}
        </span>
      ),
      mobileCell: (s) => s.name,
    },
    {
      id: 'kind',
      header: copy.colKind,
      cell: (s) => <span className="text-muted">{PATIENT_SOURCE_KIND_LABELS[s.kind]}</span>,
      mobileCell: (s) => PATIENT_SOURCE_KIND_LABELS[s.kind],
    },
    {
      id: 'status',
      header: copy.colStatus,
      mobile: 'trailing',
      cell: (s) =>
        s.isActive ? (
          <span className="text-muted">{copy.active}</span>
        ) : (
          <Badge variant="neutral">{copy.inactive}</Badge>
        ),
    },
  ];

  const empty = !loading && !error && sources.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {empty ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {loading || error ? '' : copy.count(sources.length)}
          </p>
          <Button type="button" onClick={() => setEditing({ mode: 'create' })} className="w-full sm:w-auto">
            <Plus aria-hidden />
            {copy.newSource}
          </Button>
        </div>
      )}

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<TableSkeleton rows={6} />}
        isEmpty={sources.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Megaphone aria-hidden />}
        emptyAction={
          <Button type="button" onClick={() => setEditing({ mode: 'create' })} className="max-sm:min-h-11">
            {copy.newSource}
          </Button>
        }
      >
        <DataList
          label={copy.tableLabel}
          rows={sources}
          columns={columns}
          getRowKey={(s) => s.id}
          onRowClick={(s) => setEditing({ mode: 'rename', source: s })}
          rowActions={rowActions}
          getRowLabel={(s) => s.name}
        />
      </AsyncSection>

      {editing ? (
        <SourceFormModal
          token={token}
          editing={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={(saved, created) => {
            upsert(saved);
            setNotice(created ? copy.created(saved.name) : copy.renamed(saved.name));
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open && !confirming) setDeactivating(null);
        }}
        title={deactivating ? copy.deactivateTitle(deactivating.name) : ''}
        description={copy.deactivateDescription}
        confirmLabel={copy.deactivateConfirm}
        confirming={confirming}
        destructive={false}
        error={deactivateError}
        onConfirm={() => void confirmDeactivate()}
      />
    </div>
  );
}
