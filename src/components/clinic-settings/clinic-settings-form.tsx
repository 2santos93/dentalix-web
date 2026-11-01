'use client';
import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  GENERIC_TAX_ID_LABEL,
  LOGO_ACCEPT,
  LOGO_UPLOAD_MAX_BYTES,
  getClinicSettings,
  removeClinicLogo,
  updateClinicSettings,
  uploadClinicLogo,
  type ClinicSettings,
  type ClinicSettingsPatch,
} from '@/lib/clinic/clinic-settings-api';
import { HEX6 } from '@/lib/color/brand-color';
import { useSetClinicBranding } from '@/components/brand/branding-context';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { fieldErrorId } from '@/components/shared/form-field';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingRow, SettingRows, SettingsSection } from '@/components/settings/settings-page';
import { Callout } from '@/components/ui/callout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandColorPreview } from './brand-color-preview';
import { DocumentHeaderPreview } from './document-header-preview';

export const clinicSettingsCopy = {
  brand: 'Marca',
  brandHelp: 'Lo que ven el equipo y los pacientes: el login, la app, los documentos y los mensajes.',
  name: 'Nombre comercial',
  nameHelp: 'El nombre con el que se conoce la clínica.',
  color: 'Color de la marca',
  colorHelp: 'Un solo color: Dentalix deriva el resto con contraste suficiente, en claro y en oscuro.',
  colorPicker: 'Elegir el color',
  colorHex: 'Color en hexadecimal',
  logo: 'Logo',
  logoHelp: 'PNG, JPG o SVG de hasta 1 MB. Mejor horizontal y con fondo transparente.',
  logoNone: 'Sin logo: se usan las iniciales.',
  logoPending: (name: string) => `Nuevo: ${name} (se sube al guardar).`,
  logoRemoving: 'Se quitará al guardar.',
  logoChoose: 'Elegir logo',
  logoChange: 'Cambiar logo',
  logoRemove: 'Quitar logo',
  logoUndo: 'Mantener el actual',
  logoAlt: (name: string) => `Logo de ${name}`,
  fiscal: 'Datos fiscales',
  fiscalHelp:
    'Salen en recibos, presupuestos, recetas y estados de cuenta. Texto libre: se imprime tal cual, sin formato de ningún país.',
  legalName: 'Razón social',
  taxIdLabel: 'Nombre del identificador fiscal',
  taxIdLabelHelp: `Cómo se llama en tu clínica. Vacío: «${GENERIC_TAX_ID_LABEL}».`,
  taxId: 'Identificador fiscal',
  fiscalAddress: 'Dirección fiscal',
  contact: 'Contacto',
  contactHelp: 'Para que los pacientes sepan cómo escribir o llamar a la clínica.',
  contactEmail: 'Email de contacto',
  contactPhone: 'Teléfono de contacto',
  preview: 'Así sale en los documentos',
  previewHelp: 'La cabecera de un recibo con lo que tienes escrito, antes de guardar.',
  pendingTitle: 'Datos fiscales pendientes',
  pendingBody:
    'Sin razón social o sin identificador fiscal, los recibos salen con el aviso «Datos fiscales pendientes».',
  applies:
    'Se aplica al momento en la app, el login y los documentos. Los recibos ya emitidos conservan los datos con los que salieron.',
  saved: 'Datos de la clínica guardados.',
  saveAria: 'Guardar los datos de la clínica',
  loadError: 'No pudimos cargar los datos de la clínica.',
  saveError: 'No pudimos guardar los datos de la clínica. Intenta de nuevo.',
  loading: 'Cargando',
  forbiddenTitle: 'Solo administración edita los datos de la clínica.',
  forbiddenHint: 'El nombre, el logo, el color y los datos fiscales los fija administración.',
  errors: {
    name: 'Escribe el nombre comercial (hasta 120 caracteres).',
    color: 'Escribe un color en hexadecimal de seis cifras, p. ej. #0E7490.',
    email: 'Escribe un email con la forma nombre@dominio.',
    tooLong: (max: number) => `Hasta ${max} caracteres.`,
    logoType: 'El logo debe ser una imagen PNG, JPG o SVG.',
    logoSize: 'El logo supera el máximo de 1 MB.',
  },
};

