'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  acceptPlan,
  getPlanQuote,
  planQuotePrintHref,
  type PlanQuote,
} from '@/lib/treatment-plans/plan-quote-api';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { SignaturePad } from '@/components/shared/signature-pad';
import { SectionError } from '@/components/errors/section-error';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const copy = {
  title: 'Aceptar presupuesto con firma',
  description: 'Revisa el presupuesto con el paciente. Al firmar, queda aceptado tal como se muestra.',
  loading: 'Cargando el presupuesto…',
  loadError: 'No pudimos cargar el presupuesto.',
  summary: 'Presupuesto a firmar',
  tooth: (n: string) => `Diente ${n}`,
  total: (currency: string) => `Total (${currency})`,
  validity: (days: number, until: string) => `Válido ${days} días, hasta el ${until}`,
  viewFull: 'Ver el presupuesto completo',
  newTab: '(se abre en otra pestaña)',
  signerName: 'Nombre de quien firma',
  signerHint: 'El paciente o su representante.',
  signature: 'Firma del paciente',
  signatureHint: 'Firma con el dedo, el lápiz o el ratón.',
  immutableNote:
    'Al firmar se guardan la firma, la fecha y una huella del presupuesto; sus procedimientos y precios ya no se pueden cambiar.',
  submit: 'Aceptar y firmar',
  genericError: 'No pudimos guardar la aceptación. Intenta de nuevo.',
};

interface AcceptPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  planId: string;
  /** El presupuesto ya aceptado (con la firma), para refrescar el plan. */
  onAccepted: (quote: PlanQuote) => void;
}

/**
 * «Aceptar con firma» (DX-012): enseña el presupuesto que se va a firmar
 * (procedimientos, total, validez), pide el nombre de quien firma y la firma
 * en el lienzo, y lo envía con la huella (`contentHash`) de lo mostrado. Si el
 * plan cambió entre medias, la API responde 409: se explica, se recarga el
 * presupuesto y se pide la firma de nuevo sobre lo nuevo.
 */
export function AcceptPlanModal({
  open,
  onOpenChange,
  token,
  patientId,
  planId,
  onAccepted,
}: AcceptPlanModalProps) {
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [signerName, setSignerName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPlanQuote(token, patientId, planId)
      .then((res) => {
        if (cancelled) return;
        setQuote(res);
        setLoadError(null);
        // Se propone el nombre del paciente; se puede cambiar (representante).
        setSignerName((current) => (current.trim() === '' ? res.patient.name : current));
      })
      .catch(() => {
        if (!cancelled) setLoadError(copy.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, planId, reloadKey]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Cada apertura empieza en limpio: otro plan, otra firma.
      setQuote(null);
      setLoadError(null);
      setSignerName('');
      setSignature(null);
      setSubmitError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || !signature || signerName.trim() === '') return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const accepted = await acceptPlan(token, patientId, planId, {
        signerName: signerName.trim(),
        signature,
        contentHash: quote.contentHash,
      });
      onAccepted(accepted);
      handleOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Lo firmado tiene que ser lo mostrado: se recarga y se firma de nuevo.
        setSignature(null);
        setReloadKey((k) => k + 1);
      }
      setSubmitError(err instanceof ApiError ? err.message : copy.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  const ready = quote !== null && !loadError;

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={!ready || !signature || signerName.trim() === ''}
      error={submitError}
      size="lg"
    >
      {loadError ? (
        <SectionError
          description={loadError}
          onRetry={() => {
            setLoadError(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : !quote ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{copy.loading}</span>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <section
            aria-label={copy.summary}
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <ul className="max-h-48 divide-y divide-hairline overflow-y-auto text-sm">
              {quote.items.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-ink">{item.procedure}</span>
                    <span className="block text-xs text-muted tabular-nums">{copy.tooth(item.toothNumber)}</span>
                  </span>
                  <span className="shrink-0 font-medium text-ink tabular-nums">
                    {formatCurrency(item.subtotal, quote.currency)}
                  </span>
                </li>
              ))}
            </ul>
            {quote.totals.map((total) => (
              <p
                key={total.currency}
                className="flex items-baseline justify-between gap-3 border-t border-border pt-2 font-semibold text-ink"
              >
                <span>{copy.total(total.currency)}</span>
                <span className="tabular-nums">{formatCurrency(total.net, total.currency)}</span>
              </p>
            ))}
            <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="tabular-nums">
                {copy.validity(quote.validityDays, formatCivilDate(quote.validUntil))}
              </span>
              <Link
                href={planQuotePrintHref(patientId, planId)}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {copy.viewFull}
                <ExternalLink aria-hidden className="size-3.5" />
                <span className="sr-only">{copy.newTab}</span>
              </Link>
            </p>
          </section>

          <FormField htmlFor="accept-signer-name" label={copy.signerName} hint={copy.signerHint}>
            <Input
              id="accept-signer-name"
              value={signerName}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setSignerName(e.target.value)}
              disabled={submitting}
            />
          </FormField>

          <SignaturePad
            key={quote.contentHash}
            label={copy.signature}
            hint={copy.signatureHint}
            onChange={setSignature}
            disabled={submitting}
          />
          <p className="text-xs text-muted">{copy.immutableNote}</p>
        </>
      )}
    </FormModal>
  );
}
