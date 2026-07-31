import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientForm } from './patient-form';
import { createPatient } from '@/lib/patients/patients-api';
import { listCountries } from '@/lib/reference/countries-api';
import { searchCities } from '@/lib/reference/cities-api';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching @/lib/patients/patients-api's actual location.
jest.mock('../../lib/patients/patients-api', () => ({
  createPatient: jest.fn(),
}));
jest.mock('../../lib/reference/countries-api', () => ({ listCountries: jest.fn() }));
jest.mock('../../lib/reference/cities-api', () => ({ searchCities: jest.fn() }));

const mockedCreatePatient = createPatient as jest.MockedFunction<typeof createPatient>;

describe('PatientForm', () => {
  beforeEach(() => {
    mockedCreatePatient.mockReset();
    (listCountries as jest.Mock).mockResolvedValue([{ code: 'CO', name: 'Colombia' }]);
    (searchCities as jest.Mock).mockResolvedValue([{ id: 1, name: 'Bogotá', region: null }]);
  });

  it('renders the required fields with accessible labels', async () => {
    render(<PatientForm token="tok" />);
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apellido/i)).toBeInTheDocument();
    // Flush the countries-fetch effect (see patient-form.tsx's `useEffect`)
    // before the test ends, so it doesn't resolve mid-way through a later
    // test and trigger a "not wrapped in act" warning.
    await screen.findByRole('option', { name: 'Colombia' });
  });

  it('renders docType and sex selects with the enum options', async () => {
    render(<PatientForm token="tok" />);
    const docType = screen.getByLabelText(/tipo de documento/i) as HTMLSelectElement;
    const sex = screen.getByLabelText(/sexo/i) as HTMLSelectElement;

    const docTypeValues = Array.from(docType.options).map((o) => o.value);
    expect(docTypeValues).toEqual(expect.arrayContaining(['CC', 'TI', 'CE', 'PASSPORT', 'OTHER']));

    const sexValues = Array.from(sex.options).map((o) => o.value);
    expect(sexValues).toEqual(expect.arrayContaining(['M', 'F', 'OTHER', 'UNSPECIFIED']));
    await screen.findByRole('option', { name: 'Colombia' });
  });

  it('renders optional fields with accessible labels', async () => {
    render(<PatientForm token="tok" />);
    expect(screen.getByLabelText(/número de documento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nacimiento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dirección/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notas/i)).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Colombia' });
  });

  it('renders a submit button', async () => {
    render(<PatientForm token="tok" />);
    expect(screen.getByRole('button', { name: /crear|guardar/i })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Colombia' });
  });

  it('disables the submit button while submitting', async () => {
    const user = userEvent.setup();
    let resolveCreate: () => void = () => {};
    mockedCreatePatient.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = () =>
          resolve({
            id: '1',
            tenantId: 't1',
            firstName: 'Ana',
            lastName: 'García',
            docType: 'CC',
            docNumber: null,
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
      }),
    );

    render(<PatientForm token="tok" />);
    await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
    await user.type(screen.getByLabelText(/apellido/i), 'García');

    const submit = screen.getByRole('button', { name: /crear|guardar/i });
    expect(submit).not.toBeDisabled();
    await user.click(submit);
    expect(submit).toBeDisabled();
    resolveCreate();
    await waitFor(() => expect(mockedCreatePatient).toHaveBeenCalledTimes(1));
  });

  it('shows an alert with the API error message when creation fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedCreatePatient.mockRejectedValue(new ApiError(409, 'Documento ya registrado'));

    const user = userEvent.setup();
    render(<PatientForm token="tok" />);
    await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
    await user.type(screen.getByLabelText(/apellido/i), 'García');
    await user.click(screen.getByRole('button', { name: /crear|guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Documento ya registrado');
  });

  it('renders País select and Ciudad combobox; city is disabled until a country is chosen', async () => {
    render(<PatientForm token="tok" />);
    const country = await screen.findByLabelText(/país/i);
    expect(screen.getByLabelText(/ciudad/i)).toBeDisabled();
    await screen.findByRole('option', { name: 'Colombia' });
    await userEvent.selectOptions(country, 'CO');
    expect(screen.getByLabelText(/ciudad/i)).not.toBeDisabled();
  });
});
