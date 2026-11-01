'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { readyTimeZone, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import {
  getRetentionSettings,
  RETENTION_REDUCTION_UNCONFIRMED,
  saveRetentionSettings,
  type RetentionSettings,
} from '@/lib/patients/retention-settings-api';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
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

/** Desde este salto sobre el plazo vigente se pide revisar el número. */
const BIG_JUMP_YEARS = 10;
/** Los mensajes del 409 son largos; el tope por defecto los descartaría. */
const MESSAGE_MAX_LENGTH = 1000;

const copy = {
  label: 'Plazo de conservación',
  hint: (min: number) =>
    `Años que se conserva la historia clínica desde la última atención. Mientras dure, el paciente no se puede archivar. El mínimo de la plataforma es de ${min} años.`,
  years: (n: number) => `${n} años`,
  change: 'Cambiar',
  platformRaised: (min: number) => `La plataforma exige al menos ${min} años: se aplica ${min}.`,
  windowNote: (until: string, previous: number) =>
    `Hasta el ${until} puedes volver a ${previous} años sin ningún efecto.`,
  windowNoteNoDate: (previous: number) =>
    `Durante 24 horas desde la subida puedes volver a ${previous} años sin ningún efecto.`,
  dialogTitle: 'Cambiar el plazo de conservación',
  fieldLabel: 'Años',
  raise: (n: number, windowSentence: string) =>
    `Se aplica desde ya en todas las sedes: las historias se conservarán ${n} años desde su última atención, también las que ya habían salido del plazo y siguen sin archivar. ${windowSentence} Pasadas las 24 horas, si reduces el plazo, las historias que estén en retención conservarán la fecha de ${n} años y eso no se puede deshacer. El cambio queda en la auditoría.`,
  raiseWindowFresh: (previous: number) =>
    `Si te equivocas, durante 24 horas puedes volver a ${previous} años sin ningún efecto.`,
  raiseWindowOpen: (previous: number, until: string | null) =>
    until
      ? `Puedes volver a ${previous} años sin ningún efecto hasta el ${until}.`
      : `Puedes volver a ${previous} años sin ningún efecto durante las 24 horas siguientes a la subida.`,
  reduce:
    'Las historias que hoy están en retención mantienen su fecha de fin. El plazo nuevo se aplica al resto y a las atenciones que vengan.',
  reduceInWindow: 'Estás corrigiendo una subida reciente: esa subida no deja fechas fijadas.',
  jump: 'Es un salto grande: revisa el número.',
  invalid: (min: number, max: number) =>
    `El plazo de conservación de la historia clínica tiene que ser un número entero de años entre ${min} y ${max}.`,
  save: 'Guardar',
  raiseTo: (n: number) => `Subir a ${n} años`,
  cancel: 'Cancelar',
  confirmTitle: (a: number, b: number) => `Reducir el plazo de ${a} a ${b} años`,
  confirmFallback: 'Confirma la reducción del plazo para guardarla.',
  back: 'Volver',
  reduceButton: 'Reducir el plazo',
  savedRaise: (n: number) => `Plazo guardado: ${n} años.`,
  savedReduce: (n: number, protectedPatients: number) =>
    protectedPatients === 0
      ? `Plazo guardado: ${n} años.`
      : protectedPatients === 1
        ? `Plazo guardado: ${n} años. 1 historia mantiene su fecha anterior.`
        : `Plazo guardado: ${n} años. ${protectedPatients} historias mantienen su fecha anterior.`,
  loadError: 'No pudimos cargar el plazo de conservación.',
  saveError: 'No pudimos guardar el plazo de conservación. Intenta de nuevo.',
  forbiddenTitle: 'Solo administración cambia el plazo de conservación.',
  forbiddenHint: 'La ficha de cada paciente dice hasta cuándo se conserva su historia.',
};

const loadErrorOptions = { fallback: copy.loadError, byStatus: { 404: copy.loadError } };

type Step = 'closed' | 'edit' | 'confirm';

/** Entero de hasta tres cifras; todo lo demás (vacío, `15,5`, `1e2`, `-20`) no es un plazo. */
function parseYears(draft: string): number | null {
  const text = draft.trim();
  return /^\d{1,3}$/.test(text) ? Number(text) : null;
}

/**
 * Ajustes → Historia clínica → Plazo de conservación (DX-330): cuántos años se
 * conserva la historia desde la última atención. Solo ADMIN lo cambia, en un
 * diálogo: una subida avisa de la ventana de corrección de 24 h; una bajada
 * pide un segundo paso con el mensaje de la API.
 */
