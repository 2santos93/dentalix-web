import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicalRecordCopiesSection } from './clinical-record-copies-section';
import { copyPeriodError } from './clinical-record-copy-dialog';
import { ApiError } from '@/lib/api/client';
import {
  generateClinicalRecordCopy,
  listClinicalRecordCopies,
} from '@/lib/patients/clinical-record-copies-api';
import { todayDate } from '@/lib/dates/iso';
import { makeCopySummary } from '@/lib/test/clinical-record-copies';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../lib/patients/clinical-record-copies-api', () => ({
  ...jest.requireActual('../../lib/patients/clinical-record-copies-api'),
  listClinicalRecordCopies: jest.fn(),
  generateClinicalRecordCopy: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/locations').clinicLocation()]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([]),
}));

const mockedList = listClinicalRecordCopies as jest.MockedFunction<typeof listClinicalRecordCopies>;
const mockedGenerate = generateClinicalRecordCopy as jest.MockedFunction<typeof generateClinicalRecordCopy>;

const today = todayDate('America/Caracas');

beforeEach(() => {
  mockedList.mockReset();
  mockedGenerate.mockReset();
  push.mockReset();
});

describe('copyPeriodError (DX-456)', () => {
  it('dice qué le falta al período', () => {
    expect(copyPeriodError(null, '2026-11-15')).toMatch(/Elige el primer/);
    expect(copyPeriodError({ from: '2026-04-01', to: '2026-03-01' }, '2026-11-15')).toMatch(/anterior o igual/);
    expect(copyPeriodError({ from: '2026-11-16', to: '2026-11-30' }, '2026-11-15')).toMatch(/después de hoy/);
    expect(copyPeriodError({ from: '1999-01-01', to: '2026-03-01' }, '2026-11-15')).toMatch(/entre el 01\/01\/2000/);
    expect(copyPeriodError({ from: '2026-01-01', to: '2026-11-15' }, '2026-11-15')).toBeNull();
  });
});

describe('ClinicalRecordCopiesSection (DX-456)', () => {
  it('lista las generaciones con período, secciones, autor, sede y «entregada a»', async () => {
    // Con el formato de SU sede (la de la copia), no el de la pantalla.
    mockedList.mockResolvedValue([makeCopySummary({ location: { id: 'loc-1', name: 'Sede Chacao' } })]);
    render(<ClinicalRecordCopiesSection token="tok" patientId="p1" />);
    const row = await screen.findByTestId('clinical-record-copy');
    expect(row).toHaveTextContent('Evoluciones y adendas, Citas');
    expect(row).toHaveTextContent('Dra. Andreina Salazar');
    expect(row).toHaveTextContent('Sede Chacao');
    expect(row).toHaveTextContent('Entregada a Carmen Rondón (madre)');
    await waitFor(() => expect(row).toHaveTextContent('01/03/2026'));
    expect(within(row).getByRole('link', { name: /Volver a imprimir/ })).toHaveAttribute(
      'href',
      '/print/patients/p1/clinical-record-copies/11111111-1111-4111-8111-111111111111',
    );
  });

  it('vacío: lo dice y enseña a generarla', async () => {
    mockedList.mockResolvedValue([]);
    render(<ClinicalRecordCopiesSection token="tok" patientId="p1" />);
    expect(await screen.findByText('Aún no se ha generado ninguna copia')).toBeInTheDocument();
  });

  it('error al cargar: SectionError con reintento', async () => {
    const user = userEvent.setup();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Fallo'));
    mockedList.mockResolvedValueOnce([makeCopySummary()]);
    render(<ClinicalRecordCopiesSection token="tok" patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByTestId('clinical-record-copy')).toBeInTheDocument();
  });

  it('genera con el período por defecto y todas las secciones y abre la vista imprimible', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([]);
    mockedGenerate.mockResolvedValue(makeCopySummary({ id: 'nueva' }));
    render(<ClinicalRecordCopiesSection token="tok" patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Copia de la historia clínica' }));
    const dialog = await screen.findByRole('dialog', { name: 'Copia de la historia clínica' });
    await user.type(within(dialog).getByLabelText('Entregado a (opcional)'), 'Carmen Rondón');
    await user.click(within(dialog).getByRole('button', { name: 'Generar e imprimir' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/print/patients/p1/clinical-record-copies/nueva'));
    expect(mockedGenerate).toHaveBeenCalledWith('tok', 'p1', {
      from: `${today.year}-01-01`,
      to: today.toString(),
      sections: [
        'EVOLUTIONS',
        'DIAGNOSES',
        'ANAMNESIS',
        'ODONTOGRAM',
        'ANESTHESIA_SEDATION',
        'CONSENTS',
        'PRESCRIPTIONS',
        'APPOINTMENTS',
      ],
      deliveredTo: 'Carmen Rondón',
    });
  });

  it('sin secciones no envía y lo dice junto al grupo; un 400 de la API se muestra en el diálogo', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([]);
    mockedGenerate.mockRejectedValue(new ApiError(400, 'El período no puede empezar después de hoy en la sede de la copia.'));
    render(<ClinicalRecordCopiesSection token="tok" patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Copia de la historia clínica' }));
    const dialog = await screen.findByRole('dialog', { name: 'Copia de la historia clínica' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Todas las secciones' }));
    await user.click(within(dialog).getByRole('button', { name: 'Generar e imprimir' }));
    expect(await within(dialog).findByText('Elige al menos una sección.')).toBeInTheDocument();
    expect(mockedGenerate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Recetas' }));
    await user.click(within(dialog).getByRole('button', { name: 'Generar e imprimir' }));
    expect(await within(dialog).findByText(/no puede empezar después de hoy/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
