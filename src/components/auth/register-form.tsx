'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { REGISTER_LOCATION_FIELDS, registerClinic } from '@/lib/auth/register-api';
import { listPublicCurrencies } from '@/lib/reference/currencies-api';
import {
  canonicalLocale,
  canonicalTimeZone,
  REGIONAL_SETTINGS_FIELDS,
  validateRegionalSettings,
  type RegionalSettingsErrors,
  type RegionalSettingsField,
  type RegionalSettingsValues,
} from '@/lib/locations/regional-settings';
import { useRegionalDraft } from '@/lib/locations/use-regional-draft';
import { RegionalSettingsFields, regionalFieldId } from '@/components/locations/regional-settings-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wizard } from '@/components/ui/wizard';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { AUTH_FORM_CLASS, AUTH_SUBMIT_CLASS } from './auth-layout';
import { PasswordInput } from './password-input';

/** Dominio bajo el que vive cada clínica (`sonrisa.dentalix.app`). */
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'dentalix.app';
const SUBDOMAIN_PATTERN = /^[a-z0-9-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MIN = 2;
const PASSWORD_MIN = 8;

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  stepClinic: 'Tu clínica',
  stepAccount: 'Tu cuenta',
  clinicNameLabel: 'Nombre de la clínica',
  clinicNameInvalid: `Escribe el nombre de la clínica (al menos ${NAME_MIN} caracteres).`,
  subdomainLabel: 'Dirección web',
  subdomainHint: (sub: string) =>
    `Así entrarás: ${sub || 'tu-clinica'}.${ROOT_DOMAIN}. Solo minúsculas sin tildes, números y guiones.`,
  subdomainMissing: 'Escribe la dirección web de tu clínica.',
  subdomainInvalid: 'Usa solo minúsculas sin tildes, números y guiones (por ejemplo, sonrisa-norte).',
  fullNameLabel: 'Nombre completo',
  fullNameInvalid: `Escribe tu nombre (al menos ${NAME_MIN} caracteres).`,
  emailLabel: 'Correo electrónico',
  emailInvalid: 'Escribe un correo electrónico válido (por ejemplo, nombre@clinica.com).',
  passwordLabel: 'Contraseña',
  passwordHint: `Mínimo ${PASSWORD_MIN} caracteres.`,
  passwordTooShort: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`,
  showPassword: 'Mostrar clave',
  hidePassword: 'Ocultar clave',
  next: 'Continuar',
  back: 'Atrás',
  submit: 'Crear cuenta',
  submitting: 'Creando cuenta…',
  genericError: 'No pudimos crear la cuenta. Intenta de nuevo.',
  // 409 de POST /auth/register: solo la DIRECCIÓN (DX-029: el correo nunca
  // se revela; si ya tenía cuenta, su titular recibe un aviso por correo).
  taken: 'Esa dirección web ya está en uso. Elige otra.',
  sentTitle: 'Revisa tu correo',
  sentBody: (email: string) =>
    `Si ${email} puede registrar una clínica, te llegará un correo con un enlace para confirmarla. Ábrelo en las próximas 24 horas para activar tu clínica.`,
  sentSpam: 'Si no lo ves en unos minutos, revisa la carpeta de spam.',
  locationLegend: 'Tu sede',
  locationIntro:
    'La primera sede de tu clínica. Te proponemos el país y la zona de tu navegador, y la moneda y el formato de ese país: revísalos. Podrás cambiarlos y añadir más sedes en Ajustes → Sedes.',
};

const STEPS = [
  { key: 'clinic', label: copy.stepClinic },
  { key: 'account', label: copy.stepAccount },
];

const ERROR_ID = 'register-error';
const LOCATION_ID = 'register-location';
const CLINIC_NAME_ID = 'register-clinic-name';
const SUBDOMAIN_ID = 'register-subdomain';
const SUBDOMAIN_HINT_ID = 'register-subdomain-hint';
const FULL_NAME_ID = 'register-full-name';
const EMAIL_ID = 'register-email';
const PASSWORD_ID = 'register-password';
const PASSWORD_HINT_ID = 'register-password-hint';

type AccountField = 'fullName' | 'email' | 'password';

/**
 * Alta de una clínica en dos pasos: 1) la clínica — nombre, dirección web y
 * su primera sede; 2) la cuenta de quien la administra. Cada paso se valida al
 * avanzar; un 409 (dirección ocupada) o un 400 de la sede devuelven al paso 1,
 * junto al campo.
 *
 * Disponibilidad de la dirección: la API no tiene un endpoint para comprobarla
 * antes de enviar, así que se enseña el formato y la dirección resultante, y
 * la ocupada se avisa con el 409 del envío.
 */
export function RegisterForm({ tenant }: { tenant: string | null }) {
  const [step, setStep] = useState(0);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState('');
  const [subdomain, setSubdomain] = useState(tenant ?? '');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clinicNameError, setClinicNameError] = useState<string | null>(null);
  const [subdomainError, setSubdomainError] = useState<string | null>(null);
  const [accountErrors, setAccountErrors] = useState<Partial<Record<AccountField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // G1 (spec §6.7) y R1: la primera sede. País y zona del navegador; moneda,
  // formato y reloj coherentes con ese país (`useRegionalDraft`), a la vista y
  // editables. Sin sugerencia, el campo queda vacío y obligatorio.
  const draft = useRegionalDraft(null);
  const regional = draft.values;
  const [regionalErrors, setRegionalErrors] = useState<RegionalSettingsErrors>({});
  // Campo a enfocar tras el próximo render (al cambiar de paso, el campo aún no existe).
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });

  function changeRegional<F extends RegionalSettingsField>(field: F, value: RegionalSettingsValues[F]) {
    draft.change(field, value);
    setRegionalErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  /** Valida el paso 1; si vale, deja la zona y el formato en su forma canónica. */
  function validateClinicStep(): string | null {
    const nameError = clinicName.trim().length < NAME_MIN ? copy.clinicNameInvalid : null;
    const sub = subdomain.trim();
    const subError = !sub ? copy.subdomainMissing : SUBDOMAIN_PATTERN.test(sub) ? null : copy.subdomainInvalid;
    const found = validateRegionalSettings(regional);
    setClinicNameError(nameError);
    setSubdomainError(subError);
    setRegionalErrors(found);
    if (nameError) return CLINIC_NAME_ID;
    if (subError) return SUBDOMAIN_ID;
    const first = REGIONAL_SETTINGS_FIELDS.find((f) => found[f]);
    if (first) return regionalFieldId(LOCATION_ID, first);
    // Lo que se envía es lo que se ve: zona y formato quedan en su forma canónica.
    draft.normalize({
      timeZone: canonicalTimeZone(regional.timeZone) ?? regional.timeZone.trim(),
      locale: canonicalLocale(regional.locale) ?? regional.locale.trim(),
    });
    return null;
  }

  function goToStep(target: number) {
    if (target === step) return;
    if (target === 0) {
      pendingFocus.current = CLINIC_NAME_ID;
      setStep(0);
      return;
    }
    const invalid = validateClinicStep();
    if (invalid) {
      document.getElementById(invalid)?.focus();
      return;
    }
    pendingFocus.current = FULL_NAME_ID;
    setStep(1);
  }

  function handleClinicSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    goToStep(1);
  }

  async function handleAccountSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const found: Partial<Record<AccountField, string>> = {};
    if (fullName.trim().length < NAME_MIN) found.fullName = copy.fullNameInvalid;
    if (!EMAIL_PATTERN.test(email.trim())) found.email = copy.emailInvalid;
    if (password.length < PASSWORD_MIN) found.password = copy.passwordTooShort;
    setAccountErrors(found);
    const first = (
      [
        ['fullName', FULL_NAME_ID],
        ['email', EMAIL_ID],
        ['password', PASSWORD_ID],
      ] as const
    ).find(([field]) => found[field]);
    if (first) {
      document.getElementById(first[1])?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await registerClinic({
        clinicName: clinicName.trim(),
        subdomain: subdomain.trim(),
        fullName,
        email: email.trim(),
        password,
        locationCountry: regional.country,
        locationCurrency: regional.currency,
        locationTimeZone: regional.timeZone,
        locationLocale: regional.locale,
        locationHourCycle: regional.hourCycle as Exclude<RegionalSettingsValues['hourCycle'], ''>,
      });
      setSentTo(email.trim());
    } catch (err) {
      // Un 400 de la sede (`field` = locationCurrency…) va junto a su campo, en el paso 1.
      const field =
        err instanceof ApiError && err.status === 400 && err.field && Object.hasOwn(REGISTER_LOCATION_FIELDS, err.field)
          ? REGISTER_LOCATION_FIELDS[err.field as keyof typeof REGISTER_LOCATION_FIELDS]
          : null;
      if (field) {
        setRegionalErrors((prev) => ({ ...prev, [field]: apiErrorMessage(err, copy.genericError) }));
        pendingFocus.current = regionalFieldId(LOCATION_ID, field);
        setStep(0);
        return;
      }
      // 409: la dirección está ocupada → junto a su campo, en el paso 1.
      if (err instanceof ApiError && err.status === 409) {
        setSubdomainError(apiErrorMessage(err, { fallback: copy.taken, byStatus: { 409: copy.taken } }));
        pendingFocus.current = SUBDOMAIN_ID;
        setStep(0);
        return;
      }
      setError(
        apiErrorMessage(err, {
          fallback: copy.genericError,
          // 403 («Untrusted origin»): no hay administrador a quien pedir acceso.
          byStatus: { 403: copy.genericError },
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <MailCheck className="size-8 text-success-text" aria-hidden="true" />
        <h2 className="t-title text-ink">{copy.sentTitle}</h2>
        <p className="text-sm text-muted">{copy.sentBody(sentTo)}</p>
        <p className="text-sm text-muted">{copy.sentSpam}</p>
      </div>
    );
  }

  /** `aria-describedby` de un campo del paso 2: el resumen del envío, su error o su pista. */
  const describe = (id: string, fieldError: string | undefined, hintId?: string) =>
    error ? ERROR_ID : fieldError ? fieldErrorId(id) : hintId;

  return (
    <Wizard steps={STEPS} current={step} onStepChange={goToStep}>
      {step === 0 ? (
        <form onSubmit={handleClinicSubmit} noValidate className={AUTH_FORM_CLASS}>
          <FormField htmlFor={CLINIC_NAME_ID} label={copy.clinicNameLabel} error={clinicNameError}>
            <Input
              id={CLINIC_NAME_ID}
              name="clinicName"
              type="text"
              autoComplete="organization"
              required
              value={clinicName}
              aria-invalid={clinicNameError ? true : undefined}
              aria-describedby={clinicNameError ? fieldErrorId(CLINIC_NAME_ID) : undefined}
              onChange={(e) => {
                setClinicName(e.target.value);
                setClinicNameError(null);
              }}
            />
          </FormField>

          <FormField
            htmlFor={SUBDOMAIN_ID}
            label={copy.subdomainLabel}
            hint={copy.subdomainHint(subdomain.trim())}
            hintId={SUBDOMAIN_HINT_ID}
            error={subdomainError}
          >
            <div className="flex min-w-0">
              <Input
                id={SUBDOMAIN_ID}
                name="subdomain"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={subdomain}
                aria-invalid={subdomainError ? true : undefined}
                aria-describedby={subdomainError ? fieldErrorId(SUBDOMAIN_ID) : SUBDOMAIN_HINT_ID}
                onChange={(e) => {
                  setSubdomain(e.target.value.toLowerCase());
                  setSubdomainError(null);
                }}
                className="min-w-0 flex-1 rounded-r-none"
              />
              {/* La pista ya dice la dirección completa: el sufijo es solo visual. */}
              <span
                aria-hidden
                className="inline-flex shrink-0 items-center rounded-r-lg border border-l-0 border-border-input bg-surface-sunken px-3 text-sm text-muted"
              >
                .{ROOT_DOMAIN}
              </span>
            </div>
          </FormField>

          <fieldset className="flex flex-col gap-4 border-t border-border-subtle pt-4">
            <legend className="float-left w-full t-title text-ink">{copy.locationLegend}</legend>
            <p className="text-sm text-muted">{copy.locationIntro}</p>
            <RegionalSettingsFields
              idPrefix={LOCATION_ID}
              values={regional}
              onChange={changeRegional}
              errors={regionalErrors}
              currencyLoader={listPublicCurrencies}
              sources={draft.sources}
              proposals={draft.proposals}
              onAcceptProposal={draft.accept}
              stacked
            />
          </fieldset>

          <Button type="submit" size="lg" className={AUTH_SUBMIT_CLASS}>
            {copy.next}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleAccountSubmit} noValidate className={AUTH_FORM_CLASS}>
          <FormField htmlFor={FULL_NAME_ID} label={copy.fullNameLabel} error={accountErrors.fullName}>
            <Input
              id={FULL_NAME_ID}
              name="fullName"
              type="text"
              autoComplete="name"
              required
              disabled={submitting}
              aria-invalid={error || accountErrors.fullName ? true : undefined}
              aria-describedby={describe(FULL_NAME_ID, accountErrors.fullName)}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </FormField>

          <FormField htmlFor={EMAIL_ID} label={copy.emailLabel} error={accountErrors.email}>
            <Input
              id={EMAIL_ID}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              disabled={submitting}
              aria-invalid={error || accountErrors.email ? true : undefined}
              aria-describedby={describe(EMAIL_ID, accountErrors.email)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>

          <FormField
            htmlFor={PASSWORD_ID}
            label={copy.passwordLabel}
            hint={copy.passwordHint}
            hintId={PASSWORD_HINT_ID}
            error={accountErrors.password}
          >
            <PasswordInput
              id={PASSWORD_ID}
              name="password"
              autoComplete="new-password"
              required
              disabled={submitting}
              aria-invalid={error || accountErrors.password ? true : undefined}
              aria-describedby={describe(PASSWORD_ID, accountErrors.password, PASSWORD_HINT_ID)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              visible={showPassword}
              onVisibleChange={setShowPassword}
              showLabel={copy.showPassword}
              hideLabel={copy.hidePassword}
            />
          </FormField>

          {error ? (
            <InlineError id={ERROR_ID} variant="summary">
              {error}
            </InlineError>
          ) : null}

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => goToStep(0)}
              disabled={submitting}
            >
              {copy.back}
            </Button>
            <Button type="submit" size="lg" disabled={submitting} className="sm:flex-1">
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" /> {copy.submitting}
                </>
              ) : (
                copy.submit
              )}
            </Button>
          </div>
        </form>
      )}
    </Wizard>
  );
}
