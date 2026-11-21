'use client';
import * as React from 'react';
import { useEffect, useId, useState } from 'react';
import { ArrowUp, Info, Plus, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  ACCEPTED_CURRENCIES_MAX,
  saveClinicCurrencies,
  type ClinicCurrenciesPatch,
  type ExchangeRateSettings,
} from '@/lib/exchange/exchange-settings-api';
import { locationCurrency } from '@/lib/locations/location-settings';
import { loadLocations } from '@/lib/session/session-store';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { SectionHeader } from '@/components/ui/section-header';
import { SettingRow, SettingRows } from '@/components/settings/settings-page';

type ShowChoice = 'auto' | 'always' | 'never';

export const clinicCurrenciesCopy = {
  heading: 'Monedas de la clínica',
  description: 'En qué monedas se cobra y qué tasa enseña el menú a quien cobra.',
  change: 'Cambiar',
  save: 'Guardar',
  accepted: {
    label: 'Monedas aceptadas',
    any: 'Cualquier moneda',
    description:
      'Con alguna elegida, los abonos solo se registran en esas monedas. La primera es la que enseña el menú; los abonos ya registrados no cambian.',
    changeLabel: 'Cambiar las monedas aceptadas',
    dialogTitle: 'Monedas aceptadas',
    dialogDescription:
      'Los abonos, los cobros divididos y el vuelto solo se podrán registrar en estas monedas. Sin ninguna, se cobra en cualquiera, como hasta ahora. El cambio queda en la auditoría.',
    listLabel: 'Monedas elegidas, en el orden del menú',
    none: 'Ninguna: se cobra en cualquier moneda.',
    add: 'Añadir',
    addField: 'Añadir una moneda',
    addPlaceholder: 'Elige una moneda',
    max: `La clínica puede aceptar ${ACCEPTED_CURRENCIES_MAX} monedas como mucho.`,
    first: 'En el menú',
    up: (code: string) => `Subir ${code}`,
    remove: (code: string) => `Quitar ${code}`,
    referenceDropped: (code: string) =>
      `La moneda de referencia (${code}) ya no estará entre las aceptadas ni es la de ninguna sede: pasará a ser la de la sede activa.`,
    saved: 'Monedas aceptadas guardadas.',
    saveError: 'No pudimos guardar las monedas aceptadas. Intenta de nuevo.',
  },
  reference: {
    label: 'Moneda de referencia',
    sede: 'La de la sede activa',
    description: 'El menú dice cuánto vale cada moneda aceptada en esta: «1 USD = 918,77 Bs.».',
    changeLabel: 'Cambiar la moneda de referencia',
    dialogTitle: 'Moneda de referencia',
    dialogDescription:
      'Contra ella se muestran las equivalencias del menú. Tiene que ser una de las monedas aceptadas o la moneda de alguna sede. El cambio queda en la auditoría.',
    field: 'Moneda de referencia',
    saved: 'Moneda de referencia guardada.',
    saveError: 'No pudimos guardar la moneda de referencia. Intenta de nuevo.',
  },
  show: {
    label: 'Mostrar la tasa en el menú',
    changeLabel: 'Cambiar si se muestra la tasa en el menú',
    dialogTitle: 'Mostrar la tasa en el menú',
    dialogDescription: 'Quien cobra ve la tasa de hoy junto al selector de sede, y se pone al día sola.',
    legend: 'Cuándo se muestra',
    labels: { auto: 'Automático', always: 'Siempre', never: 'Nunca' } satisfies Record<ShowChoice, string>,
    hints: {
      auto: 'Se muestra si la clínica acepta alguna moneda distinta de la de referencia.',
      always: 'Se muestra aunque la clínica cobre en una sola moneda; sin monedas aceptadas, enseña la del USD.',
      never: 'No se muestra. Las monedas aceptadas siguen limitando el cobro.',
    } satisfies Record<ShowChoice, string>,
    saved: 'Preferencia del menú guardada.',
    saveError: 'No pudimos guardar la preferencia del menú. Intenta de nuevo.',
  },
};

const copy = clinicCurrenciesCopy;

function showChoiceOf(value: boolean | null): ShowChoice {
  return value === null ? 'auto' : value ? 'always' : 'never';
}

const SHOW_VALUE: Record<ShowChoice, boolean | null> = { auto: null, always: true, never: false };

