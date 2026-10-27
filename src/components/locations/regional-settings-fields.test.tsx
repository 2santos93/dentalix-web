import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import { RegionalSettingsFields } from './regional-settings-fields';
import { listCurrencies } from '@/lib/reference/currencies-api';
import {
  canonicalLocale,
  regionalPreview,
  timeZoneOptions,
  validateRegionalSettings,
  type RegionalSettingsValues,
} from '@/lib/locations/regional-settings';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));

const EMPTY: RegionalSettingsValues = { country: '', currency: '', timeZone: '', locale: '' };

function Harness({
  initial = EMPTY,
  suggestions,
  loader,
}: {
  initial?: RegionalSettingsValues;
  suggestions?: { timeZone: string | null; locale: string | null };
  loader?: () => Promise<{ code: string; name: string; symbol: string }[]>;
}) {
  const [values, setValues] = useState(initial);
  return (
    <form aria-label="sede">
      <RegionalSettingsFields
        idPrefix="t"
        values={values}
        onChange={(field, value) => setValues((prev) => ({ ...prev, [field]: value }))}
        errors={{}}
        token={loader ? undefined : 'tok'}
        currencyLoader={loader}
        suggestions={suggestions}
      />
    </form>
  );
}

beforeEach(() => {
  jest.mocked(listCurrencies).mockReset().mockResolvedValue([{ code: 'EUR', name: 'Euro', symbol: '€' }]);
});

describe('RegionalSettingsFields', () => {
  it('country and currency start empty and are never suggested', async () => {
    render(<Harness suggestions={{ timeZone: 'Asia/Tokyo', locale: 'ja-JP' }} />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    expect(screen.getByLabelText('País')).toHaveValue('');
    expect(screen.getByLabelText('Moneda')).toHaveValue('');
    expect(within(screen.getByLabelText('País')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Elige el país',
      'Colombia',
      'España',
    ]);
  });

  it('shows a live preview with the chosen format and zone', async () => {
    const user = setupUser();
    render(<Harness initial={{ ...EMPTY, timeZone: 'UTC', locale: 'de-DE' }} />);
    await screen.findByRole('option', { name: 'Euro (€)' });
    expect(screen.getByText(/^Vista previa: 1\.234,56 · /)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Formato regional'));
    await user.type(screen.getByLabelText('Formato regional'), 'en-US');
    expect(screen.getByText(/^Vista previa: 1,234\.56 · /)).toBeInTheDocument();
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

  it('regionalPreview needs both a valid format and a valid zone', () => {
    const at = new Date('2026-10-26T15:30:00Z');
    expect(regionalPreview('de-DE', 'UTC', at)).toBe('1.234,56 · 26.10.2026, 15:30');
    expect(regionalPreview('de-DE', 'Asia/Tokyo', at)).toBe('1.234,56 · 27.10.2026, 00:30');
    expect(regionalPreview('es-ES', 'Marte/Olimpo', at)).toBeNull();
    expect(regionalPreview('', 'UTC', at)).toBeNull();
  });

  it('validateRegionalSettings uses the API messages', () => {
    expect(validateRegionalSettings(EMPTY)).toEqual({
      country: 'Elige el país de la sede.',
      currency: 'Elige la moneda de la sede.',
      timeZone: 'Elige la zona horaria de la sede.',
      locale: 'Elige el formato regional de la sede.',
    });
    expect(
      validateRegionalSettings({ country: 'ES', currency: 'EUR', timeZone: 'UTC', locale: 'es-ES' }),
    ).toEqual({});
  });
});
