'use client';
import * as React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  EXTERNAL_ORDER_LIMITS as L,
  getExternalOrderSettings,
  saveExternalOrderSettings,
  type ExternalOrderSettings,
} from '@/lib/external-orders/external-orders-api';
import { SectionError } from '@/components/errors/section-error';
import { FormField } from '@/components/shared/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingRows } from '@/components/settings/settings-page';
import { cn } from '@/lib/utils';

export const externalOrderSettingsCopy = {
  overdueLabel: 'Días para considerar vencida una orden sin resultado',
  overdueHint: `Pasado ese plazo, la orden sale «Vencida» en «Órdenes sin resultado». Entre ${L.overdueDaysMin} y ${L.overdueDaysMax}.`,
  overdueInvalid: `Escribe un número entero de días entre ${L.overdueDaysMin} y ${L.overdueDaysMax}.`,
  save: 'Guardar',
  saved: 'Plazo de las órdenes guardado.',
  loadError: 'No pudimos cargar el plazo de las órdenes.',
  saveError: 'No pudimos guardar el plazo de las órdenes. Intenta de nuevo.',
  loading: 'Cargando',
};

const copy = externalOrderSettingsCopy;

interface OverdueDraft {
  overdueDays: string;
}

const EMPTY_DRAFT: OverdueDraft = { overdueDays: '' };

function toDraft(settings: ExternalOrderSettings): OverdueDraft {
  return { overdueDays: String(settings.overdueDays) };
}

function sameDraft(a: OverdueDraft, b: OverdueDraft): boolean {
  return a.overdueDays.trim() === b.overdueDays.trim();
}

function parseDays(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const days = Number(text.trim());
  return days >= L.overdueDaysMin && days <= L.overdueDaysMax ? days : null;
}

/**
 * Ajustes › Órdenes externas (DX-572): el plazo en días tras el que una orden
 * sin resultado sale vencida. Solo ADMIN: la página decide el permiso y no
 * monta esto sin él.
 */
export function ExternalOrderSettingsForm({ token }: { token: string }) {
  const [settings, setSettings] = useState<ExternalOrderSettings | null>(null);
  const saved = useMemo(() => (settings ? toDraft(settings) : EMPTY_DRAFT), [settings]);
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved, sameDraft);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const daysRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const formId = `${id}-form`;
  const daysId = `${id}-overdue-days`;

  useEffect(() => {
    let cancelled = false;
    getExternalOrderSettings(token)
      .then((res) => {
        if (cancelled) return;
        setSettings(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  if (loadError) {
    return (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!settings) {
    return (
      <div role="status" aria-label={copy.loading} className="rounded-xl border border-border bg-surface p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-56" />
      </div>
    );
  }

  function edit(patch: Partial<OverdueDraft>) {
    update(patch);
    setNotice('');
    setSaveError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setNotice('');
    const overdueDays = parseDays(draft.overdueDays);
    if (overdueDays === null) {
      setDaysError(copy.overdueInvalid);
      daysRef.current?.focus();
      return;
    }
    setDaysError(null);
    setSaving(true);
    try {
      const next = await saveExternalOrderSettings(token, { overdueDays });
      commit(toDraft(next));
      setSettings(next);
      setNotice(copy.saved);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <SettingRows>
        <div className="px-4 py-4 sm:px-6">
          <FormField htmlFor={daysId} label={copy.overdueLabel} hint={copy.overdueHint} error={daysError}>
            <Input
              ref={daysRef}
              id={daysId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft.overdueDays}
              disabled={saving}
              aria-invalid={daysError ? true : undefined}
              onChange={(e) => {
                edit({ overdueDays: e.target.value });
                setDaysError(null);
              }}
              className="t-data w-28"
            />
          </FormField>
        </div>
      </SettingRows>
      <p
        ref={noticeRef}
        role="status"
        tabIndex={-1}
        className={cn(
          notice ? 'text-sm text-success-text' : 'sr-only',
          'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text',
        )}
      >
        {notice}
      </p>
      <SaveBar
        dirty={dirty}
        saving={saving}
        form={formId}
        savedFocusTo={noticeRef}
        error={saveError}
        saveLabel={copy.save}
        onDiscard={() => {
          discard();
          setDaysError(null);
          setSaveError(null);
        }}
      />
    </form>
  );
}