/** Las monedas de las sedes de la clínica (la de referencia puede ser una de ellas). */
function useSedeCurrencies(token: string): string[] | null {
  const [currencies, setCurrencies] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLocations(token)
      .then((locations) => {
        if (cancelled) return;
        const codes = locations.map((l) => locationCurrency(l)).filter((c): c is string => c !== null);
        setCurrencies([...new Set(codes)].sort());
      })
      .catch(() => {
        // Sin sedes no se puede anticipar si la referencia sigue valiendo: la API lo dirá.
        if (!cancelled) setCurrencies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  return currencies;
}

type Dialog = 'accepted' | 'reference' | 'show';

/**
 * DX-584: Ajustes › Tasa de cambio › «Monedas de la clínica» (solo ADMIN). Las
 * monedas en que se cobra (vacía = cualquiera), la de referencia de la tasa
 * del menú y si el menú la enseña. Cada valor se cambia en su diálogo, como la
 * fuente y el plazo; tras guardar, `onSaved` (el padre avisa al menú).
 */
export function ClinicCurrenciesSettings({
  token,
  settings,
  onSaved,
}: {
  token: string;
  settings: ExchangeRateSettings;
  onSaved: (saved: ExchangeRateSettings) => void;
}) {
  const headingId = useId();
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<{ kind: Dialog; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  const sedeCurrencies = useSedeCurrencies(token);

  function openDialog(kind: Dialog) {
    setNotice('');
    setDialog((prev) => ({ kind, key: (prev?.key ?? 0) + 1 }));
    setOpen(true);
  }

  const accepted = settings.acceptedCurrencies;
  const show = showChoiceOf(settings.showRateInHeader);
  const changeButton = (kind: Dialog, label: string) => (
    <Button
      type="button"
      variant="secondary"
      className="shrink-0 max-sm:w-full"
      aria-label={label}
      onClick={() => openDialog(kind)}
    >
      {copy.change}
    </Button>
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader titleId={headingId} title={copy.heading} description={copy.description} />
      <SettingRows>
        <SettingRow
          label={copy.accepted.label}
          description={copy.accepted.description}
          value={
            <span data-testid="clinic-accepted-currencies">
              {accepted.length > 0 ? accepted.join(', ') : copy.accepted.any}
            </span>
          }
          isDefault={accepted.length === 0}
          action={changeButton('accepted', copy.accepted.changeLabel)}
        />
        <SettingRow
          label={copy.reference.label}
          description={copy.reference.description}
          value={
            <span data-testid="clinic-rate-reference">{settings.rateReferenceCurrency ?? copy.reference.sede}</span>
          }
          isDefault={settings.rateReferenceCurrency === null}
          action={changeButton('reference', copy.reference.changeLabel)}
        />
        <SettingRow
          label={copy.show.label}
          description={copy.show.hints[show]}
          value={<span data-testid="clinic-show-rate">{copy.show.labels[show]}</span>}
          isDefault={show === 'auto'}
          action={changeButton('show', copy.show.changeLabel)}
        />
      </SettingRows>
      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {dialog?.kind === 'accepted' ? (
        <AcceptedCurrenciesModal
          key={`accepted-${dialog.key}`}
          open={open}
          onOpenChange={setOpen}
          token={token}
          settings={settings}
          sedeCurrencies={sedeCurrencies}
          onSaved={(saved) => {
            onSaved(saved);
            setNotice(copy.accepted.saved);
          }}
        />
      ) : null}
      {dialog?.kind === 'reference' ? (
        <ReferenceModal
          key={`reference-${dialog.key}`}
          open={open}
          onOpenChange={setOpen}
          token={token}
          settings={settings}
          sedeCurrencies={sedeCurrencies}
          onSaved={(saved) => {
            onSaved(saved);
            setNotice(copy.reference.saved);
          }}
        />
      ) : null}
      {dialog?.kind === 'show' ? (
        <ShowRateModal
          key={`show-${dialog.key}`}
          open={open}
          onOpenChange={setOpen}
          token={token}
          current={show}
          onSaved={(saved) => {
            onSaved(saved);
            setNotice(copy.show.saved);
          }}
        />
      ) : null}
    </section>
  );
}

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  onSaved: (saved: ExchangeRateSettings) => void;
}

/** Guarda un cambio y cierra; el fallo (con el mensaje de la API) va arriba del modal. */
function useSave(
  token: string,
  onSaved: (s: ExchangeRateSettings) => void,
  onOpenChange: (o: boolean) => void,
  fallback: string,
) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(patch: ClinicCurrenciesPatch) {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveClinicCurrencies(token, patch);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, fallback));
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, save };
}

const ADD_ID = 'clinic-currency-add';

