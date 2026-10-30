import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import type { HourCycle } from '@/lib/format/regional-format';
import { RegionalSettingsFields, regionalSettingsFieldsCopy } from './regional-settings-fields';
import { COUNTRIES } from '@/lib/locations/countries';
import { listCurrencies } from '@/lib/reference/currencies-api';
import {
  canonicalLocale,
  regionalPreview,
  timeZoneOptions,
  validateRegionalSettings,
  type RegionalSettingsErrors,
  type RegionalSettingsValues,
} from '@/lib/locations/regional-settings';
import { setupUser } from '@/lib/test/user';
import { chooseCountry } from '@/lib/test/country';

jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));

const EMPTY: RegionalSettingsValues = { country: '', currency: '', timeZone: '', locale: '', hourCycle: '' };

function Harness({
  initial = EMPTY,
  suggestions,
  loader,
  errors = {},
}: {
  initial?: RegionalSettingsValues;
  suggestions?: { country?: string | null; timeZone: string | null; locale: string | null; hourCycle: HourCycle | null };
  loader?: () => Promise<{ code: string; name: string; symbol: string }[]>;
  errors?: RegionalSettingsErrors;
}) {
  const [values, setValues] = useState(initial);
  return (
    <form aria-label="sede">
      <RegionalSettingsFields
        idPrefix="t"
        values={values}
        onChange={(field, value) => setValues((prev) => ({ ...prev, [field]: value }))}
        errors={errors}
        {...(loader ? { currencyLoader: loader } : { token: 'tok' })}
        suggestions={suggestions && { country: null, ...suggestions }}
      />
    </form>
  );
}

beforeEach(() => {
  jest.mocked(listCurrencies).mockReset().mockResolvedValue([{ code: 'EUR', name: 'Euro', symbol: '€' }]);
});

