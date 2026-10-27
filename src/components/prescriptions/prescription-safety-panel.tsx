'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { ExternalLink, Info, ShieldAlert } from 'lucide-react';
import { SectionError } from '@/components/errors/section-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import {
  cimaTechnicalSheetUrl,
  type ClinicCountry,
  type PrescriptionSafetyPreview,
  type SafetyAlert,
} from '@/lib/prescriptions/prescriptions-api';

export const safetyCopy = {
  title: 'Avisos de seguridad',
  disclaimer:
    'Ayuda a la prescripción calculada con la anamnesis vigente y la edad del paciente: no sustituye tu juicio clínico.',
  idle: 'Escribe el principio activo para comprobar alergias, interacciones, embarazo y dosis infantil.',
  loading: 'Comprobando avisos de seguridad',
  errorTitle: 'No se pudieron comprobar los avisos',
  errorBody: 'Sin esta comprobación no se puede emitir la receta.',
  none: 'Sin avisos para estos medicamentos.',
  blocking: (n: number) => `Requieren confirmación (${n})`,
  info: (n: number) => `Informativos (${n})`,
  confirm:
    'Confirmo que conozco los avisos y prescribo igualmente bajo mi responsabilidad.',
  reasonLabel: 'Motivo para emitir pese a los avisos',
  reasonHint: 'Queda en la receta y no se puede cambiar.',
  cimaLabel: 'Nº de registro del medicamento (opcional)',
  cimaHint: 'Para abrir su ficha técnica en la CIMA de la AEMPS.',
  cimaLink: 'Ficha técnica en la CIMA: 4.3 Contraindicaciones · 4.5 Interacciones · 4.6 Embarazo',
};

export const SAFETY_REASON_MAX = 500;

export type SafetyState =
  | { kind: 'idle' }
  | { kind: 'loading'; preview?: PrescriptionSafetyPreview }
  | { kind: 'error'; preview?: PrescriptionSafetyPreview }
  | { kind: 'ready'; preview: PrescriptionSafetyPreview };

interface PrescriptionSafetyPanelProps {
  state: SafetyState;
  country: ClinicCountry;
  onRetry: () => void;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  reasonError: string | null;
}

function AlertList({ alerts, tone }: { alerts: SafetyAlert[]; tone: 'blocking' | 'info' }) {
  const Icon = tone === 'blocking' ? ShieldAlert : Info;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert, i) => (
        <li
          key={`${alert.code}-${alert.activeIngredient ?? ''}-${i}`}
          className={cn(
            'flex items-start gap-2 rounded-md border p-3 text-sm text-ink',
            tone === 'blocking'
              ? 'border-danger/40 bg-danger/5'
              : 'border-warning/40 bg-warning/5',
          )}
        >
          <Icon
            aria-hidden
            className={cn('mt-0.5 size-4 shrink-0', tone === 'blocking' ? 'text-danger' : 'text-warning')}
          />
          <div className="min-w-0 flex-1">
            <p className="break-words">{alert.message}</p>
            <p className="mt-1 break-words text-xs text-ink">
              {alert.source} · <span className="font-mono">{alert.code}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Receta segura (DX-300): los avisos que el SERVIDOR calculó para lo que el
 * modal lleva escrito, agrupados por gravedad. Los bloqueantes piden una
 * confirmación explícita y un motivo (que quedan en la receta); los
 * informativos solo se muestran. La API los vuelve a calcular al emitir.
 */
export function PrescriptionSafetyPanel({
  state,
  country,
  onRetry,
  confirmed,
  onConfirmedChange,
  reason,
  onReasonChange,
  reasonError,
}: PrescriptionSafetyPanelProps) {
  const titleId = useId();
  const [registration, setRegistration] = useState('');
  const cimaUrl = country === 'ES' ? cimaTechnicalSheetUrl(registration) : null;
  const preview = state.kind === 'idle' ? undefined : state.preview;
  const alerts = preview?.alerts ?? [];
  // El texto permanece idéntico si la respuesta no cambia; los controles
  // nunca pertenecen a la región viva.
  const announcement = preview && state.kind !== 'error'
    ? alerts.length > 0
      ? `Avisos actualizados: ${alerts.map((alert) => `${alert.severity === 'BLOCKING' ? 'Requiere confirmación' : 'Informativo'}: ${alert.message}`).join(' ')}`
      : `Comprobación terminada: ${safetyCopy.none}`
    : '';
  // Si la comprobación falló, el resultado anterior no describe lo escrito:
  // solo queda el error. Durante la carga se conservan los bloques (sin
  // desmontar casilla ni motivo), pero «Sin avisos» no se afirma.
  const shown = state.kind === 'error' ? [] : alerts;
  const blocking = shown.filter((a) => a.severity === 'BLOCKING');
  const info = shown.filter((a) => a.severity === 'INFO');

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="text-sm font-semibold text-ink">
          {safetyCopy.title}
        </h3>
        <p className="text-xs text-muted">{safetyCopy.disclaimer}</p>
      </div>

      <p role="status" aria-label="Resultado de seguridad" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      <p aria-hidden="true" className="min-h-5 text-xs text-muted">
        {state.kind === 'loading' ? safetyCopy.loading : '\u00a0'}
      </p>

      {state.kind === 'idle' ? <p className="text-sm text-muted">{safetyCopy.idle}</p> : null}

      {state.kind === 'error' ? (
        <SectionError
          title={safetyCopy.errorTitle}
          description={safetyCopy.errorBody}
          onRetry={onRetry}
          className="py-6"
        />
      ) : null}

      {preview && alerts.length === 0 && state.kind === 'ready' ? (
        <p className="text-sm text-muted">{safetyCopy.none}</p>
      ) : null}
      {/* Mismo alto que «Sin avisos» mientras se recomprueba: no salta. */}
      {preview && alerts.length === 0 && state.kind === 'loading' ? (
        <p aria-hidden="true" className="text-sm">{'\u00a0'}</p>
      ) : null}

      {blocking.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-danger">{safetyCopy.blocking(blocking.length)}</h4>
          <AlertList alerts={blocking} tone="blocking" />
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-danger)]"
              checked={confirmed}
              onChange={(e) => onConfirmedChange(e.target.checked)}
            />
            <span>{safetyCopy.confirm}</span>
          </label>
          <FormField
            htmlFor="rx-safety-reason"
            label={safetyCopy.reasonLabel}
            hint={safetyCopy.reasonHint}
            hintId="rx-safety-reason-hint"
            error={reasonError}
          >
            <textarea
              id="rx-safety-reason"
              rows={2}
              value={reason}
              maxLength={SAFETY_REASON_MAX}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? fieldErrorId('rx-safety-reason') : 'rx-safety-reason-hint'}
              onChange={(e) => onReasonChange(e.target.value)}
              className={cn(fieldClass, 'h-auto font-[inherit]')}
            />
          </FormField>
        </div>
      ) : null}

      {info.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-ink">{safetyCopy.info(info.length)}</h4>
          <AlertList alerts={info} tone="info" />
        </div>
      ) : null}

      {country === 'ES' ? (
        <FormField htmlFor="rx-cima" label={safetyCopy.cimaLabel} hint={safetyCopy.cimaHint}>
          <Input
            id="rx-cima"
            inputMode="numeric"
            autoComplete="off"
            maxLength={16}
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
          />
          {cimaUrl ? (
            <a
              href={cimaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1 break-words text-sm text-primary underline underline-offset-2"
            >
              <ExternalLink aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{safetyCopy.cimaLink}</span>
            </a>
          ) : null}
        </FormField>
      ) : null}
    </section>
  );
}
