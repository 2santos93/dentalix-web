import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedicalHistoryPanel } from './medical-history-panel';
import { getMedicalHistory, saveMedicalHistory } from '@/lib/patients/clinical-api';
import { listStaff } from '@/lib/staff/staff-api';
import type { MedicalHistory } from '@/lib/clinical/clinical-types';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching @/lib/patients/clinical-api's actual location (same
// convention as patient-form.test.tsx).
jest.mock('../../lib/patients/clinical-api', () => ({
  getMedicalHistory: jest.fn(),
  saveMedicalHistory: jest.fn(),
}));
// El autor de la versión se resuelve contra el personal de la clínica.
jest.mock('../../lib/staff/staff-api', () => ({
  listStaff: jest.fn(),
}));

const mockedGet = getMedicalHistory as jest.MockedFunction<typeof getMedicalHistory>;
const mockedSave = saveMedicalHistory as jest.MockedFunction<typeof saveMedicalHistory>;
const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;

const staff = [
  { userId: 'u1', fullName: 'Dra. Ana Ríos', email: 'ana@demo.com', role: 'DENTIST' as const, locationIds: null },
];

const latest: MedicalHistory = {
  id: 'mh-1',
  tenantId: 't1',
  patientId: 'p1',
  version: 2,
  source: 'STAFF',
  allergies: [
    { alergeno: 'Penicilina', tipo: 'MEDICAMENTO', severidad: 'MODERADA', esAlerta: true },
  ],
  conditions: [],
  medications: [],
  habits: null,
  pregnancy: null,
  dentalHistory: null,
  surgeries: [],
  vitalSigns: null,
  familyHistory: 'Sin antecedentes relevantes',
  notes: 'Paciente colaborador',
  safetyFlags: {
    embarazo: false,
    anticoagulantes: false,
    bifosfonatos: false,
    diabetes: false,
    profilaxisAntibiotica: false,
    alergiaAnestesico: false,
    alergiaPenicilina: true,
    alergiaLatex: false,
  },
  hasCriticalAlert: true,
  createdById: 'u1',
  createdAt: '2026-01-02T00:00:00.000Z',
};

/** El formulario va detrás de «Actualizar anamnesis» / «Registrar anamnesis». */
async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^(actualizar|registrar) anamnesis$/i }));
}

