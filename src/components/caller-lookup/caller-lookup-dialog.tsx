'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Phone, UserPlus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { hasEnoughCallerDigits, lookupCaller, type CallerMatch } from '@/lib/caller-lookup/caller-lookup-api';
import { clearPrefillPhone, setPrefillPhone } from '@/lib/patients/prefill-phone';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import type { ClinicRole } from '@/lib/me/me-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { CallerCard } from './caller-card';
import { CallerScheduleDialog } from './caller-schedule-dialog';

export const callerLookupCopy = {
  title: '¿Quién llama?',
  description: 'Pega o escribe el número para ver quién es y qué tiene pendiente.',
  fieldLabel: 'Número de teléfono',
  fieldHint: 'Tal como llega: con o sin prefijo, con espacios, guiones o paréntesis.',
  placeholder: 'Teléfono',
  search: 'Buscar',
  tooShort: 'Escribe el número completo',
  searching: 'Buscando…',
  noMatchTitle: 'Ningún paciente con ese número',
  noMatchDescription: 'Revisa el número o crea el paciente con este teléfono.',
  createPatient: 'Crear paciente',
  truncated: 'Hay más coincidencias; afina el número o busca por nombre.',
  found: (n: number) => (n === 1 ? '1 paciente con ese número' : `${n} pacientes con ese número`),
  loadError: 'No pudimos buscar por ese número.',
  errorTitle: 'No se pudo buscar',
};

type Search = { phone: string; run: number };
type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; matches: CallerMatch[]; truncated: boolean };

/**
 * «¿Quién llama?» (DX-224): diálogo para pegar o escribir un número, abierto
 * desde la cabecera o con Alt+Mayús+Q. Pantalla completa bajo 640 px. El foco
 * va al campo al abrir y vuelve al disparador al cerrar (el `Dialog`). Un
 * número de menos de 7 dígitos no sale a la API: «Escribe el número completo»
 * junto al campo (escalón 4). Si la búsqueda falla, la sección no tiene nada
 * que mostrar: `SectionError` con «Reintentar» (escalón 1).
 */
