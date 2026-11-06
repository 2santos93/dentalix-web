import { render, screen, within } from '@testing-library/react';
import { PlanQuoteDocument } from './plan-quote-document';
import { planQuoteFixture, SIGNED_ACCEPTANCE } from './plan-quote-fixture';
import { FORMAT_DE, FORMAT_ES, FORMAT_US, REGIONAL_VE } from '@/lib/test/document-regional';
import { documentFormat } from '@/lib/format/document-format';

// `Intl` con «es» separa los miles con un espacio duro; se normaliza para leer.
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

describe('PlanQuoteDocument (DX-012)', () => {
  it('agrupa la organización actual por visitas sin cambiar precios firmados',()=>{
    const quote=planQuoteFixture({visitOrganization:[{itemId:'i1',visit:1,label:'Cirugía',minDaysAfterPrevious:0},{itemId:'i2',visit:2,label:'Corona',minDaysAfterPrevious:90}]});
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={quote}/>);
    expect(screen.getByRole('rowheader',{name:'Visita 1 · Cirugía'})).toBeInTheDocument();
    expect(screen.getByRole('rowheader',{name:'Visita 2 · Corona · intervalo mínimo 90 días'})).toBeInTheDocument();
    expect(screen.getByTestId('quote-total-VES')).toHaveTextContent('3.300.000');
  });

  it('pinta logo y datos de la clínica y la sede, paciente, profesional, fecha y validez', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={planQuoteFixture()} />);
    const header = screen.getByTestId('quote-header');
    expect(within(header).getByRole('img', { name: 'Clínica Sonrisas' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/logo.png',
    );
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent('Presupuesto de tratamiento');
    expect(header).toHaveTextContent('Sede principal');
    expect(header).toHaveTextContent('Av. Francisco de Miranda 93');
    expect(header).toHaveTextContent('16/10/2026');
    expect(header).toHaveTextContent('Válido 30 días');
    expect(header).toHaveTextContent('hasta el 15/11/2026');
    const parties = screen.getByTestId('quote-parties');
    expect(parties).toHaveTextContent('Ana Pérez');
    expect(parties).toHaveTextContent('Documento nacional DOC-1020');
    expect(parties).toHaveTextContent('Dra. Laura Gómez');
  });

  it('lista cada ítem con diente, procedimiento, caras, cantidad, precio, descuento y subtotal', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={planQuoteFixture()} />);
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
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={planQuoteFixture({ items: [fee] })} />);
    const table = screen.getByRole('table', { name: 'Procedimientos del presupuesto' });
    const row = within(table).getAllByRole('row').find((r) => r.textContent?.includes('Cargo por inasistencia'))!;
    expect(row).toHaveTextContent('Sin diente');
    expect(row).not.toHaveTextContent('Diente completo');
    const card = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
    expect(card).toHaveTextContent('Sin diente');
    expect(card).not.toHaveTextContent(/Diente completo|Diente ·/);
  });

  it('suma los totales por moneda: subtotal, descuentos y total', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={planQuoteFixture()} />);
    const totals = screen.getByTestId('quote-totals');
    expect(text(totals)).toContain('3.650.000');
    expect(text(totals)).toContain('−350.000');
    expect(text(within(totals).getByTestId('quote-total-VES'))).toContain('3.300.000');
  });

  it('un plan sin ítems lo dice en la tabla, sin romper los totales', () => {
    render(
      <PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES"
        quote={planQuoteFixture({
          items: [],
          totals: [{ currency: 'VES', gross: 0, discount: 0, net: 0, agreementSaving: 0 }],
        })}
      />,
    );
    const table = screen.getByRole('table', { name: 'Procedimientos del presupuesto' });
    expect(within(table).getByText('Este plan todavía no tiene procedimientos.')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
    expect(within(list).getByText('Este plan todavía no tiene procedimientos.')).toBeInTheDocument();
    expect(text(screen.getByTestId('quote-total-VES'))).toContain('0');
  });

  it('sin firmar deja las líneas para firmar en papel', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={planQuoteFixture()} />);
    const signature = screen.getByTestId('quote-signature');
    expect(signature).toHaveTextContent('Firma de aceptación del paciente');
    expect(within(signature).queryByRole('img')).not.toBeInTheDocument();
  });

  it('aceptado: «Aceptado y firmado por … el …» con la firma y la huella', () => {
    render(
      <PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES"
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

  it('DX-514: a 390 px los textos largos se parten (nombre de procedimiento, paciente, firmante), sin desbordar', () => {
    // jsdom no mide: se comprueba que las cajas pueden encogerse y partir palabras (DESIGN: wrap, no ocultar).
    const longProcedure = 'Rehabilitación-implantosoportada-con-pilar-personalizado-de-zirconio';
    const longName = 'María Alejandra Rodríguez-Villasmil de Fernández';
    render(
      <PlanQuoteDocument
        format={FORMAT_ES}
        catalogCurrency="VES"
        quote={planQuoteFixture({
          patient: { name: longName, document: 'Documento nacional V-12345678' },
          items: [{ ...planQuoteFixture().items[0], procedure: longProcedure }],
          planStatus: 'ACCEPTED',
          acceptance: { ...SIGNED_ACCEPTANCE, signerName: longName },
        })}
      />,
    );
    const card = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
    const procedure = within(card).getByText(longProcedure);
    expect(procedure).toHaveClass('min-w-0', 'break-words');
    expect(procedure.nextElementSibling).toHaveClass('shrink-0');
    const parties = screen.getByTestId('quote-parties');
    expect(within(parties).getByText(longName)).toHaveClass('break-words');
    expect(within(parties).getByText(longName).parentElement).toHaveClass('min-w-0');
    const caption = screen.getByTestId('quote-signature').querySelector('figcaption');
    expect(caption).toHaveClass('break-words');
    expect(caption?.closest('figure')).toHaveClass('min-w-0');
  });

  describe('DX-514: aceptado a distancia', () => {
    // Sede en Caracas (UTC−4) y jest en UTC: 02:30 UTC del 31 es el 30 a las 10:30 p. m. en la sede.
    const FORMAT_VE = documentFormat(REGIONAL_VE)!;
    const REMOTE = {
      signatureRequestId: 'sr-1',
      channel: 'EMAIL' as const,
      destinationMasked: 'an***@example.com',
      sentAt: '2026-10-30T22:00:00.000Z',
      openedAt: '2026-10-31T02:20:00.000Z',
      verifiedAt: '2026-10-31T02:25:00.000Z',
    };
    const remoteAcceptance = (
      signerName: string,
      signerType?: 'PATIENT' | 'GUARDIAN',
    ): NonNullable<Parameters<typeof planQuoteFixture>[0]>['acceptance'] => ({
      ...SIGNED_ACCEPTANCE,
      signerName,
      acceptedAt: '2026-10-31T02:30:00.000Z',
      acceptedByName: 'Dra. Laura Gómez',
      remote: { ...REMOTE, ...(signerType ? { signerType } : {}) },
    });
    const renderRemote = (acceptance: ReturnType<typeof remoteAcceptance>) =>
      render(
        <PlanQuoteDocument
          format={FORMAT_VE}
          catalogCurrency="VES"
          quote={planQuoteFixture({ planStatus: 'ACCEPTED', acceptance })}
        />,
      );

    it('firmó la paciente: «Firmado a distancia por … (paciente)» y «Enviado por …», con la hora de la sede', () => {
      renderRemote(remoteAcceptance('Ana Pérez', 'PATIENT'));
      const signature = screen.getByTestId('quote-signature');
      expect(text(signature)).toContain('Firmado a distancia por Ana Pérez (paciente) el 30/10/2026 10:30 p. m.');
      expect(text(signature)).toContain('Enviado por Dra. Laura Gómez el 30/10/2026 6:00 p. m.');
      expect(signature).not.toHaveTextContent('Registró la firma');
      expect(signature).not.toHaveTextContent('Aceptado y firmado por');
      // Nunca la hora en UTC (ni la del navegador, que en jest es UTC).
      expect(signature).not.toHaveTextContent(/31\/10\/2026|2:30|22:00/);
    });

    it('firmó el representante: «(representante de <paciente>)»', () => {
      renderRemote(remoteAcceptance('Luis Pérez', 'GUARDIAN'));
      const signature = screen.getByTestId('quote-signature');
      expect(text(signature)).toContain(
        'Firmado a distancia por Luis Pérez (representante de Ana Pérez) el 30/10/2026 10:30 p. m.',
      );
      expect(within(signature).getByRole('img', { name: 'Firma de Luis Pérez' })).toBeInTheDocument();
      expect(text(signature)).toContain('Enviado por Dra. Laura Gómez');
    });

    it('sin el tipo de firmante (API anterior) no inventa el papel', () => {
      renderRemote(remoteAcceptance('Ana Pérez'));
      expect(text(screen.getByTestId('quote-signature'))).toContain(
        'Firmado a distancia por Ana Pérez el 30/10/2026 10:30 p. m.',
      );
    });

    it('aceptado en la clínica no cambia: «Aceptado y firmado por …» y «Registró la firma: …»', () => {
      render(
        <PlanQuoteDocument
          format={FORMAT_VE}
          catalogCurrency="VES"
          quote={planQuoteFixture({
            planStatus: 'ACCEPTED',
            acceptance: { ...SIGNED_ACCEPTANCE, acceptedAt: '2026-10-31T02:30:00.000Z' },
          })}
        />,
      );
      const signature = screen.getByTestId('quote-signature');
      expect(text(signature)).toContain('Aceptado y firmado por Ana Pérez el 30/10/2026 10:30 p. m.');
      expect(signature).toHaveTextContent('Registró la firma: Dra. Laura Gómez');
      expect(signature).not.toHaveTextContent(/a distancia|Enviado por/);
    });
  });

  it('avisa si la huella no coincide con lo guardado', () => {
    render(
      <PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES"
        quote={planQuoteFixture({
          acceptance: { ...SIGNED_ACCEPTANCE, integrityOk: false },
        })}
      />,
    );
    expect(screen.getByText(/pudo alterarse fuera de Dentalix/)).toBeInTheDocument();
  });

  it('sin logo ni dirección ni profesional no deja huecos rotos', () => {
    render(
      <PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES"
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
        totals: [{ currency: 'VES', gross: 3150000, discount: 350000, net: 2800000, agreementSaving: 500000 }],
      });

    it('pone el convenio en las partes: «Plan Oro · Seguros Sol»', () => {
      render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={withAgreement()} />);
      const agreement = screen.getByTestId('quote-agreement');
      expect(agreement).toHaveTextContent('Convenio');
      expect(agreement).toHaveTextContent('Plan Oro · Seguros Sol');
    });

    it('sin convenio no hay entrada de convenio ni ahorro', () => {
      render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={planQuoteFixture()} />);
      expect(screen.queryByTestId('quote-agreement')).not.toBeInTheDocument();
      expect(screen.queryByText('Ahorro por convenio')).not.toBeInTheDocument();
      expect(screen.queryByText(/Precio de lista/)).not.toBeInTheDocument();
    });

    it('cada ítem cuyo precio difiere del de lista lo dice; el que coincide, no', () => {
      render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={withAgreement()} />);
      const table = screen.getByRole('table', { name: 'Procedimientos del presupuesto' });
      const rows = within(table).getAllByRole('row');
      const implant = rows.find((r) => r.textContent?.includes('Implante'))!;
      const resin = rows.find((r) => r.textContent?.includes('Resina'))!;
      expect(text(implant)).toContain('Precio de lista 3.500.000');
      expect(text(resin)).not.toContain('Precio de lista');
    });

    it('la ficha de pantalla estrecha también lleva el precio de lista', () => {
      render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={withAgreement()} />);
      const list = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
      expect(text(list)).toContain('Precio de lista 3.500.000');
    });

    it('los totales llevan «Ahorro por convenio» cuando es mayor que cero', () => {
      render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={withAgreement()} />);
      const totals = screen.getByTestId('quote-totals');
      expect(within(totals).getByText('Ahorro por convenio')).toBeInTheDocument();
      expect(text(within(totals).getByTestId('quote-saving-VES'))).toContain('500.000');
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
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={planQuoteFixture()} secondCurrency={SECOND} />);
    const totals = screen.getByTestId('quote-totals');
    expect(text(within(totals).getByTestId('quote-second-total'))).toContain('Total orientativo (USD)825,00 USD');
    const note = text(screen.getByTestId('quote-second-currency'));
    expect(note).toContain('Tasa: 1 USD = 4000,00 VES (manual, 30/10/2026).');
    expect(note).toContain('El importe en USD es orientativo y se calcula con la tasa del día del pago.');
  });

  it('sin 2.ª moneda el presupuesto no cambia', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={planQuoteFixture()} />);
    expect(screen.queryByTestId('quote-second-total')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quote-second-currency')).not.toBeInTheDocument();
  });

  it('ningún texto nombra un país ni un banco central', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={planQuoteFixture()} secondCurrency={SECOND} />);
    expect(text(screen.getByTestId('quote-second-currency'))).not.toMatch(/venezuela|colom[b]ia|bcv|banco central/i);
  });
});

