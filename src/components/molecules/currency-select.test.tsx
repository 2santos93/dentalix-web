import { render, screen, waitFor } from '@testing-library/react';
import { CurrencySelect } from './currency-select';
import { listCurrencies } from '@/lib/reference/currencies-api';

jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
const mocked = listCurrencies as jest.MockedFunction<typeof listCurrencies>;

describe('CurrencySelect', () => {
  beforeEach(() => {
    mocked.mockReset().mockResolvedValue([
      { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
      { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    ]);
  });

  it('renders fetched currencies as "name (symbol)" options with code values', async () => {
    render(<CurrencySelect id="cur" token="tok" value="USD" onChange={() => {}} />);
    await waitFor(() => expect(mocked).toHaveBeenCalledWith('tok'));
    // The component is label-less on its own; query by role instead.
    const el = screen.getByRole('combobox') as HTMLSelectElement;
    await waitFor(() => {
      const opts = Array.from(el.options).map((o) => `${o.value}:${o.textContent}`);
      expect(opts).toEqual(expect.arrayContaining([
        'USD:Dólar estadounidense ($)',
        'COP:Peso colombiano ($)',
      ]));
    });
  });

  // WCAG 4.1.2: call sites with no adjacent `<label>` (e.g. a select placed
  // next to a button rather than inside a `FormField`) must still expose an
  // accessible name — `ariaLabel` covers that case.
  it('exposes an accessible name via the optional ariaLabel prop, for call sites with no <label>', async () => {
    render(
      <CurrencySelect id="cur" token="tok" value="USD" onChange={() => {}} ariaLabel="Moneda del nuevo plan" />,
    );
    expect(await screen.findByLabelText(/moneda del nuevo plan/i)).toBe(screen.getByRole('combobox'));
  });
});
