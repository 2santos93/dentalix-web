import { render, screen } from '@testing-library/react';
import { QuoteValidity } from './quote-validity';
import { STAMP_FORMATS, STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { stampPainters } from '@/lib/locations/sede-stamp';

const stamp = testStamp([STAMP_SEDES.caracas, STAMP_SEDES.berlin]);
const caracas = STAMP_FORMATS.caracas.civilDate('2026-12-09');
const berlin = STAMP_FORMATS.berlin.civilDate('2026-12-09');

describe('QuoteValidity (DX-379)', () => {
  it('vencido: chip danger «Vencido el …» con el formato de la sede del dato', () => {
    render(<QuoteValidity validUntil="2026-12-09" expired locationId="sede-berlin" stamp={stamp} />);
    const chip = screen.getByTestId('quote-expired');
    expect(chip).toHaveTextContent(`Vencido el ${berlin}`);
    expect(chip).toHaveAttribute('data-status', 'EXPIRED');
    expect(chip.className).toMatch(/danger/);
    expect(berlin).not.toBe(caracas);
  });

  it('vigente: línea secundaria «Válido hasta el …», sin chip', () => {
    render(<QuoteValidity validUntil="2026-12-09" expired={false} locationId="sede-caracas" stamp={stamp} />);
    expect(screen.getByTestId('quote-valid-until')).toHaveTextContent(`Válido hasta el ${caracas}`);
    expect(screen.queryByTestId('quote-expired')).not.toBeInTheDocument();
  });

  it('sin fechas (plan anterior): nada', () => {
    const { container } = render(<QuoteValidity validUntil={null} expired={false} stamp={stamp} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sin formato de la sede: «—» en la frase; en una celda de móvil, nada', () => {
    const noClock = stampPainters(null);
    const { unmount } = render(<QuoteValidity validUntil="2026-12-09" expired stamp={noClock} />);
    expect(screen.getByTestId('quote-expired')).toHaveTextContent('Vencido el —');
    unmount();
    const { container } = render(<QuoteValidity validUntil="2026-12-09" expired stamp={noClock} omitWithoutFormat />);
    expect(container).toBeEmptyDOMElement();
  });
});
