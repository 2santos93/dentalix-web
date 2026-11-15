import { render, screen, within } from '@testing-library/react';
import { ClinicalRecordCopyPrintView } from './clinical-record-copy-print-view';
import { getClinicalRecordCopyDocument } from '@/lib/patients/clinical-record-copies-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeCopyDocument } from '@/lib/test/clinical-record-copies';

jest.mock('../../lib/patients/clinical-record-copies-api', () => ({
  ...jest.requireActual('../../lib/patients/clinical-record-copies-api'),
  getClinicalRecordCopyDocument: jest.fn(),
}));

const mockedGet = getClinicalRecordCopyDocument as jest.MockedFunction<typeof getClinicalRecordCopyDocument>;

describe('ClinicalRecordCopyPrintView (DX-456)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    window.print = jest.fn();
  });

  it('pinta la cabecera y las secciones, abre la impresión una vez y nunca muestra ids', async () => {
    const doc = makeCopyDocument();
    mockedGet.mockResolvedValue(doc);
    render(<ClinicalRecordCopyPrintView token="tok" patientId="p1" copyId="c1" />);
    expect(await screen.findByRole('heading', { name: 'Copia de la historia clínica' })).toBeInTheDocument();
    expect(window.print).toHaveBeenCalledTimes(1);
    const header = screen.getByTestId('copy-header');
    expect(within(header).getByText('Clínica Dental Ávila')).toBeInTheDocument();
    expect(within(header).getByText(/Sede Chacao/)).toBeInTheDocument();
    expect(screen.getByTestId('copy-patient')).toHaveTextContent('Mariela Rondón');
    expect(screen.getByTestId('copy-period')).toHaveTextContent(/01\/03\/2026 al 31\/03\/2026/);
    // Adendas en orden.
    const addenda = screen.getAllByTestId('copy-addendum').map((a) => a.textContent);
    expect(addenda[0]).toContain('Control a los 7 días.');
    expect(addenda[1]).toContain('Evolución favorable.');
    // Sección elegida sin registros.
    expect(within(screen.getByTestId('copy-section-APPOINTMENTS')).getByText('Sin registros en el período.')).toBeInTheDocument();
    // Ni ids internos ni secciones no elegidas.
    const text = document.body.textContent ?? '';
    expect(text).not.toContain(doc.copy.id);
    expect(text).not.toContain(doc.copy.generatedBy.id);
    expect(text).not.toContain(doc.copy.location.id);
    expect(screen.queryByTestId('copy-section-CONSENTS')).not.toBeInTheDocument();
    // Cabecera de hoja y «Página X de Y» con el nombre (no un id).
    const style = screen.getByTestId('copy-page-style').textContent ?? '';
    expect(style).toContain('Mariela Rondón · Copia de la historia clínica');
    expect(style).toContain('counter(pages)');
    expect(screen.getByRole('link', { name: /volver a la ficha/i })).toHaveAttribute('href', '/patients/p1?tab=clinical-history');
  });

  it('un período sin registros dice «Sin registros en el período»', async () => {
    mockedGet.mockResolvedValue(makeCopyDocument({ content: { evolutions: [], appointments: [] }, empty: true }));
    render(<ClinicalRecordCopyPrintView token="tok" patientId="p1" copyId="c1" />);
    expect(await screen.findByText('Sin registros en el período')).toBeInTheDocument();
  });

  it('sin permiso no pide nada; 403 de la API también es aviso', async () => {
    const { unmount } = render(<ClinicalRecordCopyPrintView token="tok" patientId="p1" copyId="c1" allowed={false} />);
    expect(screen.getByText('No tienes acceso a esta copia.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
    unmount();
    mockedGet.mockRejectedValueOnce(new ApiError(403, 'No tienes acceso a esta sede.'));
    render(<ClinicalRecordCopyPrintView token="tok" patientId="p1" copyId="c1" />);
    expect(await screen.findByText('No tienes acceso a esta copia.')).toBeInTheDocument();
  });

  it('404 es un aviso; otro error, SectionError con reintento', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'No encontrada'));
    const { unmount } = render(<ClinicalRecordCopyPrintView token="tok" patientId="p1" copyId="c1" />);
    expect(await screen.findByText('No encontramos esta copia.')).toBeInTheDocument();
    unmount();

    mockedGet.mockRejectedValueOnce(new ApiError(500, 'x'));
    mockedGet.mockResolvedValueOnce(makeCopyDocument());
    render(<ClinicalRecordCopyPrintView token="tok" patientId="p1" copyId="c1" />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Copia de la historia clínica' })).toBeInTheDocument();
  });

  it('sin formato de la sede: «—» en las fechas y la nota fuera del papel', async () => {
    mockedGet.mockResolvedValue(
      makeCopyDocument({ location: { name: 'Sede Chacao', address: null, timeZone: 'America/Caracas', locale: null, hourCycle: 'h12' } }),
    );
    render(<ClinicalRecordCopyPrintView token="tok" patientId="p1" copyId="c1" />);
    expect(await screen.findByTestId('copy-generated')).toHaveTextContent(/^—$/);
  });
});
