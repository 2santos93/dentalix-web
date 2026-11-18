'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { LinkIcon, LogOut, ShieldCheck } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { documentFormat } from '@/lib/format/document-format';
import {
  PATIENT_ACCESS_LOCKED,
  PATIENT_ACCESS_SCOPE_LABELS,
  PATIENT_ACCESS_SCOPES,
  confirmPortalAppointment,
  getPatientPortal,
  logoutPatientPortal,
  verifyPatientAccess,
  type PatientAccessScope,
  type PatientPortal,
} from '@/lib/patient-access/patient-access-api';
import { useClinicBranding } from '@/components/brand/branding-context';
import { ClinicBrand } from '@/components/brand/clinic-brand';
import { AccountStatementDocument } from '@/components/account-statement/account-statement-document';
import { PlanQuoteDocument } from '@/components/treatment-plans/plan-quote-document';
import { printableQuote, printableStatement } from '@/lib/patient-access/portal-documents';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { PublicNotice, publicBrandStyle } from '@/components/shared/public-page';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DateField } from '@/components/ui/date-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PortalAccount, PortalAppointments, PortalPlans } from './portal-sections';

// Copy como constantes (i18n-ready). Español neutro y de «tú», sin nada de un país.
export const publicPortalCopy = {
  documentTitle: 'Mi clínica',
  fallbackClinic: 'Tu clínica',
  verifyTitle: 'Consulta tus citas y tu cuenta',
  verifyLead: 'Para proteger tus datos, escribe tu fecha de nacimiento.',
  birthDate: 'Fecha de nacimiento',
  birthDateHint: 'Día, mes y año, como en tu documento.',
  birthDateRequired: 'Escribe tu fecha de nacimiento completa.',
  submit: 'Entrar',
  invalid: 'Datos incorrectos',
  invalidHelp: 'Revisa la fecha. Si el enlace caducó o la clínica lo anuló, pide uno nuevo.',
  lockedTitle: 'Enlace bloqueado por ahora',
  lockedFallback: 'Demasiados intentos. Por seguridad, el enlace queda bloqueado un rato.',
  lockedWait: (minutes: number) =>
    minutes <= 1 ? 'Podrás volver a intentarlo en 1 minuto.' : `Podrás volver a intentarlo en ${minutes} minutos.`,
  verifyError: 'No pudimos comprobar la fecha. Revisa tu conexión e intenta de nuevo.',
  sessionExpired: 'Tu sesión caducó: vuelve a escribir tu fecha de nacimiento.',
  loggedOut: 'Saliste de tu cuenta. Para volver a entrar, escribe tu fecha de nacimiento.',
  loading: 'Cargando tus datos…',
  loadError: 'No pudimos cargar tus datos. Revisa tu conexión.',
  retry: 'Reintentar',
  greeting: (name: string) => `Hola, ${name}`,
  lead: 'Esto es lo que la clínica compartió contigo. Solo puedes consultarlo.',
  minor: 'Este enlace es de un paciente menor de edad: lo consulta su responsable.',
  tabsLabel: 'Apartados',
  logout: 'Salir',
  goneTitle: 'Este enlace ya no está disponible',
  goneMessage: 'Pide uno nuevo a la clínica.',
  confirmError: 'No pudimos confirmar la cita. Intenta de nuevo.',
  privacy: 'La sesión se cierra sola a los 30 minutos. En un dispositivo compartido, pulsa «Salir» al terminar.',
};
const copy = publicPortalCopy;

type VerifyNotice = 'sessionExpired' | 'loggedOut' | null;

type State =
  | { kind: 'verify'; notice: VerifyNotice }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: PatientPortal }
  | { kind: 'gone' };

type Printing = { kind: 'plan'; planId: string } | { kind: 'account' } | null;