const copy = clinicSettingsCopy;

/** Lo que se edita (textos tal como se escriben; '' = sin dato). */
interface Draft {
  name: string;
  legalName: string;
  taxIdLabel: string;
  taxId: string;
  fiscalAddress: string;
  contactEmail: string;
  contactPhone: string;
  primaryColor: string;
  /** 'keep' · 'remove' · `new:<id>` (el fichero vive en una ref). */
  logo: string;
}

type TextField = Exclude<keyof Draft, 'logo'>;

const MAX: Record<TextField, number> = {
  name: 120,
  legalName: 160,
  taxIdLabel: 40,
  taxId: 64,
  fiscalAddress: 250,
  contactEmail: 254,
  contactPhone: 40,
  primaryColor: 7,
};

function toDraft(s: ClinicSettings): Draft {
  return {
    name: s.name,
    legalName: s.legalName ?? '',
    taxIdLabel: s.taxIdLabel ?? '',
    taxId: s.taxId ?? '',
    fiscalAddress: s.fiscalAddress ?? '',
    contactEmail: s.contactEmail ?? '',
    contactPhone: s.contactPhone ?? '',
    primaryColor: s.primaryColor.toUpperCase(),
    logo: 'keep',
  };
}

const isLogoFile = (file: File) =>
  /^image\/(png|jpeg|svg\+xml)$/.test(file.type) || /\.(png|jpe?g|svg)$/i.test(file.name);

/** Errores de cada campo antes de mandar nada (la API valida otra vez). */
export function validateClinicDraft(draft: Draft): Partial<Record<TextField, string>> {
  const errors: Partial<Record<TextField, string>> = {};
  for (const field of Object.keys(MAX) as TextField[]) {
    if ([...draft[field].trim()].length > MAX[field]) errors[field] = copy.errors.tooLong(MAX[field]);
  }
  if (draft.name.trim() === '') errors.name = copy.errors.name;
  if (!HEX6.test(draft.primaryColor.trim())) errors.primaryColor = copy.errors.color;
  const email = draft.contactEmail.trim();
  if (email !== '' && !/^[^\s@]+@[^\s@]+$/u.test(email)) errors.contactEmail = copy.errors.email;
  return errors;
}

/**
 * DX-019, Ajustes › Datos de la clínica (solo ADMIN): marca (nombre, color con
 * su familia derivada en claro y oscuro, logo), datos fiscales con el nombre
 * propio del identificador, y contacto. Un solo guardado (la barra «Cambios
 * sin guardar»), también para el logo; al guardar, la pestaña pinta ya con la
 * marca nueva.
 */