describe('RegionalSettingsFields', () => {
  it('currency starts empty and the country is suggested only from an explicit browser region', async () => {
    // Sin región explícita no hay sugerencia: el país empieza vacío.
    const { unmount } = render(<Harness suggestions={{ timeZone: 'Asia/Tokyo', locale: 'ja-JP', hourCycle: 'h23' }} />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    expect(screen.getByLabelText('País')).toHaveValue('');
    expect(screen.getByLabelText('País')).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
    expect(screen.getByLabelText('Moneda')).toHaveValue('');
    unmount();

    // Con la región del navegador (es-VE → VE), el país llega sugerido; la moneda nunca.
    render(
      <Harness
        initial={{ ...EMPTY, country: 'VE' }}
        suggestions={{ country: 'VE', timeZone: null, locale: null, hourCycle: null }}
      />,
    );
    await screen.findByRole('option', { name: 'Euro (€)' });
    expect(screen.getByLabelText('País')).toHaveValue('Venezuela');
    expect(screen.getByLabelText('Moneda')).toHaveValue('');
  });

  it('the country picker offers every country of the shared list by name', async () => {
    const user = setupUser();
    render(<Harness />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    const country = screen.getByRole('combobox', { name: 'País' });
    await user.click(country);
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(COUNTRIES.map((c) => c.name));
    expect(options).toHaveLength(250);
    await chooseCountry(user, country, 'VE');
    expect(country).toHaveValue('Venezuela');
  });

  it('the country hint promises nothing about phones and changes nothing else', async () => {
    render(<Harness />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    const hint = 'País donde está la sede. No cambia la moneda, la zona ni el formato.';
    expect(regionalSettingsFieldsCopy.countryHint).toBe(hint);
    expect(screen.getByLabelText('País')).toHaveAccessibleDescription(hint);
    expect(hint).not.toMatch(/receta|tel[eé]fono|indicativo/i);
  });

  it('a suggested country carries the mark until changed', async () => {
    const user = setupUser();
    render(
      <Harness
        initial={{ ...EMPTY, country: 'VE' }}
        suggestions={{ country: 'VE', timeZone: null, locale: null, hourCycle: null }}
      />,
    );
    await screen.findByRole('option', { name: 'Euro (€)' });
    const country = screen.getByLabelText('País');
    expect(country).toHaveAccessibleDescription(
      'Sugerido por tu navegador. País donde está la sede. No cambia la moneda, la zona ni el formato.',
    );
    await chooseCountry(user, country, 'PE');
    expect(country).toHaveValue('Perú');
    expect(country).toHaveAccessibleDescription('País donde está la sede. No cambia la moneda, la zona ni el formato.');
  });

  it('choosing a country changes nothing else', async () => {
    const user = setupUser();
    const initial: RegionalSettingsValues = {
      country: '',
      currency: 'EUR',
      timeZone: 'Asia/Tokyo',
      locale: 'ja-JP',
      hourCycle: 'h23',
    };
    render(<Harness initial={initial} />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    for (const code of ['VE', 'ES']) {
      await chooseCountry(user, screen.getByLabelText('País'), code);
      expect(screen.getByLabelText('Moneda')).toHaveValue('EUR');
      expect(screen.getByLabelText('Zona horaria')).toHaveValue('Asia/Tokyo');
      expect(screen.getByLabelText('Formato regional')).toHaveValue('ja-JP');
      expect(within(screen.getByRole('radiogroup', { name: 'Reloj' })).getByRole('radio', { name: '24 h' })).toBeChecked();
    }
  });

  it('a country error is announced on the field', async () => {
    render(<Harness errors={{ country: 'Elige el país de la sede.' }} />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    const country = screen.getByRole('combobox', { name: 'País' });
    expect(country).toHaveAttribute('aria-invalid', 'true');
    expect(country).toHaveAccessibleDescription('Elige el país de la sede.');
  });

  it('shows a live preview with the chosen format and zone', async () => {
    const user = setupUser();
    render(<Harness initial={{ ...EMPTY, timeZone: 'UTC', locale: 'de-DE' }} />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    expect(screen.getByText(/^Vista previa: 12\.345,67 · /)).toBeInTheDocument();
    // Describe el campo de formato (sin `aria-live`, que anunciaría cada tecla).
    expect(screen.getByLabelText('Formato regional')).toHaveAccessibleDescription(expect.stringContaining('Vista previa: 12.345,67'));
    await user.clear(screen.getByLabelText('Formato regional'));
    await user.type(screen.getByLabelText('Formato regional'), 'en-US');
    expect(screen.getByText(/^Vista previa: 12,345\.67 · /)).toBeInTheDocument();
  });

  describe('with a fixed clock', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('clock option examples and preview follow the chosen clock and locale', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-26T15:05:00.000Z'), advanceTimers: true });
      const user = setupUser();
      render(<Harness initial={{ ...EMPTY, timeZone: 'UTC', locale: 'en-US' }} />);
      await screen.findByRole('option', { name: 'Euro (€)' });
      const clock = screen.getByRole('radiogroup', { name: 'Reloj' });
      const h12 = within(clock).getByRole('radio', { name: '12 h' });
      const h23 = within(clock).getByRole('radio', { name: '24 h' });
      // Sin reloj elegido: ninguna opción marcada y la vista previa sin hora.
      expect(h12).not.toBeChecked();
      expect(h23).not.toBeChecked();
      expect(h12).toHaveAccessibleDescription('3:05 p. m.');
      expect(h23).toHaveAccessibleDescription('15:05');
      expect(screen.getByText('Vista previa: 12,345.67 · 10/26/2026')).toBeInTheDocument();

      await user.click(h12);
      expect(h12).toBeChecked();
      expect(screen.getByText('Vista previa: 12,345.67 · 10/26/2026 3:05 p. m.')).toBeInTheDocument();

      await user.clear(screen.getByLabelText('Formato regional'));
      await user.type(screen.getByLabelText('Formato regional'), 'de-DE');
      await user.click(h23);
      expect(screen.getByText('Vista previa: 12.345,67 · 26.10.2026 15:05')).toBeInTheDocument();

      // Los ejemplos son la hora en la zona elegida.
      await user.clear(screen.getByLabelText('Zona horaria'));
      await user.type(screen.getByLabelText('Zona horaria'), 'Asia/Tokyo');
      expect(h12).toHaveAccessibleDescription('12:05 a. m.');
      expect(h23).toHaveAccessibleDescription('00:05');
      expect(screen.getByText('Vista previa: 12.345,67 · 27.10.2026 00:05')).toBeInTheDocument();
    });
  });

  it('format and clock suggested by the browser carry the mark until changed', async () => {
    const user = setupUser();
    render(
      <Harness
        initial={{ ...EMPTY, timeZone: 'Asia/Tokyo', locale: 'ja-JP', hourCycle: 'h23' }}
        suggestions={{ timeZone: 'Asia/Tokyo', locale: 'ja-JP', hourCycle: 'h23' }}
      />,
    );
    await screen.findByRole('option', { name: 'Euro (€)' });
    const clock = screen.getByRole('radiogroup', { name: 'Reloj' });
    expect(within(clock).getByRole('radio', { name: '24 h' })).toBeChecked();
    expect(clock).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));
    expect(screen.getByLabelText('Formato regional')).toHaveAccessibleDescription(
      expect.stringContaining('Sugerido por tu navegador.'),
    );
    await user.click(within(clock).getByRole('radio', { name: '12 h' }));
    expect(clock).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
  });

  it('a clock error is announced on the group, next to the field', async () => {
    render(<Harness errors={{ hourCycle: 'Elige el reloj de la sede: 12 h o 24 h.' }} />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    const clock = screen.getByRole('radiogroup', { name: 'Reloj' });
    expect(clock).toHaveAccessibleDescription('Elige el reloj de la sede: 12 h o 24 h.');
    expect(clock).toHaveAttribute('aria-invalid', 'true');
    expect(within(clock).getByRole('alert')).toHaveTextContent('Elige el reloj de la sede: 12 h o 24 h.');
    // También en cada opción: no todos los lectores anuncian la descripción del grupo.
    for (const name of ['12 h', '24 h']) {
      expect(within(clock).getByRole('radio', { name })).toHaveAccessibleDescription(
        expect.stringContaining('Elige el reloj de la sede: 12 h o 24 h.'),
      );
    }
  });

  it('the preview follows the format field and the clock spans the row below it (no empty half-row)', async () => {
    render(<Harness initial={{ ...EMPTY, timeZone: 'UTC', locale: 'en-US', hourCycle: 'h12' }} />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    const preview = screen.getByText(/^Vista previa: /);
    const clock = screen.getByRole('radiogroup', { name: 'Reloj' });
    // Orden del DOM = orden de la rejilla: formato, vista previa, reloj.
    expect(screen.getByLabelText('Formato regional').compareDocumentPosition(preview)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(preview.compareDocumentPosition(clock)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(preview).toHaveClass('sm:col-span-2');
    expect(clock).toHaveClass('sm:col-span-2');
  });

  it('without a session the currencies come from the loader (R18)', async () => {
    const loader = jest.fn().mockResolvedValue([{ code: 'JPY', name: 'Yen japonés', symbol: '¥' }]);
    render(<Harness loader={loader} />);
    expect(await screen.findByRole('option', { name: 'Yen japonés (¥)' })).toBeInTheDocument();
    expect(listCurrencies).not.toHaveBeenCalled();
  });
});

describe('regional-settings helpers', () => {
  it('canonicalLocale canonicalizes and rejects invalid tags', () => {
    expect(canonicalLocale('ES-mx')).toBe('es-MX');
    expect(canonicalLocale('  ja-jp ')).toBe('ja-JP');
    expect(canonicalLocale('no_es_un_locale')).toBeNull();
    expect(canonicalLocale('')).toBeNull();
  });

  it('timeZoneOptions keeps extra zones not listed by the runtime, once', () => {
    const zones = timeZoneOptions(['UTC', 'UTC', null, '']);
    expect(zones.filter((z) => z === 'UTC')).toHaveLength(1);
    expect(zones).toContain('Asia/Tokyo');
  });

  it('regionalPreview uses the helper with the chosen clock; it needs a valid format and zone', () => {
    const at = new Date('2026-10-26T15:30:00Z');
    expect(regionalPreview('de-DE', 'UTC', 'h23', at)).toBe('12.345,67 · 26.10.2026 15:30');
    expect(regionalPreview('de-DE', 'Asia/Tokyo', 'h23', at)).toBe('12.345,67 · 27.10.2026 00:30');
    expect(regionalPreview('en-US', 'UTC', 'h12', at)).toBe('12,345.67 · 10/26/2026 3:30 p. m.');
    expect(regionalPreview('fr-FR', 'UTC', 'h12', at)).toBe('12\u202f345,67 · 26/10/2026 3:30 p. m.');
    // Sin reloj elegido, sin hora: nunca uno deducido del formato.
    expect(regionalPreview('en-US', 'UTC', '', at)).toBe('12,345.67 · 10/26/2026');
    expect(regionalPreview('ja-JP', 'Marte/Olimpo', 'h23', at)).toBeNull();
    expect(regionalPreview('', 'UTC', 'h23', at)).toBeNull();
  });

  it('regionalPreview with a stored clock that is not valid shows no time and does not throw', () => {
    const at = new Date('2026-10-26T15:30:00Z');
    // Un reloj guardado fuera de h12/h23 (API inesperada): ni se adivina otro ni rompe el modal.
    expect(() => regionalPreview('en-US', 'UTC', 'h11', at)).not.toThrow();
    expect(regionalPreview('en-US', 'UTC', 'h11', at)).toBe('12,345.67 · 10/26/2026');
    expect(regionalPreview('de-DE', 'UTC', 'cualquiera', at)).toBe('12.345,67 · 26.10.2026');
  });

  it('validateRegionalSettings uses the API messages', () => {
    expect(validateRegionalSettings(EMPTY)).toEqual({
      country: 'Elige el país de la sede.',
      currency: 'Elige la moneda de la sede.',
      timeZone: 'Elige la zona horaria de la sede.',
      locale: 'Elige el formato regional de la sede.',
      hourCycle: 'Elige el reloj de la sede: 12 h o 24 h.',
    });
    expect(
      validateRegionalSettings({ country: 'ES', currency: 'EUR', timeZone: 'UTC', locale: 'de-DE', hourCycle: 'h23' }),
    ).toEqual({});
    expect(
      validateRegionalSettings({
        country: 'ES',
        currency: 'EUR',
        timeZone: 'UTC',
        locale: 'en-US',
        hourCycle: 'h11' as RegionalSettingsValues['hourCycle'],
      }),
    ).toEqual({ hourCycle: 'El reloj «h11» no es válido: elige 12 h o 24 h.' });
  });

  it('validateRegionalSettings rejects a code that is not in the list with the API message', () => {
    const valid = { currency: 'EUR', timeZone: 'UTC', locale: 'de-DE', hourCycle: 'h23' } as const;
    expect(validateRegionalSettings({ ...valid, country: 'VE' })).toEqual({});
    expect(validateRegionalSettings({ ...valid, country: 'ZZ' })).toEqual({
      country: 'El país «ZZ» no está en la lista de países.',
    });
  });
});
