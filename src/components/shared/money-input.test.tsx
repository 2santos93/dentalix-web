import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoneyInput, MONEY_PREVIEW_DELAY_MS } from './money-input';
import { moneyWithCode, NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { testAgendaClock } from '@/lib/test/sede-clock';

const caracasMoney = stampPainters(testAgendaClock([STAMP_SEDES.caracas, STAMP_SEDES.berlin])).money;
const berlinMoney = stampPainters(testAgendaClock([STAMP_SEDES.berlin, STAMP_SEDES.caracas])).money;

function Harness({
  currency = 'USD',
  initial = '',
  invalid = false,
  requirePositive = false,
  money = caracasMoney,
}: {
  money?: (amount: number, currency: string) => string;
  currency?: string;
  initial?: string;
  invalid?: boolean;
  requirePositive?: boolean;
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
        requirePositive={requirePositive}
        money={money}
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
    expect(preview()).toHaveTextContent(/^Se guardará: USD\s150,50$/);
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

  it('en VES, miles y céntimos se leen como en el resto de monedas', async () => {
    render(<Harness currency="VES" />);
    await type().type(screen.getByLabelText('Importe'), '150.000,50');
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview()).toHaveTextContent(/^Se guardará: VES\s150\.000,50$/);
  });

  it('sin moneda elegida no promete ningún formato', () => {
    render(<Harness currency="" initial="15.000,5" />);
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview()).toBeEmptyDOMElement();
  });

  // DX-354b: la vista previa usa el formato de la sede de la pantalla, no uno fijo.
  it('la vista previa sale con el formato de la sede: Caracas «VES 1.234,50», Berlín «1.234,50 VES», Miami «USD 1,234.50»', async () => {
    const miami = stampPainters(testAgendaClock([STAMP_SEDES.miami, STAMP_SEDES.caracas])).money;
    const { unmount } = render(<Harness currency="VES" money={caracasMoney} />);
    await type().type(screen.getByLabelText('Importe'), '1234,5');
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview().textContent).toBe(`Se guardará: ${moneyWithCode(1234.5, 'VES', STAMP_FORMATS.caracas)}`);
    unmount();
    const berlinRender = render(<Harness currency="VES" money={berlinMoney} />);
    await type().type(screen.getByLabelText('Importe'), '1234,5');
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview().textContent).toBe(`Se guardará: ${moneyWithCode(1234.5, 'VES', STAMP_FORMATS.berlin)}`);
    berlinRender.unmount();
    render(<Harness currency="USD" money={miami} />);
    await type().type(screen.getByLabelText('Importe'), '1234,5');
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview().textContent).toBe(`Se guardará: ${moneyWithCode(1234.5, 'USD', STAMP_FORMATS.miami)}`);
  });

  it('sin formato de sede («—») la vista previa calla en vez de prometer «—»', () => {
    render(<Harness initial="150,50" money={() => NO_SEDE_FORMAT} />);
    act(() => jest.advanceTimersByTime(MONEY_PREVIEW_DELAY_MS));
    expect(preview()).toBeEmptyDOMElement();
  });

  // QA DX-241: «Se guardará: 0,00» prometía algo que el envío rechaza.
  it('con requirePositive, «0» avisa en la vista previa en vez de prometer «Se guardará: 0,00»', () => {
    render(<Harness requirePositive initial="0" />);
    expect(preview()).toHaveTextContent(/^Escribe un importe mayor que 0\.$/);
  });

  it('sin requirePositive, «0» se guarda como 0 (fondo de caja, arqueo)', () => {
    render(<Harness initial="0" />);
    expect(preview()).toHaveTextContent(/^Se guardará: USD\s0,00$/);
  });
});
