import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NewPrescriptionModal } from './new-prescription-modal';
import {
  checkPrescriptionSafety,
  getPrescriptionIssuer,
  issuePrescription,
  listPrescriptionTemplates,
  type PrescriptionSafetyPreview,
  type SafetyAlert,
} from '@/lib/prescriptions/prescriptions-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeIssuer, makePrescription, postExodoncia } from '@/lib/test/prescriptions';

jest.mock('../../lib/prescriptions/prescriptions-api', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescriptions-api'),
  getPrescriptionIssuer: jest.fn(),
  issuePrescription: jest.fn(),
  listPrescriptionTemplates: jest.fn(),
  checkPrescriptionSafety: jest.fn(),
}));

const mockedIssuer = getPrescriptionIssuer as jest.MockedFunction<typeof getPrescriptionIssuer>;
const mockedIssue = issuePrescription as jest.MockedFunction<typeof issuePrescription>;
const mockedTemplates = listPrescriptionTemplates as jest.MockedFunction<
  typeof listPrescriptionTemplates
>;
const mockedCheck = checkPrescriptionSafety as jest.MockedFunction<typeof checkPrescriptionSafety>;

function preview(alerts: SafetyAlert[] = [], anamnesis: 'PRESENT' | 'MISSING' = 'PRESENT'): PrescriptionSafetyPreview {
  return {
    rulesVersion: 'RX_SAFETY_V1',
    anamnesis,
    hasBlocking: alerts.some((a) => a.severity === 'BLOCKING'),
    alerts,
  };
}

const allergyAlert: SafetyAlert = {
  rule: 'ALLERGY',
  code: 'ALLERGY_MATCH',
  severity: 'BLOCKING',
  activeIngredient: 'Amoxicilina',
  message: 'Alergia: el paciente tiene registrada alergia a penicilina y Amoxicilina puede causarla.',
  source: 'Anamnesis: alergias registradas',
};
const antiresorptiveAlert: SafetyAlert = {
  rule: 'ANTIRESORPTIVE',
  code: 'ANTIRESORPTIVE_MRONJ',
  severity: 'INFO',
  activeIngredient: null,
  message: 'El paciente toma antirresortivos (bifosfonatos o denosumab).',
  source: 'SDCEP',
};

