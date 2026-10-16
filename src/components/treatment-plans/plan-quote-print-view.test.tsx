import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanQuotePrintView } from './plan-quote-print-view';
import { getPlanQuote } from '@/lib/treatment-plans/plan-quote-api';
import { ApiError } from '@/lib/api/client';
import { planQuoteFixture } from './plan-quote-fixture';

jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
}));

const mockedGet = getPlanQuote as jest.MockedFunction<typeof getPlanQuote>;

function renderView(props: Partial<React.ComponentProps<typeof PlanQuotePrintView>> = {}) {
  return render(
    <PlanQuotePrintView
      token="tok"
      patientId="p1"
      planId="plan-1"
      backHref="/patients/p1?tab=treatment-plans"
      {...props}
    />,
  );
}

describe('PlanQuotePrintView (DX-012)', () => {
  const print = jest.fn();
  beforeEach(() => {
    mockedGet.mockReset();
    print.mockReset();
    window.print = print;
  });

  it('muestra la carga, pinta el documento y abre el diálogo de impresión una vez', async () => {
    mockedGet.mockResolvedValue(planQuoteFixture());
    renderView();
    expect(screen.getByRole('status')).toHaveTextContent('Preparando el presupuesto…');
    expect(await screen.findByTestId('quote-header')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('tok', 'p1', 'plan-1');
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.title).toBe('Presupuesto · Ana Pérez');
    const back = screen.getByRole('link', { name: /Volver/ });
    expect(back).toHaveAttribute('href', '/patients/p1?tab=treatment-plans');
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir o guardar como PDF' }));
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('un fallo de red es un error de sección con reintento', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(planQuoteFixture());
    renderView();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar el presupuesto.');
    await userEvent.click(screen.getByRole('button', { name: /reintentar|intentar de nuevo/i }));
    expect(await screen.findByTestId('quote-header')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('404: aviso sin reintento (reintentar no lo arregla)', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Plan de tratamiento no encontrado'));
    renderView();
    expect(await screen.findByText('No encontramos este presupuesto.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
  });

  it('403 de la API: aviso de acceso', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Insufficient role'));
    renderView();
    expect(await screen.findByText('Tu rol no tiene acceso a este presupuesto.')).toBeInTheDocument();
  });

  it('sin permiso no pide nada', () => {
    renderView({ allowed: false });
    expect(screen.getByText('Tu rol no tiene acceso a este presupuesto.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('si el presupuesto es de otro paciente no se imprime bajo esta ficha', async () => {
    mockedGet.mockResolvedValue(planQuoteFixture({ patientId: 'otro' }));
    renderView();
    expect(await screen.findByText('No encontramos este presupuesto.')).toBeInTheDocument();
    await waitFor(() => expect(print).not.toHaveBeenCalled());
  });
});