describe('DX-489: plan en EUR con el catálogo en VES', () => {
  const eurQuote = () =>
    planQuoteFixture({
      currency: 'EUR',
      agreement: { name: 'Plan Oro', payerName: 'Seguros Sol' },
      items: [
        { ...planQuoteFixture().items[0], unitPrice: 100.55, discount: 0, subtotal: 100.55, listPrice: 80000, agreementName: 'Plan Oro' },
        { ...planQuoteFixture().items[1], unitPrice: 50, subtotal: 50, listPrice: 50 },
      ],
      // Lo que guarda la API, sin tocarlo: el ahorro resta VES de EUR.
      totals: [{ currency: 'EUR', gross: 150.55, discount: 0, net: 150.55, agreementSaving: 79899.45 }],
    });

  it('el precio de lista sale en VES, nunca en EUR, en la tabla y en la ficha estrecha', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={eurQuote()} />);
    const table = screen.getByRole('table', { name: 'Procedimientos del presupuesto' });
    const implant = within(table).getAllByRole('row').find((r) => r.textContent?.includes('Implante'))!;
    expect(text(implant)).toContain('Precio de lista 80.000,00 VES');
    expect(text(implant)).not.toContain('80.000,00 EUR');
    const list = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
    expect(text(list)).toContain('Precio de lista 80.000,00 VES');
    // Los importes del plan siguen en EUR.
    expect(text(implant)).toContain('100,55 EUR');
  });

  it('dice que el precio de lista es el del catálogo, en su moneda y sin convertir', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={eurQuote()} />);
    expect(text(screen.getByTestId('quote-list-price-note'))).toBe(
      'El precio de lista es el del catálogo de la clínica, en VES: es de referencia y no se convierte a EUR.',
    );
  });

  it('no pinta el «Ahorro por convenio», que restaría VES de EUR', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency="VES" quote={eurQuote()} />);
    expect(screen.queryByText('Ahorro por convenio')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quote-saving-EUR')).not.toBeInTheDocument();
  });

  it('sin saber la moneda del catálogo: la cifra sin moneda y la nota lo dice', () => {
    render(<PlanQuoteDocument format={FORMAT_ES} catalogCurrency={null} quote={eurQuote()} />);
    const list = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
    expect(text(list)).toContain('Precio de lista 80.000,00');
    expect(text(list)).not.toMatch(/Precio de lista 80\.000,00 (EUR|VES)/);
    expect(text(screen.getByTestId('quote-list-price-note'))).toBe(
      'El precio de lista es el del catálogo de la clínica, que puede estar en otra moneda: es de referencia y no se convierte a EUR.',
    );
    expect(screen.queryByText('Ahorro por convenio')).not.toBeInTheDocument();
  });

  it('con el catálogo en la moneda del plan, ni nota ni cambios: el ahorro sigue', () => {
    render(
      <PlanQuoteDocument format={FORMAT_ES}
        catalogCurrency="EUR"
        quote={eurQuote()}
      />,
    );
    expect(screen.queryByTestId('quote-list-price-note')).not.toBeInTheDocument();
    expect(screen.getByText('Ahorro por convenio')).toBeInTheDocument();
  });
});

