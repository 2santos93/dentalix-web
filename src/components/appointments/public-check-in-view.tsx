'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { CircleCheck, QrCode } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  CHECK_IN_LOCKED,
  getCheckInQr,
  identifyCheckIn,
  type PublicArrival,
  type PublicCheckInQr,
} from '@/lib/appointments/arrival-api';
import { documentFormat, documentTexts } from '@/lib/format/document-format';
import { PublicNotice, publicBrandStyle } from '@/components/shared/public-page';
import { ClinicBrand } from '@/components/brand/clinic-brand';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DateField } from '@/components/ui/date-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrivalOutcome } from './arrival-card';
import { ARRIVAL_COPY } from './arrival-copy';
import {
  CLINIC_PAGE_LANGUAGE,
  PAGE_LANGUAGES,
  PUBLIC_CONFIRMATION_COPY,
  type PageLanguage,
} from './public-confirmation-copy';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'inactive' }
  | { kind: 'ready'; qr: PublicCheckInQr };

type FormError = 'document' | 'birthDate' | 'noMatch' | 'network' | null;

/** Tras marcar la llegada, la página vuelve sola al formulario (la tablet o el móvil de otro paciente). */
const RESET_AFTER_MS = 60_000;

/**
 * DX-265: página pública del QR de llegada de una sede (`/llegada/<token>`).
 * El paciente escribe su documento y su fecha de nacimiento y, si tiene cita
 * HOY en esta sede dentro de la ventana, queda marcada su llegada: la página
 * le dice «Toma asiento» o «Pasa por recepción» (nunca por qué). Un fallo
 * responde siempre lo mismo (no revela si el paciente existe); tras 5 fallos
 * la API bloquea 15 minutos. Pensada para 390 px y con la marca de la clínica.
 */
