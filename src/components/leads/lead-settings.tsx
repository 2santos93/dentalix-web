'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { collapseSpaces } from '@/lib/format/text';
import {
  LEAD_REASON_MAX,
  LEAD_REASON_MIN,
  LEAD_RETENTION_MONTHS_DEFAULT,
  LEAD_RETENTION_MONTHS_MAX,
  LEAD_RETENTION_MONTHS_MIN,
  createLeadReason,
  getLeadSettings,
  removeLeadReason,
  updateLeadSettings,
  type LeadReason,
  type LeadReasonKind,
  type LeadSettings,
} from '@/lib/leads/leads-api';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SettingRow, SettingRows, SettingsSection } from '@/components/settings/settings-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeadReasons } from './use-lead-catalogs';

export const leadSettingsCopy = {
  forbiddenTitle: 'Solo administración cambia los ajustes de prospectos.',
  forbiddenHint: 'Recepción usa los motivos al dar de alta o perder un prospecto.',
  kinds: {
    INTEREST: {
      title: 'Motivos de interés',
      description: 'Qué busca quien escribe. Se elige al dar de alta un prospecto.',
      placeholder: 'Diseño de sonrisa',
    },
    LOSS: {
      title: 'Motivos de pérdida',
      description: 'Por qué no siguió. Es obligatorio al marcar un prospecto como perdido.',
      placeholder: 'Se mudó de ciudad',
    },
  } satisfies Record<LeadReasonKind, { title: string; description: string; placeholder: string }>,
  predefined: 'Predefinido',
  listLabel: (title: string) => title,
  newReason: 'Nuevo motivo',
  add: 'Añadir',
  retire: 'Retirar',
  retireLabel: (name: string) => `Retirar el motivo ${name}`,
  nameLength: `Escribe entre ${LEAD_REASON_MIN} y ${LEAD_REASON_MAX} caracteres.`,
  noHealth: 'Sin datos de salud: el motivo lo ve todo el mostrador.',
  loadError: 'No pudimos cargar los motivos.',
  addError: 'No pudimos añadir el motivo. Intenta de nuevo.',
  retireError: 'No pudimos retirar el motivo. Intenta de nuevo.',
  added: (name: string) => `Motivo «${name}» añadido.`,
  retired: (name: string) => `Motivo «${name}» retirado. Los prospectos que lo usan lo conservan.`,
  retention: {
    section: 'Conservación',
    sectionHint: 'Qué pasa con los datos de los prospectos que no siguieron.',
    label: 'Anonimizar los prospectos perdidos tras',
    hint: 'Pasado ese plazo desde que se marcó como perdido, se borran su nombre, teléfono y notas. Las cifras del informe se conservan.',
    months: (n: number) => (n === 1 ? '1 mes' : `${n} meses`),
    change: 'Cambiar',
    dialogTitle: 'Conservación de prospectos perdidos',
    dialogDescription: 'Se aplica en el barrido diario a todos los prospectos perdidos de la clínica.',
    field: 'Meses',
    range: `Entre ${LEAD_RETENTION_MONTHS_MIN} y ${LEAD_RETENTION_MONTHS_MAX} meses.`,
    save: 'Guardar',
    cancel: 'Cancelar',
    saved: 'Conservación guardada.',
    loadError: 'No pudimos cargar la conservación de los prospectos.',
    saveError: 'No pudimos guardar la conservación. Intenta de nuevo.',
  },
};
const copy = leadSettingsCopy;

