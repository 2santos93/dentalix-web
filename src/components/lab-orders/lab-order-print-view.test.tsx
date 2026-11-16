import { render, screen, waitFor } from '@testing-library/react';
import { LabOrderPrintView } from './lab-order-print-view';
import { getLabOrderPrint, type LabOrderPrint } from '@/lib/lab-orders/lab-orders-api';
import { ApiError } from '@/lib/api/client';
import { clearSessionStore } from '@/lib/session/session-store';
import { tokenFor } from '@/lib/test/prescriptions';
import { makeOverdueLabOrder } from '@/lib/test/lab-orders';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede({ id: 'loc1' })]),
}));
jest.mock('../../lib/lab-orders/lab-orders-api', () => ({
  ...jest.requireActual('../../lib/lab-orders/lab-orders-api'),
  getLabOrderPrint: jest.fn(),
}));

const DENTIST = tokenFor('DENTIST', 'u-dentist');

function printData(): LabOrderPrint {
  return {
    order: makeOverdueLabOrder({ instructions: 'Contacto proximal firme', replacesOrder: { id: 'lo0', number: 7 } }),
    clinic: {
      name: 'Clínica Demo',
      legalName: 'Clínica Demo C.A.',
      taxIdLabel: 'RIF',
      taxId: 'J-12345678-9',
      phone: null,
      email: null,
      logoUrl: null,
    },
    location: { name: 'Sede Centro', address: 'Av. Principal 1', phone: null, healthRegistrationNumber: null },
    professional: { fullName: 'Dra. Laura Ruiz', license: 'MPPS 12345', specialty: 'Prostodoncia' },
    patient: { fullName: 'Ana Pérez', document: 'Cédula V-12345678', birthDate: '1990-05-04', ageYears: 36 },
    printedAt: '2026-11-16T10:00:00.000Z',
  };
}

describe('LabOrderPrintView (DX-017)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
    window.print = jest.fn();
  });

  it('la prescripción A4 con clínica, profesional y registro, paciente, trabajo y fecha prometida; imprime una vez', async () => {
    jest.mocked(getLabOrderPrint).mockResolvedValue(printData());
    render(<LabOrderPrintView token={DENTIST} orderId="lo2" />);
    const doc = await screen.findByRole('article');
    expect(doc).toHaveTextContent('Orden de laboratorio dental');
    expect(doc).toHaveTextContent('Orden N.º 9');
    expect(doc).toHaveTextContent('Corrige la orden N.º 7');
    expect(doc).toHaveTextContent('Clínica Demo C.A. · RIF J-12345678-9');
    expect(doc).toHaveTextContent('Sede Centro · Av. Principal 1');
    expect(doc).toHaveTextContent('Dra. Laura Ruiz');
    expect(doc).toHaveTextContent('MPPS 12345');
    expect(doc).toHaveTextContent('Cédula V-12345678');
    expect(doc).toHaveTextContent('36 años');
    expect(doc).toHaveTextContent('Corona de zirconio');
    expect(doc).toHaveTextContent('A2');
    expect(doc).toHaveTextContent('Zirconio monolítico');
    expect(doc).toHaveTextContent('Contacto proximal firme');
    expect(doc).toHaveTextContent('Laboratorio Dental Caracas');
    await waitFor(() => expect(doc).toHaveTextContent('10/11/2026'));
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('link', { name: 'Volver a la ficha' })).toHaveAttribute('href', '/patients/p1?tab=lab-orders');
  });

  it('un rol sin acceso ve el aviso en español y no pide nada', () => {
    render(<LabOrderPrintView token={tokenFor('RECEPTION', 'u-rec')} orderId="lo2" allowed={false} />);
    expect(screen.getByText('Tu rol no puede imprimir órdenes de laboratorio.')).toBeInTheDocument();
    expect(getLabOrderPrint).not.toHaveBeenCalled();
  });

  it('404: aviso sin reintento', async () => {
    jest.mocked(getLabOrderPrint).mockRejectedValue(new ApiError(404, 'No encontrada'));
    render(<LabOrderPrintView token={DENTIST} orderId="x" />);
    expect(await screen.findByText('No encontramos esta orden de laboratorio.')).toBeInTheDocument();
  });
});
