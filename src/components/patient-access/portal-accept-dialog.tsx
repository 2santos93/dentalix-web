'use client';
import * as React from 'react';
import { useId, useMemo, useState } from 'react';
import { PenLine, Type } from 'lucide-react';
import { documentFormat, documentTexts } from '@/lib/format/document-format';
import type { PortalPlan } from '@/lib/patient-access/patient-access-api';
import { renderTypedSignature } from '@/lib/patient-access/typed-signature';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { SignaturePad } from '@/components/shared/signature-pad';
import { InlineError } from '@/components/errors/inline-error';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';

// Copy como constantes (i18n-ready). Español neutro y de «tú», sin nada de un país.
export const portalAcceptCopy = {
  titleSingle: 'Aceptar presupuesto',
  /** `option` es «Opción B». */
  titleOption: (option: string) => `Elegir la ${option.charAt(0).toLowerCase()}${option.slice(1)}`,
  description: 'Revisa el resumen, escribe tu nombre y firma. La clínica recibirá tu aceptación al momento.',
  summary: 'Resumen del presupuesto',
  quoteTitle: (location: string) => `Presupuesto · ${location}`,
  total: (currency: string) => `Total (${currency})`,
  validUntil: (date: string) => `Válido hasta el ${date}`,
  consent: 'He leído el presupuesto y lo acepto',
  consentRequired: 'Marca la casilla para aceptar el presupuesto.',
  signerName: 'Tu nombre completo',
  signerHint: 'El de quien firma: tú o, si el paciente es menor de edad, su responsable.',
  signerRequired: 'Escribe tu nombre para firmar.',
  signerTooLong: 'El nombre admite hasta 120 caracteres.',
  modeLabel: 'Cómo quieres firmar',
  modeType: 'Escribir mi nombre',
  modeDraw: 'Dibujar',
  previewLabel: 'Tu firma',
  previewAlt: (name: string) => `Vista previa de tu firma: ${name}`,
  previewEmpty: 'Escribe tu nombre arriba y aquí verás tu firma.',
  previewUnsupported: 'Este navegador no puede generar la firma a partir de tu nombre. Elige «Dibujar».',
  drawLabel: 'Dibuja tu firma',
  drawHint: 'Firma con el dedo o con el ratón dentro del recuadro.',
  drawClear: 'Borrar firma',
  drawRequired: 'Dibuja tu firma o elige «Escribir mi nombre».',
  submit: 'Firmar y aceptar',
  cancel: 'Cancelar',
};
const copy = portalAcceptCopy;

export const SIGNER_NAME_MAX = 120;

export type SignatureMode = 'type' | 'draw';

export interface PortalAcceptInput {
  signerName: string;
  signature: string;
}

interface PortalAcceptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PortalPlan;
  /** «Opción B» en un grupo A/B; `null` si el presupuesto va solo. */
  optionLabel: string | null;
  submitting: boolean;
  /** Fallo del envío (la red, un 429, un 400 de la API): banner arriba del formulario. */
  error: string | null;
  onSubmit: (input: PortalAcceptInput) => void;
  /** A dónde va el foco al cerrar (el botón que lo abrió ya no existe tras aceptar). */
  onCloseAutoFocus?: (event: Event) => void;
}

type Errors = { consent?: string; signerName?: string; signature?: string };

/**
 * DX-101-bis: el paciente (o su responsable) acepta un presupuesto del portal
 * con su firma. Dos modos en un control segmentado: «Escribir mi nombre» (por
 * defecto: todo con el teclado; el nombre se pinta con letra manuscrita del
 * sistema y se manda como PNG) y «Dibujar» (`SignaturePad`). La pantalla que lo
 * abre hace la llamada; aquí solo se valida y se entrega `{ signerName, signature }`.
 * Llega en su propio trozo de JS (`next/dynamic` en `PublicPatientPortalView`).
 */