describe('DX-354: el formato de la sede del presupuesto', () => {
  const signed = () => planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: { ...SIGNED_ACCEPTANCE, acceptedAt: '2027-05-03T19:05:00.000Z' } });

  it('A: sede en-US h12, fechas mm/dd/yyyy, hora de la firma en 12 h e importes con código', () => {
    render(<PlanQuoteDocument format={FORMAT_US} catalogCurrency="VES" quote={signed()} />);
    const header = screen.getByTestId('quote-header');
    expect(header).toHaveTextContent('10/16/2026');
    expect(header).toHaveTextContent('hasta el 11/15/2026');
    expect(text(screen.getByTestId('quote-signature'))).toContain('05/03/2027 3:05 p. m.');
    expect(text(screen.getByTestId('quote-total-VES'))).toContain('VES 3,300,000.00');
  });

  it('B: sede de-DE h23, dd.mm.yyyy, 24 h e importes con código', () => {
    render(<PlanQuoteDocument format={FORMAT_DE} catalogCurrency="VES" quote={signed()} />);
    expect(screen.getByTestId('quote-header')).toHaveTextContent('16.10.2026');
    expect(text(screen.getByTestId('quote-signature'))).toContain('03.05.2027 21:05');
    expect(text(screen.getByTestId('quote-total-VES'))).toContain('3.300.000,00 VES');
  });

  it('C: sin formato de sede, «—» en fechas e importes, sin símbolo ni dd/mm/yyyy', () => {
    const { container } = render(<PlanQuoteDocument format={null} catalogCurrency="VES" quote={signed()} />);
    expect(screen.getByTestId('quote-header')).toHaveTextContent('—');
    expect(container.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(container.textContent).not.toMatch(/\d[.,]\d{2}/);
    expect(container.textContent).not.toContain('US$');
  });

  it('el precio de lista se imprime con moneyWithCode en la moneda del catálogo', () => {
    const base = planQuoteFixture();
    const quote = planQuoteFixture({ items: [{ ...base.items[0], listPrice: 3_800_000 }] });
    render(<PlanQuoteDocument format={FORMAT_US} catalogCurrency="VES" quote={quote} />);
    expect(text(screen.getByRole('table', { name: 'Procedimientos del presupuesto' }))).toContain(
      'Precio de lista VES 3,800,000.00',
    );
  });
});