export function ClinicSettingsForm({ token, allowed }: { token: string; allowed: boolean }) {
  const [saved, setSaved] = useState<ClinicSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getClinicSettings(token)
      .then((settings) => {
        if (cancelled) return;
        setSaved(settings);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [token, allowed, reloadKey]);

  if (!allowed) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />;
  }
  if (loadError) {
    return <SectionError description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
  if (!saved) {
    return (
      <div role="status" aria-label={copy.loading} className="flex flex-col gap-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }
  return <ClinicSettingsFields token={token} saved={saved} onSaved={setSaved} />;
}

function ClinicSettingsFields({
  token,
  saved,
  onSaved,
}: {
  token: string;
  saved: ClinicSettings;
  onSaved: (next: ClinicSettings) => void;
}) {
  const router = useRouter();
  const setBranding = useSetClinicBranding();
  const savedDraft = useMemo(() => toDraft(saved), [saved]);
  const { draft, update, dirty, discard, commit } = useSettingsDraft<Draft>(savedDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TextField, string>>>({});
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const formId = 'clinic-settings-form';

  const shownLogo =
    draft.logo === 'remove' ? null : draft.logo.startsWith('new:') ? logoPreview : saved.logoUrl;

  function set(field: TextField, value: string) {
    update({ [field]: value.replace(/[\r\n]+/g, ' ') } as Partial<Draft>);
    if (fieldErrors[field]) {
      const rest = { ...fieldErrors };
      delete rest[field];
      setFieldErrors(rest);
    }
  }

  function chooseLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isLogoFile(file)) return setLogoError(copy.errors.logoType);
    if (file.size > LOGO_UPLOAD_MAX_BYTES) return setLogoError(copy.errors.logoSize);
    setLogoError(null);
    // `data:` y no `blob:`: la vista previa local no pasa por `connect-src` de la CSP.
    const reader = new FileReader();
    reader.onload = () => {
      setPendingFile(file);
      setLogoPreview(typeof reader.result === 'string' ? reader.result : null);
      update({ logo: `new:${file.name}:${file.size}:${file.lastModified}` });
    };
    reader.onerror = () => setLogoError(copy.errors.logoType);
    reader.readAsDataURL(file);
  }

  function resetLogo() {
    setPendingFile(null);
    setLogoPreview(null);
    setLogoError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const errors = validateClinicDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      let next = saved;
      // El logo primero: es lo que más puede fallar (tipo, tamaño), y así un
      // fallo no deja los textos guardados a medias.
      if (draft.logo.startsWith('new:') && pendingFile) {
        next = await uploadClinicLogo(token, pendingFile);
      } else if (draft.logo === 'remove') {
        next = await removeClinicLogo(token);
      }
      const patch: ClinicSettingsPatch = {};
      for (const field of Object.keys(MAX) as TextField[]) {
        const value = field === 'primaryColor' ? draft[field].trim().toUpperCase() : draft[field].trim();
        if (value !== savedDraft[field].trim()) (patch as Record<string, string | null>)[field] = value === '' ? null : value;
      }
      if (Object.keys(patch).length > 0) next = await updateClinicSettings(token, patch);
      resetLogo();
      onSaved(next);
      commit(toDraft(next));
      // La pestaña pinta ya con la marca nueva; el layout la vuelve a leer.
      setBranding({ name: next.name, logoUrl: next.logoUrl, primaryColor: next.primaryColor });
      router.refresh();
      toast.success(copy.saved);
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  const textRow = (field: TextField, label: string, opts: { help?: string; placeholder?: string; type?: string; autoComplete?: string } = {}) => {
    const id = `clinic-${field}`;
    const err = fieldErrors[field] ?? null;
    return (
      <SettingRow key={field} labelId={`${id}-label`} label={label} description={opts.help}>
        <div className="flex w-full flex-col gap-1 sm:w-80">
          <Input
            id={id}
            type={opts.type ?? 'text'}
            autoComplete={opts.autoComplete ?? 'off'}
            aria-labelledby={`${id}-label`}
            placeholder={opts.placeholder}
            value={draft[field]}
            disabled={saving}
            onChange={(e) => set(field, e.target.value)}
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? fieldErrorId(id) : undefined}
            className="max-sm:min-h-11"
          />
          {err ? <InlineError id={fieldErrorId(id)}>{err}</InlineError> : null}
        </div>
      </SettingRow>
    );
  };

  const colorValid = HEX6.test(draft.primaryColor.trim());
  const colorErr = fieldErrors.primaryColor ?? null;

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-10">
      {saved.fiscalDataPending ? (
        <Callout tone="warning" title={copy.pendingTitle} data-testid="fiscal-pending-callout">
          {copy.pendingBody}
        </Callout>
      ) : null}

      <SettingsSection title={copy.brand} description={copy.brandHelp}>
        <SettingRows>
          {textRow('name', copy.name, { help: copy.nameHelp, autoComplete: 'organization' })}
          <SettingRow labelId="clinic-color-label" label={copy.color} description={copy.colorHelp}>
            <div className="flex w-full flex-col gap-1 sm:w-80">
              <div className="flex items-center gap-2">
                {/* Muestra nativa del navegador: elige el color; el campo de al lado lo escribe. */}
                <input
                  type="color"
                  aria-label={copy.colorPicker}
                  value={colorValid ? draft.primaryColor.trim().toLowerCase() : '#000000'}
                  disabled={saving}
                  onChange={(e) => set('primaryColor', e.target.value.toUpperCase())}
                  className="size-10 shrink-0 cursor-pointer rounded-md border border-border-input bg-surface p-1 disabled:cursor-not-allowed pointer-coarse:size-11"
                />
                <Input
                  id="clinic-primaryColor"
                  aria-label={copy.colorHex}
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.primaryColor}
                  disabled={saving}
                  onChange={(e) => set('primaryColor', e.target.value.toUpperCase())}
                  aria-invalid={colorErr ? true : undefined}
                  aria-describedby={colorErr ? fieldErrorId('clinic-primaryColor') : undefined}
                  className="t-data max-sm:min-h-11"
                />
              </div>
              {colorErr ? <InlineError id={fieldErrorId('clinic-primaryColor')}>{colorErr}</InlineError> : null}
            </div>
          </SettingRow>
          <div className="px-4 py-3 sm:px-6 sm:py-4">
            <BrandColorPreview color={colorValid ? draft.primaryColor.trim() : null} />
          </div>
          <SettingRow
            labelId="clinic-logo-label"
            label={copy.logo}
            description={
              draft.logo === 'remove'
                ? copy.logoRemoving
                : draft.logo.startsWith('new:') && pendingFile
                  ? copy.logoPending(pendingFile.name)
                  : shownLogo
                    ? copy.logoHelp
                    : `${copy.logoNone} ${copy.logoHelp}`
            }
          >
            <div className="flex w-full flex-col gap-2 sm:w-80">
              {shownLogo ? (
                <div className="flex h-16 items-center justify-center rounded-lg border border-border-subtle bg-white px-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- logo de la clínica (o su vista previa local) */}
                  <img
                    src={shownLogo}
                    alt={copy.logoAlt(draft.name || saved.name)}
                    data-testid="clinic-logo-preview"
                    className="max-h-12 w-auto max-w-full object-contain"
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 max-sm:[&>*]:flex-1">
                <Button type="button" variant="secondary" disabled={saving} onClick={() => fileRef.current?.click()}>
                  {shownLogo ? copy.logoChange : copy.logoChoose}
                </Button>
                {draft.logo !== 'keep' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                      resetLogo();
                      update({ logo: 'keep' });
                    }}
                  >
                    {copy.logoUndo}
                  </Button>
                ) : saved.logoUrl ? (
                  <Button type="button" variant="destructive-ghost" disabled={saving} onClick={() => update({ logo: 'remove' })}>
                    {copy.logoRemove}
                  </Button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={LOGO_ACCEPT}
                className="hidden"
                aria-label={copy.logoChoose}
                data-testid="clinic-logo-input"
                onChange={chooseLogo}
              />
              {logoError ? <InlineError>{logoError}</InlineError> : null}
            </div>
          </SettingRow>
        </SettingRows>
      </SettingsSection>

      <SettingsSection title={copy.fiscal} description={copy.fiscalHelp}>
        <SettingRows>
          {textRow('legalName', copy.legalName, { autoComplete: 'organization' })}
          {textRow('taxIdLabel', copy.taxIdLabel, { help: copy.taxIdLabelHelp, placeholder: GENERIC_TAX_ID_LABEL })}
          {textRow('taxId', copy.taxId)}
          {textRow('fiscalAddress', copy.fiscalAddress, { autoComplete: 'street-address' })}
        </SettingRows>
      </SettingsSection>

      <SettingsSection title={copy.contact} description={copy.contactHelp}>
        <SettingRows>
          {textRow('contactEmail', copy.contactEmail, { type: 'email', autoComplete: 'email' })}
          {textRow('contactPhone', copy.contactPhone, { type: 'tel', autoComplete: 'tel' })}
        </SettingRows>
      </SettingsSection>

      <SettingsSection title={copy.preview} description={copy.previewHelp}>
        <DocumentHeaderPreview
          name={draft.name.trim() || saved.name}
          logoUrl={shownLogo}
          fiscal={{
            legalName: draft.legalName.trim() || null,
            taxIdLabel: draft.taxIdLabel.trim() || null,
            taxId: draft.taxId.trim() || null,
            address: draft.fiscalAddress.trim() || null,
            email: draft.contactEmail.trim() || null,
            phone: draft.contactPhone.trim() || null,
          }}
        />
      </SettingsSection>

      <p className="text-sm text-muted">{copy.applies}</p>
      <SaveBar
        dirty={dirty}
        saving={saving}
        form={formId}
        error={error}
        saveAriaLabel={copy.saveAria}
        onDiscard={() => {
          discard();
          resetLogo();
          setError(null);
          setFieldErrors({});
        }}
      />
    </form>
  );
}
