import { render, screen } from '@testing-library/react';
import { PrescriptionPrintView } from './prescription-print-view';
import { getPrescription } from '@/lib/prescriptions/prescriptions-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makePrescriptionDocument } from '@/lib/test/prescriptions';

jest.mock('../../lib/prescriptions/prescriptions-api', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescriptions-api'),
  getPrescription: jest.fn(),
}));

const mockedGet = getPrescription as jest.MockedFunction<typeof getPrescription>;

describe('PrescriptionPrintView', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    window.print = jest.fn();
  });

  it('carga la receta y abre el diálogo de impresión una vez', async () => {
    mockedGet.mockResolvedValue(makePrescriptionDocument());
    render(<PrescriptionPrintView token="tok" patientId="p1" prescriptionId="rx1" />);
    expect(await screen.findByRole('heading', { name: 'Fórmula médica' })).toBeInTheDocument();
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /volver a la ficha/i })).toHaveAttribute(
      'href',
      '/patients/p1?tab=prescriptions',
    );
    expect(document.querySelector('.prescription-print-page')).toBeInTheDocument();
  });

  it('sin permiso no pide nada y lo dice', () => {
    render(
      <PrescriptionPrintView token="tok" patientId="p1" prescriptionId="rx1" allowed={false} />,
    );
    expect(screen.getByText('Tu rol no tiene acceso a las recetas.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('404 es un aviso; otro error, SectionError con reintento', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'Receta no encontrada'));
    const { unmount } = render(
      <PrescriptionPrintView token="tok" patientId="p1" prescriptionId="rx1" />,
    );
    expect(await screen.findByText('No encontramos esta receta.')).toBeInTheDocument();
    unmount();

    mockedGet.mockRejectedValueOnce(new ApiError(500, 'x'));
    mockedGet.mockResolvedValueOnce(makePrescriptionDocument());
    render(<PrescriptionPrintView token="tok" patientId="p1" prescriptionId="rx1" />);
    expect(await screen.findByText('No pudimos cargar la receta.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Fórmula médica' })).toBeInTheDocument();
  });

  it('una receta de otro paciente que el de la URL no se imprime: aviso de no encontrada', async () => {
    mockedGet.mockResolvedValue(makePrescriptionDocument({ patientId: 'otro' }));
    render(<PrescriptionPrintView token="tok" patientId="p1" prescriptionId="rx1" />);
    expect(await screen.findByText('No encontramos esta receta.')).toBeInTheDocument();
    expect(window.print).not.toHaveBeenCalled();
  });
});
