import { render, screen } from '@testing-library/react';
import { PrescriptionPrintView } from './prescription-print-view';
import { getPrescription } from '@/lib/prescriptions/prescriptions-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makePrescriptionDocument } from '@/lib/test/prescriptions';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';

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
    expect(await screen.findByRole('heading', { name: 'Receta' })).toBeInTheDocument();
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /volver a la ficha/i })).toHaveAttribute(
      'href',
      '/patients/p1?tab=prescriptions',
    );
    expect(document.querySelector('.prescription-print-page')).toBeInTheDocument();
    // Formato de la sede de la receta: en-US/h12/America/New_York.
    expect(screen.getByText('Fecha de emisión').nextSibling).toHaveTextContent('10/16/2026 11:00 a. m.');
    expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument();
  });

  it('las fechas siguen el formato de la sede que trae la receta', async () => {
    mockedGet.mockResolvedValue(
      makePrescriptionDocument({
        locationFormat: { locale: 'de-DE', hourCycle: 'h23', timeZone: 'Europe/Berlin' },
      }),
    );
    render(<PrescriptionPrintView token="tok" patientId="p1" prescriptionId="rx1" />);
    expect(await screen.findByRole('heading', { name: 'Receta' })).toBeInTheDocument();
    expect(screen.getByText('Fecha de emisión').nextSibling).toHaveTextContent('16.10.2026 17:00');
    expect(screen.getByText('Válida hasta').nextSibling).toHaveTextContent('14.11.2026');
  });

  it('missing locale shows «—» and SedeConfigError', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValueOnce(
      makePrescriptionDocument({
        locationFormat: { locale: null, hourCycle: 'h12', timeZone: 'America/New_York' },
      }),
    );
    mockedGet.mockResolvedValueOnce(makePrescriptionDocument());
    render(<PrescriptionPrintView token="tok" patientId="p1" prescriptionId="rx1" />);
    expect(await screen.findByRole('heading', { name: 'Receta' })).toBeInTheDocument();
    expect(screen.getByText('Fecha de emisión').nextSibling).toHaveTextContent(/^—$/);
    expect(screen.getByText('Válida desde').nextSibling).toHaveTextContent(/^—$/);
    // La cantidad no depende del formato (I8).
    expect(screen.getByText('21 (veintiuno) cápsulas')).toBeInTheDocument();
    // La nota no sale en el papel.
    const note = screen.getByText(SEDE_LOCALE_ERROR).closest('[role="status"]');
    expect(note?.closest('.print\\:hidden')).not.toBeNull();
    // Reintentar vuelve a leer la receta, que trae el formato de su sede.
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('10/16/2026 11:00 a. m.')).toBeInTheDocument();
    expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('una zona guardada inválida es formato ausente, nunca otra zona', async () => {
    mockedGet.mockResolvedValue(
      makePrescriptionDocument({
        locationFormat: { locale: 'en-US', hourCycle: 'h12', timeZone: 'Not/AZone' },
      }),
    );
    render(<PrescriptionPrintView token="tok" patientId="p1" prescriptionId="rx1" />);
    expect(await screen.findByText(SEDE_LOCALE_ERROR)).toBeInTheDocument();
    expect(screen.getByText('Fecha de emisión').nextSibling).toHaveTextContent(/^—$/);
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
    expect(await screen.findByRole('heading', { name: 'Receta' })).toBeInTheDocument();
  });

  it('una receta de otro paciente que el de la URL no se imprime: aviso de no encontrada', async () => {
    mockedGet.mockResolvedValue(makePrescriptionDocument({ patientId: 'otro' }));
    render(<PrescriptionPrintView token="tok" patientId="p1" prescriptionId="rx1" />);
    expect(await screen.findByText('No encontramos esta receta.')).toBeInTheDocument();
    expect(window.print).not.toHaveBeenCalled();
  });
});