export function PortalAcceptDialog({
  open,
  onOpenChange,
  plan,
  optionLabel,
  submitting,
  error,
  onSubmit,
  onCloseAutoFocus,
}: PortalAcceptDialogProps) {
  const id = useId();
  const nameId = `${id}-signer`;
  const consentId = `${id}-consent`;
  const previewId = `${id}-preview`;
  const canvasId = `${id}-canvas`;
  const signatureErrorId = `${id}-signature-error`;
  const [consent, setConsent] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [mode, setMode] = useState<SignatureMode>('type');
  const [drawn, setDrawn] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  const trimmed = signerName.trim();
  // El PNG del nombre escrito: lo que se ve en la vista previa es exactamente lo que se envía.
  const typed = useMemo(
    () => (mode === 'type' && trimmed ? renderTypedSignature(trimmed) : null),
    [mode, trimmed],
  );
  const typedUnsupported = mode === 'type' && trimmed !== '' && typed === null;

  const { quote } = plan;
  const doc = documentTexts(documentFormat(quote.regional));
  const title = optionLabel ? copy.titleOption(optionLabel) : copy.titleSingle;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const next: Errors = {};
    if (!consent) next.consent = copy.consentRequired;
    if (!trimmed) next.signerName = copy.signerRequired;
    else if (trimmed.length > SIGNER_NAME_MAX) next.signerName = copy.signerTooLong;
    const signature = mode === 'type' ? typed : drawn;
    if (!signature) {
      if (mode === 'draw') next.signature = copy.drawRequired;
      else if (typedUnsupported) next.signature = copy.previewUnsupported;
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !signature) return;
    onSubmit({ signerName: trimmed, signature });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      cancelLabel={copy.cancel}
      submitting={submitting}
      error={error}
      touchTargets
      ownValidation
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <section
        aria-label={copy.summary}
        data-testid="portal-accept-summary"
        className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-4"
      >
        <p className="break-words font-medium text-ink">
          {optionLabel ? `${optionLabel} · ` : ''}
          {copy.quoteTitle(quote.location.name)}
        </p>
        <dl className="flex flex-col gap-1 text-sm">
          {quote.totals.map((t) => (
            <div key={t.currency} className="flex justify-between gap-3 font-semibold text-ink">
              <dt>{copy.total(t.currency)}</dt>
              <dd className="tabular-nums">{doc.amount(t.net, t.currency)}</dd>
            </div>
          ))}
        </dl>
        <p className="t-caption tabular-nums text-muted">{copy.validUntil(doc.civilDate(plan.validUntil))}</p>
      </section>

      <Checkbox
        id={consentId}
        label={copy.consent}
        checked={consent}
        disabled={submitting}
        error={errors.consent ?? null}
        onChange={(e) => {
          setConsent(e.target.checked);
          if (e.target.checked && errors.consent) setErrors((prev) => ({ ...prev, consent: undefined }));
        }}
      />

      <FormField htmlFor={nameId} label={copy.signerName} hint={copy.signerHint} error={errors.signerName ?? null}>
        <Input
          id={nameId}
          value={signerName}
          maxLength={SIGNER_NAME_MAX}
          autoComplete="name"
          aria-invalid={errors.signerName ? true : undefined}
          disabled={submitting}
          onChange={(e) => {
            setSignerName(e.target.value);
            if (errors.signerName) setErrors((prev) => ({ ...prev, signerName: undefined }));
            if (mode === 'type' && errors.signature) setErrors((prev) => ({ ...prev, signature: undefined }));
          }}
        />
      </FormField>

      <div className="flex min-w-0 flex-col gap-3">
        <SegmentedControl<SignatureMode>
          aria-label={copy.modeLabel}
          value={mode}
          onValueChange={(next) => {
            setMode(next);
            // «Dibujar» monta un lienzo nuevo (vacío): lo dibujado antes ya no se ve, no se envía.
            setDrawn(null);
            setErrors((prev) => ({ ...prev, signature: undefined }));
          }}
          fullWidthOnMobile
          disabled={submitting}
          options={[
            { value: 'type', label: (<><Type aria-hidden /> {copy.modeType}</>) },
            { value: 'draw', label: (<><PenLine aria-hidden /> {copy.modeDraw}</>) },
          ]}
        />

        {mode === 'type' ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id={previewId} className="text-sm font-medium text-ink">
              {copy.previewLabel}
            </span>
            {/* Fondo blanco fijo: la firma es un documento que se imprime (igual que el lienzo de «Dibujar»). */}
            <div
              aria-labelledby={previewId}
              role="group"
              data-testid="portal-typed-signature"
              className="flex min-h-28 min-w-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white px-3"
            >
              {typed ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL generada en el navegador; next/image no la optimiza
                <img
                  src={typed}
                  alt={copy.previewAlt(trimmed)}
                  aria-describedby={errors.signature ? signatureErrorId : undefined}
                  className="h-24 w-full max-w-full object-contain"
                />
              ) : (
                <p className="px-2 py-4 text-center text-sm text-[#4b5563]">
                  {typedUnsupported ? copy.previewUnsupported : copy.previewEmpty}
                </p>
              )}
            </div>
          </div>
        ) : (
          <SignaturePad
            label={copy.drawLabel}
            hint={copy.drawHint}
            clearLabel={copy.drawClear}
            onChange={(png) => {
              setDrawn(png);
              if (png && errors.signature) setErrors((prev) => ({ ...prev, signature: undefined }));
            }}
            disabled={submitting}
            canvasId={canvasId}
            errorId={errors.signature ? signatureErrorId : undefined}
          />
        )}
        {errors.signature ? (
          <InlineError id={signatureErrorId} className="text-xs">
            {errors.signature}
          </InlineError>
        ) : null}
      </div>
    </FormModal>
  );
}
