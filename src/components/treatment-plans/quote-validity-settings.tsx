'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  DEFAULT_QUOTE_VALIDITY_DAYS,
  getQuoteSettings,
  parseQuoteValidityDays,
  QUOTE_VALIDITY_INVALID_MESSAGE,
  QUOTE_VALIDITY_MAX_DAYS,
  QUOTE_VALIDITY_MIN_DAYS,
  saveQuoteSettings,
  type QuoteSettings,
} from '@/lib/treatment-plans/quote-settings-api';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const copy = {
  label: 'Validez del presupuesto',
  hint: 'Los presupuestos nuevos indican hasta qué día valen sus precios. Cambiarlo no afecta a los ya presentados. Una clínica nueva empieza con 30 días.',
  days: (n: number) => (n === 1 ? '1 día' : `${n} días`),
  change: 'Cambiar',
  readOnly: 'Lo cambia administración.',
  dialogTitle: 'Cambiar la validez del presupuesto',
  dialogDescription:
    'Se aplica a los presupuestos que se presenten o se impriman por primera vez desde ahora, en todas las sedes. Los ya emitidos conservan sus fechas. El cambio queda en la auditoría.',
  fieldLabel: 'Días',
  save: 'Guardar',
  cancel: 'Cancelar',
  saved: (n: number) => `Validez guardada: ${n === 1 ? '1 día' : `${n} días`}.`,
  loadError: 'No pudimos cargar la validez del presupuesto.',
  saveError: 'No pudimos guardar la validez del presupuesto. Intenta de nuevo.',
};

const loadErrorOptions = { fallback: copy.loadError, byStatus: { 404: copy.loadError } };

/**
 * Ajustes → Presupuestos (DX-379): cuántos días valen los precios de un
 * presupuesto. La leen todos los roles; solo ADMIN la cambia, en un diálogo
 * (la API responde 403 a los demás, y ese texto se enseña tal cual).
 */
export function QuoteValiditySettingsSection({ token, allowed }: { token: string; allowed: boolean }) {
  const [settings, setSettings] = useState<QuoteSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const sending = useRef(false);
  const fieldId = useId();

  useEffect(() => {
    let cancelled = false;
    getQuoteSettings(token)
      .then((res) => {
        if (cancelled) return;
        setSettings(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, loadErrorOptions));
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
      <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-72" />
      </div>
    );
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const days = parseQuoteValidityDays(draft);
    if (days === null) {
      setFieldError(QUOTE_VALIDITY_INVALID_MESSAGE);
      return;
    }
    // Dos clics seguidos antes de que `saving` pinte: una sola llamada.
    if (sending.current) return;
    sending.current = true;
    setFieldError(null);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveQuoteSettings(token, { validityDays: days });
      setSettings(res);
      setNotice(copy.saved(res.validityDays));
      setOpen(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingRows>
        <SettingRow
          label={copy.label}
          description={copy.hint}
          isDefault={settings.validityDays === DEFAULT_QUOTE_VALIDITY_DAYS}
          value={<span data-testid="quote-validity-days">{copy.days(settings.validityDays)}</span>}
          action={
            allowed ? (
              <Button
                type="button"
                variant="secondary"
                className="max-sm:min-h-11"
                aria-label={copy.dialogTitle}
                onClick={() => {
                  setDraft(String(settings.validityDays));
                  setFieldError(null);
                  setSaveError(null);
                  setNotice('');
                  setOpen(true);
                }}
              >
                {copy.change}
              </Button>
            ) : (
              <span className="text-sm text-muted">{copy.readOnly}</span>
            )
          }
        />
      </SettingRows>
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>
      {/* Mientras se guarda no se cierra: el fallo llegaría a un diálogo cerrado. */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && saving) return;
          setOpen(next);
        }}
      >
        <DialogContent className="max-w-md" closeDisabled={saving}>
          <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{copy.dialogTitle}</DialogTitle>
              <DialogDescription>{copy.dialogDescription}</DialogDescription>
            </DialogHeader>
            <FormField htmlFor={fieldId} label={copy.fieldLabel} error={fieldError}>
              <Input
                id={fieldId}
                type="number"
                inputMode="numeric"
                min={QUOTE_VALIDITY_MIN_DAYS}
                max={QUOTE_VALIDITY_MAX_DAYS}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setFieldError(null);
                  setSaveError(null);
                }}
                disabled={saving}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? fieldErrorId(fieldId) : undefined}
                className="max-sm:h-11"
              />
            </FormField>
            {saveError ? <InlineError variant="summary">{saveError}</InlineError> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={saving} className="max-sm:min-h-11">
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button type="submit" loading={saving} className="max-sm:min-h-11">
                {copy.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
