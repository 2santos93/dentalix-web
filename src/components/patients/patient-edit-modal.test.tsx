import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientEditModal } from './patient-edit-modal';
import { updatePatient } from '@/lib/patients/patients-api';
import type { Patient } from '@/lib/patients/patients-api';
import { getDocumentTypeNames } from '@/lib/patients/document-type-names-api';

// jest.mock con ruta RELATIVA: el transform SWC no reescribe `@/`.
jest.mock('../../lib/patients/patients-api', () => ({ updatePatient: jest.fn() }));
// El modal no pide los nombres: se los pasa la ficha (sin un segundo GET).
jest.mock('../../lib/patients/document-type-names-api', () => ({ getDocumentTypeNames: jest.fn() }));
const mockedUpdate = updatePatient as jest.MockedFunction<typeof updatePatient>;

const patient = {
  id: 'p1',
  tenantId: 't1',
  firstName: 'Carlos',
  lastName: 'Mejía',
  docType: 'NATIONAL_ID',
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

  it('ya no ofrece «Aseguradora / EPS»: la cobertura se edita en su sección (DX-153)', () => {
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    expect(screen.queryByLabelText(/aseguradora/i)).not.toBeInTheDocument();
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

  it('manda null al borrar una fecha de nacimiento, que ahora sí la vacía', async () => {
    // Antes `birthDate` era la excepción: el handler hacía `new Date(null)` y
    // escribía 1970-01-01, así que había que omitirlo. Con el backend
    // arreglado (`null` vacía la columna) sigue la regla general, y borrar una
    // fecha mal cargada por fin funciona.
    const withBoth = { ...patient, birthDate: '2000-05-01T00:00:00.000Z', email: 'viejo@x.com' };
    mockedUpdate.mockResolvedValue(withBoth);
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={withBoth} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    // DateField (segmentos de react-aria): se vacía borrando cada segmento.
    const birth = screen.getByRole('group', { name: /fecha de nacimiento/i });
    for (const segment of within(birth).getAllByRole('spinbutton')) {
      await user.click(segment);
      await user.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}');
    }
    await user.clear(screen.getByLabelText(/correo electrónico/i));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , input] = mockedUpdate.mock.calls[0];
    expect(input.birthDate).toBeNull();
    expect(input.email).toBeNull();
  });

  it('omite firstName en vez de mandar null al borrarlo (NOT NULL en el schema)', async () => {
    // `firstName`/`lastName` son NOT NULL en Prisma; un `null` se cuela
    // pasando de largo `@IsOptional()` (que salta TODOS los validadores,
    // incluido `@MinLength`) y revienta en un 500 al llegar a Postgres.
    mockedUpdate.mockResolvedValue(patient);
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    const firstNameInput = screen.getByLabelText(/^nombre$/i);
    fireEvent.change(firstNameInput, { target: { value: '' } });
    // El input es `required`: un click normal dispararía la validación
    // nativa del navegador y ni llegaría a `onSubmit`. Se dispara el submit
    // directo para probar la guarda de `buildPatch` en sí (defensa en
    // profundidad, no sólo el `required` del DOM).
    fireEvent.submit(firstNameInput.closest('form')!);

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , input] = mockedUpdate.mock.calls[0];
    expect(input).not.toHaveProperty('firstName');
  });

  it('el required en Nombre bloquea el guardado antes de llegar al backend', async () => {
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );

    await user.clear(screen.getByLabelText(/^nombre$/i));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(mockedUpdate).not.toHaveBeenCalled();
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

  it("seeds the patient's generic type and sends it only when it changes", async () => {
    mockedUpdate.mockResolvedValue(patient);
    const user = userEvent.setup();
    render(
      <PatientEditModal
        open
        patient={patient}
        token="tok"
        docTypeNames={{ NATIONAL_ID: 'ID local' }}
        onOpenChange={() => {}}
        onSaved={() => {}}
      />,
    );
    const select = screen.getByLabelText(/tipo de documento/i) as HTMLSelectElement;
    expect(select).toHaveValue('NATIONAL_ID');
    expect(getDocumentTypeNames).not.toHaveBeenCalled();
    expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
      ['NATIONAL_ID', 'ID local'],
      ['PASSPORT', 'Pasaporte'],
      ['RESIDENCE_PERMIT', 'Permiso de residencia'],
      ['TAX_ID', 'Identificación fiscal'],
      ['OTHER', 'Otro documento'],
    ]);

    await user.selectOptions(select, 'PASSPORT');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toEqual({ docType: 'PASSPORT' });
  });

  it('legacy code from an older API seeds its generic type and is not sent back unchanged', async () => {
    mockedUpdate.mockResolvedValue(patient);
    const user = userEvent.setup();
    const legacy = { ...patient, docType: 'CE' } as unknown as Patient;
    render(
      <PatientEditModal open patient={legacy} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    expect(screen.getByLabelText(/tipo de documento/i)).toHaveValue('RESIDENCE_PERMIT');

    await user.type(screen.getByLabelText(/ocupación/i), 'Docente');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('docType');
  });

  it('changing the type clears the label field', async () => {
    mockedUpdate.mockResolvedValue(patient);
    const user = userEvent.setup();
    const labelled = { ...patient, docTypeLabel: 'ID local' };
    render(
      <PatientEditModal open patient={labelled} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    const label = screen.getByLabelText('Nombre del documento (opcional)');
    expect(label).toHaveValue('ID local');

    await user.selectOptions(screen.getByLabelText(/tipo de documento/i), 'PASSPORT');
    expect(label).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toEqual({ docType: 'PASSPORT', docTypeLabel: null });
  });

  it('changing the type and back restores the saved label instead of deleting it', async () => {
    mockedUpdate.mockResolvedValue(patient);
    const user = userEvent.setup();
    const labelled = { ...patient, docTypeLabel: 'ID local' };
    render(
      <PatientEditModal open patient={labelled} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    const label = screen.getByLabelText('Nombre del documento (opcional)');
    const type = screen.getByLabelText(/tipo de documento/i);

    await user.selectOptions(type, 'PASSPORT');
    expect(label).toHaveValue('');
    await user.selectOptions(type, 'NATIONAL_ID');
    expect(label).toHaveValue('ID local');

    await user.type(screen.getByLabelText(/^teléfono$/i), '3000000001');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toEqual({ phone: '3000000001' });
  });

  it('places the type next to its number, with the free label right below', () => {
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    const section = screen.getByRole('heading', { name: 'Identificación' }).parentElement!;
    const labels = Array.from(section.querySelectorAll('label')).map((l) => l.textContent);
    expect(labels).toEqual([
      'Nombre',
      'Apellido',
      'Tipo de documento',
      'Número de documento',
      'Nombre del documento (opcional)',
      'Fecha de nacimiento',
      'Sexo',
    ]);
  });

  it('an email the API would reject («ana@x», no TLD) is marked on its field and not sent', async () => {
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    const email = screen.getByLabelText(/correo electrónico/i);
    await user.type(email, 'ana@x');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-describedby', 'pe-email-error');
    expect(document.getElementById('pe-email-error')).toHaveTextContent('Revisa el correo electrónico');
    expect(email).toHaveFocus();

    mockedUpdate.mockResolvedValue(patient);
    await user.type(email, '.co');
    expect(email).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toEqual({ email: 'ana@x.co' });
  });

  it('an unchanged saved email does not block saving other fields', async () => {
    mockedUpdate.mockResolvedValue(patient);
    const user = userEvent.setup();
    const oldEmail = { ...patient, email: 'ana@x' };
    render(
      <PatientEditModal open patient={oldEmail} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    await user.type(screen.getByLabelText(/ocupación/i), 'Docente');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toEqual({ occupation: 'Docente' });
  });

  it('rejects a label with a control or format character, as the API does', async () => {
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    const label = screen.getByLabelText('Nombre del documento (opcional)');
    fireEvent.change(label, { target: { value: 'ID \u202Elocal' } });
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(label).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('pe-docTypeLabel-error')).toHaveTextContent(
      'El nombre del documento no puede llevar caracteres de control.',
    );
    expect(label).toHaveFocus();
  });

  it('sends docTypeLabel null when the label is emptied', async () => {
    mockedUpdate.mockResolvedValue(patient);
    const user = userEvent.setup();
    const labelled = { ...patient, docTypeLabel: 'ID local' };
    render(
      <PatientEditModal open patient={labelled} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    await user.clear(screen.getByLabelText('Nombre del documento (opcional)'));
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toEqual({ docTypeLabel: null });
  });

  it('sends the label only when it changed, trimmed', async () => {
    mockedUpdate.mockResolvedValue(patient);
    const user = userEvent.setup();
    const labelled = { ...patient, docTypeLabel: 'ID local' };
    const { rerender } = render(
      <PatientEditModal open patient={labelled} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    await user.type(screen.getByLabelText(/ocupación/i), 'Docente');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('docTypeLabel');

    rerender(
      <PatientEditModal open patient={{ ...labelled }} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    const label = screen.getByLabelText('Nombre del documento (opcional)');
    await user.clear(label);
    await user.type(label, '  Documento   A ');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
    expect(mockedUpdate.mock.calls[1][2]).toEqual({ docTypeLabel: 'Documento A' });
  });

  it('rejects a label over 40 characters', async () => {
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    const label = screen.getByLabelText('Nombre del documento (opcional)');
    expect(screen.getByText('Si lo escribes, se muestra en lugar del tipo en fichas y documentos.')).toBeInTheDocument();
    fireEvent.change(label, { target: { value: '\u{1D49C}'.repeat(41) } });
    expect(label).toHaveValue('\u{1D49C}'.repeat(41));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(label).toHaveAttribute('aria-invalid', 'true');
    expect(label).toHaveAttribute('aria-describedby', 'pe-docTypeLabel-error');
    expect(document.getElementById('pe-docTypeLabel-error')).toHaveTextContent('Hasta 40 caracteres.');
    expect(label).toHaveFocus();

    mockedUpdate.mockResolvedValue(patient);
    fireEvent.change(label, { target: { value: '\u{1D49C}'.repeat(40) } });
    expect(label).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toEqual({ docTypeLabel: '\u{1D49C}'.repeat(40) });
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

  it.each([
    ['no válido', 'Para elegir WhatsApp el paciente necesita un móvil válido. Revisa el número o escríbelo con + y su prefijo.'],
    ['con dos lecturas', 'Ese número se puede leer de dos formas. Escríbelo con + y su prefijo.'],
  ])('el 400 del móvil %s va junto a «Teléfono», con el foco, no arriba del formulario (DX-329)', async (_, message) => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedUpdate.mockRejectedValue(
      new ApiError(400, message, { messages: [message], code: 'WHATSAPP_REQUIRES_VALID_MOBILE' }),
    );
    const user = userEvent.setup();
    render(
      <PatientEditModal open patient={patient} token="tok" onOpenChange={() => {}} onSaved={() => {}} />,
    );
    const phone = screen.getByLabelText('Teléfono');
    await user.type(phone, '0058 412 1234567');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(phone).toHaveAccessibleDescription(message));
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(phone).toHaveFocus();
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    await user.type(phone, '8');
    expect(phone).not.toHaveAttribute('aria-invalid');
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
