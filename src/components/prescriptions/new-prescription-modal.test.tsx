import { render, screen, waitFor, within } from '@testing-library/react';
import { NewPrescriptionModal } from './new-prescription-modal';
import {
  getPrescriptionIssuer,
  issuePrescription,
  listPrescriptionTemplates,
} from '@/lib/prescriptions/prescriptions-api';
import { getMedicalHistory } from '@/lib/patients/clinical-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeIssuer, makePrescription, postExodoncia } from '@/lib/test/prescriptions';
import type { MedicalHistory } from '@/lib/clinical/clinical-types';

jest.mock('../../lib/prescriptions/prescriptions-api', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescriptions-api'),
  getPrescriptionIssuer: jest.fn(),
  issuePrescription: jest.fn(),
  listPrescriptionTemplates: jest.fn(),
}));
jest.mock('../../lib/patients/clinical-api', () => ({
  getMedicalHistory: jest.fn(),
}));

const mockedIssuer = getPrescriptionIssuer as jest.MockedFunction<typeof getPrescriptionIssuer>;
const mockedIssue = issuePrescription as jest.MockedFunction<typeof issuePrescription>;
const mockedTemplates = listPrescriptionTemplates as jest.MockedFunction<
  typeof listPrescriptionTemplates
>;
const mockedHistory = getMedicalHistory as jest.MockedFunction<typeof getMedicalHistory>;

function historyWith(alergeno: string): MedicalHistory {
  return {
    allergies: [{ alergeno, tipo: 'MEDICAMENTO', severidad: 'ANAFILAXIA', esAlerta: true }],
  } as unknown as MedicalHistory;
}

function renderModal(onIssued = jest.fn(), onOpenChange = jest.fn()) {
  render(
    <NewPrescriptionModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      patientId="p1"
      onIssued={onIssued}
    />,
  );
  return { onIssued, onOpenChange };
}

async function fillAmoxicilina(user: ReturnType<typeof setupUser>) {
  const dialog = screen.getByRole('dialog');
  const set = async (label: RegExp, value: string) => {
    const input = within(dialog).getByLabelText(label);
    await user.clear(input);
    await user.type(input, value);
  };
  await set(/principio activo/i, 'Amoxicilina');
  await set(/^concentración/i, '500 mg');
  await set(/forma farmacéutica/i, 'Cápsula');
  await set(/vía de administración/i, 'Oral');
  await set(/^dosis/i, '1 cápsula');
  await set(/^frecuencia/i, 'Cada 8 horas');
  await set(/duración/i, '7');
  await set(/cantidad total/i, '21');
  await set(/^unidad/i, 'cápsulas');
}

