import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('with a loader (no session) reads the list from it and never from GET /currencies', async () => {
    const loader = jest.fn().mockResolvedValue([{ code: 'JPY', name: 'Yen japonés', symbol: '¥' }]);
    render(<CurrencySelect id="cur" loader={loader} value="" placeholder="Elige la moneda" onChange={() => {}} />);
    expect(await screen.findByRole('option', { name: 'Yen japonés (¥)' })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(mocked).not.toHaveBeenCalled();
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

  // DX-063 / FE-013: un fallo al cargar las monedas no se esconde detrás de un
  // select con una sola opción: escalón 2 (FieldError) con reintento.
  it('si la lista falla, sustituye el control por un FieldError con reintento', async () => {
    mocked.mockReset()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([{ code: 'COP', name: 'Peso colombiano', symbol: '$' }]);
    const user = userEvent.setup();
    render(<CurrencySelect id="cur" token="tok" value="COP" onChange={() => {}} className="w-44" />);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Monedas no disponibles');
    expect(status).toHaveClass('h-10', 'w-44');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    // Revisión M-4: el `<label htmlFor="cur">` del padre sigue teniendo destino.
    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveAttribute('id', 'cur');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    const el = (await screen.findByRole('combobox')) as HTMLSelectElement;
    await waitFor(() => expect(el.options[0]?.textContent).toBe('Peso colombiano ($)'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mocked).toHaveBeenCalledTimes(2);
  });
});