export function CallerLookupDialog({
  open,
  onOpenChange,
  token,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  role: ClinicRole | null;
}) {
  const router = useRouter();
  const inputId = React.useId();
  const hintId = `${inputId}-hint`;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [phone, setPhone] = React.useState('');
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState<Search | null>(null);
  const [state, setState] = React.useState<State>({ kind: 'idle' });
  const creatingRef = React.useRef(false);
  const [scheduling, setScheduling] = React.useState<CallerMatch | null>(null);

  // Al cerrar se limpia todo: el número no se queda en pantalla para el
  // siguiente que abra el diálogo.
  React.useEffect(() => {
    if (open) return;
    const reset = () => {
      // M7: el número que se dejó para «Crear paciente» no sobrevive a un
      // cierre cualquiera; solo al cerrar para ir al alta se conserva.
      if (!creatingRef.current) clearPrefillPhone();
      creatingRef.current = false;

      setPhone('');
      setFieldError(null);
      setSearch(null);
      setState({ kind: 'idle' });
      setScheduling(null);
    };
    reset();
  }, [open]);

  React.useEffect(() => {
    if (!search || !token) return;
    let cancelled = false;
    async function run() {
      setState({ kind: 'loading' });
      try {
        const { matches, truncated } = await lookupCaller(token!, search!.phone);
        if (!cancelled) setState({ kind: 'done', matches, truncated });
      } catch (err: unknown) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: apiErrorMessage(err, {
              fallback: callerLookupCopy.loadError,
            }),
          });
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [search, token]);

  const matches = state.kind === 'done' ? state.matches : [];
  const truncated = state.kind === 'done' && state.truncated;
  const stamp = useSedeStamp(
    token ?? '',
    matches.flatMap((m) => [m.nextAppointment?.location.id, m.lastVisit?.location.id]),
  );

  function submit(value: string) {
    if (!hasEnoughCallerDigits(value)) {
      setFieldError(callerLookupCopy.tooShort);
      setSearch(null);
      setState({ kind: 'idle' });
      inputRef.current?.focus();
      return;
    }
    setFieldError(null);
    setSearch((prev) => ({ phone: value, run: (prev?.run ?? 0) + 1 }));
  }

  function createPatient() {
    setPrefillPhone(search?.phone ?? phone);
    creatingRef.current = true;
    onOpenChange(false);
    router.push('/patients/new');
  }

  const status =
    state.kind === 'loading'
      ? callerLookupCopy.searching
      : state.kind === 'done'
        ? matches.length === 0
          ? callerLookupCopy.noMatchTitle
          : callerLookupCopy.found(matches.length)
        : '';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          fullScreenOnMobile
          className="max-w-2xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{callerLookupCopy.title}</DialogTitle>
            <DialogDescription>{callerLookupCopy.description}</DialogDescription>
          </DialogHeader>

          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit(phone);
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
          >
            <FormField
              htmlFor={inputId}
              label={callerLookupCopy.fieldLabel}
              error={fieldError ?? undefined}
              hint={callerLookupCopy.fieldHint}
              hintId={hintId}
              className="min-w-0 flex-1"
            >
              <Input
                ref={inputRef}
                id={inputId}
                name="caller-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={64}
                placeholder={callerLookupCopy.placeholder}
                value={phone}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? fieldErrorId(inputId) : hintId}
                onChange={(event) => {
                  setPhone(event.target.value);
                  if (fieldError) setFieldError(null);
                }}
                onPaste={(event) => {
                  // Pegar un número completo busca al instante.
                  const pasted = event.clipboardData.getData('text');
                  if (!hasEnoughCallerDigits(pasted)) return;
                  event.preventDefault();
                  setPhone(pasted.trim());
                  submit(pasted.trim());
                }}
              />
            </FormField>
            {/* Alineado con el campo (no con su rótulo): `sm:mt-[1.625rem]`. */}
            <Button
              type="submit"
              loading={state.kind === 'loading'}
              className="max-sm:min-h-11 max-sm:w-full sm:mt-[1.625rem]"
            >
              <Phone aria-hidden />
              {callerLookupCopy.search}
            </Button>
          </form>

          {/* Siempre montada y vacía al abrir: así el lector de pantalla anuncia los cambios. */}
          <p role="status" data-testid="caller-status" className="sr-only">
            {status}
          </p>

          <div aria-busy={state.kind === 'loading'} className="flex flex-col gap-3">
            {state.kind === 'loading' ? (
              <div className="flex flex-col gap-3" aria-hidden>
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : null}
            {state.kind === 'error' ? (
              <SectionError
                title={callerLookupCopy.errorTitle}
                description={state.message}
                onRetry={() => setSearch((prev) => (prev ? { ...prev, run: prev.run + 1 } : prev))}
              />
            ) : null}
            {state.kind === 'done' && matches.length === 0 ? (
              <EmptyState
                title={callerLookupCopy.noMatchTitle}
                description={callerLookupCopy.noMatchDescription}
                icon={<Phone aria-hidden />}
                action={
                  <Button type="button" onClick={createPatient} className="max-sm:min-h-11 max-sm:w-full">
                    <UserPlus aria-hidden />
                    {callerLookupCopy.createPatient}
                  </Button>
                }
              />
            ) : null}
            {state.kind === 'done' && matches.length > 0 ? (
              <>
                <ul className="flex flex-col gap-3">
                  {matches.map((match) => (
                    <CallerCard
                      key={match.id}
                      match={match}
                      role={role}
                      stamp={stamp}
                      onNewAppointment={setScheduling}
                      onOpenRecord={() => onOpenChange(false)}
                    />
                  ))}
                </ul>
                {truncated ? (
                  <p role="status" data-testid="caller-truncated" className="text-sm text-muted">
                    {callerLookupCopy.truncated}
                  </p>
                ) : null}
                <SedeStampNote stamp={stamp} />
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {scheduling && token ? (
        <CallerScheduleDialog
          token={token}
          match={scheduling}
          onClose={() => setScheduling(null)}
          onCreated={() => {
            setScheduling(null);
            onOpenChange(false);
          }}
        />
      ) : null}
    </>
  );
}