describe('NewPrescriptionModal', () => {
  beforeEach(() => {
    mockedIssuer.mockReset().mockResolvedValue(makeIssuer());
    mockedIssue.mockReset();
    mockedTemplates.mockReset().mockResolvedValue([postExodoncia]);
    mockedHistory.mockReset().mockResolvedValue(null);
  });

  it('dice desde qué sede y país se emite, y emite con los datos del formulario', async () => {
    const user = setupUser();
    mockedIssue.mockResolvedValue(makePrescription());
    const { onIssued, onOpenChange } = renderModal();
    expect(
      await screen.findByText(/Se emite desde Sede Principal \(Colombia\) · validez de 30 días/),
    ).toBeInTheDocument();
    await fillAmoxicilina(user);
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith('tok', 'p1', {
        items: [
          {
            activeIngredient: 'Amoxicilina',
            concentration: '500 mg',
            pharmaceuticalForm: 'Cápsula',
            route: 'Oral',
            dose: '1 cápsula',
            frequency: 'Cada 8 horas',
            durationDays: 7,
            totalQuantity: 21,
            quantityUnit: 'cápsulas',
          },
        ],
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onIssued).toHaveBeenCalled();
  });

  it('parte de una plantilla y permite añadir otro medicamento', async () => {
    const user = setupUser();
    renderModal();
    const select = await screen.findByLabelText('Partir de una plantilla');
    await waitFor(() => expect(select).not.toBeDisabled());
    await user.selectOptions(select, 'tpl1');
    expect(screen.getByLabelText(/principio activo/i)).toHaveValue('Ibuprofeno');
    expect(screen.getByLabelText(/indicaciones generales/i)).toHaveValue('Dieta blanda');
    await user.click(screen.getByRole('button', { name: 'Añadir medicamento' }));
    expect(screen.getAllByLabelText(/principio activo/i)).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Medicamento 2' })).toBeInTheDocument();
  });

  it('alerta de alergia en vivo: bloquea hasta confirmar y manda allergyOverride', async () => {
    const user = setupUser();
    mockedHistory.mockResolvedValue(historyWith('Penicilina'));
    mockedIssue.mockResolvedValue(makePrescription({ allergyOverride: true }));
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    expect(
      screen.getByText('Alergia registrada en la anamnesis: Penicilina.'),
    ).toBeInTheDocument();
    const alert = screen.getByText('Alerta de alergia').closest('[role="alert"]') as HTMLElement;
    expect(alert).toHaveTextContent('Penicilina (Amoxicilina)');
    const submit = screen.getByRole('button', { name: 'Emitir receta' });
    expect(submit).toBeDisabled();
    await user.click(within(alert).getByRole('checkbox', { name: /confirmo que conozco la alergia/i }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith(
        'tok',
        'p1',
        expect.objectContaining({ allergyOverride: true }),
      ),
    );
  });

  it('si la API detecta la alergia (409), pide la confirmación con su mensaje', async () => {
    const user = setupUser();
    mockedIssue
      .mockRejectedValueOnce(new ApiError(409, 'Alerta de alergia: el paciente tiene registrada alergia a Penicilina (Amoxicilina).'))
      .mockResolvedValueOnce(makePrescription());
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));
    const checkbox = await screen.findByRole('checkbox', { name: /confirmo que conozco la alergia/i });
    expect(screen.getByText(/Alerta de alergia: el paciente tiene registrada/)).toBeInTheDocument();
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenLastCalledWith(
        'tok',
        'p1',
        expect.objectContaining({ allergyOverride: true }),
      ),
    );
  });

  it('400 de la API: el resumen del error queda en el modal, visible y con el foco', async () => {
    const user = setupUser();
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockedIssue.mockRejectedValue(
      new ApiError(400, 'No se puede emitir la receta: Falta el número de historia clínica.'),
    );
    const { onOpenChange } = renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));
    const alert = (await screen.findByText(/Falta el número de historia clínica/)).closest(
      '[role="alert"]',
    ) as HTMLElement;
    expect(alert).toBeInTheDocument();
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('valida en el cliente: marca cada campo que falta, lleva el foco al primero y no llama a la API', async () => {
    const user = setupUser();
    renderModal();
    await screen.findByText(/Se emite desde/);
    await user.type(screen.getByLabelText(/principio activo/i), 'Amoxicilina');
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));

    const concentration = screen.getByLabelText(/^concentración/i);
    expect(concentration).toHaveAttribute('aria-invalid', 'true');
    expect(concentration).toHaveAccessibleDescription('Falta la concentración.');
    expect(concentration).toHaveFocus();
    expect(screen.getByLabelText(/^dosis/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/duración/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/principio activo/i)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(/marca comercial/i)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(/nº de envases/i)).not.toHaveAttribute('aria-invalid');
    expect(mockedIssue).not.toHaveBeenCalled();

    // Al escribir en un campo, su error desaparece; los demás siguen.
    await user.type(concentration, '500 mg');
    expect(concentration).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Falta la concentración.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^dosis/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('España: el nº de envases y el nº de colegiado vacíos se marcan', async () => {
    const user = setupUser();
    mockedIssuer.mockResolvedValue(
      makeIssuer({ country: 'ES', validityDays: 10, maxItems: 1, professionalLicense: null }),
    );
    renderModal();
    await screen.findByText(/\(España\)/);
    await fillAmoxicilina(user);
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));
    const packages = screen.getByLabelText('Nº de envases');
    expect(packages).toHaveAttribute('aria-invalid', 'true');
    expect(packages).toHaveFocus();
    expect(screen.getByLabelText('Tu nº de colegiado')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Tu nº de colegiado')).toHaveAccessibleDescription(
      /Falta tu nº de colegiado/,
    );
    expect(mockedIssue).not.toHaveBeenCalled();
  });

  it('elegir una plantilla limpia los errores de campo y el del servidor', async () => {
    const user = setupUser();
    mockedIssue.mockRejectedValueOnce(new ApiError(400, 'Falta el número de historia clínica.'));
    renderModal();
    const select = await screen.findByLabelText('Partir de una plantilla');
    await waitFor(() => expect(select).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));
    expect(screen.getByLabelText(/^concentración/i)).toHaveAttribute('aria-invalid', 'true');

    await fillAmoxicilina(user);
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));
    expect(await screen.findByText('Falta el número de historia clínica.')).toBeInTheDocument();

    await user.selectOptions(select, 'tpl1');
    expect(screen.queryByText('Falta el número de historia clínica.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^concentración/i)).not.toHaveAttribute('aria-invalid');
  });

  it('editar un campo tras un error del servidor lo quita', async () => {
    const user = setupUser();
    mockedIssue.mockRejectedValueOnce(new ApiError(400, 'Falta el número de historia clínica.'));
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));
    expect(await screen.findByText('Falta el número de historia clínica.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/indicaciones generales/i), 'x');
    expect(screen.queryByText('Falta el número de historia clínica.')).not.toBeInTheDocument();
  });

  it('sin registro profesional en el perfil lo pide y lo manda', async () => {
    const user = setupUser();
    mockedIssuer.mockResolvedValue(makeIssuer({ professionalLicense: null }));
    mockedIssue.mockResolvedValue(makePrescription());
    renderModal();
    await user.type(await screen.findByLabelText('Tu registro profesional'), 'TP-55');
    await fillAmoxicilina(user);
    await user.click(screen.getByRole('button', { name: 'Emitir receta' }));
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith(
        'tok',
        'p1',
        expect.objectContaining({ professionalLicense: 'TP-55' }),
      ),
    );
  });

  it('España: nº de envases obligatorio, fecha prevista de dispensación y un solo medicamento', async () => {
    mockedIssuer.mockResolvedValue(
      makeIssuer({ country: 'ES', validityDays: 10, maxItems: 1, professionalLicense: null }),
    );
    renderModal();
    expect(await screen.findByText(/\(España\) · validez de 10 días/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nº de envases')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha prevista de dispensación')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu nº de colegiado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir medicamento' })).toBeDisabled();
  });

  it('si el emisor no carga: error de sección con reintento y sin poder emitir', async () => {
    const user = setupUser();
    mockedIssuer.mockRejectedValueOnce(new ApiError(500, 'Caída')).mockResolvedValueOnce(makeIssuer());
    renderModal();
    expect(await screen.findByText('No pudimos preparar la receta.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Se emite desde/)).toBeInTheDocument();
  });

  it('si las plantillas no cargan, el selector se sustituye por un error de campo con reintento', async () => {
    mockedTemplates.mockRejectedValue(new Error('x'));
    renderModal();
    expect(await screen.findByText('Plantillas no disponibles')).toBeInTheDocument();
  });
});
