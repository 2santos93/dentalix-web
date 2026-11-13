'use client';
import { useEffect, useId, useState } from 'react';
import { Languages, Lock, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPatientLanguages,
  languageName,
  savePatientLanguages,
  type PatientLanguages,
} from '@/lib/patients/patient-languages';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const copy = {
  intro:
    'Los idiomas que recepción puede elegir en la ficha de cada paciente. El recordatorio por email y la página para confirmar la cita le llegan en su idioma si hay traducción (hoy, español e inglés); si no, en el de la clínica, y el registro de envíos lo dice. La fecha y la hora siempre siguen el formato de la sede.',
  clinicLanguage: 'Idioma de la clínica',
  clinicLanguageHint: 'El de los pacientes sin preferencia. No se puede quitar.',
  withTranslation: 'Con traducción',
  withoutTranslation: 'Sin traducción: le llega en el idioma de la clínica.',
  add: 'Añadir idioma',
  remove: 'Quitar',
  removeLabel: (name: string) => `Quitar ${name}`,
  addTitle: 'Añadir un idioma',
  addDescription: 'Escribe su código BCP 47: «en» inglés, «ca» catalán, «pt-BR» portugués de Brasil. El cambio queda en la auditoría.',
  codeLabel: 'Código del idioma',
  preview: (name: string) => `Se verá como: ${name}`,
  codeRequired: 'Escribe el código del idioma (p. ej. en).',
  codeInvalid: 'Ese código no es un idioma válido. Usa uno como «en», «ca» o «pt-BR».',
  codeDuplicate: 'Ese idioma ya está en la lista.',
  removeTitle: (name: string) => `¿Quitar ${name}?`,
  removeDescription:
    'Los pacientes que lo tienen lo conservan: su ficha lo muestra «(no disponible)» y sus mensajes les llegan en el idioma de la clínica hasta que recepción elija otro. El cambio queda en la auditoría.',
  save: 'Añadir',
  confirmRemove: 'Quitar idioma',
  cancel: 'Cancelar',
  added: (name: string) => `${name} añadido.`,
  removed: (name: string) => `${name} quitado de la lista.`,
  loadError: 'No pudimos cargar los idiomas de los pacientes.',
  saveError: 'No pudimos guardar los idiomas. Intenta de nuevo.',
  forbiddenTitle: 'Solo administración cambia los idiomas de los pacientes.',
  forbiddenHint: 'Recepción elige el idioma de cada paciente en su ficha, en «Comunicaciones».',
};

/** Idiomas con catálogo de textos en el recordatorio y la página de confirmar (DX-497). */
const TRANSLATED = new Set(['es', 'en']);

/** Sugerencias del campo (no limitan: vale cualquier etiqueta BCP 47). */
const SUGGESTIONS = ['en', 'ca', 'pt', 'pt-BR', 'fr', 'it', 'de', 'ar', 'zh', 'gl', 'eu'];

const loadErrorOptions = { fallback: copy.loadError, byStatus: { 404: copy.loadError } };

/** La etiqueta canónica, o null si no es BCP 47 (la API vuelve a validarla). */
function canonicalTag(raw: string): string | null {
  const trimmed = raw.trim().replace(/_/g, '-');
  if (!trimmed) return null;
  try {
    const [tag] = Intl.getCanonicalLocales(trimmed);
    return tag && /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/.test(tag) ? tag : null;
  } catch {
    return null;
  }
}

/**
 * Ajustes › Idiomas de los pacientes (DX-497): la lista de idiomas que la
 * ficha ofrece. Solo ADMIN la cambia; añadir y quitar van en un diálogo y se
 * guardan al confirmar. El idioma de la clínica no se puede quitar.
 */
