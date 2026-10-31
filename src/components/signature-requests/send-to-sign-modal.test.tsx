import { render, screen, waitFor, within } from '@testing-library/react';
import { SendToSignModal } from './send-to-sign-modal';
import { ApiError } from '@/lib/api/api-error';
import {
  createSignatureRequest,
  getSignatureRequestOptions,
  type SignatureRequestCreated,
  type SignatureRequestOptions,
} from '@/lib/signature-requests/signature-requests-api';
import { listPlans } from '@/lib/treatment-plans/treatment-plans-api';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/signature-requests/signature-requests-api', () => ({
  ...jest.requireActual('../../lib/signature-requests/signature-requests-api'),
  getSignatureRequestOptions: jest.fn(),
  createSignatureRequest: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  listPlans: jest.fn(),
}));

const mockedOptions = getSignatureRequestOptions as jest.MockedFunction<typeof getSignatureRequestOptions>;
const mockedCreate = createSignatureRequest as jest.MockedFunction<typeof createSignatureRequest>;
const mockedPlans = listPlans as jest.MockedFunction<typeof listPlans>;

function options(overrides: Partial<SignatureRequestOptions> = {}): SignatureRequestOptions {
  return {
    templates: [{ id: 'tpl-1', title: 'Consentimiento informado — Exodoncia', version: 2 }],
    professionals: [
      { id: 'u-dentist', fullName: 'Dra. Laura Gómez' },
      { id: 'u-dentist-2', fullName: 'Dr. Andrés Ruiz' },
    ],
    defaultProfessionalId: null,
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

const created = { id: 'sr-1', destinationMasked: 'la***@example.com', emailQueued: true } as SignatureRequestCreated;

function renderModal(props: Partial<React.ComponentProps<typeof SendToSignModal>> = {}) {
  const onSent = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <SendToSignModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      patientId="p1"
      canPickPlan={false}
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
    mockedPlans.mockReset();
  });

  it('recepción elige plantilla y profesional; envía CONSENT por email al destino enmascarado', async () => {
    const user = setupUser();
    mockedOptions.mockResolvedValue(options());
    mockedCreate.mockResolvedValue(created);
    const { onSent, onOpenChange } = renderModal();

    const dialog = await screen.findByRole('dialog', { name: 'Enviar a firmar' });
    const recipient = await within(dialog).findByRole('region', { name: 'Destinatario' });
    expect(recipient).toHaveTextContent('Por correo electrónico');
    expect(recipient).toHaveTextContent('la***@example.com · firma Laura Castro (paciente)');
    // Sin plan para recepción (no lee los planes).
    expect(within(dialog).queryByLabelText(/plan de tratamiento/i)).not.toBeInTheDocument();
    expect(mockedPlans).not.toHaveBeenCalled();

    const send = within(dialog).getByRole('button', { name: 'Enviar enlace' });
    expect(send).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Consentimiento'), 'tpl-1');
    expect(send).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Profesional que firmará'), 'u-dentist-2');
    await user.click(send);

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
        type: 'CONSENT',
        channel: 'EMAIL',
        templateId: 'tpl-1',
        professionalId: 'u-dentist-2',
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSent).toHaveBeenCalledWith(created);
  });

  it('un clínico: el profesional por defecto es él y puede asociar un plan', async () => {
    const user = setupUser();
    mockedOptions.mockResolvedValue(options({ defaultProfessionalId: 'u-dentist' }));
    mockedPlans.mockResolvedValue([
      { id: 'plan-1', status: 'ACCEPTED', createdAt: '2026-09-01T00:00:00.000Z' },
    ] as Awaited<ReturnType<typeof listPlans>>);
    mockedCreate.mockResolvedValue(created);
    renderModal({ canPickPlan: true });

    const professional = await screen.findByLabelText('Profesional que firmará');
    expect(professional).toHaveValue('u-dentist');
    await user.selectOptions(screen.getByLabelText('Consentimiento'), 'tpl-1');
    await user.selectOptions(await screen.findByLabelText(/plan de tratamiento/i), 'plan-1');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', expect.objectContaining({ treatmentPlanId: 'plan-1' })),
    );
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
      'cl***@example.com · firma Claudia Navarro, su responsable (el paciente es menor de edad)',
    );
  });

  it('si no se puede enviar, dice por qué y no deja enviar', async () => {
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
    expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeDisabled();
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
      new ApiError(429, 'Ya enviamos un correo a esta persona hace un momento. Espera 30 segundos antes de volver a enviarlo.'),
    );
    const { onOpenChange, onSent } = renderModal();
    await user.selectOptions(await screen.findByLabelText('Consentimiento'), 'tpl-1');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText(/Espera 30 segundos/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });
});