export function PublicCheckInView({ qrToken }: { qrToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [language, setLanguage] = useState<PageLanguage>(CLINIC_PAGE_LANGUAGE);
  const t = ARRIVAL_COPY[language];
  const id = useId();
  const [documentNumber, setDocumentNumber] = useState('');
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [error, setError] = useState<FormError>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState<{ until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<PublicArrival | null>(null);

  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    document.title = t.qrTitle;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [language, t]);

  useEffect(() => {
    let cancelled = false;
    getCheckInQr(qrToken)
      .then((qr) => {
        if (!cancelled) setState({ kind: 'ready', qr });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 404 ? { kind: 'inactive' } : { kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [qrToken, reloadKey]);

  // Bloqueado: el formulario se reabre solo al vencer.
  useEffect(() => {
    if (!locked) return;
    const tick = window.setInterval(() => {
      const t2 = Date.now();
      setNow(t2);
      if (t2 >= locked.until) setLocked(null);
    }, 15_000);
    return () => window.clearInterval(tick);
  }, [locked]);

  // Con el resultado a la vista, al minuto vuelve el formulario vacío.
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => resetForm(), RESET_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

  function resetForm() {
    setResult(null);
    setDocumentNumber('');
    setBirthDate(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked || submitting) return;
    if (!documentNumber.trim()) {
      setError('document');
      return;
    }
    if (!birthDate) {
      setError('birthDate');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setResult(await identifyCheckIn(qrToken, { documentNumber: documentNumber.trim(), birthDate }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = err.code === CHECK_IN_LOCKED ? (err.retryAfterSeconds ?? 15 * 60) : (err.retryAfterSeconds ?? 60);
        const start = Date.now();
        setNow(start);
        setLocked({ until: start + seconds * 1000 });
      } else if (err instanceof ApiError && err.status === 400) {
        setError('noMatch');
      } else if (err instanceof ApiError && err.status === 404) {
        setState({ kind: 'inactive' });
      } else {
        setError('network');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const clinic = state.kind === 'ready' ? state.qr.clinic : null;
  const location = state.kind === 'ready' ? state.qr.locationName : '';
  const minutesLeft = locked ? Math.max(1, Math.ceil((locked.until - now) / 60_000)) : 0;
  const docError = error === 'document' ? t.documentRequired : null;
  const dateError = error === 'birthDate' ? t.birthDateRequired : null;
  const outsideWindow = result && result.state !== 'ARRIVED' ? result : null;
  const outsideTime =
    outsideWindow?.appointment && outsideWindow.opensAt
      ? (() => {
          const a = outsideWindow.appointment;
          const format = documentFormat({ timeZone: a.timeZone ?? null, locale: a.locale ?? null, hourCycle: a.hourCycle ?? null });
          return format ? documentTexts(format).time(outsideWindow.opensAt) : null;
        })()
      : null;

  return (
    <div style={publicBrandStyle(clinic)} lang={language} className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex items-center justify-end gap-2">
          <label htmlFor={`${id}-lang`} className="t-caption text-muted">
            {PUBLIC_CONFIRMATION_COPY[language].languageLabel}
          </label>
          <NativeSelect
            id={`${id}-lang`}
            value={language}
            onChange={(e) => setLanguage(e.target.value as PageLanguage)}
            selectClassName="h-11"
          >
            {PAGE_LANGUAGES.map((l) => (
              <option key={l} value={l} lang={l}>
                {PUBLIC_CONFIRMATION_COPY[l].languageName}
              </option>
            ))}
          </NativeSelect>
        </div>

        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{PUBLIC_CONFIRMATION_COPY[language].loading}</span>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            title={t.loadErrorTitle}
            retryLabel={t.retry}
            description={t.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'inactive' && (
          <PublicNotice headingLevel={1} icon={QrCode} title={t.inactiveTitle} message={t.inactiveMessage} />
        )}

        {state.kind === 'ready' && (
          <>
            <ClinicBrand variant="public" name={clinic?.name ?? location} logoUrl={clinic?.logoUrl} />
            {result && result.state === 'ARRIVED' ? (
              <div className="flex flex-col gap-4">
                <ArrivalOutcome arrival={result} t={t} />
                <Button type="button" variant="secondary" size="lg" className="h-12 w-full" onClick={resetForm}>
                  {t.again}
                </Button>
              </div>
            ) : (
              <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h1 id={`${id}-title`} className="t-display text-ink">
                    {t.qrTitle}
                  </h1>
                  <p className="text-sm text-muted">{t.qrLead(location)}</p>
                </div>
                {outsideWindow ? (
                  <Callout tone="warning" role="alert" data-testid="check-in-outside-window">
                    {outsideWindow.state === 'TOO_EARLY' ? t.tooEarly(outsideTime) : t.tooLate}
                  </Callout>
                ) : null}
                {locked ? (
                  <Callout tone="danger" role="alert" title={t.lockedTitle} data-testid="check-in-locked">
                    <span className="block tabular-nums">{t.lockedWait(minutesLeft)}</span>
                  </Callout>
                ) : null}
                <form
                  noValidate
                  onSubmit={(e) => void handleSubmit(e)}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:px-6"
                >
                  <FormField htmlFor={`${id}-doc`} label={t.documentLabel} hint={t.documentHint} error={docError}>
                    <Input
                      id={`${id}-doc`}
                      value={documentNumber}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={40}
                      disabled={locked !== null || submitting}
                      aria-invalid={docError ? true : undefined}
                      className="h-12"
                      onChange={(e) => {
                        setDocumentNumber(e.target.value);
                        if (error === 'document' || error === 'noMatch') setError(null);
                      }}
                    />
                  </FormField>
                  <FormField htmlFor={`${id}-birth`} label={t.birthDateLabel} hint={t.birthDateHint} error={dateError}>
                    <DateField
                      id={`${id}-birth`}
                      value={birthDate}
                      disabled={locked !== null || submitting}
                      isInvalid={dateError !== null}
                      onChange={(v) => {
                        setBirthDate(v);
                        if (error === 'birthDate' || error === 'noMatch') setError(null);
                      }}
                    />
                  </FormField>
                  {error === 'noMatch' ? (
                    <Callout tone="warning" role="alert" data-testid="check-in-no-match">
                      <span className="block">{t.noMatch}</span>
                      <span className="block">{t.noMatchHelp}</span>
                    </Callout>
                  ) : null}
                  {error === 'network' ? <InlineError>{t.error}</InlineError> : null}
                  <Button
                    type="submit"
                    size="lg"
                    className="h-12 w-full"
                    loading={submitting}
                    disabled={locked !== null}
                  >
                    <CircleCheck aria-hidden /> {t.qrSubmit}
                  </Button>
                </form>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
