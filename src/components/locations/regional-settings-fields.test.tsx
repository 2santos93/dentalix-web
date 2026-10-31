import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import { RegionalSettingsFields, regionalSettingsFieldsCopy as copy } from './regional-settings-fields';
import type { CountryField, RegionalSource } from '@/lib/locations/use-regional-draft';
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
import { chooseCountry, chooseRegionalOption } from '@/lib/test/country';

jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));

const EMPTY: RegionalSettingsValues = { country: '', currency: '', timeZone: '', locale: '', hourCycle: '' };

function Harness({
  initial = EMPTY,
  sources,
  proposals,
  onAccept,
  loader,
  errors = {},
}: {
  initial?: RegionalSettingsValues;
  sources?: Partial<Record<keyof RegionalSettingsValues, RegionalSource>>;
  proposals?: Partial<Record<CountryField, string>>;
  onAccept?: (field: CountryField) => void;
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
        sources={sources}
        proposals={proposals}
        onAcceptProposal={onAccept}
      />
    </form>
  );
}

beforeEach(() => {
  jest.mocked(listCurrencies).mockReset().mockResolvedValue([
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'VES', name: 'Bolívar venezolano', symbol: 'Bs.' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
  ]);
});

const ready = () => screen.findByRole('option', { name: 'Euro (€)' });