describe('MedicalHistoryPanel', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
    mockedListStaff.mockReset();
    mockedListStaff.mockResolvedValue(staff);
  });

  it('la versión declara cuándo se registró y quién la firmó', async () => {
    // Sin esto «Versión 2» es un número sin destino: el API todavía no expone
    // la cadena de versiones, así que se dice lo que sí llega en la respuesta.
    mockedGet.mockResolvedValue(latest);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    expect(await screen.findByText(/versión 2/i)).toBeInTheDocument();
    expect(await screen.findByText(/registrada el .* por Dra\. Ana Ríos/i)).toBeInTheDocument();
  });

  it('el resumen de condiciones dice «sin responder» (atenuado) y no cuenta la ausencia como «No»', async () => {
    mockedGet.mockResolvedValue({
      ...latest,
      conditions: [{ codigo: 'DIABETES', etiqueta: 'Diabetes', estado: 'SI', esAlerta: true }],
    });
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    const term = await screen.findByText('Condiciones', { selector: 'dt' });
    const dd = term.nextElementSibling as HTMLElement;
    expect(dd).toHaveTextContent('1 Sí · 14 sin responder');
    expect(dd).not.toHaveTextContent(/\bNo\b/);
    expect(screen.getAllByText('14 sin responder')[0]).toHaveClass('text-muted');
  });

  it('un texto largo sin espacios parte la línea en vez de ensanchar la ficha a 390 px', async () => {
    // jsdom no maqueta: se fija lo que lo hace posible. Sin `min-w-0` la celda
    // de la rejilla mide lo que el texto entero (p. ej. una URL pegada) y
    // `<main>` se desplaza en horizontal en móvil (mismo caso que «Datos»).
    const notes =
      'https://informes.una-clinica-de-nombre-largo.example.com/radiografias/panoramica-2026';
    mockedGet.mockResolvedValue({ ...latest, notes });
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    // El formulario de la versión nueva repite el valor en su textarea.
    const value = await screen.findByText(notes, { selector: 'dd' });
    expect(value).toHaveClass('break-words');
    expect(value.parentElement).toHaveClass('min-w-0');
  });

  it('si el personal no carga, la versión conserva su fecha de registro', async () => {
    mockedListStaff.mockRejectedValue(new Error('sin red'));
    mockedGet.mockResolvedValue(latest);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    expect(await screen.findByText(/^registrada el /i)).toBeInTheDocument();
  });

  it('dice en voz alta que el registro es append-only', async () => {
    // PRODUCT.md, principio 5: la UI nunca debe sugerir que algo se borró o se
    // editó cuando el modelo solo añade.
    mockedGet.mockResolvedValue(latest);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    expect(
      await screen.findByText(/cada corrección crea una versión nueva/i),
    ).toBeInTheDocument();
  });

  it('shows a loading state while fetching', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    // También el personal queda pendiente: si resolviera tras terminar el
    // test, su `setState` caería fuera de `act()`.
    mockedListStaff.mockReturnValue(new Promise(() => {}));
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
  });

  it('sin anamnesis no repite el aviso: ofrece «Registrar anamnesis» y el formulario sale vacío detrás', async () => {
    mockedGet.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" headingId="anam" />);

    // «Sin anamnesis registrada» ya lo dice el aviso de la ficha: aquí no.
    expect(await screen.findByRole('button', { name: 'Registrar anamnesis' })).toBeInTheDocument();
    expect(screen.queryByText(/aún no hay anamnesis/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /agregar alergia/i })).not.toBeInTheDocument();

    await openForm(user);
    expect(screen.getByRole('heading', { name: 'Primera anamnesis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /agregar alergia/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/notas/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Guardar anamnesis' })).toBeDisabled();
  });

  it('la pestaña abre con el resumen de la versión vigente, no con el formulario', async () => {
    mockedGet.mockResolvedValue(latest);
    render(<MedicalHistoryPanel token="tok" patientId="p1" headingId="anam" />);
    expect(await screen.findByRole('region', { name: 'Anamnesis' })).toBeInTheDocument();
    const term = await screen.findByText('Alergias', { selector: 'dt' });
    expect(term.nextElementSibling).toHaveTextContent('Penicilina (moderada)');
    expect(screen.queryByRole('button', { name: /agregar alergia/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar anamnesis' })).toBeInTheDocument();
  });

  it('embarazo sin responder (también una versión anterior sin «Sí») se abre «Sin responder», nunca «No»', async () => {
    mockedGet.mockResolvedValue(latest);
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await openForm(user);
    const g = screen.getByRole('radiogroup', { name: 'Embarazo' });
    expect(within(g).getByRole('radio', { name: 'Sin responder' })).toBeChecked();
    expect(within(g).getByRole('radio', { name: 'No' })).not.toBeChecked();
  });

  it('un «No» elegido al embarazo vuelve «No» al reabrir y se ve en el resumen', async () => {
    mockedGet.mockResolvedValue({ ...latest, pregnancy: 'NO' });
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    const term = await screen.findByText('Embarazo', { selector: 'dt' });
    expect(term.nextElementSibling).toHaveTextContent('No');
    await openForm(user);
    const g = screen.getByRole('radiogroup', { name: 'Embarazo' });
    expect(within(g).getByRole('radio', { name: 'No' })).toBeChecked();
  });

  it('el resumen de hábitos dice los «Sí» y, aparte, los «No sabe»', async () => {
    mockedGet.mockResolvedValue({
      ...latest,
      habits: { tabaquismo: { estado: 'SI' }, alcohol: { estado: 'DESCONOCE' }, bruxismo: 'NO' },
    });
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    const term = await screen.findByText('Hábitos', { selector: 'dt' });
    expect(term.nextElementSibling).toHaveTextContent('Fuma');
    expect(term.nextElementSibling).toHaveTextContent('No sabe: Consume alcohol');
    expect(term.nextElementSibling).not.toHaveTextContent('Bruxismo');
  });

  it('cancelar con cambios pide confirmación y, al descartar, vuelve al resumen sin guardar', async () => {
    mockedGet.mockResolvedValue(latest);
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await openForm(user);
    await user.type(screen.getByLabelText(/notas/i), ' (actualizado)');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByLabelText(/notas/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar anamnesis' })).toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('loads the latest version into the structured allergy editor (carry-forward)', async () => {
    mockedGet.mockResolvedValue(latest);
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    await screen.findByText(/versión 2/i);
    await openForm(user);
    expect(screen.getByDisplayValue('Penicilina')).toBeInTheDocument();
    expect(screen.getByLabelText(/notas/i)).toHaveValue('Paciente colaborador');
  });

  it('adds a new allergy and saves the whole carried-forward value (append-only)', async () => {
    mockedGet.mockResolvedValue(latest);
    mockedSave.mockResolvedValue({ ...latest, version: 3 });

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);
    await openForm(user);
    screen.getByDisplayValue('Penicilina');

    await user.click(screen.getByRole('button', { name: /agregar alergia/i }));
    const allergenInputs = screen.getAllByLabelText(/alérgeno/i);
    expect(allergenInputs).toHaveLength(2);
    await user.type(allergenInputs[1], 'Látex');

    await user.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    const [token, patientId, input] = mockedSave.mock.calls[0];
    expect(token).toBe('tok');
    expect(patientId).toBe('p1');
    expect(input.allergies).toHaveLength(2);
    expect(input.allergies?.[0].alergeno).toBe('Penicilina');
    expect(input.allergies?.[1].alergeno).toBe('Látex');
    // Untouched fields from the baseline are still sent, not dropped.
    expect(input.notes).toBe('Paciente colaborador');
    expect(input.familyHistory).toBe('Sin antecedentes relevantes');

    expect(await screen.findByText(/versión 3/i)).toBeInTheDocument();
    // Guardado: el formulario se cierra y queda el resumen.
    expect(screen.queryByRole('button', { name: /agregar alergia/i })).not.toBeInTheDocument();
  });

  it('carries forward embarazo/semanasEmbarazo across versions (safety flag, not just for display)', async () => {
    const pregnant: MedicalHistory = {
      ...latest,
      pregnancy: 'SI',
      safetyFlags: { ...latest.safetyFlags, embarazo: true, semanasEmbarazo: 20 },
    };
    mockedGet.mockResolvedValue(pregnant);
    mockedSave.mockResolvedValue({ ...pregnant, version: 3 });

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);
    await openForm(user);

    const embarazo = screen.getByRole('radiogroup', { name: 'Embarazo' });
    expect(within(embarazo).getByRole('radio', { name: 'Sí' })).toBeChecked();
    expect(screen.getByLabelText(/semanas de embarazo/i)).toHaveValue(20);

    // An unrelated edit (adding an allergy) must not drop the safety flag.
    await user.click(screen.getByRole('button', { name: /agregar alergia/i }));
    const allergenInputs = screen.getAllByLabelText(/alérgeno/i);
    await user.type(allergenInputs[1], 'Látex');
    await user.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    const [, , input] = mockedSave.mock.calls[0];
    expect(input.pregnancy).toBe('SI');
    expect(input.semanasEmbarazo).toBe(20);
  });

  it('shows an alert with the API error message when loading fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la anamnesis.');
  });

  it('does not render the structured form when the initial load failed, so no version can be created from an unknown baseline', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByRole('alert');

    expect(screen.queryByRole('button', { name: /agregar alergia/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /guardar|actualizar anamnesis/i })).not.toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('offers a retry action on load error that re-fetches the latest version', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    mockedGet.mockResolvedValueOnce(latest);

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    await screen.findByText(/versión 2/i);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    await openForm(user);
    expect(screen.getByDisplayValue('Penicilina')).toBeInTheDocument();
  });

  it('shows an alert with the API error message when saving fails', async () => {
    mockedGet.mockResolvedValue(null);
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedSave.mockRejectedValue(new ApiError(400, 'Datos inválidos'));

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await openForm(user);
    // Add real content so the form differs from the (empty) baseline — an
    // all-empty first-visit form is now a no-op (dup guard), so the save only
    // fires when there's something to persist.
    await user.type(screen.getByLabelText(/notas/i), 'Primera visita');
    await user.click(screen.getByRole('button', { name: 'Guardar anamnesis' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos');
  });

  it('does not save an unchanged version — the save button is disabled until the form changes (dup guard)', async () => {
    mockedGet.mockResolvedValue(latest);
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);
    await openForm(user);

    // Form equals the latest saved version (carried forward on load) → saving
    // would create an identical duplicate version, so the button is disabled.
    const save = screen.getByRole('button', { name: 'Guardar nueva versión' });
    expect(save).toBeDisabled();

    // A real change re-enables it, and no save fired for the unchanged state.
    await user.type(screen.getByLabelText(/notas/i), ' (actualizado)');
    expect(screen.getByRole('button', { name: 'Guardar nueva versión' })).toBeEnabled();
    expect(mockedSave).not.toHaveBeenCalled();
  });
});
