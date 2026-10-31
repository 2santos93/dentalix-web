import { render, screen, within } from '@testing-library/react';
import { PlanQuoteDocument } from './plan-quote-document';
import { planQuoteFixture, SIGNED_ACCEPTANCE } from './plan-quote-fixture';

// `Intl` con «es» separa los miles con un espacio duro; se normaliza para leer.
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

describe('PlanQuoteDocument (DX-012)', () => {
  it('agrupa la organización actual por visitas sin cambiar precios firmados',()=>{
    const quote=planQuoteFixture({visitOrganization:[{itemId:'i1',visit:1,label:'Cirugía',minDaysAfterPrevious:0},{itemId:'i2',visit:2,label:'Corona',minDaysAfterPrevious:90}]});
    render(<PlanQuoteDocument quote={quote}/>);
    expect(screen.getByRole('rowheader',{name:'Visita 1 · Cirugía'})).toBeInTheDocument();
    expect(screen.getByRole('rowheader',{name:'Visita 2 · Corona · intervalo mínimo 90 días'})).toBeInTheDocument();
    expect(screen.getByTestId('quote-total-COP')).toHaveTextContent('3.300.000');
  });

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
    expect(parties).toHaveTextContent('Documento nacional DOC-1020');
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

  it('DX-291: un cargo administrativo sin diente dice «Sin diente» y no «Diente completo»', () => {
    const fee = {
      id: 'fee',
      toothNumber: '',
      surfaces: [],
      procedure: 'Cargo por inasistencia o cancelación tardía',
      quantity: 1,
      unitPrice: 50000,
      discount: 0,
      subtotal: 50000,
      listPrice: null,
      agreementName: null,
    };
    render(<PlanQuoteDocument quote={planQuoteFixture({ items: [fee] })} />);
    const table = screen.getByRole('table', { name: 'Procedimientos del presupuesto' });
    const row = within(table).getAllByRole('row').find((r) => r.textContent?.includes('Cargo por inasistencia'))!;
    expect(row).toHaveTextContent('Sin diente');
    expect(row).not.toHaveTextContent('Diente completo');
    const card = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
    expect(card).toHaveTextContent('Sin diente');
    expect(card).not.toHaveTextContent(/Diente completo|Diente ·/);
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

  describe('convenio (DX-105)', () => {
    const withAgreement = () =>
      planQuoteFixture({
        agreement: { name: 'Plan Oro', payerName: 'Seguros Sol' },
        items: [
          { ...planQuoteFixture().items[0], unitPrice: 3000000, subtotal: 2700000, listPrice: 3500000, agreementName: 'Plan Oro' },
          { ...planQuoteFixture().items[1], listPrice: 150000 },
        ],
        totals: [{ currency: 'COP', gross: 3150000, discount: 350000, net: 2800000, agreementSaving: 500000 }],
      });

    it('pone el convenio en las partes: «Plan Oro · Seguros Sol»', () => {
      render(<PlanQuoteDocument quote={withAgreement()} />);
      const agreement = screen.getByTestId('quote-agreement');
      expect(agreement).toHaveTextContent('Convenio');
      expect(agreement).toHaveTextContent('Plan Oro · Seguros Sol');
    });

    it('sin convenio no hay entrada de convenio ni ahorro', () => {
      render(<PlanQuoteDocument quote={planQuoteFixture()} />);
      expect(screen.queryByTestId('quote-agreement')).not.toBeInTheDocument();
      expect(screen.queryByText('Ahorro por convenio')).not.toBeInTheDocument();
      expect(screen.queryByText(/Precio de lista/)).not.toBeInTheDocument();
    });

    it('cada ítem cuyo precio difiere del de lista lo dice; el que coincide, no', () => {
      render(<PlanQuoteDocument quote={withAgreement()} />);
      const table = screen.getByRole('table', { name: 'Procedimientos del presupuesto' });
      const rows = within(table).getAllByRole('row');
      const implant = rows.find((r) => r.textContent?.includes('Implante'))!;
      const resin = rows.find((r) => r.textContent?.includes('Resina'))!;
      expect(text(implant)).toContain('Precio de lista 3.500.000');
      expect(text(resin)).not.toContain('Precio de lista');
    });

    it('la ficha de pantalla estrecha también lleva el precio de lista', () => {
      render(<PlanQuoteDocument quote={withAgreement()} />);
      const list = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
      expect(text(list)).toContain('Precio de lista 3.500.000');
    });

    it('los totales llevan «Ahorro por convenio» cuando es mayor que cero', () => {
      render(<PlanQuoteDocument quote={withAgreement()} />);
      const totals = screen.getByTestId('quote-totals');
      expect(within(totals).getByText('Ahorro por convenio')).toBeInTheDocument();
      expect(text(within(totals).getByTestId('quote-saving-COP'))).toContain('500.000');
    });
  });
});

describe('DX-376: segunda moneda opcional al imprimir', () => {
  const SECOND = {
    currency: 'USD',
    fromPerBase: 4000,
    toPerBase: 1,
    source: 'MANUAL' as const,
    date: '2026-10-30',
  };

  it('añade el total en la 2.ª moneda con la tasa, su fuente, su fecha y la frase de importe orientativo', () => {
    render(<PlanQuoteDocument quote={planQuoteFixture()} secondCurrency={SECOND} />);
    const totals = screen.getByTestId('quote-totals');
    expect(text(within(totals).getByTestId('quote-second-total'))).toContain('Total orientativo (USD)825,00 USD');
    const note = text(screen.getByTestId('quote-second-currency'));
    expect(note).toContain('Tasa: 1 USD = 4000,00 COP (manual, 30/10/2026).');
    expect(note).toContain('El importe en USD es orientativo y se calcula con la tasa del día del pago.');
  });

  it('sin 2.ª moneda el presupuesto no cambia', () => {
    render(<PlanQuoteDocument quote={planQuoteFixture()} />);
    expect(screen.queryByTestId('quote-second-total')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quote-second-currency')).not.toBeInTheDocument();
  });

  it('ningún texto nombra un país ni un banco central', () => {
    render(<PlanQuoteDocument quote={planQuoteFixture()} secondCurrency={SECOND} />);
    expect(text(screen.getByTestId('quote-second-currency'))).not.toMatch(/venezuela|colombia|bcv|banco central/i);
  });
});