/** Los apartados que se ven: los de `scopes` cuyo contenido llegó (los no compartidos llegan `null`). */
export function visibleScopes(data: PatientPortal): PatientAccessScope[] {
  const content: Record<PatientAccessScope, unknown> = {
    APPOINTMENTS: data.appointments,
    PLANS: data.plans,
    ACCOUNT: data.account,
  };
  return PATIENT_ACCESS_SCOPES.filter((s) => data.scopes.includes(s) && content[s] !== null && content[s] !== undefined);
}

const SCOPE_TAB: Record<PatientAccessScope, string> = {
  APPOINTMENTS: 'citas',
  PLANS: 'presupuestos',
  ACCOUNT: 'cuenta',
};

function isStatus(err: unknown, status: number): boolean {
  return err instanceof ApiError && err.status === status;
}

/** Formulario de la fecha de nacimiento (el segundo factor del enlace). */
function VerifyForm({
  linkToken,
  notice,
  onVerified,
}: {
  linkToken: string;
  notice: VerifyNotice;
  onVerified: () => void;
}) {
  const id = useId();
  const fieldId = `${id}-birth`;
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [error, setError] = useState<'required' | 'invalid' | 'network' | null>(null);
  const [locked, setLocked] = useState<{ message: string; until: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Mientras dura el bloqueo, el formulario está deshabilitado; al vencer vuelve solo.
  useEffect(() => {
    if (!locked) return;
    const tick = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= locked.until) setLocked(null);
    }, 15_000);
    return () => window.clearInterval(tick);
  }, [locked]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked || submitting) return;
    if (!birthDate) {
      setError('required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await verifyPatientAccess(linkToken, birthDate);
      onVerified();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = err.retryAfterSeconds ?? 30 * 60;
        const message = err.code === PATIENT_ACCESS_LOCKED ? apiErrorMessage(err, copy.lockedFallback) : copy.lockedFallback;
        const start = Date.now();
        setNow(start);
        setLocked({ message, until: start + seconds * 1000 });
      } else if (isStatus(err, 400)) {
        setError('invalid');
      } else {
        setError('network');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const minutesLeft = locked ? Math.max(1, Math.ceil((locked.until - now) / 60_000)) : 0;
  const fieldError = error === 'required' ? copy.birthDateRequired : error === 'invalid' ? copy.invalid : null;

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 id={`${id}-title`} className="t-display text-ink">
          {copy.verifyTitle}
        </h1>
        <p className="text-sm text-muted">{copy.verifyLead}</p>
      </div>
      {notice ? (
        <Callout tone={notice === 'sessionExpired' ? 'warning' : 'neutral'} data-testid="portal-verify-notice">
          {notice === 'sessionExpired' ? copy.sessionExpired : copy.loggedOut}
        </Callout>
      ) : null}
      {locked ? (
        <Callout tone="danger" role="alert" title={copy.lockedTitle} data-testid="portal-locked">
          <span className="block">{locked.message}</span>
          <span className="block tabular-nums">{copy.lockedWait(minutesLeft)}</span>
        </Callout>
      ) : null}
      <form noValidate onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:px-6">
        <FormField htmlFor={fieldId} label={copy.birthDate} hint={copy.birthDateHint} error={fieldError}>
          <DateField
            id={fieldId}
            value={birthDate}
            disabled={locked !== null || submitting}
            isInvalid={fieldError !== null}
            aria-describedby={error === 'invalid' ? `${id}-help` : undefined}
            onChange={(v) => {
              setBirthDate(v);
              if (error === 'required' || error === 'invalid') setError(null);
            }}
          />
        </FormField>
        {error === 'invalid' ? (
          <p id={`${id}-help`} className="text-sm text-ink">
            {copy.invalidHelp}
          </p>
        ) : null}
        {error === 'network' ? <InlineError>{copy.verifyError}</InlineError> : null}
        <Button type="submit" size="lg" className="w-full max-sm:min-h-11" loading={submitting} disabled={locked !== null}>
          <ShieldCheck aria-hidden /> {copy.submit}
        </Button>
      </form>
    </section>
  );
}

