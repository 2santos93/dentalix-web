'use client';
import * as React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  CERTIFICATE_REST_MAX_DAYS_MAX,
  CERTIFICATE_REST_MAX_DAYS_MIN,
  getCertificateSettings,
  saveCertificateSettings,
  type CertificateSettings,
} from '@/lib/certificates/certificates-api';
import { SectionError } from '@/components/errors/section-error';
import { FormField } from '@/components/shared/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingRows } from '@/components/settings/settings-page';
import { cn } from '@/lib/utils';

export const certificateSettingsCopy = {
  maxDaysLabel: 'Máximo de días de reposo',
  maxDaysHint: `Lo más que puede indicar un certificado de reposo. Entre ${CERTIFICATE_REST_MAX_DAYS_MIN} y ${CERTIFICATE_REST_MAX_DAYS_MAX}.`,
  maxDaysInvalid: `Escribe un número entero de días entre ${CERTIFICATE_REST_MAX_DAYS_MIN} y ${CERTIFICATE_REST_MAX_DAYS_MAX}.`,
  diagnosisTitle: 'Imprimir el diagnóstico en el reposo',
  diagnosisHint:
    'Quien emite el reposo puede escribir el diagnóstico y sale impreso. Recepción no lo ve ni imprime esos reposos. El justificante de asistencia nunca lo lleva.',
  save: 'Guardar',
  saved: 'Ajustes de los certificados guardados.',
  loadError: 'No pudimos cargar los ajustes de los certificados.',
  saveError: 'No pudimos guardar los ajustes de los certificados. Intenta de nuevo.',
  loading: 'Cargando',
};

const copy = certificateSettingsCopy;

interface CertificateSettingsDraft {
  maxDays: string;
  printDiagnosis: boolean;
}

const EMPTY_DRAFT: CertificateSettingsDraft = { maxDays: '', printDiagnosis: false };

function toDraft(settings: CertificateSettings): CertificateSettingsDraft {
  return { maxDays: String(settings.restMaxDays), printDiagnosis: settings.restPrintDiagnosis };
}

function sameDraft(a: CertificateSettingsDraft, b: CertificateSettingsDraft): boolean {
  return a.maxDays.trim() === b.maxDays.trim() && a.printDiagnosis === b.printDiagnosis;
}

function parseMaxDays(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const days = Number(text.trim());
  return days >= CERTIFICATE_REST_MAX_DAYS_MIN && days <= CERTIFICATE_REST_MAX_DAYS_MAX ? days : null;
}

/**
 * Ajustes › Certificados (DX-306): el máximo de días de un certificado de
 * reposo y si el reposo imprime el diagnóstico. Aplica a la siguiente emisión.
 * Solo ADMIN: la página decide el permiso y no monta esto sin él.
 */
export function CertificateSettingsForm({ token }: { token: string }) {
  const [settings, setSettings] = useState<CertificateSettings | null>(null);
  const saved = useMemo(() => (settings ? toDraft(settings) : EMPTY_DRAFT), [settings]);
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved, sameDraft);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [maxDaysError, setMaxDaysError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const maxDaysRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const formId = `${id}-form`;
  const maxDaysId = `${id}-max-days`;

  useEffect(() => {
    let cancelled = false;
    getCertificateSettings(token)
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

  function edit(patch: Partial<CertificateSettingsDraft>) {
    update(patch);
    setNotice('');
    setSaveError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setNotice('');
    const restMaxDays = parseMaxDays(draft.maxDays);
    if (restMaxDays === null) {
      setMaxDaysError(copy.maxDaysInvalid);
      maxDaysRef.current?.focus();
      return;
    }
    setMaxDaysError(null);
    setSaving(true);
    try {
      const next = await saveCertificateSettings(token, {
        restMaxDays,
        restPrintDiagnosis: draft.printDiagnosis,
      });
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
          <FormField htmlFor={maxDaysId} label={copy.maxDaysLabel} hint={copy.maxDaysHint} error={maxDaysError}>
            <Input
              ref={maxDaysRef}
              id={maxDaysId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft.maxDays}
              disabled={saving}
              aria-invalid={maxDaysError ? true : undefined}
              onChange={(e) => {
                edit({ maxDays: e.target.value });
                setMaxDaysError(null);
              }}
              className="t-data w-28"
            />
          </FormField>
        </div>
        {/* Espera a «Guardar»: casilla, no interruptor (DESIGN.md → Form Controls). */}
        <div className="px-4 py-3 sm:px-6">
          <Checkbox
            label={copy.diagnosisTitle}
            description={copy.diagnosisHint}
            checked={draft.printDiagnosis}
            disabled={saving}
            onChange={(e) => edit({ printDiagnosis: e.target.checked })}
          />
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
          setMaxDaysError(null);
          setSaveError(null);
        }}
      />
    </form>
  );
}
