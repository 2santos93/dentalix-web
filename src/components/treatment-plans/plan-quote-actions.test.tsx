import { dateTimeIn, STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { PlanQuoteActions } from './plan-quote-actions';
import { getPlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { previewRepricing } from '@/lib/treatment-plans/plan-repricing-api';
import { planQuoteFixture } from './plan-quote-fixture';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { ITEM_WITHOUT_DISCOUNT, PLAN_WITHOUT_OPTIONS } from './plan-fixture';

jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
}));

jest.mock('../../lib/treatment-plans/plan-repricing-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-repricing-api'),
  previewRepricing: jest.fn(),
}));

const mockedGet = getPlanQuote as jest.MockedFunction<typeof getPlanQuote>;

const item = {
  id: 'i1',
  tenantId: 't1',
  planId: 'plan-1',
  toothNumber: '11',
  surfaces: [],
  catalogItemId: 'c1',
  price: 100,
  discount: 0,
  visit: 1,
    ...ITEM_WITHOUT_DISCOUNT,
  status: 'PROPOSED' as const,
  notes: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function plan(overrides: Partial<TreatmentPlan> = {}): TreatmentPlan {
  return {
    id: 'plan-1',
    tenantId: 't1',
    patientId: 'p1',
    status: 'DRAFT',
    currency: 'USD',
    notes: null,
    createdById: null,
    ...PLAN_WITHOUT_OPTIONS,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    items: [item],
    total: 100,
    acceptance: null,
    ...overrides,
  };
}

function renderActions(
  p: TreatmentPlan,
  role: 'DENTIST' | 'RECEPTION' | 'ADMIN' = 'DENTIST',
  stamp = testStamp([STAMP_SEDES.caracas, STAMP_SEDES.berlin, STAMP_SEDES.miami]),
) {
  const onAccepted = jest.fn();
  render(<PlanQuoteActions token="tok" patientId="p1" plan={p} role={role} onAccepted={onAccepted} stamp={stamp} />);
  return onAccepted;
}

describe('PlanQuoteActions (DX-012)', () => {
  it('«Imprimir presupuesto» abre la vista A4 en otra pestaña', () => {
    renderActions(plan());
    const link = screen.getByRole('link', { name: /Imprimir presupuesto/ });
    expect(link).toHaveAttribute('href', '/print/patients/p1/treatment-plans/plan-1');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('«Aceptar con firma» abre el modal con el lienzo', async () => {
    mockedGet.mockResolvedValue(planQuoteFixture());
    renderActions(plan());
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar con firma' }));
    expect(screen.getByRole('dialog', { name: 'Aceptar presupuesto con firma' })).toBeInTheDocument();
  });

  it('recepción imprime pero no acepta', () => {
    renderActions(plan(), 'RECEPTION');
    expect(screen.getByRole('link', { name: /Imprimir presupuesto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar con firma' })).not.toBeInTheDocument();
  });

  it('un plan sin ítems no se ofrece para firmar y lo explica', () => {
    renderActions(plan({ items: [], total: 0 }));
    expect(screen.queryByRole('button', { name: 'Aceptar con firma' })).not.toBeInTheDocument();
    expect(screen.getByText('Agrega procedimientos para poder aceptarlo con firma.')).toBeInTheDocument();
  });

  it('un plan cancelado no se ofrece para firmar', () => {
    renderActions(plan({ status: 'CANCELLED' }));
    expect(screen.queryByRole('button', { name: 'Aceptar con firma' })).not.toBeInTheDocument();
  });

  it('aceptado: «Aceptado y firmado por … el …», sin volver a firmar', () => {
    renderActions(
      plan({
        status: 'ACCEPTED',
        acceptance: { signerName: 'Ana Pérez', acceptedAt: '2026-10-16T15:30:00.000Z', remote: null },
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `Aceptado y firmado por Ana Pérez el ${dateTimeIn('caracas', '2026-10-16T15:30:00.000Z')}`,
    );
    expect(screen.getByText('Sus procedimientos y precios ya no se pueden cambiar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar con firma' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Imprimir presupuesto/ })).toBeInTheDocument();
  });

  it('la firma sale con el reloj de la sede donde se aceptó, no con el de la pantalla (E1)', () => {
    const acceptedAt = '2026-10-17T02:30:00.000Z';
    renderActions(
      plan({
        status: 'ACCEPTED',
        acceptedLocationId: STAMP_SEDES.berlin.id,
        acceptance: { signerName: 'Ana Pérez', acceptedAt, remote: null },
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(`el ${dateTimeIn('berlin', acceptedAt)}`);
    expect(dateTimeIn('berlin', acceptedAt)).not.toBe(dateTimeIn('caracas', acceptedAt));
  });

  it('DX-514: aceptado a distancia, «Aceptado» y las evidencias («Enviado», «Abierto», «Código verificado») con el reloj de la sede donde se aceptó', () => {
    // Pantalla en Miami; aceptado en la sede de Caracas; jest en UTC.
    const acceptedAt = '2026-10-31T04:46:00.000Z';
    const remote = {
      destinationMasked: 'ma***@example.com',
      sentAt: '2026-10-31T04:44:00.000Z',
      openedAt: '2026-10-31T04:45:00.000Z',
      verifiedAt: '2026-10-31T04:45:30.000Z',
      ipAddress: null,
    };
    renderActions(
      plan({
        status: 'ACCEPTED',
        acceptedLocationId: STAMP_SEDES.caracas.id,
        acceptance: { signerName: 'Marta Ríos', acceptedAt, remote },
      }),
      'DENTIST',
      testStamp([STAMP_SEDES.miami, STAMP_SEDES.caracas]),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `Aceptado a distancia por Marta Ríos el ${dateTimeIn('caracas', acceptedAt)}`,
    );
    const evidence = screen.getByLabelText('Evidencias de la aceptación a distancia');
    expect(evidence).toHaveTextContent(`Enviado:${dateTimeIn('caracas', remote.sentAt)}`);
    expect(evidence).toHaveTextContent(`Abierto:${dateTimeIn('caracas', remote.openedAt)}`);
    expect(evidence).toHaveTextContent(`Código verificado:${dateTimeIn('caracas', remote.verifiedAt)}`);
    // 04:44 UTC = 12:44 a. m. en Caracas: ni la hora UTC ni la de la sede de la pantalla.
    expect(dateTimeIn('caracas', remote.sentAt)).toMatch(/12:44/);
    expect(evidence).not.toHaveTextContent(/4:44|4:45/);
    expect(evidence).not.toHaveTextContent(dateTimeIn('miami', remote.sentAt));
  });

  it('sin formato de la sede, «—» en lugar de la fecha (el aviso lo pinta la pantalla)', () => {
    renderActions(
      plan({
        status: 'ACCEPTED',
        acceptance: { signerName: 'Ana Pérez', acceptedAt: '2026-10-16T15:30:00.000Z', remote: null },
      }),
      'DENTIST',
      stampPainters(null),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Aceptado y firmado por Ana Pérez el —');
  });
});

describe('PlanQuoteActions · «Actualizar precios» (DX-379 B)', () => {
  function renderReprice(p: TreatmentPlan, role: 'ADMIN' | 'DENTIST' | 'ASSISTANT' | 'RECEPTION', repricePrimary = false) {
    render(
      <PlanQuoteActions
        token="tok"
        patientId="p1"
        plan={p}
        role={role}
        onAccepted={jest.fn()}
        onRepriced={jest.fn()}
        procedureOf={() => 'Resina compuesta'}
        repricePrimary={repricePrimary}
        stamp={testStamp([STAMP_SEDES.caracas])}
      />,
    );
  }

  it('la ven ADMIN, odontólogo y asistente en un borrador o presentado; recepción no', () => {
    for (const role of ['ADMIN', 'DENTIST', 'ASSISTANT'] as const) {
      for (const status of ['DRAFT', 'PRESENTED'] as const) {
        renderReprice(plan({ status }), role);
        expect(screen.getByRole('button', { name: 'Actualizar precios' })).toBeInTheDocument();
        cleanup();
      }
    }
    renderReprice(plan({ status: 'PRESENTED' }), 'RECEPTION');
    expect(screen.queryByRole('button', { name: 'Actualizar precios' })).not.toBeInTheDocument();
  });

  it('un plan aceptado (con o sin firma), rechazado o sin propuestos no la ofrece', () => {
    const signed = { signerName: 'Ana', acceptedAt: '2026-10-16T15:00:00Z', remote: null };
    for (const p of [
      plan({ status: 'ACCEPTED' }),
      plan({ status: 'PRESENTED', acceptance: signed }),
      plan({ status: 'REJECTED' }),
      plan({ status: 'DRAFT', items: [{ ...item, status: 'DONE' }] }),
    ]) {
      renderReprice(p, 'ADMIN');
      expect(screen.queryByRole('button', { name: 'Actualizar precios' })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('vencido: es la primaria y explica que así se renueva; abre el asistente', async () => {
    jest.mocked(previewRepricing).mockReturnValue(new Promise(() => {}));
    renderReprice(plan({ status: 'PRESENTED', quoteExpired: true, quoteValidUntil: '2026-10-31' }), 'DENTIST', true);
    const button = screen.getByRole('button', { name: 'Actualizar precios' });
    expect(button.className).toMatch(/(^|\s)bg-primary(\s|$)/);
    expect(screen.getByText('El presupuesto venció: actualiza los precios para renovar su validez.')).toBeInTheDocument();
    await userEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Actualizar precios' })).toBeInTheDocument();
    expect(previewRepricing).toHaveBeenCalledWith('tok', 'p1', 'plan-1');
  });
});