describe('RegionalSettingsFields', () => {
  it('shows each suggestion with where it comes from', async () => {
    render(
      <Harness
        initial={{ country: 'VE', currency: 'VES', timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' }}
        sources={{ country: 'browser', currency: 'country', timeZone: 'browser', locale: 'country', hourCycle: 'browser' }}
      />,
    );
    await ready();
    expect(screen.getByLabelText('País')).toHaveValue('Venezuela');
    expect(screen.getByLabelText('País')).toHaveAccessibleDescription(`Sugerido por tu navegador. ${copy.countryHint}`);
    expect(screen.getByLabelText('Moneda')).toHaveValue('VES');
    expect(screen.getByLabelText('Moneda')).toHaveAccessibleDescription(`Sugerido por el país. ${copy.currencyHint}`);
    expect(screen.getByLabelText('Zona horaria')).toHaveAccessibleDescription(
      `Sugerido por tu navegador. ${copy.timeZoneHint}`,
    );
    expect(screen.getByLabelText('Formato regional')).toHaveAccessibleDescription(
      expect.stringContaining(`Sugerido por el país. ${copy.localeHint}`),
    );
    const clock = screen.getByRole('radiogroup', { name: 'Reloj' });
    expect(clock).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));
  });

  it('zone and format show human labels, never the raw IANA id or BCP 47 tag', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-31T12:00:00.000Z'), advanceTimers: true });
    try {
      render(
        <Harness initial={{ country: 'VE', currency: 'VES', timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' }} />,
      );
      await ready();
      expect(screen.getByRole('combobox', { name: 'Zona horaria' })).toHaveValue('(UTC−4) Caracas — Venezuela');
      expect(screen.getByRole('combobox', { name: 'Formato regional' })).toHaveValue(
        'Español (Venezuela) — 12.345,67 · 31/10/2026',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('the zone list puts the zones of the country first and finds a zone by city, country or id', async () => {
    const user = setupUser();
    render(<Harness initial={{ ...EMPTY, country: 'VE' }} />);
    await ready();
    const zone = screen.getByRole('combobox', { name: 'Zona horaria' });
    await user.click(zone);
    const options = within(screen.getByRole('listbox', { name: 'Zonas horarias' })).getAllByRole('option');
    expect(options[0]).toHaveTextContent(/Caracas — Venezuela$/);
    await user.keyboard('{Escape}');
    for (const query of ['caracas', 'venezuela', 'America/Caracas']) {
      await chooseRegionalOption(user, zone, query);
      expect(zone).toHaveValue('(UTC−4) Caracas — Venezuela');
    }
  });

  it('a typed zone that matches nothing is never kept', async () => {
    const user = setupUser();
    render(<Harness initial={{ ...EMPTY, timeZone: 'UTC' }} />);
    await ready();
    const zone = screen.getByRole('combobox', { name: 'Zona horaria' });
    await user.clear(zone);
    await user.type(zone, 'Marte/Olimpo');
    expect(screen.getByRole('option', { name: 'Ninguna zona coincide.' })).toBeInTheDocument();
    await user.tab();
    expect(zone).toHaveValue('UTC');
  });

  it('warns when the zone is not one of the country', async () => {
    render(<Harness initial={{ ...EMPTY, country: 'VE', timeZone: 'America/Bogota' }} />);
    await ready();
    expect(screen.getByLabelText('Zona horaria')).toHaveAccessibleDescription(
      expect.stringContaining('No es una zona de Venezuela: las suyas salen primero en la lista.'),
    );
  });

  it('offers what the country proposes for a field it does not follow, and applies it only when asked', async () => {
    const user = setupUser();
    const onAccept = jest.fn();
    render(
      <Harness
        initial={{ country: 'VE', currency: 'EUR', timeZone: 'Europe/Madrid', locale: 'es-ES', hourCycle: 'h23' }}
        proposals={{ currency: 'VES', timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' }}
        onAccept={onAccept}
      />,
    );
    await ready();
    expect(screen.getByText('En Venezuela se usa VES.')).toBeInTheDocument();
    expect(screen.getByLabelText('Moneda')).toHaveValue('EUR');
    await user.click(screen.getByRole('button', { name: 'Usar VES' }));
    expect(onAccept).toHaveBeenCalledWith('currency');
    expect(screen.getByText(/^Zona de Venezuela: \(UTC−4\) Caracas — Venezuela\.$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usar esta zona' }));
    expect(onAccept).toHaveBeenCalledWith('timeZone');
    expect(screen.getByText('Formato de Venezuela: Español (Venezuela).')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usar este formato' }));
    // El reloj va con el formato.
    expect(onAccept).toHaveBeenCalledWith('locale');
    expect(onAccept).toHaveBeenCalledWith('hourCycle');
  });

  it('the country picker offers every country of the shared list by name', async () => {
    const user = setupUser();
    render(<Harness />);
    await ready();
    const country = screen.getByRole('combobox', { name: 'País' });
    await user.click(country);
    const options = within(screen.getByRole('listbox', { name: 'Países' })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(COUNTRIES.map((c) => c.name));
    expect(options).toHaveLength(250);
    await chooseCountry(user, country, 'VE');
    expect(country).toHaveValue('Venezuela');
  });

  it('the country hint says it proposes, and promises nothing about phones', async () => {
    render(<Harness />);
    await ready();
    expect(screen.getByLabelText('País')).toHaveAccessibleDescription(copy.countryHint);
    expect(copy.countryHint).not.toMatch(/receta|tel[eé]fono|indicativo/i);
  });

  it('a country error is announced on the field', async () => {
    render(<Harness errors={{ country: 'Elige el país de la sede.' }} />);
    await ready();
    const country = screen.getByRole('combobox', { name: 'País' });
    expect(country).toHaveAttribute('aria-invalid', 'true');
    expect(country).toHaveAccessibleDescription('Elige el país de la sede.');
  });

  it('shows a live preview with the chosen format and zone', async () => {
    const user = setupUser();
    render(<Harness initial={{ ...EMPTY, timeZone: 'UTC', locale: 'de-DE' }} />);
    await ready();
    expect(screen.getByText(/^Vista previa: 12\.345,67 · /)).toBeInTheDocument();
    // Describe el campo de formato (sin `aria-live`, que anunciaría cada tecla).
    expect(screen.getByLabelText('Formato regional')).toHaveAccessibleDescription(
      expect.stringContaining('Vista previa: 12.345,67'),
    );
    await chooseRegionalOption(user, screen.getByLabelText('Formato regional'), 'en-US');
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
      await ready();
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

      await chooseRegionalOption(user, screen.getByLabelText('Formato regional'), 'de-DE');
      await user.click(h23);
      expect(screen.getByText('Vista previa: 12.345,67 · 26.10.2026 15:05')).toBeInTheDocument();

      // Los ejemplos son la hora en la zona elegida.
      await chooseRegionalOption(user, screen.getByLabelText('Zona horaria'), 'Asia/Tokyo');
      expect(h12).toHaveAccessibleDescription('12:05 a. m.');
      expect(h23).toHaveAccessibleDescription('00:05');
      expect(screen.getByText('Vista previa: 12.345,67 · 27.10.2026 00:05')).toBeInTheDocument();
    });
  });

  it('a clock error is announced on the group, next to the field', async () => {
    render(<Harness errors={{ hourCycle: 'Elige el reloj de la sede: 12 h o 24 h.' }} />);
    await ready();
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
    await ready();
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