/** Espera a que la comprobación de avisos termine y emite. */
async function submit(user: ReturnType<typeof setupUser>) {
  const button = screen.getByRole('button', { name: 'Emitir receta' });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
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
    mockedCheck.mockReset().mockResolvedValue(preview());
  });

  it('issuer line reads «Se emite desde {sede} · válida 30 días.» and emits the form data', async () => {
    const user = setupUser();
    mockedIssue.mockResolvedValue(makePrescription());
    const { onIssued, onOpenChange } = renderModal();
    expect(await screen.findByText('Se emite desde Sede Principal · válida 30 días.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Válida desde' })).toBeInTheDocument();
    await fillAmoxicilina(user);
    await submit(user);
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

  it('issuer line reads «válida 1 día.» with a one-day validity', async () => {
    mockedIssuer.mockResolvedValue(makeIssuer({ validityDays: 1 }));
    renderModal();
    expect(await screen.findByText('Se emite desde Sede Principal · válida 1 día.')).toBeInTheDocument();
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

  it('aviso bloqueante del servidor: agrupado por gravedad, exige confirmación y motivo, y los manda', async () => {
    const user = setupUser();
    mockedCheck.mockResolvedValue(preview([allergyAlert, antiresorptiveAlert]));
    mockedIssue.mockResolvedValue(makePrescription());
    renderModal();
    await screen.findByText(/Se emite desde/);
    expect(screen.getByText(/no sustituye tu juicio clínico/)).toBeInTheDocument();
    await fillAmoxicilina(user);
    const blocking = (await screen.findByText('Requieren confirmación (1)')).closest(
      'div',
    ) as HTMLElement;
    expect(blocking).toHaveTextContent('alergia a penicilina');
    expect(screen.getByText('Informativos (1)')).toBeInTheDocument();
    // La consulta va con retardo: en un runner lento la última llamada llega después del aviso.
    await waitFor(() =>
      expect(mockedCheck).toHaveBeenLastCalledWith('tok', 'p1', [
        {
          activeIngredient: 'Amoxicilina',
          concentration: '500 mg',
          dose: '1 cápsula',
          frequency: 'Cada 8 horas',
        },
      ]),
    );
    const button = screen.getByRole('button', { name: 'Emitir receta' });
    expect(button).toBeDisabled();
    await user.click(within(blocking).getByRole('checkbox', { name: /confirmo que conozco los avisos/i }));
    // Sin motivo el botón sigue activo: al pulsarlo, el campo dice qué falta.
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-describedby');
    const reason = screen.getByLabelText('Motivo para emitir pese a los avisos');
    expect(reason).toHaveAccessibleDescription('Queda en la receta y no se puede cambiar.');
    await user.click(button);
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(reason).toHaveAccessibleDescription(/Escribe el motivo para emitir pese a los avisos/);
    expect(reason).toHaveFocus();
    expect(mockedIssue).not.toHaveBeenCalled();
    await user.type(reason, 'Prueba cutánea negativa');
    expect(reason).not.toHaveAttribute('aria-invalid');
    await user.click(button);
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith(
        'tok',
        'p1',
        expect.objectContaining({
          safetyOverride: true,
          safetyOverrideReason: 'Prueba cutánea negativa',
        }),
      ),
    );
  });

  it('conserva nodos, foco, confirmación y motivo durante un recheck idéntico; no emite pendiente', async () => {
    const user = setupUser();
    mockedCheck.mockResolvedValue(preview([allergyAlert]));
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    const checkbox = await screen.findByRole('checkbox', { name: /Confirmo/ });
    const reason = screen.getByLabelText('Motivo para emitir pese a los avisos');
    await user.click(checkbox);
    await user.type(reason, 'Prueba cutánea negativa');
    const button = screen.getByRole('button', { name: 'Emitir receta' });
    await waitFor(() => expect(button).toBeEnabled());
    let resolve!: (value: PrescriptionSafetyPreview) => void;
    mockedCheck.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    fireEvent.change(screen.getByLabelText(/^dosis/i), { target: { value: '2 cápsulas' } });
    reason.focus();
    expect(button).toBeDisabled();
    const calls = mockedCheck.mock.calls.length;
    await waitFor(() => expect(mockedCheck.mock.calls.length).toBe(calls + 1));
    expect(screen.getByLabelText('Motivo para emitir pese a los avisos')).toBe(reason);
    expect(reason).toHaveFocus();
    expect(reason).toHaveValue('Prueba cutánea negativa');
    expect(checkbox).toBeChecked();
    expect(checkbox.closest('[aria-live], [role="alert"], [role="status"]')).toBeNull();
    fireEvent.submit(button.closest('form')!);
    expect(mockedIssue).not.toHaveBeenCalled();
    await act(async () => resolve(preview([allergyAlert])));
    await waitFor(() => expect(button).toBeEnabled());
    expect(reason).toHaveFocus();
    expect(screen.getByRole('status', { name: 'Resultado de seguridad' })).not.toContainElement(reason);
  });

  it('al cambiar de paciente oculta el resultado anterior e ignora una respuesta atrasada', async () => {
    const user = setupUser();
    mockedCheck.mockResolvedValueOnce(preview([allergyAlert]));
    const props = { open: true, token: 'tok', patientId: 'p1', onOpenChange: jest.fn(), onIssued: jest.fn() };
    const { rerender } = render(<NewPrescriptionModal {...props} />);
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await user.click(await screen.findByRole('checkbox', { name: /Confirmo/ }));
    await user.type(screen.getByLabelText('Motivo para emitir pese a los avisos'), 'Motivo p1');
    let resolve!: (value: PrescriptionSafetyPreview) => void;
    mockedCheck.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    fireEvent.change(screen.getByLabelText(/^dosis/i), { target: { value: '2 cápsulas' } });
    await waitFor(() => expect(mockedCheck.mock.calls.length).toBe(2));
    rerender(<NewPrescriptionModal {...props} patientId="p2" />);
    expect(screen.queryByText(allergyAlert.message)).not.toBeInTheDocument();
    await act(async () => resolve(preview([allergyAlert])));
    expect(screen.queryByText(allergyAlert.message)).not.toBeInTheDocument();
    await screen.findByText(/Se emite desde/);
    expect(screen.queryByRole('checkbox', { name: /Confirmo/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/principio activo/i)).toHaveValue('');
    expect(mockedIssue).not.toHaveBeenCalled();
  });

  it('renovar el token conserva el borrador y bloquea hasta comprobar de nuevo', async () => {
    const user = setupUser();
    mockedCheck.mockResolvedValue(preview([allergyAlert]));
    const props = { open: true, token: 'tok', patientId: 'p1', onOpenChange: jest.fn(), onIssued: jest.fn() };
    const { rerender } = render(<NewPrescriptionModal {...props} />);
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await user.click(await screen.findByRole('checkbox', { name: /Confirmo/ }));
    const reason = screen.getByLabelText('Motivo para emitir pese a los avisos');
    await user.type(reason, 'Motivo conservado');
    const button = screen.getByRole('button', { name: 'Emitir receta' });
    await waitFor(() => expect(button).toBeEnabled());
    let resolve!: (value: PrescriptionSafetyPreview) => void;
    mockedCheck.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    rerender(<NewPrescriptionModal {...props} token="tok-renovado" />);
    expect(button).toBeDisabled();
    expect(screen.getByLabelText(/principio activo/i)).toHaveValue('Amoxicilina');
    expect(reason).toHaveValue('Motivo conservado');
    await waitFor(() => expect(mockedCheck).toHaveBeenLastCalledWith('tok-renovado', 'p1', expect.any(Array)));
    fireEvent.submit(button.closest('form')!);
    expect(mockedIssue).not.toHaveBeenCalled();
    await act(async () => resolve(preview([allergyAlert])));
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByLabelText('Motivo para emitir pese a los avisos')).toBe(reason);
  });

  it('un aviso bloqueante nuevo exige volver a confirmar y anuncia el cambio fuera de los controles', async () => {
    const user = setupUser();
    mockedCheck.mockResolvedValueOnce(preview([allergyAlert]));
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await user.click(await screen.findByRole('checkbox', { name: /Confirmo/ }));
    await user.type(screen.getByLabelText('Motivo para emitir pese a los avisos'), 'Motivo');
    mockedCheck.mockResolvedValueOnce(preview([{ ...allergyAlert, message: 'Otro aviso bloqueante del servidor.' }]));
    fireEvent.change(screen.getByLabelText(/^dosis/i), { target: { value: '2 cápsulas' } });
    await waitFor(() => expect(screen.getByRole('status', { name: 'Resultado de seguridad' })).toHaveTextContent('Otro aviso bloqueante del servidor.'));
    expect(screen.getByRole('checkbox', { name: /Confirmo/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeDisabled();
  });

  it.each(['otro aviso', 'sin avisos'])('exige reconfirmar si A cambia a %s y vuelve A', async (intermediate) => {
    const user = setupUser();
    mockedCheck.mockResolvedValue(preview([allergyAlert]));
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await user.click(await screen.findByRole('checkbox', { name: /Confirmo/ }));
    await user.type(screen.getByLabelText('Motivo para emitir pese a los avisos'), 'Motivo');
    const button = screen.getByRole('button', { name: 'Emitir receta' });
    await waitFor(() => expect(button).toBeEnabled());
    const next = intermediate === 'otro aviso'
      ? preview([{ ...allergyAlert, message: 'Otro aviso bloqueante.' }])
      : preview();
    mockedCheck.mockResolvedValueOnce(next);
    fireEvent.change(screen.getByLabelText(/^dosis/i), { target: { value: '2 cápsulas' } });
    if (intermediate === 'otro aviso') {
      await screen.findByText('Otro aviso bloqueante.');
    } else {
      await screen.findByText('Sin avisos para estos medicamentos.');
    }
    mockedCheck.mockResolvedValueOnce(preview([allergyAlert]));
    fireEvent.change(screen.getByLabelText(/^dosis/i), { target: { value: '3 cápsulas' } });
    await screen.findByText(allergyAlert.message);
    expect(screen.getByRole('checkbox', { name: /Confirmo/ })).not.toBeChecked();
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest('form')!);
    expect(mockedIssue).not.toHaveBeenCalled();
  });

  it('mientras se calculan los avisos no se emite: estado de carga', async () => {
    const user = setupUser();
    mockedCheck.mockReturnValue(new Promise(() => {}));
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    expect(await screen.findByText('Comprobando avisos de seguridad')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeDisabled();
  });

  it.each([
    ['sin avisos', () => preview(), 'Sin avisos para estos medicamentos.'],
    ['con un aviso bloqueante', () => preview([allergyAlert]), allergyAlert.message],
  ])('recomprobación tras un resultado %s: en carga no afirma «Sin avisos» y en error no enseña lo anterior', async (_, first, shownText) => {
    const user = setupUser();
    mockedCheck.mockResolvedValueOnce(first());
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    expect(await screen.findByText(shownText)).toBeInTheDocument();
    let reject!: (reason: unknown) => void;
    mockedCheck.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    fireEvent.change(screen.getByLabelText(/^dosis/i), { target: { value: '2 cápsulas' } });
    await waitFor(() => expect(screen.getByText('Comprobando avisos de seguridad')).toBeInTheDocument());
    expect(screen.queryByText('Sin avisos para estos medicamentos.')).not.toBeInTheDocument();
    await act(async () => reject(new ApiError(500, 'Caída')));
    expect(await screen.findByText('No se pudieron comprobar los avisos')).toBeInTheDocument();
    expect(screen.queryByText('Sin avisos para estos medicamentos.')).not.toBeInTheDocument();
    expect(screen.queryByText(allergyAlert.message)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Confirmo/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Resultado de seguridad' })).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeDisabled();
  });

  it('si la comprobación falla: error con Reintentar y sin poder emitir', async () => {
    const user = setupUser();
    mockedCheck.mockRejectedValueOnce(new ApiError(500, 'Caída')).mockResolvedValue(preview());
    mockedIssue.mockResolvedValue(makePrescription());
    renderModal();
    await screen.findByText(/Se emite desde/);
    await user.type(screen.getByLabelText(/principio activo/i), 'Amoxicilina');
    expect(await screen.findByText('No se pudieron comprobar los avisos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin avisos para estos medicamentos.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeEnabled());
  });

  it('sin anamnesis vigente: lo dice como aviso informativo y deja emitir', async () => {
    const user = setupUser();
    mockedCheck.mockResolvedValue(
      preview(
        [
          {
            rule: 'NO_ANAMNESIS',
            code: 'NO_ANAMNESIS',
            severity: 'INFO',
            activeIngredient: null,
            message: 'Sin anamnesis vigente: no se han podido comprobar alergias ni interacciones',
            source: 'Anamnesis',
          },
        ],
        'MISSING',
      ),
    );
    mockedIssue.mockResolvedValue(makePrescription());
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    expect(
      await screen.findByText('Sin anamnesis vigente: no se han podido comprobar alergias ni interacciones'),
    ).toBeInTheDocument();
    await submit(user);
    await waitFor(() => expect(mockedIssue).toHaveBeenCalled());
    expect(mockedIssue.mock.calls[0][2]).not.toHaveProperty('safetyOverride');
  });

  // Revisión D-1: el 409 lista los avisos; con varios pasa de 240 caracteres y
  // quien prescribe tiene que verlos enteros. Además se vuelven a pedir.
  it('409 de la API (la anamnesis cambió): mensaje entero y nueva comprobación', async () => {
    const user = setupUser();
    const msg = `Avisos de seguridad sin confirmar: ${'Interacción grave: el paciente toma Warfarina y Ibuprofeno es un AINE. '.repeat(4)}Confirma y escribe el motivo para emitir igualmente.`;
    expect(msg.length).toBeGreaterThan(240);
    mockedIssue.mockRejectedValueOnce(new ApiError(409, msg));
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await submit(user);
    expect(await screen.findByText(msg)).toBeInTheDocument();
    await waitFor(() => expect(mockedCheck.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText(/datos cambiaron|choca con el estado/i)).not.toBeInTheDocument();
  });

  it('there is no medicine registration field or external link', async () => {
    const user = setupUser();
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await screen.findByText('Sin avisos para estos medicamentos.');
    expect(screen.queryByRole('textbox', { name: /Nº de registro del medicamento/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link').filter((a) => /aemps/i.test(a.getAttribute('href') ?? ''))).toEqual([]);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('the words hint on «Cantidad total» shows only when the clinic prints quantities in words', async () => {
    const hint = 'Se imprime también en letras.';
    mockedIssuer.mockResolvedValue(makeIssuer({ printQuantityInWords: true }));
    const { unmount } = render(
      <NewPrescriptionModal open onOpenChange={jest.fn()} token="tok" patientId="p1" onIssued={jest.fn()} />,
    );
    await screen.findByText(/Se emite desde/);
    expect(screen.getByText(hint)).toBeInTheDocument();
    unmount();

    mockedIssuer.mockResolvedValue(makeIssuer({ printQuantityInWords: false }));
    renderModal();
    await screen.findByText(/Se emite desde/);
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    const quantity = screen.getByLabelText(/cantidad total/i);
    // Sin pista, el campo no apunta a ningún id que no exista.
    for (const id of (quantity.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(quantity).toHaveAccessibleDescription('');
  });

  it('the HC note shows only when the clinic requires it', async () => {
    const note = 'Esta clínica exige el documento del paciente como nº de historia clínica.';
    renderModal();
    await screen.findByText(/Se emite desde/);
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });

  it('the HC note shows when the clinic setting is on', async () => {
    mockedIssuer.mockResolvedValue(makeIssuer({ requireClinicalRecordNumber: true }));
    renderModal();
    await screen.findByText(/Se emite desde/);
    expect(
      screen.getByText('Esta clínica exige el documento del paciente como nº de historia clínica.'),
    ).toBeInTheDocument();
  });

  it('a 400 for the HC rule is shown in the form summary', async () => {
    const user = setupUser();
    const msg = 'Falta el número de historia clínica: registra el documento del paciente en sus datos';
    mockedIssuer.mockResolvedValue(makeIssuer({ requireClinicalRecordNumber: true }));
    mockedIssue.mockRejectedValue(new ApiError(400, msg));
    const { onOpenChange } = renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await submit(user);
    const alert = (await screen.findByText(msg)).closest('[role="alert"]') as HTMLElement;
    expect(alert).toBeInTheDocument();
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
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
    await submit(user);
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
    await submit(user);

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

  it('missing license reads «Falta tu nº de registro profesional.» next to «Tu nº de registro profesional»', async () => {
    const user = setupUser();
    mockedIssuer.mockResolvedValue(makeIssuer({ professionalLicense: null }));
    renderModal();
    await screen.findByText(/Se emite desde/);
    await fillAmoxicilina(user);
    await submit(user);
    const license = screen.getByLabelText('Tu nº de registro profesional');
    expect(license).toHaveAttribute('aria-invalid', 'true');
    expect(license).toHaveAccessibleDescription(/Falta tu nº de registro profesional\./);
    expect(license).toHaveFocus();
    expect(screen.getByLabelText('Nº de envases (opcional)')).not.toHaveAttribute('aria-invalid');
    expect(mockedIssue).not.toHaveBeenCalled();
  });

  it('elegir una plantilla limpia los errores de campo y el del servidor', async () => {
    const user = setupUser();
    mockedIssue.mockRejectedValueOnce(new ApiError(400, 'Falta el número de historia clínica.'));
    renderModal();
    const select = await screen.findByLabelText('Partir de una plantilla');
    await waitFor(() => expect(select).not.toBeDisabled());
    await submit(user);
    expect(screen.getByLabelText(/^concentración/i)).toHaveAttribute('aria-invalid', 'true');

    await fillAmoxicilina(user);
    await submit(user);
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
    await submit(user);
    expect(await screen.findByText('Falta el número de historia clínica.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/indicaciones generales/i), 'x');
    expect(screen.queryByText('Falta el número de historia clínica.')).not.toBeInTheDocument();
  });

  it('sin registro profesional en el perfil lo pide y lo manda', async () => {
    const user = setupUser();
    mockedIssuer.mockResolvedValue(makeIssuer({ professionalLicense: null }));
    mockedIssue.mockResolvedValue(makePrescription());
    renderModal();
    await user.type(await screen.findByLabelText('Tu nº de registro profesional'), 'TP-55');
    await fillAmoxicilina(user);
    await submit(user);
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith(
        'tok',
        'p1',
        expect.objectContaining({ professionalLicense: 'TP-55' }),
      ),
    );
  });

  it('up to 10 medications for every clinic; the 11th shows «Una receta admite como mucho 10 medicamentos.»', async () => {
    const user = setupUser();
    const item = postExodoncia.items[0];
    mockedTemplates.mockResolvedValue([
      postExodoncia,
      { ...postExodoncia, id: 'tpl11', name: 'Once', items: Array.from({ length: 11 }, () => item) },
    ]);
    renderModal();
    const select = await screen.findByLabelText('Partir de una plantilla');
    await waitFor(() => expect(select).not.toBeDisabled());
    const add = screen.getByRole('button', { name: 'Añadir medicamento' });
    for (let i = 1; i < 10; i++) await user.click(add);
    expect(screen.getAllByRole('group', { name: /^Medicamento \d+$/ })).toHaveLength(10);
    expect(add).toBeDisabled();
    expect(screen.queryByText(/admite como mucho/)).not.toBeInTheDocument();
    await user.selectOptions(select, 'tpl11');
    expect(screen.getByText('Una receta admite como mucho 10 medicamentos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir receta' })).toBeDisabled();
  });

  it('the issuer maxItems caps «Añadir medicamento»', async () => {
    const user = setupUser();
    mockedIssuer.mockResolvedValue(makeIssuer({ maxItems: 2 }));
    renderModal();
    await screen.findByText(/Se emite desde/);
    const add = screen.getByRole('button', { name: 'Añadir medicamento' });
    expect(add).toBeEnabled();
    await user.click(add);
    expect(add).toBeDisabled();
  });

  it('packages are optional: five items without packages submit', async () => {
    const user = setupUser();
    const item = postExodoncia.items[0];
    mockedTemplates.mockResolvedValue([
      { ...postExodoncia, id: 'tpl5', name: 'Cinco', items: Array.from({ length: 5 }, () => item) },
    ]);
    mockedIssue.mockResolvedValue(makePrescription());
    renderModal();
    const select = await screen.findByLabelText('Partir de una plantilla');
    await waitFor(() => expect(select).not.toBeDisabled());
    await user.selectOptions(select, 'tpl5');
    expect(screen.getAllByLabelText('Nº de envases (opcional)')).toHaveLength(5);
    await submit(user);
    await waitFor(() => expect(mockedIssue).toHaveBeenCalled());
    const sent = mockedIssue.mock.calls[0][2];
    expect(sent.items).toHaveLength(5);
    for (const sentItem of sent.items) expect(sentItem).not.toHaveProperty('packages');
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