export function PatientLanguagesSettingsSection({ token, allowed }: { token: string; allowed: boolean }) {
  const [data, setData] = useState<PatientLanguages | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const fieldId = useId();
  const listId = useId();

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getPatientLanguages(token)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, loadErrorOptions));
      });
    return () => {
      cancelled = true;
    };
  }, [token, allowed, reloadKey]);

  if (!allowed) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={copy.forbiddenTitle} description={copy.forbiddenHint} />;
  }
  if (loadError) {
    return (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!data) {
    return (
      <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-72" />
      </div>
    );
  }

  async function save(languages: string[], message: string): Promise<boolean> {
    setSaving(true);
    setSaveError(null);
    try {
      setData(await savePatientLanguages(token, languages));
      setNotice(message);
      return true;
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data) return;
    const tag = canonicalTag(code);
    const error = !code.trim()
      ? copy.codeRequired
      : !tag
        ? copy.codeInvalid
        : data.languages.includes(tag)
          ? copy.codeDuplicate
          : null;
    setCodeError(error);
    if (error || !tag) {
      document.getElementById(fieldId)?.focus();
      return;
    }
    if (await save([...data.languages, tag], copy.added(languageName(tag)))) setAdding(false);
  }

  async function handleRemove() {
    if (!data || !removing) return;
    const name = languageName(removing);
    if (await save(data.languages.filter((l) => l !== removing), copy.removed(name))) setRemoving(null);
  }

  const previewTag = canonicalTag(code);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[70ch] text-sm text-muted">{copy.intro}</p>
      <SettingRows data-testid="patient-languages">
        {data.languages.map((tag) => {
          const name = languageName(tag);
          const isClinic = tag === data.clinicLanguage;
          return (
            <SettingRow
              key={tag}
              label={name}
              description={
                isClinic ? copy.clinicLanguageHint : TRANSLATED.has(tag) ? copy.withTranslation : copy.withoutTranslation
              }
              inline
            >
              {isClinic ? (
                <Badge variant="neutral">{copy.clinicLanguage}</Badge>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="max-sm:min-h-11"
                  aria-label={copy.removeLabel(name)}
                  onClick={() => {
                    setSaveError(null);
                    setNotice('');
                    setRemoving(tag);
                  }}
                >
                  {copy.remove}
                </Button>
              )}
            </SettingRow>
          );
        })}
      </SettingRows>
      <div>
        <Button
          type="button"
          variant="secondary"
          className="max-sm:min-h-11 max-sm:w-full"
          onClick={() => {
            setCode('');
            setCodeError(null);
            setSaveError(null);
            setNotice('');
            setAdding(true);
          }}
        >
          <Plus aria-hidden /> {copy.add}
        </Button>
      </div>
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      <Dialog open={adding} onOpenChange={(open) => !saving && setAdding(open)}>
        <DialogContent className="max-w-md">
          <form onSubmit={(e) => void handleAdd(e)} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{copy.addTitle}</DialogTitle>
              <DialogDescription>{copy.addDescription}</DialogDescription>
            </DialogHeader>
            <FormField
              htmlFor={fieldId}
              label={copy.codeLabel}
              error={codeError}
              hint={previewTag && !codeError ? copy.preview(languageName(previewTag)) : undefined}
            >
              <Input
                id={fieldId}
                name="language"
                list={listId}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={35}
                className="max-sm:h-11"
                value={code}
                disabled={saving}
                aria-invalid={codeError ? true : undefined}
                aria-describedby={codeError ? fieldErrorId(fieldId) : undefined}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError(null);
                }}
              />
            </FormField>
            <datalist id={listId}>
              {SUGGESTIONS.filter((tag) => !data.languages.includes(tag)).map((tag) => (
                <option key={tag} value={tag}>
                  {languageName(tag)}
                </option>
              ))}
            </datalist>
            {saveError ? <InlineError variant="summary">{saveError}</InlineError> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={saving}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button type="submit" loading={saving} className="max-sm:min-h-11">
                <Languages aria-hidden /> {copy.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(open) => !saving && !open && setRemoving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{removing ? copy.removeTitle(languageName(removing)) : ''}</DialogTitle>
            <DialogDescription>{copy.removeDescription}</DialogDescription>
          </DialogHeader>
          {saveError ? <InlineError variant="summary">{saveError}</InlineError> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={saving}>
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" loading={saving} className="max-sm:min-h-11" onClick={() => void handleRemove()}>
              {copy.confirmRemove}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
