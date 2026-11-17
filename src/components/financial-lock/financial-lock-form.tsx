'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  FINANCIAL_LOCK_DAYS_MAX,
  getFinancialLock,
  updateFinancialLock,
  type FinancialLockOperation,
  type FinancialLockOverride,
  type FinancialLockSettings,
} from '@/lib/financial-lock/financial-lock-api';
import { sedeCivilDate } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { addDaysIso } from '@/lib/locations/provider-schedule';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { SectionError } from '@/components/errors/section-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingsSection } from '@/components/settings/settings-page';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

export const financialLockCopy = {
  heading: 'Cierre contable',
  support:
    'Cierra los días ya cuadrados: no se registran abonos con esas fechas ni se anulan los suyos, y no se crean ni cancelan planes de cuotas con cuotas en ellos. Cada cambio queda en la auditoría.',
  dateLabel: 'Cerrar hasta el día',
  dateHint: 'Ese día y los anteriores quedan cerrados. Vacío = sin fecha fija.',
  daysLabel: 'Días abiertos hacia atrás',
  daysHint: `Con 7, se puede registrar o anular con fecha de hoy y de los 7 días anteriores; lo de antes queda cerrado. 0 = solo hoy. Vacío = sin cierre por días. Si pones fecha y días, rige el cierre más reciente (de 0 a ${FINANCIAL_LOCK_DAYS_MAX}).`,
  daysInvalid: `Escribe un número entero de 0 a ${FINANCIAL_LOCK_DAYS_MAX}, o déjalo vacío.`,
  exemptLabel: 'Administración puede hacerlo indicando el motivo',
  exemptHint:
    'Un administrador podrá registrar o anular en un período cerrado escribiendo por qué. Queda registrado quién, cuándo y por qué; recepción nunca puede.',
  lockedThrough: (day: string) => `Ahora mismo está cerrado hasta el ${day}, inclusive.`,
  notLocked: 'Ahora mismo no hay ningún día cerrado.',
  overridesTitle: 'Excepciones registradas',
  overridesEmpty: 'Todavía nadie ha hecho una operación en un período cerrado.',
  overridesLabel: 'Excepciones al cierre contable',
  colWhen: 'Cuándo',
  colWho: 'Quién',
  colWhat: 'Qué',
  colDay: 'Día cerrado',
  colReason: 'Motivo',
  formerMember: 'Exmiembro de la clínica',
  operations: {
    PAYMENT_CREATE: 'Registró un abono',
    PAYMENT_VOID: 'Anuló un abono',
    PAYMENT_PLAN_CREATE: 'Creó un plan de cuotas',
    PAYMENT_PLAN_CANCEL: 'Canceló un plan de cuotas',
  } satisfies Record<FinancialLockOperation, string>,
  saved: 'Cierre contable guardado.',
  saveAria: 'Guardar el cierre contable',
  loadError: 'No pudimos cargar el cierre contable.',
  saveError: 'No pudimos guardar el cierre contable. Intenta de nuevo.',
  loading: 'Cargando',
};

const copy = financialLockCopy;

interface Draft {
  lockDate: string;
  lockDays: string;
  adminExempt: boolean;
}

const toDraft = (s: FinancialLockSettings): Draft => ({
  lockDate: s.lockDate ?? '',
  lockDays: s.lockDays === null ? '' : String(s.lockDays),
  adminExempt: s.adminExempt,
});

/** Los días como número válido, `null` vacío, o `undefined` si no vale. */
function parseDays(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return n <= FINANCIAL_LOCK_DAYS_MAX ? n : undefined;
}

/**
 * DX-091, Ajustes › Caja › Cierre contable (solo ADMIN, como la página): la
 * fecha fija, los días abiertos y la exención del administrador, con la barra
 * «Cambios sin guardar»; debajo, las excepciones (quién, cuándo y por qué).
 */
