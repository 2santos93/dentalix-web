'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { History, Mail, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { locationCurrency } from '@/lib/locations/location-settings';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import {
  NOTICE_HOURS_MAX,
  NOTICE_HOURS_MIN,
  PATIENT_TEXT_MAX,
  createCancellationPolicyVersion,
  getCancellationPolicy,
  getReminderEmailPreview,
  type CancellationPolicy,
  type CancellationPolicyVersion,
  type ReminderEmailPreview,
} from '@/lib/cancellations/cancellation-policy-api';
import { formatCurrency } from '@/lib/format/currency';
import { formatDateTime } from '@/lib/format/date';
import { parseMoneyInput } from '@/lib/format/money';
import { AsyncSection } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FieldError } from '@/components/errors/field-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { SectionError } from '@/components/errors/section-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const cancellationPolicyCopy = {
  heading: 'Política de cancelación',
  support:
    'Cuántas horas de aviso pide cada sede. Una cancelación del paciente con menos aviso cuenta como tardía; las de la clínica nunca. Cada cambio guarda una versión nueva y la anterior queda en el historial.',
  loadError: 'No pudimos cargar las sedes.',
  policyLoadError: 'Política sin cargar',
  inactive: 'inactiva',
  none: 'Sin política: ninguna cancelación cuenta como tardía.',
  summary: (hours: number, version: number) => `${hours} h de aviso · versión ${version}`,
  fee: (amount: string) => `Importe sugerido: ${amount}`,
  configure: 'Configurar',
  change: 'Cambiar',
  configureFor: (name: string) => `Configurar la política de ${name}`,
  changeFor: (name: string) => `Cambiar la política de ${name}`,
  history: 'Historial de versiones',
  historyMeta: (n: number) => (n === 1 ? '1 versión' : `${n} versiones`),
  versionLine: (version: number, when: string, who: string | null) =>
    `Versión ${version} · ${when}${who ? ` · ${who}` : ''}`,
  noText: 'Sin texto para el paciente.',
  modalTitle: (name: string) => `Política de cancelación · ${name}`,
  modalDescription:
    'Guardar crea una versión nueva; la anterior no cambia y queda en el historial.',
  hours: 'Horas de aviso',
  hoursHint: `De ${NOTICE_HOURS_MIN} a ${NOTICE_HOURS_MAX} (7 días). Con menos aviso, la cancelación del paciente es tardía.`,
  hoursError: `Escribe un número entero de ${NOTICE_HOURS_MIN} a ${NOTICE_HOURS_MAX}.`,
  feeLabel: 'Importe sugerido (opcional)',
  feeHint: 'Lo que la clínica podría cobrar por una inasistencia o cancelación tardía.',
  currency: 'Moneda',
  feeNeedsCurrency: 'El importe necesita la moneda de la sede: configúrala en Ajustes → Sedes.',
  text: 'Texto para el paciente',
  textHint: 'Lo verá el paciente al confirmar o cancelar su cita.',
  counter: (n: number) => `${n}/${PATIENT_TEXT_MAX}`,
  save: 'Guardar versión nueva',
  saved: (name: string, version: number) => `Política de ${name} guardada (versión ${version}).`,
  saveError: 'No pudimos guardar la política. Intenta de nuevo.',
  // DX-291: quién cobra y vista previa del recordatorio.
  receptionCanCharge: 'Recepción puede generar o condonar el cargo',
  receptionCanChargeHint:
    'Si no, solo un administrador cobra o condona las inasistencias y cancelaciones tardías.',
  receptionCharges: 'Recepción puede generar el cargo',
  preview: 'Vista previa del email',
  previewFor: (name: string) => `Vista previa del recordatorio de ${name}`,
  previewTitle: (name: string) => `Recordatorio por email · ${name}`,
  previewDescription:
    'Así le llega el recordatorio al paciente con la política vigente. El paciente y el profesional son de ejemplo.',
  previewSubject: (subject: string) => `Asunto: ${subject}`,
  previewFrame: 'Contenido del email de recordatorio',
  previewLoading: 'Cargando la vista previa…',
  previewError: 'No pudimos cargar la vista previa.',
  close: 'Cerrar',
};