export function ClinicalRecordRetentionSettingsSection({
  token,
  allowed,
}: {
  token: string;
  allowed: boolean;
}) {
  const [settings, setSettings] = useState<RetentionSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [step, setStep] = useState<Step>('closed');
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const sending = useRef(false);
  const fieldId = useId();
  const fmt = readyFormat(useSedeFormat(token));
  const timeZone = readyTimeZone(useSedeTimeZone(token));

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getRetentionSettings(token)
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

  const { effectiveYears, platformMinimumYears: min, maximumYears: max, correctionWindow } = settings;
  const untilText =
    correctionWindow && fmt && timeZone ? fmt.dateTime(new Date(correctionWindow.until), timeZone) : null;
  const parsed = parseYears(draft);
  const valid = parsed !== null && parsed >= min && parsed <= max;
  const isRaise = valid && parsed > effectiveYears;
  const isReduction = valid && parsed < effectiveYears;
  const bigJump = isRaise && parsed - effectiveYears >= BIG_JUMP_YEARS;

  function openDialog() {
    // Empieza en el plazo que rige, no en el guardado (que puede ser menor).
    setDraft(String(effectiveYears));
    setFieldError(null);
    setSaveError(null);
    setNotice('');
    setStep('edit');
  }

  function close() {
    setStep('closed');
  }

  function raiseDescription(n: number) {
    const windowSentence = correctionWindow
      ? copy.raiseWindowOpen(correctionWindow.previousYears, untilText)
      : copy.raiseWindowFresh(effectiveYears);
    return copy.raise(n, windowSentence);
  }

  async function send(years: number, confirm: boolean) {
    // Dos clics seguidos antes de que el estado `saving` pinte: una sola llamada.
    if (sending.current) return;
    sending.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveRetentionSettings(token, {
        clinicalRecordRetentionYears: years,
        ...(confirm ? { confirmReduction: true as const } : {}),
      });
      setSettings(res);
      setNotice(
        years < effectiveYears
          ? copy.savedReduce(years, res.protectedPatients)
          : copy.savedRaise(years),
      );
      setStep('closed');
    } catch (err) {
      if (err instanceof ApiError && err.code === RETENTION_REDUCTION_UNCONFIRMED) {
        setConfirmMessage(
          apiErrorMessage(err, { fallback: copy.confirmFallback, maxLength: MESSAGE_MAX_LENGTH }),
        );
        setStep('confirm');
      } else {
        setSaveError(apiErrorMessage(err, { fallback: copy.saveError, maxLength: MESSAGE_MAX_LENGTH }));
      }
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) {
      setFieldError(copy.invalid(min, max));
      return;
    }
    setFieldError(null);
    void send(parsed, false);
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingRows>
        <SettingRow
          label={copy.label}
          description={copy.hint(min)}
          isDefault={effectiveYears === min && settings.clinicalRecordRetentionYears === min}
          value={<span data-testid="retention-years">{copy.years(effectiveYears)}</span>}
          action={
            <Button type="button" variant="secondary" className="max-sm:min-h-11" onClick={openDialog}>
              {copy.change}
            </Button>
          }
        />
      </SettingRows>
      {settings.clinicalRecordRetentionYears < effectiveYears ? (
        <p className="text-sm text-muted">{copy.platformRaised(min)}</p>
      ) : null}
      {correctionWindow ? (
        <p className="text-sm text-muted">
          {untilText
            ? copy.windowNote(untilText, correctionWindow.previousYears)
            : copy.windowNoteNoDate(correctionWindow.previousYears)}
        </p>
      ) : null}
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>
      <Dialog open={step !== 'closed'} onOpenChange={(open) => (open ? undefined : close())}>
        <DialogContent className="max-w-md">
          {step === 'confirm' ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{copy.confirmTitle(effectiveYears, parsed ?? effectiveYears)}</DialogTitle>
                <DialogDescription>{confirmMessage}</DialogDescription>
              </DialogHeader>
              {saveError ? <InlineError variant="summary">{saveError}</InlineError> : null}
              <DialogFooter>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => setStep('edit')}>
                  {copy.back}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  loading={saving}
                  className="max-sm:min-h-11"
                  onClick={() => parsed !== null && void send(parsed, true)}
                >
                  {copy.reduceButton}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{copy.dialogTitle}</DialogTitle>
                <DialogDescription>
                  {isRaise
                    ? raiseDescription(parsed)
                    : isReduction
                      ? [correctionWindow ? copy.reduceInWindow : null, copy.reduce]
                          .filter(Boolean)
                          .join(' ')
                      : copy.hint(min)}
                </DialogDescription>
              </DialogHeader>
              <FormField htmlFor={fieldId} label={copy.fieldLabel} error={fieldError}>
                <Input
                  id={fieldId}
                  type="number"
                  inputMode="numeric"
                  min={min}
                  max={max}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setFieldError(null);
                  }}
                  disabled={saving}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? fieldErrorId(fieldId) : undefined}
                  className="max-sm:h-11"
                />
              </FormField>
              {bigJump ? <p className="text-sm text-warning-text">{copy.jump}</p> : null}
              {saveError ? <InlineError variant="summary">{saveError}</InlineError> : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={saving}>
                    {copy.cancel}
                  </Button>
                </DialogClose>
                <Button type="submit" loading={saving} className="max-sm:min-h-11">
                  {isRaise ? copy.raiseTo(parsed) : copy.save}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
