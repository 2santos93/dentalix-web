import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  await user.type(screen.getByLabelText(/^nombre$/i), 'Ana');
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
    expect(screen.getByLabelText(/^nombre$/i)).toBeInTheDocument();
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

      await user.type(screen.getByLabelText(/^nombre$/i), 'Ana');
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

    it('a missing first name or surname is marked on its own field', async () => {
      const user = userEvent.setup();
      render(<PatientForm token="tok" />);
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));

      const first = screen.getByLabelText(/^nombre$/i);
      const last = screen.getByLabelText(/apellido/i);
      expect(first).toHaveAttribute('aria-invalid', 'true');
      expect(first).toHaveAttribute('aria-describedby', 'patient-first-name-error');
      expect(document.getElementById('patient-first-name-error')).toHaveTextContent('Escribe el nombre.');
      expect(last).toHaveAttribute('aria-invalid', 'true');
      expect(last).toHaveAttribute('aria-describedby', 'patient-last-name-error');
      expect(document.getElementById('patient-last-name-error')).toHaveTextContent('Escribe el apellido.');
      expect(first).toHaveFocus();

      await user.type(first, 'Ana');
      expect(first).not.toHaveAttribute('aria-invalid');
      expect(document.getElementById('patient-first-name-error')).toBeNull();
      await screen.findByRole('option', { name: 'Colombia' });
    });

    it('a malformed email never reaches the API and is marked on its field', async () => {
      const user = userEvent.setup();
      render(<PatientForm token="tok" />);
      await fillRequired(user);
      const email = screen.getByLabelText(/correo/i);
      await user.type(email, 'ana@');
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));

      expect(mockedCreatePatient).not.toHaveBeenCalled();
      expect(email).toHaveAttribute('aria-invalid', 'true');
      expect(email).toHaveAttribute('aria-describedby', 'patient-email-error');
      expect(document.getElementById('patient-email-error')).toHaveTextContent(
        'Revisa el correo electrónico',
      );
      expect(email).toHaveFocus();
      // Solo falla el correo: no hay aviso de obligatorios.
      expect(
        screen.queryByText('Nombre, apellido y tipo de documento son obligatorios para continuar.'),
      ).not.toBeInTheDocument();

      mockedCreatePatient.mockResolvedValue({ id: 'p1' } as Awaited<ReturnType<typeof createPatient>>);
      await user.type(email, 'demo.com');
      expect(email).not.toHaveAttribute('aria-invalid');
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));
      await waitFor(() => expect(mockedCreatePatient).toHaveBeenCalledTimes(1));
      expect(mockedCreatePatient.mock.calls[0][1]).toMatchObject({ email: 'ana@demo.com' });
    });

    it('a 400 the API ties to a field is shown on that field', async () => {
      const { ApiError } = jest.requireActual('../../lib/api/client');
      mockedCreatePatient.mockRejectedValue(
        new ApiError(400, 'Bad Request', {
          messages: ['El correo electrónico no es válido.'],
          field: 'email',
        }),
      );
      const user = userEvent.setup();
      render(<PatientForm token="tok" />);
      await fillRequired(user);
      const email = screen.getByLabelText(/correo/i);
      await user.type(email, 'ana@demo.com');
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));

      await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
      expect(document.getElementById('patient-email-error')).toHaveTextContent(
        'El correo electrónico no es válido.',
      );
      expect(email).toHaveFocus();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it('sends the free label trimmed, or omits it when empty', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue({ id: 'p1' } as Awaited<ReturnType<typeof createPatient>>);
      const onCreated = jest.fn();
      const { unmount } = render(<PatientForm token="tok" onCreated={onCreated} />);
      await fillRequired(user);
      const label = screen.getByLabelText('Nombre del documento (opcional)');
      expect(screen.getByText('Si lo escribes, los documentos impresos lo muestran en lugar del tipo.')).toBeInTheDocument();
      await user.type(label, '  ID   local  ');
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(mockedCreatePatient.mock.calls[0][1]).toMatchObject({ docTypeLabel: 'ID local' });
      await screen.findByRole('option', { name: 'Colombia' });
      unmount();

      render(<PatientForm token="tok" onCreated={onCreated} />);
      await fillRequired(user);
      await user.type(screen.getByLabelText('Nombre del documento (opcional)'), '   ');
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
      expect(mockedCreatePatient.mock.calls[1][1]).not.toHaveProperty('docTypeLabel');
      await screen.findByRole('option', { name: 'Colombia' });
    });

    it('rejects a label over 40 characters', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue({ id: 'p1' } as Awaited<ReturnType<typeof createPatient>>);
      render(<PatientForm token="tok" />);
      await fillRequired(user);
      const label = screen.getByLabelText('Nombre del documento (opcional)');
      // 41 caracteres fuera del plano básico: el campo no los corta antes de validar.
      fireEvent.change(label, { target: { value: '\u{1D49C}'.repeat(41) } });
      expect(label).toHaveValue('\u{1D49C}'.repeat(41));
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));

      expect(mockedCreatePatient).not.toHaveBeenCalled();
      expect(label).toHaveAttribute('aria-invalid', 'true');
      expect(label).toHaveAttribute('aria-describedby', 'patient-doc-type-label-error');
      expect(document.getElementById('patient-doc-type-label-error')).toHaveTextContent('Hasta 40 caracteres.');
      expect(label).toHaveFocus();
      expect(
        screen.queryByText('Nombre, apellido y tipo de documento son obligatorios para continuar.'),
      ).not.toBeInTheDocument();

      // 40 caracteres (80 unidades UTF-16) sí caben.
      fireEvent.change(label, { target: { value: '\u{1D49C}'.repeat(40) } });
      expect(label).not.toHaveAttribute('aria-invalid');
      await user.click(screen.getByRole('button', { name: /crear|guardar/i }));
      await waitFor(() => expect(mockedCreatePatient).toHaveBeenCalledTimes(1));
      expect(mockedCreatePatient.mock.calls[0][1]).toMatchObject({ docTypeLabel: '\u{1D49C}'.repeat(40) });
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