function AcceptedCurrenciesModal({
  open,
  onOpenChange,
  token,
  settings,
  sedeCurrencies,
  onSaved,
}: ModalProps & { settings: ExchangeRateSettings; sedeCurrencies: string[] | null }) {
  const [draft, setDraft] = useState<string[]>(settings.acceptedCurrencies);
  const [adding, setAdding] = useState('');
  const { saving, error, save } = useSave(token, onSaved, onOpenChange, copy.accepted.saveError);
  const listId = useId();
  const full = draft.length >= ACCEPTED_CURRENCIES_MAX;
  const reference = settings.rateReferenceCurrency;
  // Quitar la de referencia (si no es de ninguna sede) la deja sin valor: se
  // manda `null` en el mismo cambio (la de la sede activa) y se avisa antes.
  const dropsReference =
    reference !== null && !draft.includes(reference) && sedeCurrencies !== null && !sedeCurrencies.includes(reference);

  function add() {
    if (adding === '' || full || draft.includes(adding)) return;
    setDraft((prev) => [...prev, adding]);
    setAdding('');
  }

  function move(index: number) {
    setDraft((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const unchanged = draft.join(',') === settings.acceptedCurrencies.join(',');
    if (unchanged) {
      onOpenChange(false);
      return;
    }
    await save(
      dropsReference ? { acceptedCurrencies: draft, rateReferenceCurrency: null } : { acceptedCurrencies: draft },
    );
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.accepted.dialogTitle}
      description={copy.accepted.dialogDescription}
      onSubmit={handleSubmit}
      submitLabel={copy.save}
      submitting={saving}
      error={error}
      touchTargets
    >
      <div className="flex flex-col gap-2">
        <p id={listId} className="t-label text-ink">
          {copy.accepted.listLabel}
        </p>
        {draft.length === 0 ? (
          <p className="t-body text-muted">{copy.accepted.none}</p>
        ) : (
          <ol
            aria-labelledby={listId}
            className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border"
          >
            {draft.map((code, index) => (
              <li key={code} className="flex items-center gap-2 px-3 py-1.5">
                <span className="t-id min-w-0 flex-1 text-ink">
                  {code}
                  {index === 0 ? <span className="ml-2 text-xs text-muted">· {copy.accepted.first}</span> : null}
                </span>
                {index > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copy.accepted.up(code)}
                    title={copy.accepted.up(code)}
                    disabled={saving}
                    onClick={() => move(index)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy.accepted.remove(code)}
                  title={copy.accepted.remove(code)}
                  disabled={saving}
                  onClick={() => setDraft((prev) => prev.filter((c) => c !== code))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </div>
      <FormField htmlFor={ADD_ID} label={copy.accepted.addField} hint={full ? copy.accepted.max : undefined}>
        <div className="flex gap-2 max-sm:flex-col">
          <CurrencySelect
            id={ADD_ID}
            token={token}
            value={adding}
            onChange={setAdding}
            exclude={draft}
            placeholder={copy.accepted.addPlaceholder}
            disabled={full || saving}
            className="min-w-0 flex-1"
          />
          <Button type="button" variant="secondary" onClick={add} disabled={adding === '' || full || saving}>
            <Plus aria-hidden />
            {copy.accepted.add}
          </Button>
        </div>
      </FormField>
      {dropsReference ? (
        <Callout tone="neutral" icon={Info} role="status">
          <p>{copy.accepted.referenceDropped(reference)}</p>
        </Callout>
      ) : null}
    </FormModal>
  );
}

const REFERENCE_ID = 'clinic-rate-reference';

function ReferenceModal({
  open,
  onOpenChange,
  token,
  settings,
  sedeCurrencies,
  onSaved,
}: ModalProps & { settings: ExchangeRateSettings; sedeCurrencies: string[] | null }) {
  const [draft, setDraft] = useState(settings.rateReferenceCurrency ?? '');
  const { saving, error, save } = useSave(token, onSaved, onOpenChange, copy.reference.saveError);
  const choices = [...new Set([...settings.acceptedCurrencies, ...(sedeCurrencies ?? [])])];
  if (settings.rateReferenceCurrency && !choices.includes(settings.rateReferenceCurrency)) {
    choices.push(settings.rateReferenceCurrency);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = draft === '' ? null : draft;
    if (next === settings.rateReferenceCurrency) {
      onOpenChange(false);
      return;
    }
    await save({ rateReferenceCurrency: next });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.reference.dialogTitle}
      description={copy.reference.dialogDescription}
      onSubmit={handleSubmit}
      submitLabel={copy.save}
      submitting={saving}
      error={error}
      touchTargets
      fullScreenOnMobile={false}
    >
      <FormField htmlFor={REFERENCE_ID} label={copy.reference.field}>
        <CurrencySelect
          id={REFERENCE_ID}
          token={token}
          value={draft}
          onChange={setDraft}
          noneLabel={copy.reference.sede}
          only={choices}
          disabled={saving}
        />
      </FormField>
    </FormModal>
  );
}

function ShowRateModal({ open, onOpenChange, token, current, onSaved }: ModalProps & { current: ShowChoice }) {
  const [draft, setDraft] = useState<ShowChoice>(current);
  const { saving, error, save } = useSave(token, onSaved, onOpenChange, copy.show.saveError);
  const name = useId();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (draft === current) {
      onOpenChange(false);
      return;
    }
    await save({ showRateInHeader: SHOW_VALUE[draft] });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.show.dialogTitle}
      description={copy.show.dialogDescription}
      onSubmit={handleSubmit}
      submitLabel={copy.save}
      submitting={saving}
      error={error}
      touchTargets
    >
      <RadioGroup
        id={name}
        legend={copy.show.legend}
        value={draft}
        onValueChange={(v) => setDraft(v as ShowChoice)}
        disabled={saving}
        optionsClassName="gap-2"
      >
        {(['auto', 'always', 'never'] as const).map((choice) => (
          <RadioCard
            key={choice}
            value={choice}
            title={copy.show.labels[choice]}
            description={copy.show.hints[choice]}
          />
        ))}
      </RadioGroup>
    </FormModal>
  );
}
