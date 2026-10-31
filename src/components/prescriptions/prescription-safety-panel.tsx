'use client';
import * as React from 'react';
import { useId } from 'react';
import { Info, ShieldAlert } from 'lucide-react';
import { SectionError } from '@/components/errors/section-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { SectionHeader } from '@/components/ui/section-header';
import { Textarea } from '@/components/ui/textarea';
import type { PrescriptionSafetyPreview, SafetyAlert } from '@/lib/prescriptions/prescriptions-api';

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
};

export const SAFETY_REASON_MAX = 500;

export type SafetyState =
  | { kind: 'idle' }
  | { kind: 'loading'; preview?: PrescriptionSafetyPreview }
  | { kind: 'error'; preview?: PrescriptionSafetyPreview }
  | { kind: 'ready'; preview: PrescriptionSafetyPreview };

interface PrescriptionSafetyPanelProps {
  state: SafetyState;
  onRetry: () => void;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  reasonError: string | null;
}

function AlertList({ alerts, tone }: { alerts: SafetyAlert[]; tone: 'blocking' | 'info' }) {
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert, i) => (
        <li key={`${alert.code}-${alert.activeIngredient ?? ''}-${i}`}>
          {/* `note`: la región viva del panel ya anuncia los avisos; cada
              tarjeta no debe volver a hacerlo. */}
          <Callout
            role="note"
            tone={tone === 'blocking' ? 'danger' : 'warning'}
            icon={tone === 'blocking' ? ShieldAlert : Info}
          >
            <p className="break-words">{alert.message}</p>
            <p className="t-caption mt-1 break-words text-ink">
              {alert.source} · <span className="t-id">{alert.code}</span>
            </p>
          </Callout>
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
  onRetry,
  confirmed,
  onConfirmedChange,
  reason,
  onReasonChange,
  reasonError,
}: PrescriptionSafetyPanelProps) {
  const titleId = useId();
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
      <SectionHeader as="h3" titleId={titleId} title={safetyCopy.title} description={safetyCopy.disclaimer} />

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
          <h4 className="t-label font-semibold text-danger-text">{safetyCopy.blocking(blocking.length)}</h4>
          <AlertList alerts={blocking} tone="blocking" />
          <Checkbox
            id="rx-safety-confirm"
            label={safetyCopy.confirm}
            checked={confirmed}
            onChange={(e) => onConfirmedChange(e.target.checked)}
          />
          <FormField
            htmlFor="rx-safety-reason"
            label={safetyCopy.reasonLabel}
            hint={safetyCopy.reasonHint}
            hintId="rx-safety-reason-hint"
            error={reasonError}
          >
            <Textarea
              id="rx-safety-reason"
              rows={2}
              autoGrow
              value={reason}
              maxLength={SAFETY_REASON_MAX}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? fieldErrorId('rx-safety-reason') : 'rx-safety-reason-hint'}
              onChange={(e) => onReasonChange(e.target.value)}
            />
          </FormField>
        </div>
      ) : null}

      {info.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="t-label font-semibold text-ink">{safetyCopy.info(info.length)}</h4>
          <AlertList alerts={info} tone="info" />
        </div>
      ) : null}
    </section>
  );
}
