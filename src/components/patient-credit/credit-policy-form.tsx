'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getCreditPolicy, saveCreditPolicy, type CreditPolicy } from '@/lib/patient-credit/patient-credit-api';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import { SectionError } from '@/components/errors/section-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingsSection } from '@/components/settings/settings-page';
import { Skeleton } from '@/components/ui/skeleton';

export const creditPolicyCopy = {
  heading: 'Saldo a favor',
  support:
    'Cuánto puede mover recepción del saldo a favor de un paciente (aplicarlo a otro plan o devolverlo). Cada cambio queda en la auditoría.',
  label: 'Tope de recepción por día (en cada moneda)',
  hint: '0 = recepción no puede traspasar ni devolver; el administrador siempre puede. Un traspaso se compara con el tope en cada operación; una devolución, con lo ya devuelto ese día.',
  saved: 'Tope de recepción guardado.',
  saveAria: 'Guardar el tope de recepción',
  loadError: 'No pudimos cargar el tope de recepción.',
  saveError: 'No pudimos guardar el tope de recepción. Intenta de nuevo.',
  loading: 'Cargando',
};

const copy = creditPolicyCopy;
const noMoney = () => '';

interface Draft {
  cap: string;
}

const toDraft = (policy: CreditPolicy): Draft => ({ cap: moneyInputText(policy.receptionMaxAmount) });

/**
 * DX-432, Ajustes › Caja: el tope de recepción del saldo a favor (solo ADMIN,
 * como la página). Un número por clínica que se aplica en cada moneda, por
 * día; la API lo audita con el antes y el después. Un solo modelo de
 * guardado: la barra «Cambios sin guardar».
 */
export function CreditPolicyForm({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<CreditPolicy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const saved = React.useMemo(() => (loaded ? toDraft(loaded) : null), [loaded]);

  useEffect(() => {
    let cancelled = false;
    getCreditPolicy(token)
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
      ) : !saved ? (
        <div role="status" aria-label={copy.loading} className="rounded-xl border border-border bg-surface p-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      ) : (
        <CreditPolicyFields token={token} saved={saved} onSaved={setLoaded} />
      )}
    </SettingsSection>
  );
}

function CreditPolicyFields({
  token,
  saved,
  onSaved,
}: {
  token: string;
  saved: Draft;
  onSaved: (policy: CreditPolicy) => void;
}) {
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const formId = 'credit-policy-form';
  const inputId = 'credit-policy-cap';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    // El tope es un número sin moneda (se aplica a cada una): se lee con la regla del importe.
    const parsed = parseMoneyInput(draft.cap, '');
    if (!parsed.ok) return setFieldError(parsed.message);
    setSaving(true);
    try {
      const res = await saveCreditPolicy(token, parsed.value);
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
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <FormField htmlFor={inputId} label={copy.label} hint={copy.hint} hintId={`${inputId}-hint`} error={fieldError}>
          <MoneyInput
            id={inputId}
            value={draft.cap}
            onValueChange={(cap) => update({ cap })}
            currency=""
            money={noMoney}
            disabled={saving}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? fieldErrorId(inputId) : `${inputId}-hint`}
            containerClassName="sm:max-w-64"
            className="max-sm:min-h-11"
          />
        </FormField>
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
          setFieldError(null);
        }}
      />
    </form>
  );
}
