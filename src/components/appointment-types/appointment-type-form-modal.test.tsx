import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppointmentTypeFormModal } from './appointment-type-form-modal';
import {
  createAppointmentType,
  updateAppointmentType,
  type AppointmentType,
} from '@/lib/appointments/appointment-types-api';
import { getPatientLanguages } from '@/lib/patients/patient-languages';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/appointments/appointment-types-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointment-types-api'),
  createAppointmentType: jest.fn(),
  updateAppointmentType: jest.fn(),
}));
jest.mock('../../lib/patients/patient-languages', () => ({
  ...jest.requireActual('../../lib/patients/patient-languages'),
  getPatientLanguages: jest.fn(),
}));

const mockedCreate = createAppointmentType as jest.MockedFunction<typeof createAppointmentType>;
const mockedUpdate = updateAppointmentType as jest.MockedFunction<typeof updateAppointmentType>;
const mockedLanguages = getPatientLanguages as jest.MockedFunction<typeof getPatientLanguages>;

const surgery: AppointmentType = {
  id: 'type-1',
  tenantId: 't1',
  name: 'Cirugía',
  durationMinutes: 60,
  color: '#7C3AED',
  active: true,
  isUrgent: false,
  preVisitInstructions: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function renderModal(type: AppointmentType | null = null) {
  const onSaved = jest.fn();
  render(<AppointmentTypeFormModal open onOpenChange={jest.fn()} token="tok" type={type} onSaved={onSaved} />);
  return { onSaved, dialog: screen.getByRole('dialog') };
}

describe('AppointmentTypeFormModal — indicaciones previas (DX-564)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLanguages.mockResolvedValue({ languages: ['es', 'en'], clinicLanguage: 'es' });
    mockedCreate.mockImplementation(async (_t, input) => ({ ...surgery, ...input, preVisitInstructions: input.preVisitInstructions ?? [] }));
    mockedUpdate.mockImplementation(async (_t, _id, input) => ({ ...surgery, ...input, preVisitInstructions: input.preVisitInstructions ?? [] }) as AppointmentType);
  });

  it('un campo por idioma de la clínica (español primero), con ayuda y contador 0/600', async () => {
    const { dialog } = renderModal();
    const group = within(dialog).getByRole('group', { name: /indicaciones previas a la cita/i });
    expect(group).toHaveTextContent('no escribas datos de un paciente. Sin enlaces, direcciones web ni correos, ni HTML.');
    const es = within(group).getByLabelText('Español (es)', { exact: true });
    const en = await within(group).findByLabelText('English (en)', { exact: true });
    expect(es.compareDocumentPosition(en) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(group).getAllByText('0/600')).toHaveLength(2);
    fireEvent.change(es, { target: { value: 'Ven en ayunas.' } });
    expect(within(group).getByText('14/600')).toBeInTheDocument();
  });

  it('vista previa «Antes de tu cita:» / «Before your appointment:» y envía la lista entera', async () => {
    const user = setupUser();
    const { dialog, onSaved } = renderModal(surgery);
    const es = within(dialog).getByLabelText('Español (es)', { exact: true });
    const en = await within(dialog).findByLabelText('English (en)', { exact: true });
    fireEvent.change(es, { target: { value: 'Ven en ayunas.\nTrae tus radiografías.' } });
    fireEvent.change(en, { target: { value: 'Come fasting.' } });
    const preview = within(dialog).getByTestId('pre-visit-preview');
    expect(preview).toHaveTextContent('Antes de tu cita:Ven en ayunas.');
    expect(preview).toHaveTextContent('Before your appointment:Come fasting.');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'type-1', {
        name: 'Cirugía',
        durationMinutes: 60,
        color: '#7C3AED',
        isUrgent: false,
        preVisitInstructions: [
          { language: 'es', text: 'Ven en ayunas.\nTrae tus radiografías.' },
          { language: 'en', text: 'Come fasting.' },
        ],
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('vaciar un idioma lo quita de la lista; sin texto, lista vacía y sin vista previa', async () => {
    const user = setupUser();
    const { dialog } = renderModal({ ...surgery, preVisitInstructions: [{ language: 'es', text: 'Ven en ayunas.' }] });
    const es = within(dialog).getByLabelText('Español (es)', { exact: true });
    expect(es).toHaveValue('Ven en ayunas.');
    await within(dialog).findByLabelText('English (en)', { exact: true });
    fireEvent.change(es, { target: { value: '   ' } });
    expect(within(dialog).queryByTestId('pre-visit-preview')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'type-1', expect.objectContaining({ preVisitInstructions: [] })),
    );
  });

  it('un enlace da el error junto al campo y no se envía', async () => {
    const user = setupUser();
    const { dialog } = renderModal(surgery);
    const en = await within(dialog).findByLabelText('English (en)', { exact: true });
    fireEvent.change(en, { target: { value: 'See https://example.com' } });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    const error = await within(dialog).findByText('Las indicaciones no admiten enlaces ni HTML: escríbelas como texto.');
    expect(en).toHaveAttribute('aria-invalid', 'true');
    expect(en.getAttribute('aria-describedby')).toContain(error.closest('[id]')!.id);
    expect(mockedUpdate).not.toHaveBeenCalled();
    // Al corregir, el error se va.
    fireEvent.change(en, { target: { value: 'Come fasting.' } });
    expect(within(dialog).queryByText(/no admiten enlaces/)).not.toBeInTheDocument();
  });

  it('más de 600 caracteres: contador en rojo y error junto al campo', async () => {
    const user = setupUser();
    const { dialog } = renderModal(surgery);
    const es = within(dialog).getByLabelText('Español (es)', { exact: true });
    fireEvent.change(es, { target: { value: 'a'.repeat(601) } });
    expect(within(dialog).getByText('601/600')).toHaveClass('text-danger-text');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialog).findByText('Las indicaciones no pueden tener más de 600 caracteres.')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('el 400 de idioma de la API va junto al campo; el tope conjunto, como error del formulario', async () => {
    const user = setupUser();
    const { dialog } = renderModal(surgery);
    const en = await within(dialog).findByLabelText('English (en)', { exact: true });
    fireEvent.change(en, { target: { value: 'Come fasting.' } });
    mockedUpdate.mockRejectedValueOnce(
      new ApiError(400, 'Ese idioma no está entre los idiomas de los pacientes de la clínica.'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await within(dialog).findByText('Ese idioma no está entre los idiomas de los pacientes de la clínica.');
    expect(en).toHaveAttribute('aria-invalid', 'true');

    mockedUpdate.mockRejectedValueOnce(
      new ApiError(400, 'Las indicaciones son demasiado largas en conjunto: acorta alguno de los idiomas.'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    const formError = await within(dialog).findByText(/demasiado largas en conjunto/);
    expect(en).not.toHaveAttribute('aria-invalid');
    expect(formError).toBeInTheDocument();
  });

  it('idioma ya retirado: en solo lectura con su aviso; se reenvía tal cual o se quita', async () => {
    const user = setupUser();
    const type = {
      ...surgery,
      preVisitInstructions: [
        { language: 'es', text: 'Ven en ayunas.' },
        { language: 'ca', text: 'Vine en dejú.' },
      ],
    };
    const { dialog } = renderModal(type);
    const retired = await within(dialog).findByTestId('pre-visit-retired');
    expect(retired).toHaveTextContent('Este idioma ya no está entre los de la clínica');
    expect(retired).toHaveTextContent('Vine en dejú.');
    expect(within(dialog).queryByRole('textbox', { name: /català/i })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenLastCalledWith(
        'tok',
        'type-1',
        expect.objectContaining({
          preVisitInstructions: [
            { language: 'es', text: 'Ven en ayunas.' },
            { language: 'ca', text: 'Vine en dejú.' },
          ],
        }),
      ),
    );
  });

  it('cambiar solo el nombre reenvía tal cual las variantes de idiomas retirados (si no, la API las borraría)', async () => {
    const user = setupUser();
    const { dialog } = renderModal({
      ...surgery,
      preVisitInstructions: [
        { language: 'es', text: 'Ven en ayunas.\n\nTrae tus radiografías.' },
        { language: 'en', text: 'Come fasting.' },
        { language: 'ca', text: 'Vine en dejú.' },
        { language: 'pt', text: 'Venha em jejum.' },
      ],
    });
    // Los idiomas de la clínica ya han llegado: ca y pt quedan en solo lectura.
    expect(await within(dialog).findAllByTestId('pre-visit-retired')).toHaveLength(2);
    const name = within(dialog).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Cirugía oral');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , input] = mockedUpdate.mock.calls[0];
    expect(input.name).toBe('Cirugía oral');
    expect(input.preVisitInstructions).toEqual([
      { language: 'es', text: 'Ven en ayunas.\n\nTrae tus radiografías.' },
      { language: 'en', text: 'Come fasting.' },
      { language: 'ca', text: 'Vine en dejú.' },
      { language: 'pt', text: 'Venha em jejum.' },
    ]);
  });

  it('quitar la variante retirada la deja fuera de la lista', async () => {
    const user = setupUser();
    const { dialog } = renderModal({
      ...surgery,
      preVisitInstructions: [{ language: 'ca', text: 'Vine en dejú.' }],
    });
    const retired = await within(dialog).findByTestId('pre-visit-retired');
    await user.click(within(retired).getByRole('button', { name: /quitar las indicaciones en/i }));
    expect(within(dialog).queryByTestId('pre-visit-retired')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'type-1', expect.objectContaining({ preVisitInstructions: [] })),
    );
  });

  it('el texto se pinta como texto (vista previa sin HTML)', async () => {
    const { dialog } = renderModal(surgery);
    fireEvent.change(within(dialog).getByLabelText('Español (es)', { exact: true }), {
      target: { value: 'Tensión < 140 y > 90 <img src=x>' },
    });
    const preview = within(dialog).getByTestId('pre-visit-preview');
    expect(preview.querySelector('img')).toBeNull();
    expect(preview).toHaveTextContent('<img src=x>');
  });
});
