import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientCreateWizard } from './patient-create-wizard';
import { createPatient } from '@/lib/patients/patients-api';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching @/lib/patients/patients-api's actual location.
jest.mock('../../lib/patients/patients-api', () => ({
  createPatient: jest.fn(),
}));

const mockedCreatePatient = createPatient as jest.MockedFunction<typeof createPatient>;

async function goToStep(user: ReturnType<typeof userEvent.setup>, times: number) {
  for (let i = 0; i < times; i += 1) {
    await user.click(screen.getByRole('button', { name: /siguiente/i }));
  }
}

describe('PatientCreateWizard', () => {
  beforeEach(() => {
    mockedCreatePatient.mockReset();
  });

  it('renders the wizard steps and the basic-info fields on step 1', () => {
    render(<PatientCreateWizard token="tok" />);
    expect(screen.getByText('Datos')).toBeInTheDocument();
    expect(screen.getByText('Antecedentes')).toBeInTheDocument();
    expect(screen.getByText('Alergias y medicamentos')).toBeInTheDocument();
    expect(screen.getByText('Hábitos')).toBeInTheDocument();
    expect(screen.getByText('Consentimiento')).toBeInTheDocument();
    expect(screen.getByLabelText(/^nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apellido/i)).toBeInTheDocument();
  });

  it('blocks advancing past step 1 without nombre/apellido and shows a validation message', async () => {
    const user = userEvent.setup();
    render(<PatientCreateWizard token="tok" />);
    await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
    await user.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // still on step 1 — the basic-info fields are still visible.
    expect(screen.getByLabelText(/^nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número de documento/i)).toBeInTheDocument();
  });

  it('creates a patient with the assembled medical history and consent after completing the wizard', async () => {
    const user = userEvent.setup();
    mockedCreatePatient.mockResolvedValue({
      id: 'p1',
      tenantId: 't1',
      firstName: 'Ana',
      lastName: 'García',
      docType: 'CC',
      docNumber: '123',
      birthDate: null,
      sex: 'UNSPECIFIED',
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdById: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    render(<PatientCreateWizard token="tok" />);

    await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
    await user.type(screen.getByLabelText(/apellido/i), 'García');
    await user.type(screen.getByLabelText(/número de documento/i), '123');
    await goToStep(user, 1); // -> Antecedentes
    await goToStep(user, 1); // -> Alergias y medicamentos

    await user.click(screen.getByRole('button', { name: /agregar alergia/i }));

    await goToStep(user, 1); // -> Hábitos
    await goToStep(user, 1); // -> Consentimiento

    await user.click(
      screen.getByRole('checkbox', { name: /tratamiento de sus datos/i }),
    );
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(mockedCreatePatient).toHaveBeenCalledTimes(1);
    const [, input] = mockedCreatePatient.mock.calls[0];
    expect(input).toMatchObject({
      firstName: 'Ana',
      lastName: 'García',
      docType: 'CC',
      sex: 'UNSPECIFIED',
      docNumber: '123',
      dataConsentAccepted: true,
      dataConsentPolicyVersion: 'v1',
    });
    expect(input.medicalHistory?.allergies).toHaveLength(1);
    expect(typeof input.dataConsentAt).toBe('string');
  });
});