export function FinancialLockForm({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<FinancialLockSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const saved = React.useMemo(() => (loaded ? toDraft(loaded) : null), [loaded]);
  const fmt = readyFormat(useSedeFormat(token));
  const timeZone = readyTimeZone(useSedeTimeZone(token));

  useEffect(() => {
    let cancelled = false;
    getFinancialLock(token)
      .then((res) => {
        if (cancelled) return;
        setLoaded(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  return (
    <SettingsSection title={copy.heading} description={copy.support}>
      {loadError ? (
        <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !saved || !loaded ? (
        <div role="status" aria-label={copy.loading} className="rounded-xl border border-border bg-surface p-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      ) : (
        <>
          <FinancialLockFields
            token={token}
            saved={saved}
            settings={loaded}
            fmt={fmt}
            today={timeZone ? sedeToday(timeZone) : null}
            onSaved={setLoaded}
          />
          <OverridesList overrides={loaded.overrides} fmt={fmt} timeZone={timeZone} />
        </>
      )}
    </SettingsSection>
  );
}

function FinancialLockFields({
  token,
  saved,
  settings,
  fmt,
  today,
  onSaved,
}: {
  token: string;
  saved: Draft;
  settings: FinancialLockSettings;
  fmt: RegionalFormat | null;
  today: string | null;
  onSaved: (s: FinancialLockSettings) => void;
}) {
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daysError, setDaysError] = useState<string | null>(null);
  const formId = 'financial-lock-form';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const days = parseDays(draft.lockDays);
    if (days === undefined) {
      setDaysError(copy.daysInvalid);
      document.getElementById('financial-lock-days')?.focus();
      return;
    }
    setDaysError(null);
    setSaving(true);
    try {
      const res = await updateFinancialLock(token, {
        lockDate: draft.lockDate || null,
        lockDays: days,
        adminExempt: draft.adminExempt,
      });
      onSaved(res);
      commit(toDraft(res));
      toast.success(copy.saved);
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <p role="status" className="text-sm font-medium text-ink">
          {settings.lockedThrough
            ? copy.lockedThrough(sedeCivilDate(settings.lockedThrough, fmt))
            : copy.notLocked}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="financial-lock-date" label={copy.dateLabel} hint={copy.dateHint}>
            <DatePicker
              id="financial-lock-date"
              name="financial-lock-date"
              value={draft.lockDate || null}
              disabled={saving}
              // Hoy sigue abierto: el último día que se puede cerrar es ayer.
              max={today ? addDaysIso(today, -1) : undefined}
              onChange={(next) => update({ lockDate: next ?? '' })}
            />
          </FormField>
          <FormField htmlFor="financial-lock-days" label={copy.daysLabel} hint={copy.daysHint} error={daysError}>
            <Input
              id="financial-lock-days"
              type="number"
              inputMode="numeric"
              min={0}
              max={FINANCIAL_LOCK_DAYS_MAX}
              value={draft.lockDays}
              disabled={saving}
              onChange={(e) => {
                update({ lockDays: e.target.value });
                setDaysError(null);
              }}
              aria-invalid={daysError ? true : undefined}
              aria-describedby={daysError ? fieldErrorId('financial-lock-days') : undefined}
              className="max-sm:h-11 sm:max-w-40"
            />
          </FormField>
        </div>
        <Switch
          checked={draft.adminExempt}
          disabled={saving}
          onChange={(e) => update({ adminExempt: e.target.checked })}
          label={<span className="font-medium">{copy.exemptLabel}</span>}
          description={<span className="text-sm">{copy.exemptHint}</span>}
          className="flex-row-reverse justify-between gap-4 pointer-coarse:py-2"
        />
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        form={formId}
        error={error}
        saveAriaLabel={copy.saveAria}
        onDiscard={() => {
          discard();
          setError(null);
          setDaysError(null);
        }}
      />
    </form>
  );
}

function OverridesList({
  overrides,
  fmt,
  timeZone,
}: {
  overrides: FinancialLockOverride[];
  fmt: RegionalFormat | null;
  timeZone: string | null;
}) {
  const columns: DataListColumn<FinancialLockOverride>[] = [
    {
      id: 'when',
      header: copy.colWhen,
      cell: (o) => (fmt && timeZone ? fmt.dateTime(new Date(o.createdAt), timeZone) : sedeCivilDate(o.createdAt, fmt)),
      cellClassName: 'tabular-nums whitespace-nowrap',
    },
    { id: 'who', header: copy.colWho, cell: (o) => o.actor.name ?? copy.formerMember },
    { id: 'what', header: copy.colWhat, cell: (o) => copy.operations[o.operation], mobile: 'primary' },
    {
      id: 'day',
      header: copy.colDay,
      cell: (o) => sedeCivilDate(o.businessDate, fmt),
      cellClassName: 'tabular-nums whitespace-nowrap',
    },
    { id: 'reason', header: copy.colReason, cell: (o) => o.reason },
  ];
  return (
    <div className="flex flex-col gap-2">
      <h3 className="t-title text-ink">{copy.overridesTitle}</h3>
      {overrides.length === 0 ? (
        <p className="text-sm text-muted">{copy.overridesEmpty}</p>
      ) : (
        <DataList label={copy.overridesLabel} rows={overrides} columns={columns} getRowKey={(o) => o.id} />
      )}
    </div>
  );
}
