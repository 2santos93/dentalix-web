import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientEditModal } from './patient-edit-modal';
import { updatePatient } from '@/lib/patients/patients-api';
import type { Patient } from '@/lib/patients/patients-api';

// jest.mock con ruta RELATIVA: el transform SWC no reescribe `@/`.
jest.mock('../../lib/patients/patients-api', () => ({ updatePatient: jest.fn() }));
const mockedUpdate = updatePatient as jest.MockedFunction<typeof updatePatient>;

const patient = {
  id: 'p1',
  tenantId: 't1',
  firstName: 'Carlos',
  lastName: 'Mejía',
  docType: 'CC',
  docNumber: '1002',
  birthDate: null,
  sex: 'M',
  phone: null,
  email: null,
  address: null,
  countryCode: null,
  cityId: null,
  notes: null,
  dataConsentAccepted: false,
  dataConsentAt: null,
  dataConsentPolicyVersion: null,
  maritalStatus: null,
  occupation: null,
  insurerEps: null,
  physicianName: null,
  physicianPhone: null,
  emergencyContactName: null,
  emergencyContactRelationship: null,
  emergencyContactPhone: null,
  guardianName: null,
  guardianDocNumber: null,
  createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Patient;

describe('PatientEditModal', () => {
  beforeEach(() => mockedUpdate.mockReset());

  it('precarga los datos actuales del paciente', () => {
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    expect(screen.getByLabelText(/^nombre$/i)).toHaveValue('Carlos');
    expect(screen.getByLabelText(/^apellido$/i)).toHaveValue('Mejía');
  });

  it('guarda los campos administrativos que antes no se podían cargar', async () => {
    mockedUpdate.mockResolvedValue({ ...patient, occupation: 'Docente' });
    const onSaved = jest.fn();
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={onSaved} />,
    );

    await user.type(screen.getByLabelText(/ocupación/i), 'Docente');
    await user.type(screen.getByLabelText(/contacto de emergencia/i), 'Ana Pérez');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, id, input] = mockedUpdate.mock.calls[0];
    expect(id).toBe('p1');
    expect(input.occupation).toBe('Docente');
    expect(input.emergencyContactName).toBe('Ana Pérez');
    expect(onSaved).toHaveBeenCalled();
  });

  it('no manda los campos que quedaron vacíos', async () => {
    mockedUpdate.mockResolvedValue(patient);
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    await user.type(screen.getByLabelText(/ocupación/i), 'Docente');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , input] = mockedUpdate.mock.calls[0];
    expect(input).not.toHaveProperty('insurerEps');
  });

  it('manda null cuando se borra un campo que sí tenía valor', async () => {
    const withEmail = { ...patient, email: 'viejo@x.com' };
    mockedUpdate.mockResolvedValue(withEmail);
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={withEmail} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    await user.clear(screen.getByLabelText(/correo electrónico/i));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , input] = mockedUpdate.mock.calls[0];
    expect(input.email).toBeNull();
  });

  it('omite birthDate en vez de mandar null al borrarlo (el backend lo escribiría como 1970-01-01)', async () => {
    // Junto con el email, borrados los dos: el email debe viajar como `null`
    // (regla general de FIX 2) pero `birthDate` debe brillar por su ausencia,
    // no por un `null` — si el fix tratara ambos igual, este test lo detecta.
    const withBoth = { ...patient, birthDate: '2000-05-01T00:00:00.000Z', email: 'viejo@x.com' };
    mockedUpdate.mockResolvedValue(withBoth);
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={withBoth} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    await user.clear(screen.getByLabelText(/fecha de nacimiento/i));
    await user.clear(screen.getByLabelText(/correo electrónico/i));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , input] = mockedUpdate.mock.calls[0];
    expect(input).not.toHaveProperty('birthDate');
    expect(input.email).toBeNull();
  });

  it('no reenvía un campo que no cambió, aunque tuviera valor', async () => {
    const withPhone = { ...patient, phone: '3000000001' };
    mockedUpdate.mockResolvedValue(withPhone);
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={withPhone} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    await user.type(screen.getByLabelText(/ocupación/i), 'Docente');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , input] = mockedUpdate.mock.calls[0];
    expect(input).not.toHaveProperty('phone');
    expect(input.occupation).toBe('Docente');
  });

  it('omite docType y sex si no cambiaron', async () => {
    mockedUpdate.mockResolvedValue(patient);
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    await user.type(screen.getByLabelText(/ocupación/i), 'Docente');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , input] = mockedUpdate.mock.calls[0];
    expect(input).not.toHaveProperty('docType');
    expect(input).not.toHaveProperty('sex');
  });

  it('descarta una edición cancelada al reabrir el modal', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    await user.type(screen.getByLabelText(/ocupación/i), 'Docente');
    expect(screen.getByLabelText(/ocupación/i)).toHaveValue('Docente');

    // Cancelar cierra el modal (onOpenChange(false)) pero no lo desmonta.
    rerender(
      <PatientEditModal open={false} patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    // Reabrir con el mismo paciente.
    rerender(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    expect(screen.getByLabelText(/ocupación/i)).toHaveValue('');
  });

  it('muestra el error del backend tal cual', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedUpdate.mockRejectedValue(new ApiError(409, 'Documento duplicado'));
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    await user.type(screen.getByLabelText(/ocupación/i), 'X');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Documento duplicado');
  });
});