function ReasonCatalog({ token, kind }: { token: string; kind: LeadReasonKind }) {
  const reasons = useLeadReasons(token, kind);
  const fieldId = useId();
  const text = copy.kinds[kind];
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = collapseSpaces(name);
    if (trimmed.length < LEAD_REASON_MIN || trimmed.length > LEAD_REASON_MAX) {
      setNameError(copy.nameLength);
      return;
    }
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createLeadReason(token, kind, trimmed);
      setName('');
      setNotice(copy.added(created.name));
      reasons.reload();
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: copy.addError }));
    } finally {
      setAdding(false);
    }
  }

  async function retire(reason: LeadReason & { id: string }) {
    setRetiringId(reason.id);
    setError(null);
    setNotice(null);
    try {
      await removeLeadReason(token, reason.id);
      setNotice(copy.retired(reason.name));
      reasons.reload();
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: copy.retireError }));
    } finally {
      setRetiringId(null);
    }
  }

  let list: React.ReactNode;
  if (reasons.failed) {
    list = <SectionError description={copy.loadError} onRetry={reasons.reload} />;
  } else if (reasons.items === null) {
    list = (
      <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else {
    list = (
      <ul
        aria-label={copy.listLabel(text.title)}
        className="divide-y divide-border-subtle rounded-xl border border-border bg-surface px-4"
      >
        {reasons.items.map((r) => (
          <li key={`${r.id ?? 'p'}:${r.name}`} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
            <span className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">{r.name}</span>
            {r.predefined || !r.id ? (
              <Badge variant="neutral">{copy.predefined}</Badge>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={retiringId === r.id}
                disabled={retiringId !== null && retiringId !== r.id}
                aria-label={copy.retireLabel(r.name)}
                onClick={() => void retire(r as LeadReason & { id: string })}
              >
                {copy.retire}
              </Button>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <SettingsSection title={text.title} description={text.description}>
      <div className="flex flex-col gap-3">
        {error ? <InlineError variant="summary">{error}</InlineError> : null}
        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>
        {list}
        <form noValidate onSubmit={(e) => void add(e)} className="flex flex-col gap-1.5">
          <FormField htmlFor={fieldId} label={copy.newReason} hint={copy.noHealth} error={nameError ?? undefined}>
            <Input
              id={fieldId}
              value={name}
              maxLength={LEAD_REASON_MAX}
              placeholder={text.placeholder}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
            />
          </FormField>
          <Button type="submit" variant="secondary" loading={adding} className="self-start max-sm:w-full">
            <Plus aria-hidden />
            {copy.add}
          </Button>
        </form>
      </div>
    </SettingsSection>
  );
}

function RetentionSection({ token }: { token: string }) {
  const r = copy.retention;
  const fieldId = useId();
  const [settings, setSettings] = useState<LeadSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    getLeadSettings(token)
      .then((res) => {
        if (cancelled) return;
        setSettings(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, { fallback: r.loadError }));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey, r.loadError]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const months = Number(draft);
    if (!Number.isInteger(months) || months < LEAD_RETENTION_MONTHS_MIN || months > LEAD_RETENTION_MONTHS_MAX) {
      setFieldError(r.range);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      setSettings(await updateLeadSettings(token, { lostRetentionMonths: months }));
      setNotice(r.saved);
      setOpen(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err, { fallback: r.saveError }));
    } finally {
      setSaving(false);
    }
  }

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  } else if (!settings) {
    body = (
      <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-72" />
      </div>
    );
  } else {
    body = (
      <SettingRows>
        <SettingRow
          label={r.label}
          description={r.hint}
          isDefault={settings.lostRetentionMonths === LEAD_RETENTION_MONTHS_DEFAULT}
          value={<span data-testid="lead-retention">{r.months(settings.lostRetentionMonths)}</span>}
          action={
            <Button
              type="button"
              variant="secondary"
              className="max-sm:min-h-11"
              onClick={() => {
                setDraft(String(settings.lostRetentionMonths));
                setFieldError(null);
                setSaveError(null);
                setNotice('');
                setOpen(true);
              }}
            >
              {r.change}
            </Button>
          }
        />
      </SettingRows>
    );
  }

  return (
    <SettingsSection title={r.section} description={r.sectionHint}>
      <div className="flex flex-col gap-3">
        {body}
        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form noValidate onSubmit={(e) => void save(e)} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{r.dialogTitle}</DialogTitle>
              <DialogDescription>{r.dialogDescription}</DialogDescription>
            </DialogHeader>
            <FormField htmlFor={fieldId} label={r.field} hint={r.range} error={fieldError ?? undefined}>
              <Input
                id={fieldId}
                type="number"
                inputMode="numeric"
                min={LEAD_RETENTION_MONTHS_MIN}
                max={LEAD_RETENTION_MONTHS_MAX}
                step={1}
                value={draft}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? fieldErrorId(fieldId) : undefined}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                className="max-w-32"
              />
            </FormField>
            {saveError ? <InlineError variant="summary">{saveError}</InlineError> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={saving}>
                  {r.cancel}
                </Button>
              </DialogClose>
              <Button type="submit" loading={saving} className="max-sm:min-h-11">
                {r.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

/**
 * Ajustes › Prospectos (DX-556): los catálogos de motivos (interés y pérdida:
 * los predefinidos de solo lectura y los propios con alta y retirada) y la
 * conservación de los perdidos. Solo ADMIN (la API responde 403 al resto).
 */
export function LeadSettingsSections({ token, allowed }: { token: string; allowed: boolean }) {
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
  return (
    <>
      <ReasonCatalog token={token} kind="INTEREST" />
      <ReasonCatalog token={token} kind="LOSS" />
      <RetentionSection token={token} />
    </>
  );
}