const copy = cancellationPolicyCopy;

/**
 * DX-279: Ajustes → Sedes → «Política de cancelación». Solo ADMIN (la página
 * no la pinta a los demás y la API les responde 403): horas de aviso, importe
 * sugerido opcional, texto para el paciente con contador e historial de
 * versiones (append-only).
 */
export function CancellationPolicySettings({ token }: { token: string }) {
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // G1: la lectura de la sesión; el modal de sede la invalida y esta tarjeta
  // relee sin vaciarse (la sede nueva o editada aparece sin recargar).
  const requestLocations = useSessionLocations(token);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await requestLocations();
        if (cancelled) return;
        setLocations(data);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [requestLocations, reloadKey]);

  return (
    <section aria-labelledby="cancellation-policy-heading" className="mt-8 flex flex-col gap-3">
      <div>
        <h2 id="cancellation-policy-heading" className="text-lg font-semibold text-ink">
          {copy.heading}
        </h2>
        <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
      </div>
      <AsyncSection loading={loading} error={error} onRetry={() => {
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
      >
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-border bg-surface">
          {locations.map((location) => (
            <li key={location.id} className="px-4 py-3">
              <LocationPolicyRow
                token={token}
                location={location}
                onRetryLocations={() => {
                  // Relee sin vaciar la lista (el modal abierto sigue abierto).
                  requestLocations.invalidate();
                  setReloadKey((k) => k + 1);
                }}
              />
            </li>
          ))}
        </ul>
      </AsyncSection>
    </section>
  );
}

function feeText(version: CancellationPolicyVersion): string | null {
  return version.suggestedFee !== null && version.currency
    ? formatCurrency(version.suggestedFee, version.currency)
    : null;
}

function LocationPolicyRow({
  token,
  location,
  onRetryLocations,
}: {
  token: string;
  location: ClinicLocation;
  onRetryLocations: () => void;
}) {
  const [policy, setPolicy] = useState<CancellationPolicy | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const name = `${location.name}${location.isActive ? '' : ` (${copy.inactive})`}`;

  useEffect(() => {
    let cancelled = false;
    getCancellationPolicy(token, location.id)
      .then((res) => {
        if (cancelled) return;
        setPolicy(res);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, location.id, reloadKey]);

  const current = policy?.current ?? null;
  const fee = current ? feeText(current) : null;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-ink">{name}</span>
          {failed ? (
            <FieldError
              label={copy.policyLoadError}
              onRetry={() => {
                setFailed(false);
                setReloadKey((k) => k + 1);
              }}
              className="h-9"
            />
          ) : policy === null ? (
            <span role="status" className="h-5 w-48 animate-pulse rounded bg-surface-2">
              <span className="sr-only">Cargando la política…</span>
            </span>
          ) : current ? (
            <>
              <span className="tabular-nums text-ink" data-testid={`policy-summary-${location.id}`}>
                {copy.summary(current.noticeHours, current.version)}
              </span>
              {fee ? <span className="tabular-nums text-muted">{copy.fee(fee)}</span> : null}
              {current.receptionCanCharge ? <span className="text-muted">{copy.receptionCharges}</span> : null}
            </>
          ) : (
            <span className="text-muted">{copy.none}</span>
          )}
        </div>
        {policy !== null ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {current ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                aria-label={copy.previewFor(location.name)}
                onClick={() => setPreviewing(true)}
              >
                <Mail aria-hidden />
                {copy.preview}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full sm:min-h-0 sm:w-auto"
              aria-label={current ? copy.changeFor(location.name) : copy.configureFor(location.name)}
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden />
              {current ? copy.change : copy.configure}
            </Button>
          </div>
        ) : null}
      </div>
      {policy && policy.versions.length > 0 ? (
        <Disclosure summary={copy.history} meta={copy.historyMeta(policy.versions.length)}>
          <ol className="flex flex-col divide-y divide-hairline" aria-label={`${copy.history} · ${location.name}`}>
            {policy.versions.map((v) => (
              <li key={v.id} className="flex flex-col gap-0.5 px-2 py-2">
                <span className="flex items-center gap-1.5 text-xs text-muted tabular-nums">
                  <History aria-hidden className="size-3.5 shrink-0" />
                  {copy.versionLine(v.version, formatDateTime(v.createdAt), v.createdByName)}
                </span>
                <span className="tabular-nums text-ink">
                  {copy.summary(v.noticeHours, v.version)}
                  {feeText(v) ? ` · ${copy.fee(feeText(v)!)}` : ''}
                </span>
                <span className="whitespace-pre-line break-words text-muted">
                  {v.patientText || copy.noText}
                </span>
              </li>
            ))}
          </ol>
        </Disclosure>
      ) : null}
      {editing ? (
        <CancellationPolicyModal
          token={token}
          location={location}
          current={current}
          onRetryLocations={onRetryLocations}
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
          onSaved={(saved) => {
            setEditing(false);
            setPolicy((prev) => ({
              locationId: location.id,
              current: saved,
              versions: [saved, ...(prev?.versions ?? [])],
            }));
            toast.success(copy.saved(location.name, saved.version));
          }}
        />
      ) : null}
      {previewing ? (
        <ReminderPreviewDialog token={token} location={location} onClose={() => setPreviewing(false)} />
      ) : null}
    </div>
  );
}

/**
 * DX-291: el recordatorio por email tal como lo renderiza la API (con la marca
 * de la clínica y `{politica_cancelacion}`), en un iframe SIN permisos: el
 * HTML del email no ejecuta nada ni navega desde aquí.
 */
function ReminderPreviewDialog({
  token,
  location,
  onClose,
}: {
  token: string;
  location: ClinicLocation;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<ReminderEmailPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getReminderEmailPreview(token, location.id)
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, copy.previewError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, location.id, reloadKey]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.previewTitle(location.name)}</DialogTitle>
          <DialogDescription>{copy.previewDescription}</DialogDescription>
        </DialogHeader>
        {error ? (
          <SectionError
            description={error}
            onRetry={() => {
              setError(null);
              setReloadKey((k) => k + 1);
            }}
          />
        ) : preview === null ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="sr-only">{copy.previewLoading}</span>
            <span className="h-5 w-64 max-w-full animate-pulse rounded bg-surface-2" />
            <span className="h-64 w-full animate-pulse rounded bg-surface-2" />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="break-words text-sm font-medium text-ink">{copy.previewSubject(preview.subject)}</p>
            <iframe
              title={copy.previewFrame}
              sandbox=""
              srcDoc={preview.html}
              className="h-[55vh] w-full rounded-lg border border-border bg-white"
            />
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {copy.close}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DIGITS = /^\d{1,3}$/;

export function CancellationPolicyModal({
  token,
  location,
  current,
  onRetryLocations,
  onOpenChange,
  onSaved,
}: {
  token: string;
  location: ClinicLocation;
  current: CancellationPolicyVersion | null;
  /** Vuelve a leer las sedes (la sede no tenía moneda). */
  onRetryLocations: () => void;
  onOpenChange: (open: boolean) => void;
  onSaved: (saved: CancellationPolicyVersion) => void;
}) {
  const id = useId();
  const hoursId = `${id}-hours`;
  const feeId = `${id}-fee`;
  const currencyId = `${id}-currency`;
  const textId = `${id}-text`;
  const [hoursText, setHoursText] = useState(current ? String(current.noticeHours) : '24');
  const [feeTextValue, setFeeTextValue] = useState(
    current?.suggestedFee != null ? String(current.suggestedFee) : '',
  );
  // La moneda de la versión vigente o, si no tiene, la de la sede (GLOBAL-G1).
  // Una sede sin moneda muestra `SedeConfigError` en el campo: nunca otra.
  const [currencyChoice, setCurrency] = useState(current?.currency ?? '');
  const currency = currencyChoice || locationCurrency(location) || '';
  const [patientText, setPatientText] = useState(current?.patientText ?? '');
  const [receptionCanCharge, setReceptionCanCharge] = useState(current?.receptionCanCharge ?? false);
  const [errors, setErrors] = useState<{ hours?: string; fee?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    const hours = DIGITS.test(hoursText.trim()) ? Number(hoursText.trim()) : NaN;
    if (!Number.isInteger(hours) || hours < NOTICE_HOURS_MIN || hours > NOTICE_HOURS_MAX) {
      next.hours = copy.hoursError;
    }
    let fee: number | null = null;
    if (feeTextValue.trim() !== '') {
      const parsed = parseMoneyInput(feeTextValue, currency);
      if (!currency) next.fee = copy.feeNeedsCurrency;
      else if (parsed.ok) fee = parsed.value;
      else next.fee = parsed.message;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      // Foco al primer campo con error, como el diálogo de cancelar.
      document.getElementById(next.hours ? hoursId : feeId)?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const saved = await createCancellationPolicyVersion(token, location.id, {
        noticeHours: hours,
        suggestedFee: fee,
        currency: fee === null ? null : currency,
        patientText: patientText.trim(),
        receptionCanCharge,
      });
      onSaved(saved);
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open
      onOpenChange={onOpenChange}
      title={copy.modalTitle(location.name)}
      description={copy.modalDescription}
      onSubmit={handleSubmit}
      submitLabel={copy.save}
      submitting={submitting}
      error={error}
    >
      <FormField htmlFor={hoursId} label={copy.hours} error={errors.hours} hint={copy.hoursHint} hintId={`${hoursId}-hint`}>
        <Input
          id={hoursId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={hoursText}
          disabled={submitting}
          onChange={(e) => {
            setHoursText(e.target.value);
            setErrors((x) => ({ ...x, hours: undefined }));
          }}
          aria-invalid={errors.hours ? true : undefined}
          aria-describedby={errors.hours ? fieldErrorId(hoursId) : `${hoursId}-hint`}
          className={cn('w-32 tabular-nums', errors.hours && 'border-danger')}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <FormField htmlFor={feeId} label={copy.feeLabel} error={errors.fee} hint={copy.feeHint} hintId={`${feeId}-hint`}>
          <MoneyInput
            id={feeId}
            value={feeTextValue}
            onValueChange={(v) => {
              setFeeTextValue(v);
              setErrors((x) => ({ ...x, fee: undefined }));
            }}
            currency={currency}
            disabled={submitting}
            aria-invalid={errors.fee ? true : undefined}
            aria-describedby={errors.fee ? fieldErrorId(feeId) : `${feeId}-hint`}
          />
        </FormField>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={currencyId}>{copy.currency}</Label>
          {currency ? (
            <CurrencySelect
              id={currencyId}
              token={token}
              value={currency}
              onChange={setCurrency}
              disabled={submitting}
            />
          ) : (
            <SedeConfigError
              kind="currency"
              variant="field"
              retryId={currencyId}
              onRetry={onRetryLocations}
              className="h-10 w-full"
            />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={textId}>{copy.text}</Label>
        <textarea
          id={textId}
          rows={4}
          maxLength={PATIENT_TEXT_MAX}
          value={patientText}
          disabled={submitting}
          aria-describedby={`${textId}-hint ${textId}-counter`}
          onChange={(e) => setPatientText(e.target.value)}
          className={fieldClass}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted">
          <p id={`${textId}-hint`}>{copy.textHint}</p>
          <p id={`${textId}-counter`} className="shrink-0 tabular-nums">
            {copy.counter(patientText.length)}
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <input
          id={`${id}-reception`}
          type="checkbox"
          checked={receptionCanCharge}
          disabled={submitting}
          onChange={(e) => setReceptionCanCharge(e.target.checked)}
          aria-describedby={`${id}-reception-hint`}
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={`${id}-reception`}>{copy.receptionCanCharge}</Label>
          <p id={`${id}-reception-hint`} className="text-xs text-muted">
            {copy.receptionCanChargeHint}
          </p>
        </div>
      </div>
    </FormModal>
  );
}
