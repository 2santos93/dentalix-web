'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  DEFAULT_RECEIPT_TITLE,
  RECEIPT_LEGEND_MAX,
  RECEIPT_TITLE_MAX,
  SUGGESTED_RECEIPT_LEGEND,
  getReceiptSettings,
  saveReceiptSettings,
  type ReceiptSettings,
} from '@/lib/payments/receipt-settings-api';
import { SectionError } from '@/components/errors/section-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingsSection } from '@/components/settings/settings-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

export const receiptSettingsCopy = {
  heading: 'Recibo de caja',
  support:
    'El recibo de caja no es una factura. Puedes darle otro título y una leyenda que lo deje claro; se aplican a los recibos que se emitan desde ahora.',
  title: 'Título del recibo',
  titleHint: (n: number) =>
    `Vacío: «${DEFAULT_RECEIPT_TITLE}». Por ejemplo, «Recibo de pago». ${n}/${RECEIPT_TITLE_MAX}`,
  legend: 'Leyenda del recibo',
  legendHint: (n: number) =>
    `Sale en el recibo A4 y en el de 80 mm. Vacía: no se imprime ninguna. ${n}/${RECEIPT_LEGEND_MAX}`,
  suggestion: `Usar «${SUGGESTED_RECEIPT_LEGEND}»`,
  perSede: 'Cada sede puede usar su propia leyenda desde su ficha en',
  perSedeLink: 'Sedes',
  oneLine: 'Escríbelo en una sola línea.',
  saved: 'Título y leyenda del recibo guardados.',
  saveAria: 'Guardar el título y la leyenda del recibo',
  loadError: 'No pudimos cargar el título y la leyenda del recibo.',
  saveError: 'No pudimos guardar el título y la leyenda del recibo. Intenta de nuevo.',
  loading: 'Cargando',
};

const copy = receiptSettingsCopy;

interface Draft {
  title: string;
  legend: string;
}

const toDraft = (s: Pick<ReceiptSettings, 'title' | 'legend'>): Draft => ({
  title: s.title ?? '',
  legend: s.legend ?? '',
});

/**
 * DX-515, Ajustes › Caja: título y leyenda del recibo de la clínica (solo
 * ADMIN, como la página). Un solo modelo de guardado: la barra «Cambios sin
 * guardar». La leyenda propia de cada sede va en su ficha (DESIGN.md → «Per
 * sede»). Sugerencia genérica, sin país ni norma.
 */
export function ReceiptSettingsForm({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<ReceiptSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const saved = React.useMemo(() => (loaded ? toDraft(loaded) : null), [loaded]);

  useEffect(() => {
    let cancelled = false;
    getReceiptSettings(token)
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
      ) : !loaded || !saved ? (
        <div role="status" aria-label={copy.loading} className="rounded-xl border border-border bg-surface p-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      ) : (
        <ReceiptSettingsFields token={token} saved={saved} onSaved={(s) => setLoaded({ ...loaded, ...s })} />
      )}
    </SettingsSection>
  );
}

function ReceiptSettingsFields({
  token,
  saved,
  onSaved,
}: {
  token: string;
  saved: Draft;
  onSaved: (settings: { title: string | null; legend: string | null }) => void;
}) {
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: keyof Draft; message: string } | null>(null);
  const formId = 'receipt-settings-form';
  const titleId = 'receipt-title-input';
  const legendId = 'receipt-legend-input';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (/[\r\n]/.test(draft.title)) return setFieldError({ field: 'title', message: copy.oneLine });
    if (/[\r\n]/.test(draft.legend)) return setFieldError({ field: 'legend', message: copy.oneLine });
    setSaving(true);
    try {
      const res = await saveReceiptSettings(token, {
        title: draft.title.trim() || null,
        legend: draft.legend.trim() || null,
      });
      onSaved(res);
      commit(toDraft(res));
      toast.success(copy.saved);
    } catch (err) {
      const message = apiErrorMessage(err, copy.saveError);
      if (err instanceof ApiError && err.status === 400) {
        setFieldError({ field: /título/i.test(message) ? 'title' : 'legend', message });
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  const errorOf = (field: keyof Draft) => (fieldError?.field === field ? fieldError.message : null);

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <FormField
          htmlFor={titleId}
          label={copy.title}
          hint={copy.titleHint(draft.title.length)}
          hintId={`${titleId}-hint`}
          error={errorOf('title')}
        >
          <Input
            id={titleId}
            autoComplete="off"
            maxLength={RECEIPT_TITLE_MAX}
            placeholder={DEFAULT_RECEIPT_TITLE}
            value={draft.title}
            disabled={saving}
            onChange={(e) => update({ title: e.target.value })}
            aria-invalid={errorOf('title') ? true : undefined}
            aria-describedby={errorOf('title') ? fieldErrorId(titleId) : `${titleId}-hint`}
            className="sm:max-w-96"
          />
        </FormField>
        <FormField
          htmlFor={legendId}
          label={copy.legend}
          hint={copy.legendHint(draft.legend.length)}
          hintId={`${legendId}-hint`}
          error={errorOf('legend')}
        >
          <Textarea
            id={legendId}
            rows={2}
            autoGrow
            maxLength={RECEIPT_LEGEND_MAX}
            value={draft.legend}
            disabled={saving}
            onChange={(e) => update({ legend: e.target.value.replace(/[\r\n]+/g, ' ') })}
            aria-invalid={errorOf('legend') ? true : undefined}
            aria-describedby={errorOf('legend') ? fieldErrorId(legendId) : `${legendId}-hint`}
            className="max-h-40"
          />
        </FormField>
        {draft.legend.trim() === '' ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start max-sm:w-full"
            disabled={saving}
            onClick={() => update({ legend: SUGGESTED_RECEIPT_LEGEND })}
          >
            {copy.suggestion}
          </Button>
        ) : null}
        <p className="text-sm text-muted">
          {copy.perSede}{' '}
          <Link href="/settings/sedes" className="font-medium text-primary-text underline-offset-4 hover:underline">
            {copy.perSedeLink}
          </Link>
          .
        </p>
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
