import { render, screen, waitFor, within } from '@testing-library/react';
import { PatientPrescriptionsTab } from './patient-prescriptions-tab';
import {
  listPatientPrescriptions,
  voidPrescription,
} from '@/lib/prescriptions/prescriptions-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makePrescription, tokenFor } from '@/lib/test/prescriptions';

jest.mock('../../lib/prescriptions/prescriptions-api', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescriptions-api'),
  listPatientPrescriptions: jest.fn(),
  voidPrescription: jest.fn(),
  getPrescriptionIssuer: jest.fn().mockReturnValue(new Promise(() => {})),
  listPrescriptionTemplates: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/patients/clinical-api', () => ({
  getMedicalHistory: jest.fn().mockResolvedValue(null),
}));

const mockedList = listPatientPrescriptions as jest.MockedFunction<typeof listPatientPrescriptions>;
const mockedVoid = voidPrescription as jest.MockedFunction<typeof voidPrescription>;

const DENTIST = tokenFor('DENTIST', 'u-dentist');

describe('PatientPrescriptionsTab', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedVoid.mockReset();
  });

  it('carga con esqueleto anunciado', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<PatientPrescriptionsTab token={DENTIST} patientId="p1" />);
    expect(screen.getByRole('status', { name: /cargando recetas/i })).toBeInTheDocument();
  });

  it('vacío: enseña qué hacer y ofrece «Nueva receta» a quien prescribe', async () => {
    mockedList.mockResolvedValue([]);
    render(<PatientPrescriptionsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText('Este paciente no tiene recetas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nueva receta/i })).toBeInTheDocument();
  });

  it('la asistente las ve pero no emite ni anula', async () => {
    mockedList.mockResolvedValue([makePrescription()]);
    render(<PatientPrescriptionsTab token={tokenFor('ASSISTANT', 'u-a')} patientId="p1" />);
    await screen.findByRole('table', { name: 'Recetas del paciente' });
    expect(screen.queryByRole('button', { name: /nueva receta/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^anular/i })).not.toBeInTheDocument();
  });

  it('error de carga con reintento (SectionError)', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedList.mockResolvedValueOnce([makePrescription()]);
    render(<PatientPrescriptionsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Se cayó');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: 'Recetas del paciente' })).toBeInTheDocument();
  });

  it('lista medicamentos y enlaza la vista imprimible; las anuladas, tachadas con quién/cuándo/motivo', async () => {
    mockedList.mockResolvedValue([
      makePrescription(),
      makePrescription({
        id: 'rx0',
        status: 'VOIDED',
        voidedAt: '2026-10-15T16:00:00.000Z',
        voidedById: 'u-dentist',
        voidedByName: 'Dra. Laura Ruiz',
        voidReason: 'Dosis equivocada',
      }),
    ]);
    render(<PatientPrescriptionsTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Recetas del paciente' });
    const [, issued, voided] = within(table).getAllByRole('row');
    expect(issued).toHaveTextContent('Amoxicilina 500 mg · 21 cápsulas');
    expect(within(issued).getByRole('link', { name: /ver e imprimir/i })).toHaveAttribute(
      'href',
      '/print/patients/p1/prescriptions/rx1',
    );
    expect(within(issued).getByRole('button', { name: /anular/i })).toBeInTheDocument();
    expect(voided).toHaveTextContent('Anulada');
    expect(voided).toHaveTextContent(/por Dra\. Laura Ruiz\. Motivo: Dosis equivocada/);
    expect(within(voided).getByText(/Amoxicilina/).closest('ul')).toHaveClass('line-through');
    expect(within(voided).queryByRole('button', { name: /anular/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar|borrar|eliminar/i })).not.toBeInTheDocument();
  });

  it('otro odontólogo no ve «Anular» en una receta ajena; un ADMIN sí', async () => {
    mockedList.mockResolvedValue([makePrescription()]);
    const { unmount } = render(
      <PatientPrescriptionsTab token={tokenFor('DENTIST', 'u-otro')} patientId="p1" />,
    );
    await screen.findByRole('table', { name: 'Recetas del paciente' });
    expect(screen.queryByRole('button', { name: /^anular/i })).not.toBeInTheDocument();
    unmount();
    render(<PatientPrescriptionsTab token={tokenFor('ADMIN', 'u-admin')} patientId="p1" />);
    await screen.findByRole('table', { name: 'Recetas del paciente' });
    expect(screen.getAllByRole('button', { name: /^anular/i }).length).toBeGreaterThan(0);
  });

  it('anular pide motivo y deja la fila tachada', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makePrescription()]);
    mockedVoid.mockResolvedValue(
      makePrescription({
        status: 'VOIDED',
        voidedAt: '2026-10-16T16:00:00.000Z',
        voidedByName: 'Dra. Laura Ruiz',
        voidReason: 'Error de dosis',
      }),
    );
    render(<PatientPrescriptionsTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Recetas del paciente' });
    await user.click(within(table).getByRole('button', { name: /anular/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular receta' });
    const submit = within(dialog).getByRole('button', { name: 'Anular receta' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Motivo de la anulación'), 'Error de dosis');
    await user.click(submit);
    await waitFor(() => expect(mockedVoid).toHaveBeenCalledWith(DENTIST, 'rx1', 'Error de dosis'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Motivo: Error de dosis');
  });
});
