import { render, screen, waitFor, within } from '@testing-library/react';
import { SendToSignModal } from './send-to-sign-modal';
import { ApiError } from '@/lib/api/api-error';
import {
  createSignatureRequest,
  getSignatureRequestOptions,
  type SignatureRequestCreated,
  type SignatureRequestOptions,
} from '@/lib/signature-requests/signature-requests-api';
import { setupUser } from '@/lib/test/user';
import { caracasSede, testAgendaClock } from '@/lib/test/sede-clock';

jest.mock('../../lib/signature-requests/signature-requests-api', () => ({
  ...jest.requireActual('../../lib/signature-requests/signature-requests-api'),
  getSignatureRequestOptions: jest.fn(),
  createSignatureRequest: jest.fn(),
}));

const mockedOptions = getSignatureRequestOptions as jest.MockedFunction<typeof getSignatureRequestOptions>;
const mockedCreate = createSignatureRequest as jest.MockedFunction<typeof createSignatureRequest>;

// Sede de Caracas en 12 h: «ya lo firmó el …» sale en su zona y su formato.
const CLOCK = testAgendaClock([caracasSede()]);

function options(overrides: Partial<SignatureRequestOptions> = {}): SignatureRequestOptions {
  return {
    templates: [
      {
        id: 'tpl-1',
        title: 'Consentimiento informado — Exodoncia',
        version: 2,
        usesTreatment: true,
        lastCompletedAt: null,
      },
    ],
    professionals: [
      { id: 'u-dentist', fullName: 'Dra. Laura Gómez', role: 'DENTIST' },
      { id: 'u-dentist-2', fullName: 'Dr. Andrés Ruiz', role: 'DENTIST' },
    ],
    defaultProfessionalId: null,
    plans: [
      {
        id: 'plan-1',
        status: 'PRESENTED',
        optionLabel: 'Opción A: implante',
        createdAt: '2026-09-01T15:00:00.000Z',
      },
    ],
    recipient: {
      allowed: true,
      reason: null,
      destinationMasked: 'la***@example.com',
      signerType: 'PATIENT',
      signerName: 'Laura Castro',
      minor: false,
    },
    ...overrides,
  };
}

const created = {
  id: 'sr-1',
  destinationMasked: 'la***@example.com',
  emailQueued: true,
} as SignatureRequestCreated;

function renderModal(props: Partial<React.ComponentProps<typeof SendToSignModal>> = {}) {
  const onSent = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <SendToSignModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      patientId="p1"
      userId="u-reception"
      clock={CLOCK}
      onSent={onSent}
      {...props}
    />,
  );
  return { onSent, onOpenChange };
}

