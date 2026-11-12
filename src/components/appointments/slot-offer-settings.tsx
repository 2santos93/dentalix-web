'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getSlotOfferSettings,
  parseExpiryLeadMinutes,
  parseMinLeadMinutes,
  saveSlotOfferSettings,
  SLOT_OFFER_EXPIRY_LEAD_INVALID_MESSAGE,
  SLOT_OFFER_EXPIRY_LEAD_MAX,
  SLOT_OFFER_EXPIRY_LEAD_MIN,
  SLOT_OFFER_MIN_LEAD_INVALID_MESSAGE,
  SLOT_OFFER_MIN_LEAD_MAX,
  SLOT_OFFER_MIN_LEAD_MIN,
  type SlotOfferSettings,
} from '@/lib/appointments/slot-offer-settings-api';
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

type Field = 'expiryLeadMinutes' | 'minLeadMinutes';

const minutes = (n: number) => (n === 1 ? '1 minuto' : `${n} minutos`);

const copy = {
  change: 'Cambiar',
  readOnly: 'Lo cambia administración.',
  fieldLabel: 'Minutos',
  save: 'Guardar',
  cancel: 'Cancelar',
  loadError: 'No pudimos cargar los ajustes de las ofertas de hueco.',
  saveError: 'No pudimos guardar el ajuste. Intenta de nuevo.',
};

const FIELDS: Record<
  Field,
  {
    label: string;
    hint: string;
    value: (n: number) => string;
    dialogTitle: string;
    dialogDescription: string;
    min: number;
    max: number;
    parse: (draft: string) => number | null;
    invalid: string;
    saved: (n: number) => string;
  }
> = {
  expiryLeadMinutes: {
    label: 'Caducidad del enlace',
    hint: 'Cuánto antes de que empiece el hueco deja de valer el enlace de la oferta, para que dé tiempo a avisar a otro paciente.',
    value: (n) => (n === 0 ? 'Al empezar el hueco' : `${minutes(n)} antes del hueco`),
    dialogTitle: 'Cambiar la caducidad del enlace',
    dialogDescription:
      'Se aplica a las ofertas que se envíen desde ahora, en todas las sedes. Las ya enviadas conservan su caducidad. 0 = el enlace vale hasta que empieza el hueco. El cambio queda en la auditoría.',
    min: SLOT_OFFER_EXPIRY_LEAD_MIN,
    max: SLOT_OFFER_EXPIRY_LEAD_MAX,
    parse: parseExpiryLeadMinutes,
    invalid: SLOT_OFFER_EXPIRY_LEAD_INVALID_MESSAGE,
    saved: (n) => (n === 0 ? 'Caducidad guardada: al empezar el hueco.' : `Caducidad guardada: ${minutes(n)} antes del hueco.`),
  },
  minLeadMinutes: {
    label: 'Antelación mínima para ofrecer',
    hint: 'Si al enlace le quedaría menos tiempo que esto, el hueco ya no se ofrece por enlace: hay que llamar al paciente.',
    value: minutes,
    dialogTitle: 'Cambiar la antelación mínima',
    dialogDescription:
      'Cuenta desde que se envía la oferta hasta que caduca el enlace. Se aplica a las ofertas que se envíen desde ahora, en todas las sedes. El cambio queda en la auditoría.',
    min: SLOT_OFFER_MIN_LEAD_MIN,
    max: SLOT_OFFER_MIN_LEAD_MAX,
    parse: parseMinLeadMinutes,
    invalid: SLOT_OFFER_MIN_LEAD_INVALID_MESSAGE,
    saved: (n) => `Antelación mínima guardada: ${minutes(n)}.`,
  },
};

const loadErrorOptions = { fallback: copy.loadError, byStatus: { 404: copy.loadError } };

/**
 * Ajustes → Ofertas de hueco (DX-448): cuánto antes del hueco caduca el
 * enlace de la oferta (DX-435) y la antelación mínima para ofrecerlo. Los
 * leen los roles de la agenda; solo ADMIN los cambia, cada uno en su diálogo
 * (la API responde 403 a los demás, y ese texto se enseña tal cual).
 */
export function SlotOfferSettingsSection({ token, allowed }: { token: string; allowed: boolean }) {
  const [settings, setSettings] = useState<SlotOfferSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const sending = useRef(false);
  const fieldId = useId();

  useEffect(() => {
    let cancelled = false;
    getSlotOfferSettings(token)
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
        <Skeleton className="mt-6 h-4 w-56" />
        <Skeleton className="mt-4 h-4 w-64" />
      </div>
    );
  }

  const current = settings;
  const field = editing ? FIELDS[editing] : null;

  function open(next: Field) {
    setDraft(String(current[next]));
    setFieldError(null);
    setSaveError(null);
    setNotice('');
    setEditing(next);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing || !field) return;
    const value = field.parse(draft);
    if (value === null) {
      setFieldError(field.invalid);
      return;
    }
    // Dos clics seguidos antes de que `saving` pinte: una sola llamada.
    if (sending.current) return;
    sending.current = true;
    setFieldError(null);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveSlotOfferSettings(token, {
        expiryLeadMinutes: current.expiryLeadMinutes,
        minLeadMinutes: current.minLeadMinutes,
        [editing]: value,
      });
      setSettings(res);
      setNotice(field.saved(res[editing]));
      setEditing(null);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }

  const rows: { key: Field; isDefault: boolean }[] = [
    { key: 'expiryLeadMinutes', isDefault: current.expiryLeadMinutes === current.defaultExpiryLeadMinutes },
    { key: 'minLeadMinutes', isDefault: current.minLeadMinutes === current.defaultMinLeadMinutes },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SettingRows>
        {rows.map(({ key, isDefault }) => (
          <SettingRow
            key={key}
            label={FIELDS[key].label}
            description={FIELDS[key].hint}
            isDefault={isDefault}
            value={<span data-testid={`slot-offer-${key}`}>{FIELDS[key].value(current[key])}</span>}
            action={
              allowed ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="max-sm:min-h-11"
                  aria-label={FIELDS[key].dialogTitle}
                  onClick={() => open(key)}
                >
                  {copy.change}
                </Button>
              ) : (
                <span className="text-sm text-muted">{copy.readOnly}</span>
              )
            }
          />
        ))}
      </SettingRows>
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>
      {/* Mientras se guarda no se cierra: el fallo llegaría a un diálogo cerrado. */}
      <Dialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && saving) return;
          if (!next) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md" closeDisabled={saving}>
          {field ? (
            <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{field.dialogTitle}</DialogTitle>
                <DialogDescription>{field.dialogDescription}</DialogDescription>
              </DialogHeader>
              <FormField htmlFor={fieldId} label={copy.fieldLabel} error={fieldError}>
                <Input
                  id={fieldId}
                  type="number"
                  inputMode="numeric"
                  min={field.min}
                  max={field.max}
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
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
