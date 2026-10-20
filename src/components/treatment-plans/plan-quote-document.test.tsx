import { render, screen, within } from '@testing-library/react';
import { PlanQuoteDocument } from './plan-quote-document';
import { planQuoteFixture, SIGNED_ACCEPTANCE } from './plan-quote-fixture';

// `Intl` con «es» separa los miles con un espacio duro; se normaliza para leer.
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

describe('PlanQuoteDocument (DX-012)', () => {
  it('pinta logo y datos de la clínica y la sede, paciente, profesional, fecha y validez', () => {
    render(<PlanQuoteDocument quote={planQuoteFixture()} />);
    const header = screen.getByTestId('quote-header');
    expect(within(header).getByRole('img', { name: 'Clínica Sonrisas' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/logo.png',
    );
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent('Presupuesto de tratamiento');
    expect(header).toHaveTextContent('Sede principal');
    expect(header).toHaveTextContent('Calle 93 # 14-20');
    expect(header).toHaveTextContent('16/10/2026');
    expect(header).toHaveTextContent('Válido 30 días');
    expect(header).toHaveTextContent('hasta el 15/11/2026');
    const parties = screen.getByTestId('quote-parties');
    expect(parties).toHaveTextContent('Ana Pérez');
    expect(parties).toHaveTextContent('CC 1020');
    expect(parties).toHaveTextContent('Dra. Laura Gómez');
  });

  it('lista cada ítem con diente, procedimiento, caras, cantidad, precio, descuento y subtotal', () => {
    render(<PlanQuoteDocument quote={planQuoteFixture()} />);
    const table = screen.getByRole('table', { name: 'Procedimientos del presupuesto' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Diente', 'Procedimiento', 'Cant.', 'Precio', 'Descuento', 'Subtotal']);
    const rows = within(table).getAllByRole('row');
    const implant = rows.find((r) => r.textContent?.includes('Implante'))!;
    expect(text(implant)).toContain('36');
    expect(text(implant)).toContain('3.500.000');
    expect(text(implant)).toContain('−350.000');
    expect(text(implant)).toContain('3.150.000');
    const resin = rows.find((r) => r.textContent?.includes('Resina'))!;
    expect(resin).toHaveTextContent('Oclusal, Mesial');
    expect(text(resin)).toContain('—');
  });

  it('suma los totales por moneda: subtotal, descuentos y total', () => {
    render(<PlanQuoteDocument quote={planQuoteFixture()} />);
    const totals = screen.getByTestId('quote-totals');
    expect(text(totals)).toContain('3.650.000');
    expect(text(totals)).toContain('−350.000');
    expect(text(within(totals).getByTestId('quote-total-COP'))).toContain('3.300.000');
  });

  it('un plan sin ítems lo dice en la tabla, sin romper los totales', () => {
    render(
      <PlanQuoteDocument
        quote={planQuoteFixture({
          items: [],
          totals: [{ currency: 'COP', gross: 0, discount: 0, net: 0, agreementSaving: 0 }],
        })}
      />,
    );
    const table = screen.getByRole('table', { name: 'Procedimientos del presupuesto' });
    expect(within(table).getByText('Este plan todavía no tiene procedimientos.')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
    expect(within(list).getByText('Este plan todavía no tiene procedimientos.')).toBeInTheDocument();
    expect(text(screen.getByTestId('quote-total-COP'))).toContain('0');
  });

  it('sin firmar deja las líneas para firmar en papel', () => {
    render(<PlanQuoteDocument quote={planQuoteFixture()} />);
    const signature = screen.getByTestId('quote-signature');
    expect(signature).toHaveTextContent('Firma de aceptación del paciente');
    expect(within(signature).queryByRole('img')).not.toBeInTheDocument();
  });

  it('aceptado: «Aceptado y firmado por … el …» con la firma y la huella', () => {
    render(
      <PlanQuoteDocument
        quote={planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE })}
      />,
    );
    const signature = screen.getByTestId('quote-signature');
    expect(signature).toHaveTextContent('Aceptado y firmado por Ana Pérez el 16/10/2026 15:30');
    expect(within(signature).getByRole('img', { name: 'Firma de Ana Pérez' })).toHaveAttribute(
      'src',
      'data:image/png;base64,AAA',
    );
    expect(signature).toHaveTextContent('Registró la firma: Dra. Laura Gómez');
    expect(screen.getByText('c'.repeat(64))).toBeInTheDocument();
    expect(screen.queryByText(/pudo alterarse/)).not.toBeInTheDocument();
  });

  it('avisa si la huella no coincide con lo guardado', () => {
    render(
      <PlanQuoteDocument
        quote={planQuoteFixture({
          acceptance: { ...SIGNED_ACCEPTANCE, integrityOk: false },
        })}
      />,
    );
    expect(screen.getByText(/pudo alterarse fuera de Dentalix/)).toBeInTheDocument();
  });

  it('sin logo ni dirección ni profesional no deja huecos rotos', () => {
    render(
      <PlanQuoteDocument
        quote={planQuoteFixture({
          clinicLogoUrl: null,
          location: { id: 'l', name: 'Sede principal', address: null },
          professionalName: null,
          patient: { name: 'Ana Pérez', document: null },
        })}
      />,
    );
    expect(screen.queryByRole('img', { name: 'Clínica Sonrisas' })).not.toBeInTheDocument();
    const parties = screen.getByTestId('quote-parties');
    expect(parties).toHaveTextContent('Sin documento');
    expect(parties).toHaveTextContent('Sin asignar');
  });
});
