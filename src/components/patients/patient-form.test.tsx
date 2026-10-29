import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientForm } from './patient-form';
import { createPatient } from '@/lib/patients/patients-api';
import { listCountries } from '@/lib/reference/countries-api';
import { searchCities } from '@/lib/reference/cities-api';
import { getDocumentTypeNames } from '@/lib/patients/document-type-names-api';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching @/lib/patients/patients-api's actual location.
jest.mock('../../lib/patients/patients-api', () => ({
  createPatient: jest.fn(),
}));
jest.mock('../../lib/patients/document-type-names-api', () => ({
  getDocumentTypeNames: jest.fn(),
}));
jest.mock('../../lib/reference/countries-api', () => ({ listCountries: jest.fn() }));
jest.mock('../../lib/reference/cities-api', () => ({ searchCities: jest.fn() }));

const mockedCreatePatient = createPatient as jest.MockedFunction<typeof createPatient>;
const mockedGetNames = getDocumentTypeNames as jest.MockedFunction<typeof getDocumentTypeNames>;
const NO_NAMES = { NATIONAL_ID: null, PASSPORT: null, RESIDENCE_PERMIT: null, TAX_ID: null, OTHER: null };

async function fillRequired(user: ReturnType<typeof userEvent.setup>, type = 'NATIONAL_ID') {
  await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
  await user.type(screen.getByLabelText(/apellido/i), 'García');
  await user.selectOptions(screen.getByLabelText(/tipo de documento/i), type);
}

describe('PatientForm', () => {
  beforeEach(() => {
    mockedCreatePatient.mockReset();
    (listCountries as jest.Mock).mockResolvedValue([{ code: 'CO', name: 'Colombia' }]);
    (searchCities as jest.Mock).mockResolvedValue([{ id: 1, name: 'Bogotá', region: null }]);
    mockedGetNames.mockReset();
    mockedGetNames.mockResolvedValue(NO_NAMES);
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

  it('offers the five generic types in order', async () => {
    render(<PatientForm token="tok" />);
    const docType = screen.getByLabelText(/tipo de documento/i) as HTMLSelectElement;
    const sex = screen.getByLabelText(/sexo/i) as HTMLSelectElement;

    expect(Array.from(docType.options).map((o) => [o.value, o.textContent])).toEqual([
      ['', 'Elige el tipo'],
      ['NATIONAL_ID', 'Documento nacional'],
      ['PASSPORT', 'Pasaporte'],
      ['RESIDENCE_PERMIT', 'Permiso de residencia'],
      ['TAX_ID', 'Identificación fiscal'],
      ['OTHER', 'Otro documento'],
    ]);

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
            docType: 'NATIONAL_ID',
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
    await fillRequired(user);

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
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /crear|guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Documento ya registrado');
  });

  describe('tipo de documento genérico (DX-327)', () => {
    it('the type has no default and is required', async () => {
      const user = userEvent.setup();
      render(<PatientForm token="tok" />);
      const select = screen.getByLabelText(/tipo de documento/i) as HTMLSelectElement;
      expect(select).toHaveValue('');
      expect(select).toBeRequired();

      await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
      await user.type(screen.getByLabelText(/apellido/i), 'García');
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));

      expect(mockedCreatePatient).not.toHaveBeenCalled();
      expect(
        screen.getByText('Nombre, apellido y tipo de documento son obligatorios para continuar.'),
      ).toBeInTheDocument();
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select).toHaveAttribute('aria-describedby', 'patient-doc-type-error');
      expect(document.getElementById('patient-doc-type-error')).toHaveTextContent(
        'Elige el tipo de documento.',
      );
      expect(select).toHaveFocus();
      await screen.findByRole('option', { name: 'Colombia' });
    });

    it('creates with the chosen generic type', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue({ id: 'p1' } as Awaited<ReturnType<typeof createPatient>>);
      const onCreated = jest.fn();
      render(<PatientForm token="tok" onCreated={onCreated} />);
      await fillRequired(user, 'TAX_ID');
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));
      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(mockedCreatePatient.mock.calls[0][1]).toMatchObject({ docType: 'TAX_ID' });
    });

    it("the options show the clinic's local names, and the generic ones if loading them fails", async () => {
      mockedGetNames.mockResolvedValue({ ...NO_NAMES, NATIONAL_ID: 'ID local' });
      const { unmount } = render(<PatientForm token="tok" />);
      expect(await screen.findByRole('option', { name: 'ID local' })).toHaveValue('NATIONAL_ID');
      expect(screen.getByRole('option', { name: 'Otro documento' })).toHaveValue('OTHER');
      await screen.findByRole('option', { name: 'Colombia' });
      unmount();

      mockedGetNames.mockRejectedValue(new Error('down'));
      render(<PatientForm token="tok" />);
      await screen.findByRole('option', { name: 'Colombia' });
      expect(screen.getByRole('option', { name: 'Documento nacional' })).toHaveValue('NATIONAL_ID');
      expect(screen.getByLabelText(/tipo de documento/i)).toBeEnabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('sends the number as typed', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue({ id: 'p1' } as Awaited<ReturnType<typeof createPatient>>);
      const onCreated = jest.fn();
      render(<PatientForm token="tok" onCreated={onCreated} />);
      await fillRequired(user);
      await user.type(screen.getByLabelText(/número de documento/i), 'V-12.345.678');
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));
      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mockedCreatePatient.mock.calls[0][1]).toMatchObject({ docNumber: 'V-12.345.678' });
    });
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
