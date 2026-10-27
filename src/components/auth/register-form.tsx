'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import { REGISTER_LOCATION_FIELDS, registerClinic } from '@/lib/auth/register-api';
import { listPublicCurrencies } from '@/lib/reference/currencies-api';
import {
  browserLocale,
  browserTimeZone,
  canonicalLocale,
  canonicalTimeZone,
  REGIONAL_SETTINGS_FIELDS,
  validateRegionalSettings,
  type RegionalSettingsErrors,
  type RegionalSettingsField,
  type RegionalSettingsValues,
} from '@/lib/locations/regional-settings';
import { RegionalSettingsFields, regionalFieldId } from '@/components/locations/regional-settings-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  clinicNameLabel: 'Nombre de la clínica',
  subdomainLabel: 'Subdominio',
  fullNameLabel: 'Nombre completo',
  emailLabel: 'Correo electrónico',
  passwordLabel: 'Contraseña',
  showPassword: 'Mostrar clave',
  hidePassword: 'Ocultar clave',
  submit: 'Crear cuenta',
  submitting: 'Creando cuenta…',
  genericError: 'No pudimos crear la cuenta. Intenta de nuevo.',
  // 409 de POST /auth/register: solo el SUBDOMINIO (DX-029: el correo nunca
  // se revela; si ya tenía cuenta, su titular recibe un aviso por correo).
  taken: 'Ese subdominio ya está en uso. Elige otro.',
  sentTitle: 'Revisa tu correo',
  sentBody: (email: string) =>
    `Si ${email} puede registrar una clínica, te llegará un correo con un enlace para confirmarla. Ábrelo en las próximas 24 horas para activar tu clínica.`,
  sentSpam: 'Si no lo ves en unos minutos, revisa la carpeta de spam.',
  locationLegend: 'Tu sede',
  locationIntro:
    'La primera sede de tu clínica. La zona y el formato se sugieren desde tu navegador: revísalos. Podrás cambiarlos y añadir más sedes en Ajustes → Sedes.',
};

const ERROR_ID = 'register-error';
const LOCATION_ID = 'register-location';

const EMPTY_REGIONAL: RegionalSettingsValues = { country: '', currency: '', timeZone: '', locale: '' };

export function RegisterForm({ tenant }: { tenant: string | null }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState('');
  const [subdomain, setSubdomain] = useState(tenant ?? '');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // G1 (spec §6.7): la primera sede. País y moneda empiezan vacíos; zona y
  // formato se sugieren desde el navegador, a la vista y editables (R10).
  const [regional, setRegional] = useState<RegionalSettingsValues>(EMPTY_REGIONAL);
  const [suggestions, setSuggestions] = useState<{ timeZone: string | null; locale: string | null }>();
  const [regionalErrors, setRegionalErrors] = useState<RegionalSettingsErrors>({});

  // Tras montar: el formulario también se pinta en el servidor, que no sabe la
  // zona ni el idioma del navegador.
  useEffect(() => {
    function suggest() {
      const suggested = { timeZone: browserTimeZone(), locale: browserLocale() };
      setSuggestions(suggested);
      setRegional((prev) => ({
        ...prev,
        timeZone: prev.timeZone || suggested.timeZone || '',
        locale: prev.locale || suggested.locale || '',
      }));
    }
    suggest();
  }, []);

  function changeRegional<F extends RegionalSettingsField>(field: F, value: RegionalSettingsValues[F]) {
    setRegional((prev) => ({ ...prev, [field]: value }));
    setRegionalErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function focusRegional(field: RegionalSettingsField) {
    document.getElementById(regionalFieldId(LOCATION_ID, field))?.focus();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const found = validateRegionalSettings(regional);
    setRegionalErrors(found);
    const first = REGIONAL_SETTINGS_FIELDS.find((f) => found[f]);
    if (first) {
      focusRegional(first);
      return;
    }
    // Lo que se envía es lo que se ve: zona y formato quedan en su forma canónica.
    const timeZone = canonicalTimeZone(regional.timeZone) ?? regional.timeZone.trim();
    const locale = canonicalLocale(regional.locale) ?? regional.locale.trim();
    setRegional((prev) => ({ ...prev, timeZone, locale }));
    setSubmitting(true);
    try {
      await registerClinic({
        clinicName,
        subdomain,
        fullName,
        email,
        password,
        locationCountry: regional.country as Exclude<RegionalSettingsValues['country'], ''>,
        locationCurrency: regional.currency,
        locationTimeZone: timeZone,
        locationLocale: locale,
      });
      setSentTo(email.trim());
    } catch (err) {
      // Un 400 de la sede (`field` = locationCurrency…) va junto a su campo.
      const field =
        err instanceof ApiError && err.status === 400 && err.field && Object.hasOwn(REGISTER_LOCATION_FIELDS, err.field)
          ? REGISTER_LOCATION_FIELDS[err.field as keyof typeof REGISTER_LOCATION_FIELDS]
          : null;
      if (field) {
        setRegionalErrors((prev) => ({ ...prev, [field]: apiErrorMessage(err, copy.genericError) }));
        focusRegional(field);
        return;
      }
      setError(
        apiErrorMessage(err, {
          fallback: copy.genericError,
          // 403 («Untrusted origin»): no hay administrador a quien pedir acceso.
          byStatus: { 409: copy.taken, 403: copy.genericError },
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <MailCheck className="size-8 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink">{copy.sentTitle}</h2>
        <p className="text-sm text-muted">{copy.sentBody(sentTo)}</p>
        <p className="text-sm text-muted">{copy.sentSpam}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField htmlFor="register-clinic-name" label={copy.clinicNameLabel}>
        <Input
          id="register-clinic-name"
          name="clinicName"
          type="text"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={clinicName}
          onChange={(e) => setClinicName(e.target.value)}
        />
      </FormField>

      <FormField htmlFor="register-subdomain" label={copy.subdomainLabel}>
        <Input
          id="register-subdomain"
          name="subdomain"
          type="text"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value)}
        />
      </FormField>

      <FormField htmlFor="register-full-name" label={copy.fullNameLabel}>
        <Input
          id="register-full-name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </FormField>

      <FormField htmlFor="register-email" label={copy.emailLabel}>
        <Input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>

      <FormField htmlFor="register-password" label={copy.passwordLabel}>
        <div className="relative">
          <Input
            id="register-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={submitting}
            aria-pressed={showPassword}
            aria-label={showPassword ? copy.hidePassword : copy.showPassword}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </FormField>

      <fieldset className="flex flex-col gap-4 border-t border-hairline pt-4">
        <legend className="float-left w-full text-sm font-semibold text-ink">{copy.locationLegend}</legend>
        <p className="text-sm text-muted">{copy.locationIntro}</p>
        <RegionalSettingsFields
          idPrefix={LOCATION_ID}
          values={regional}
          onChange={changeRegional}
          errors={regionalErrors}
          currencyLoader={listPublicCurrencies}
          suggestions={suggestions}
          stacked
        />
      </fieldset>

      {error ? (
        <InlineError id={ERROR_ID} variant="summary">
          {error}
        </InlineError>
      ) : null}

      <Button type="submit" size="lg" disabled={submitting} className="mt-1 w-full">
        {submitting ? (
          <>
            <Loader2 className="animate-spin" /> {copy.submitting}
          </>
        ) : (
          copy.submit
        )}
      </Button>
    </form>
  );
}