describe('SendToSignModal (DX-243)', () => {
  beforeEach(() => {
    mockedOptions.mockReset();
    mockedCreate.mockReset();
  });

  it('recepción elige plantilla, profesional y plan; envía CONSENT por email al destino enmascarado', async () => {
    const user = setupUser();
    mockedOptions.mockResolvedValue(options());
    mockedCreate.mockResolvedValue(created);
    const { onSent, onOpenChange } = renderModal();

    const dialog = await screen.findByRole('dialog', {
      name: 'Enviar a firmar',
    });
    // Quien envía no es el profesional: no le dice «lo firmas tú».
    expect(dialog).not.toHaveTextContent(/firmas tú/);
    expect(within(dialog).getByText(/firma en la app el profesional que elijas/)).toBeInTheDocument();
    const recipient = await within(dialog).findByRole('region', {
      name: 'Destinatario',
    });
    expect(recipient).toHaveTextContent('Por correo electrónico');
    expect(recipient).toHaveTextContent('la***@example.com · firma Laura Castro (paciente)');

    await user.selectOptions(within(dialog).getByLabelText('Consentimiento'), 'tpl-1');
    // El profesional se ve con su rol.
    expect(
      within(dialog).getByRole('option', {
        name: 'Dr. Andrés Ruiz · Odontólogo/a',
      }),
    ).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Profesional que firmará'), 'u-dentist-2');
    // Recepción también elige el plan (lo ve en «Presupuestos»).
    const plan = within(dialog).getByLabelText(/plan de tratamiento/i);
    expect(
      within(plan).getByRole('option', {
        name: /Opción A: implante · Presentado/,
      }),
    ).toBeInTheDocument();
    await user.selectOptions(plan, 'plan-1');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar enlace' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
        type: 'CONSENT',
        channel: 'EMAIL',
        templateId: 'tpl-1',
        professionalId: 'u-dentist-2',
        treatmentPlanId: 'plan-1',
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSent).toHaveBeenCalledWith(created);
  });

  it('sin elegir plantilla ni profesional, «Enviar enlace» dice qué falta junto a cada campo y no envía', async () => {
    const user = setupUser();
    mockedOptions.mockResolvedValue(options());
    renderModal();
    const send = await screen.findByRole('button', { name: 'Enviar enlace' });
    expect(send).toBeEnabled();
    expect(screen.getByText('Para enviar, elige el consentimiento y el profesional que firmará.')).toBeInTheDocument();
    await user.click(send);
    expect(await screen.findByText('Elige el consentimiento que quieres enviar.')).toBeInTheDocument();
    expect(screen.getByText('Elige el profesional que firmará después en la app.')).toBeInTheDocument();
    expect(screen.getByLabelText('Consentimiento')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Consentimiento')).toHaveFocus();
    expect(mockedCreate).not.toHaveBeenCalled();
    // Al elegirlo, el aviso de ese campo se va.
    await user.selectOptions(screen.getByLabelText('Consentimiento'), 'tpl-1');
    expect(screen.queryByText('Elige el consentimiento que quieres enviar.')).not.toBeInTheDocument();
  });

  it('un clínico: el profesional por defecto es él y la descripción le dice que firma después', async () => {
    const user = setupUser();
    mockedOptions.mockResolvedValue(options({ defaultProfessionalId: 'u-dentist' }));
    mockedCreate.mockResolvedValue(created);
    renderModal({ userId: 'u-dentist' });

    const professional = await screen.findByLabelText('Profesional que firmará');
    expect(professional).toHaveValue('u-dentist');
    expect(screen.getByRole('dialog')).toHaveTextContent('Después lo firmas tú en la app.');
    await user.selectOptions(screen.getByLabelText('Consentimiento'), 'tpl-1');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', expect.objectContaining({ professionalId: 'u-dentist' })),
    );
  });

  it('sin plan, si la plantilla usa el tratamiento, avisa de que dirá «No especificado»; la ayuda no enseña la variable', async () => {
    const user = setupUser();
    mockedOptions.mockResolvedValue(options());
    renderModal();
    await user.selectOptions(await screen.findByLabelText('Consentimiento'), 'tpl-1');
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
    expect(screen.getByText('Sin plan, el documento dirá «No especificado» en el tratamiento.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/plan de tratamiento/i), 'plan-1');
    expect(screen.queryByText(/No especificado/)).not.toBeInTheDocument();
  });

  it('si el paciente ya completó esa plantilla, avisa con la fecha de la sede pero deja enviar', async () => {
    const user = setupUser();
    mockedOptions.mockResolvedValue(
      options({
        defaultProfessionalId: 'u-dentist',
        templates: [
          {
            id: 'tpl-1',
            title: 'Consentimiento informado — Exodoncia',
            version: 2,
            usesTreatment: false,
            // 02:00 UTC del 2 = 22:00 del 1 de octubre en Caracas.
            lastCompletedAt: '2026-10-02T02:00:00.000Z',
          },
        ],
      }),
    );
    mockedCreate.mockResolvedValue(created);
    renderModal({ userId: 'u-dentist' });
    await user.selectOptions(await screen.findByLabelText('Consentimiento'), 'tpl-1');
    expect(screen.getByText(/^Este paciente ya firmó este consentimiento el 1 de octubre de 2026/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
  });

  it('un menor: dice que firma su responsable', async () => {
    mockedOptions.mockResolvedValue(
      options({
        recipient: {
          allowed: true,
          reason: null,
          destinationMasked: 'cl***@example.com',
          signerType: 'GUARDIAN',
          signerName: 'Claudia Navarro',
          minor: true,
        },
      }),
    );
    renderModal();
    expect(await screen.findByRole('region', { name: 'Destinatario' })).toHaveTextContent(
      'cl***@example.com · firma Claudia Navarro, su responsable (la persona es menor de edad)',
    );
  });

  it('si no se puede enviar, dice por qué y el botón deshabilitado apunta al motivo', async () => {
    const user = setupUser();
    mockedOptions.mockResolvedValue(
      options({
        recipient: {
          allowed: false,
          reason: 'El paciente no tiene email: añádelo en su ficha para enviarle el documento.',
          destinationMasked: null,
          signerType: null,
          signerName: null,
          minor: false,
        },
      }),
    );
    renderModal();
    expect(await screen.findByRole('alert')).toHaveTextContent('El paciente no tiene email');
    await user.selectOptions(screen.getByLabelText('Consentimiento'), 'tpl-1');
    await user.selectOptions(screen.getByLabelText('Profesional que firmará'), 'u-dentist');
    const send = screen.getByRole('button', { name: 'Enviar enlace' });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription(/No se puede enviar: El paciente no tiene email/);
  });

  it('error al cargar las opciones: SectionError con reintento', async () => {
    const user = setupUser();
    mockedOptions.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedOptions.mockResolvedValueOnce(options());
    renderModal();
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos preparar el envío.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Consentimiento')).toBeInTheDocument();
  });

  it('un fallo al enviar deja el modal abierto con el motivo en español', async () => {
    const user = setupUser();
    mockedOptions.mockResolvedValue(options({ defaultProfessionalId: 'u-dentist' }));
    mockedCreate.mockRejectedValue(
      new ApiError(
        429,
        'Ya enviamos un correo a esta persona hace un momento. Espera 30 segundos antes de volver a enviarlo.',
      ),
    );
    const { onOpenChange, onSent } = renderModal({ userId: 'u-dentist' });
    await user.selectOptions(await screen.findByLabelText('Consentimiento'), 'tpl-1');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText(/Espera 30 segundos/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });
});
