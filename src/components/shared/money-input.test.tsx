import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoneyInput, MONEY_PREVIEW_DELAY_MS } from './money-input';

function Harness({
  currency = 'USD',
  initial = '',
  invalid = false,
}: {
  currency?: string;
  initial?: string;
  invalid?: boolean;
}) {
  const [text, setText] = React.useState(initial);
  return (
    <>
      <label htmlFor="amount">Importe</label>
      <MoneyInput
        id="amount"
        currency={currency}
        value={text}
        onValueChange={setText}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? 'amount-error' : undefined}
      />
    </>
  );
}

function preview(): HTMLElement {
  return document.getElementById('amount-preview') as HTMLElement;
}

describe('MoneyInput (DX-241)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function type() {
    return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  }

  it('es un campo de texto con teclado decimal, no type=number', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Importe');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('enseña «Se guardará» con el importe interpretado al dejar de teclear, en una región polite', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Importe');
    expect(preview()).toHaveAttribute('aria-live', 'polite');
    expect(preview()).toBeEmptyDOMElement();
    await type().type(input, '150.50');
    // Mientras se teclea no cambia: el lector lo anuncia una vez, no por tecla.
    expect(preview()).toBeEmptyDOMElement();
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview()).toHaveTextContent(/^Se guardará: 150,50\sUS\$$/);
  });

  it('el campo apunta a la vista previa con aria-describedby, junto al error que pase el formulario', () => {
    const { unmount } = render(<Harness />);
    expect(screen.getByLabelText('Importe')).toHaveAttribute('aria-describedby', 'amount-preview');
    unmount();
    render(<Harness invalid />);
    expect(screen.getByLabelText('Importe')).toHaveAttribute('aria-describedby', 'amount-error amount-preview');
  });

  it('un texto ambiguo dice por qué en la vista previa', async () => {
    render(<Harness />);
    await type().type(screen.getByLabelText('Importe'), '1.50.0');
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview()).toHaveTextContent('No sabemos leer «1.50.0»');
    expect(preview()).not.toHaveTextContent('Se guardará');
  });

  it('con el error del formulario a la vista, la vista previa calla (no se repite)', () => {
    render(<Harness initial="1.50.0" invalid />);
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview()).toBeEmptyDOMElement();
  });

  it('los decimales salen de la moneda: COP sin céntimos', async () => {
    render(<Harness currency="COP" />);
    await type().type(screen.getByLabelText('Importe'), '150.000');
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview()).toHaveTextContent(/^Se guardará: 150\.000,00\sCOP$/);
  });

  it('sin moneda, el importe sin símbolo', () => {
    render(<Harness currency="" initial="15.000,5" />);
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview()).toHaveTextContent(/^Se guardará: 15\.000,50$/);
  });
});
