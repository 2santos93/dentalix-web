import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptPlanModal } from './accept-plan-modal';
import { acceptPlan, getPlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { ApiError } from '@/lib/api/client';
import { planQuoteFixture, SIGNED_ACCEPTANCE } from './plan-quote-fixture';

jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
  acceptPlan: jest.fn(),
}));

const mockedGet = getPlanQuote as jest.MockedFunction<typeof getPlanQuote>;
const mockedAccept = acceptPlan as jest.MockedFunction<typeof acceptPlan>;

beforeAll(() => {
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
  jest
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation(() => 'data:image/png;base64,FIRMA');
});

function sign(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

function renderModal() {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    onAccepted: jest.fn(),
    token: 'tok',
    patientId: 'p1',
    planId: 'plan-1',
  };
  render(<AcceptPlanModal {...props} />);
  return props;
}

describe('AcceptPlanModal (DX-012)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedAccept.mockReset();
  });

  it('enseña lo que se va a firmar: procedimientos, total y validez', async () => {
    mockedGet.mockResolvedValue(planQuoteFixture());
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Aceptar presupuesto con firma' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Cargando el presupuesto…');
    const summary = await within(dialog).findByRole('region', { name: 'Presupuesto a firmar' });
    expect(summary).toHaveTextContent('Implante');
    expect(summary).toHaveTextContent('Diente 36');
    expect(summary).toHaveTextContent('Resina');
    expect((summary.textContent ?? '').replace(/\s/g, ' ')).toContain('3.300.000');
    expect(summary).toHaveTextContent('Válido 30 días, hasta el 15/11/2026');
    expect(within(dialog).getByRole('link', { name: /Ver el presupuesto completo/ })).toHaveAttribute(
      'href',
      '/print/patients/p1/treatment-plans/plan-1',
    );
    expect(within(dialog).getByLabelText('Nombre de quien firma')).toHaveValue('Ana Pérez');
  });

  it('sin firma no se puede aceptar; con firma envía nombre, firma y el hash mostrado', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(planQuoteFixture());
    const accepted = planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE });
    mockedAccept.mockResolvedValue(accepted);
    const props = renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    const submit = screen.getByRole('button', { name: 'Aceptar y firmar' });
    expect(submit).toBeDisabled();

    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    expect(submit).toBeEnabled();
    await user.clear(screen.getByLabelText('Nombre de quien firma'));
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Nombre de quien firma'), 'Ana María Pérez');
    await user.click(submit);

    expect(mockedAccept).toHaveBeenCalledWith('tok', 'p1', 'plan-1', {
      signerName: 'Ana María Pérez',
      signature: 'data:image/png;base64,FIRMA',
      contentHash: 'c'.repeat(64),
    });
    await waitFor(() => expect(props.onAccepted).toHaveBeenCalledWith(accepted));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('409 (el presupuesto cambió): explica y recarga lo que se muestra', async () => {
    const user = userEvent.setup();
    mockedGet
      .mockResolvedValueOnce(planQuoteFixture())
      .mockResolvedValueOnce(planQuoteFixture({ contentHash: 'e'.repeat(64) }));
    mockedAccept.mockRejectedValue(
      new ApiError(409, 'El presupuesto cambió desde que se mostró: revísalo de nuevo con el paciente antes de firmar.'),
    );
    const props = renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El presupuesto cambió');
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(props.onAccepted).not.toHaveBeenCalled();
    // La firma se pide de nuevo sobre el presupuesto recargado.
    expect(screen.getByRole('button', { name: 'Aceptar y firmar' })).toBeDisabled();
  });

  it('409 porque otro ya lo firmó: cierra el modal y avisa al plan con la aceptación', async () => {
    const user = userEvent.setup();
    const signed = planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE });
    mockedGet.mockResolvedValueOnce(planQuoteFixture()).mockResolvedValueOnce(signed);
    mockedAccept.mockRejectedValue(
      new ApiError(409, 'El plan ya fue aceptado y firmado: no se puede volver a firmar.'),
    );
    const props = renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));

    await waitFor(() => expect(props.onAccepted).toHaveBeenCalledWith(signed));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('un error genérico al firmar deja la firma y se puede reintentar', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(planQuoteFixture());
    mockedAccept.mockRejectedValueOnce(new Error('network'));
    renderModal();
    await screen.findByRole('region', { name: 'Presupuesto a firmar' });
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    await user.click(screen.getByRole('button', { name: 'Aceptar y firmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos guardar la aceptación. Intenta de nuevo.',
    );
    expect(screen.getByRole('button', { name: 'Aceptar y firmar' })).toBeEnabled();
  });

  it('si el presupuesto no carga: error con reintento y sin poder firmar', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(planQuoteFixture());
    renderModal();
    expect(await screen.findByText('No pudimos cargar el presupuesto.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar y firmar' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Presupuesto a firmar' })).toBeInTheDocument();
  });
});
