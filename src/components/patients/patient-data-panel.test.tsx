import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientDataPanel } from './patient-data-panel';
import type { Patient } from '@/lib/patients/patients-api';

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    tenantId: 't1',
    firstName: 'Carlos',
    lastName: 'Mejía',
    docType: 'CC',
    docNumber: '1002',
    birthDate: '1992-03-12T00:00:00.000Z',
    sex: 'M',
    phone: null,
    email: null,
    address: null,
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
    ...overrides,
  };
}

describe('PatientDataPanel', () => {
  it('muestra identificación con la edad calculada', () => {
    // Edad fija: el test no puede depender del día en que corre.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    render(<PatientDataPanel patient={patient()} onEdit={() => {}} />);

    expect(screen.getByText('CC')).toBeInTheDocument();
    expect(screen.getByText('1002')).toBeInTheDocument();
    expect(screen.getByText(/34 años/)).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('oculta por completo un bloque sin datos', () => {
    render(<PatientDataPanel patient={patient()} onEdit={() => {}} />);
    // Sin contacto de emergencia ni acudiente cargados.
    expect(screen.queryByText(/^Emergencia$/)).not.toBeInTheDocument();
  });

  it('muestra el bloque de emergencia cuando hay datos', () => {
    render(
      <PatientDataPanel
        patient={patient({ emergencyContactName: 'Ana Pérez', emergencyContactRelationship: 'Madre' })}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText(/^Emergencia$/)).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
  });

  it('muestra el consentimiento con su fecha cuando fue aceptado', () => {
    render(
      <PatientDataPanel
        patient={patient({ dataConsentAccepted: true, dataConsentAt: '2026-03-12T00:00:00.000Z' })}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText(/consentimiento/i)).toBeInTheDocument();
  });

  it('avisa al padre cuando se pulsa Editar', async () => {
    const onEdit = jest.fn();
    const user = userEvent.setup();
    render(<PatientDataPanel patient={patient()} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /editar/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