/**
 * Página pública `/mi-clinica/[token]` (DX-101): el paciente (o su
 * responsable) escribe su fecha de nacimiento y consulta lo que la clínica
 * compartió — citas, presupuestos y estado de cuenta —, en solo lectura salvo
 * «Confirmar» una cita. La sesión es una cookie HttpOnly de la API: la página
 * nunca la lee ni guarda nada. Revocado o caducado (410), se borra todo lo que
 * hay en memoria y queda el aviso sin datos.
 */
export function PublicPatientPortalView({ linkToken }: { linkToken: string }) {
  const branding = useClinicBranding();
  const [state, setState] = useState<State>({ kind: 'verify', notice: null });
  const [tab, setTab] = useState<string>('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<{ id: string; message: string } | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Printing>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = copy.documentTitle;
  }, []);

  /** 401 → a la verificación; 410 → sin datos. `true` si lo trató. */
  const handleSessionError = useCallback((err: unknown): boolean => {
    if (isStatus(err, 410)) {
      setPrinting(null);
      setState({ kind: 'gone' });
      return true;
    }
    if (isStatus(err, 401)) {
      setPrinting(null);
      setState({ kind: 'verify', notice: 'sessionExpired' });
      return true;
    }
    return false;
  }, []);

  const loadPortal = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'initial') setState({ kind: 'loading' });
      try {
        const data = await getPatientPortal();
        setState({ kind: 'ready', data });
        if (mode === 'initial') {
          const first = visibleScopes(data)[0];
          setTab(first ? SCOPE_TAB[first] : '');
        }
      } catch (err) {
        if (handleSessionError(err)) return;
        if (mode === 'initial') setState({ kind: 'error' });
        else throw err;
      }
    },
    [handleSessionError],
  );

  // Recién verificado: el foco pasa al saludo (el formulario ya no está).
  useEffect(() => {
    if (state.kind === 'ready') headingRef.current?.focus();
  }, [state.kind]);

  async function handleConfirm(appointmentId: string) {
    setConfirming(appointmentId);
    setConfirmError(null);
    setConfirmedId(null);
    try {
      await confirmPortalAppointment(appointmentId);
    } catch (err) {
      if (!handleSessionError(err)) {
        setConfirmError({ id: appointmentId, message: apiErrorMessage(err, copy.confirmError) });
      }
      setConfirming(null);
      return;
    }
    try {
      await loadPortal('refresh');
    } catch {
      // Confirmada, pero no se pudo releer: se marca aquí (la API ya la guardó).
      setState((prev) =>
        prev.kind === 'ready' && prev.data.appointments
          ? {
              kind: 'ready',
              data: {
                ...prev.data,
                appointments: prev.data.appointments.map((a) =>
                  a.id === appointmentId ? { ...a, status: 'CONFIRMED', confirmable: false } : a,
                ),
              },
            }
          : prev,
      );
    }
    setConfirmedId(appointmentId);
    setConfirming(null);
  }

  async function handleLogout() {
    // Se borra lo de memoria ya; la cookie la borra la API (si no hay red, caduca sola).
    setPrinting(null);
    setState({ kind: 'verify', notice: 'loggedOut' });
    await logoutPatientPortal().catch(() => undefined);
  }

  // «Descargar PDF»: se pinta el documento en la vista de impresión y se abre
  // el diálogo del navegador (en el móvil, «Guardar como PDF» o compartir).
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const data = state.kind === 'ready' ? state.data : null;
  const clinicName = branding.name ?? data?.clinicName ?? copy.fallbackClinic;
  const scopes = data ? visibleScopes(data) : [];
  const printPlan = data && printing?.kind === 'plan' ? data.plans?.find((p) => p.id === printing.planId) ?? null : null;
  const printAccount = data && printing?.kind === 'account' ? data.account : null;

  return (
    <>
      <div className="flex min-h-dvh flex-col bg-canvas print:hidden" style={publicBrandStyle(branding)}>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
          <div className="flex items-center justify-between gap-3">
            <ClinicBrand name={clinicName} logoUrl={branding.logoUrl} variant="public" as="p" className="min-w-0" />
            {state.kind === 'ready' ? (
              <Button type="button" variant="ghost" className="shrink-0 max-sm:min-h-11" onClick={() => void handleLogout()}>
                <LogOut aria-hidden /> {copy.logout}
              </Button>
            ) : null}
          </div>

          {state.kind === 'verify' ? (
            <VerifyForm linkToken={linkToken} notice={state.notice} onVerified={() => void loadPortal('initial')} />
          ) : null}

          {state.kind === 'loading' ? (
            <div role="status" className="flex flex-col gap-4" data-testid="portal-loading">
              <span className="sr-only">{copy.loading}</span>
              <Skeleton className="h-8 w-56 max-w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : null}

          {state.kind === 'error' ? (
            <SectionError
              description={copy.loadError}
              retryLabel={copy.retry}
              onRetry={() => void loadPortal('initial')}
            />
          ) : null}

          {state.kind === 'gone' ? (
            <PublicNotice headingLevel={1} icon={LinkIcon} title={copy.goneTitle} message={copy.goneMessage} />
          ) : null}

          {data ? (
            <>
              <div className="flex flex-col gap-1">
                <h1 ref={headingRef} tabIndex={-1} className="t-display text-ink focus-visible:outline-none">
                  {copy.greeting(data.patientFirstName)}
                </h1>
                <p className="text-sm text-muted">{copy.lead}</p>
              </div>
              {data.minor ? (
                <Callout tone="info" role="note" data-testid="portal-minor">
                  {copy.minor}
                </Callout>
              ) : null}
              {scopes.length > 0 ? (
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList aria-label={copy.tabsLabel}>
                    {scopes.map((scope) => (
                      <TabsTrigger key={scope} value={SCOPE_TAB[scope]}>
                        {PATIENT_ACCESS_SCOPE_LABELS[scope]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {data.appointments ? (
                    <TabsContent value={SCOPE_TAB.APPOINTMENTS}>
                      <PortalAppointments
                        appointments={data.appointments}
                        confirming={confirming}
                        confirmError={confirmError}
                        confirmedId={confirmedId}
                        onConfirm={(id) => void handleConfirm(id)}
                      />
                    </TabsContent>
                  ) : null}
                  {data.plans ? (
                    <TabsContent value={SCOPE_TAB.PLANS}>
                      <PortalPlans plans={data.plans} onPrint={(planId) => setPrinting({ kind: 'plan', planId })} />
                    </TabsContent>
                  ) : null}
                  {data.account ? (
                    <TabsContent value={SCOPE_TAB.ACCOUNT}>
                      <PortalAccount account={printableStatement(data.account)} onPrint={() => setPrinting({ kind: 'account' })} />
                    </TabsContent>
                  ) : null}
                </Tabs>
              ) : null}
              <p className="text-xs text-muted">{copy.privacy}</p>
            </>
          ) : null}
        </main>
      </div>

      {/* La vista de impresión: fuera de pantalla, sola en el papel (print CSS de cada documento). */}
      {printPlan ? (
        <div className="quote-print-page hidden print:block" data-testid="portal-print-plan">
          <PlanQuoteDocument quote={printableQuote(printPlan)} format={documentFormat(printPlan.quote.regional)} />
        </div>
      ) : null}
      {printAccount ? (
        <div className="statement-print-page hidden print:block" data-testid="portal-print-account">
          <AccountStatementDocument statement={printableStatement(printAccount)} format={documentFormat(printAccount.regional)} />
        </div>
      ) : null}
    </>
  );
}
