import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MessageTemplatesSettings, withTemplate } from './message-templates-settings';
import { messageEditorCopy as copy } from './message-template-editor';
import {
  listMessageTemplates,
  previewMessageTemplate,
  resetMessageTemplate,
  saveMessageTemplate,
  sendMessageTemplateTest,
  type MessageTemplates,
} from '@/lib/message-templates/message-templates-api';
import { ApiError } from '@/lib/api/api-error';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/message-templates/message-templates-api', () => ({
  ...jest.requireActual('../../lib/message-templates/message-templates-api'),
  listMessageTemplates: jest.fn(),
  previewMessageTemplate: jest.fn(),
  saveMessageTemplate: jest.fn(),
  resetMessageTemplate: jest.fn(),
  sendMessageTemplateTest: jest.fn(),
}));

const REMINDER_DEFAULT_ES = {
  subject: 'Recordatorio de tu cita en {clinica}',
  body: 'Te recordamos tu cita en {clinica}.\n\nFecha y hora: {fecha} a las {hora}',
};

const VARIABLES = [
  { name: 'paciente', description: 'El nombre de pila del paciente.', sample: 'Ana' },
  { name: 'clinica', description: 'El nombre de la clínica.', sample: 'Clínica Sonrisas' },
  { name: 'fecha', description: 'El día de la cita.', sample: 'martes, 20 de octubre' },
  { name: 'hora', description: 'La hora de la cita.', sample: '9:30 a. m.' },
] as const;

function catalog(): MessageTemplates {
  return {
    languages: ['es', 'en'],
    messages: [
      {
        key: 'appointment-reminder',
        title: 'Recordatorio de cita',
        description: 'El email automático antes de la cita.',
        channels: [
          {
            channel: 'EMAIL',
            variables: [...VARIABLES],
            required: [],
            subjectMaxLength: 150,
            bodyMaxLength: 2000,
            languages: [
              { language: 'es', offered: true, default: REMINDER_DEFAULT_ES, custom: null },
              {
                language: 'en',
                offered: true,
                default: { subject: 'Reminder of your appointment at {clinica}', body: 'This is a reminder.' },
                custom: null,
              },
            ],
          },
        ],
      },
      {
        key: 'appointment-confirmation',
        title: 'Confirmación de cita por WhatsApp',
        description: 'El mensaje de «Abrir WhatsApp» del detalle de la cita.',
        channels: [
          {
            channel: 'WHATSAPP',
            variables: [...VARIABLES, { name: 'enlace', description: 'El enlace para confirmar.', sample: 'https://ejemplo.dentalix.app/vista-previa' }],
            required: ['enlace'],
            subjectMaxLength: null,
            bodyMaxLength: 1000,
            languages: [
              {
                language: 'es',
                offered: true,
                default: { subject: null, body: 'Hola {paciente}, confirma aquí: {enlace}' },
                custom: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

const EMAIL_PREVIEW = {
  channel: 'EMAIL' as const,
  subject: 'Recordatorio de tu cita en Clínica Sonrisas',
  html: '<html><body><p>Te recordamos tu cita</p></body></html>',
  text: 'Te recordamos tu cita',
};

async function openReminder() {
  render(<MessageTemplatesSettings token="tok" />);
  const user = setupUser();
  await user.click(await screen.findByRole('button', { name: 'Editar «Recordatorio de cita»' }));
  const dialog = await screen.findByRole('dialog', { name: 'Recordatorio de cita' });
  return { user, dialog };
}

describe('Ajustes › Mensajes (DX-565)', () => {
  beforeEach(() => {
    jest.mocked(listMessageTemplates).mockReset().mockResolvedValue(catalog());
    jest.mocked(previewMessageTemplate).mockReset().mockResolvedValue(EMAIL_PREVIEW);
    jest.mocked(saveMessageTemplate).mockReset();
    jest.mocked(resetMessageTemplate).mockReset();
    jest.mocked(sendMessageTemplateTest).mockReset();
  });

  it('lista cada mensaje con sus canales y el estado por idioma', async () => {
    render(<MessageTemplatesSettings token="tok" />);
    const reminder = await screen.findByTestId('message-status-appointment-reminder');
    expect(reminder).toHaveTextContent('Email');
    expect(within(reminder).getAllByText('Por defecto')).toHaveLength(2);
    expect(reminder).toHaveTextContent(/Español/);
    expect(reminder).toHaveTextContent(/English|Inglés/);
    expect(screen.getByTestId('message-status-appointment-confirmation')).toHaveTextContent('WhatsApp');
  });

  it('si no carga: error de sección con «Reintentar» que vuelve a pedir', async () => {
    jest.mocked(listMessageTemplates).mockRejectedValueOnce(new ApiError(503, 'x'));
    render(<MessageTemplatesSettings token="tok" />);
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('button', { name: 'Editar «Recordatorio de cita»' })).toBeInTheDocument();
    expect(listMessageTemplates).toHaveBeenCalledTimes(2);
  });

  it('el editor: pestañas por idioma, asunto y cuerpo con contador, avisos de lo fijo y vista previa de la API', async () => {
    const { dialog } = await openReminder();
    expect(within(dialog).getByRole('tab', { name: /Español/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tab', { name: /English|Inglés/ })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(copy.subject)).toHaveValue(REMINDER_DEFAULT_ES.subject);
    expect(within(dialog).getByLabelText(copy.body)).toHaveValue(REMINDER_DEFAULT_ES.body);
    expect(within(dialog).getByText(copy.counter(36, 150))).toBeInTheDocument();
    expect(within(dialog).getByText(copy.emailFixed)).toBeInTheDocument();
    expect(within(dialog).getByText(copy.guardian)).toBeInTheDocument();
    expect(within(dialog).getByTestId('message-template-status')).toHaveTextContent('Por defecto');
    // Sin cambios, Guardar espera.
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled();

    expect(await within(dialog).findByTitle(copy.previewFrame)).toHaveAttribute('sandbox', '');
    expect(within(dialog).getByTestId('message-preview-subject')).toHaveTextContent(EMAIL_PREVIEW.subject);
    expect(previewMessageTemplate).toHaveBeenCalledWith(
      'tok',
      { key: 'appointment-reminder', channel: 'EMAIL', language: 'es' },
      REMINDER_DEFAULT_ES,
    );
  });

  it('un chip inserta la variable donde estaba el cursor y la vista previa se pide con el borrador', async () => {
    const { user, dialog } = await openReminder();
    const body = within(dialog).getByLabelText(copy.body) as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: 'Hola . Nos vemos.' } });
    body.setSelectionRange(5, 5);
    fireEvent.select(body);
    const chip = within(dialog).getByRole('button', { name: 'Insertar {paciente}' });
    expect(chip).toHaveAccessibleDescription('El nombre de pila del paciente.');
    await user.click(chip);
    expect(body).toHaveValue('Hola {paciente}. Nos vemos.');
    await waitFor(() =>
      expect(previewMessageTemplate).toHaveBeenLastCalledWith('tok', expect.anything(), {
        subject: REMINDER_DEFAULT_ES.subject,
        body: 'Hola {paciente}. Nos vemos.',
      }),
    );
    expect(within(dialog).getByRole('tab', { name: /Español.*sin guardar/ })).toBeInTheDocument();
  });

  it('guardar: «Personalizado» en el editor y en la lista', async () => {
    jest.mocked(saveMessageTemplate).mockImplementation(async (_token, target, draft) => ({
      ...target,
      offered: true,
      default: REMINDER_DEFAULT_ES,
      custom: { subject: draft.subject, body: draft.body, updatedAt: '2026-11-19T12:00:00.000Z', updatedByName: 'Laura Gómez' },
    }));
    const { user, dialog } = await openReminder();
    await user.clear(within(dialog).getByLabelText(copy.subject));
    await user.type(within(dialog).getByLabelText(copy.subject), 'Tu cita en {{clinica}');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(saveMessageTemplate).toHaveBeenCalledWith(
      'tok',
      { key: 'appointment-reminder', channel: 'EMAIL', language: 'es' },
      { subject: 'Tu cita en {clinica}', body: REMINDER_DEFAULT_ES.body },
    );
    expect(await within(dialog).findByText(copy.saved)).toBeInTheDocument();
    expect(within(dialog).getByTestId('message-template-status')).toHaveTextContent('Personalizado');
    expect(within(dialog).getByText(copy.savedBy('Laura Gómez'))).toBeInTheDocument();
    expect(within(screen.getByTestId('message-status-appointment-reminder')).getByText('Personalizado')).toBeInTheDocument();
  });

  it('un 400 de la API va junto al campo que indica y no guarda', async () => {
    jest.mocked(saveMessageTemplate).mockRejectedValue(
      new ApiError(400, '{importe} no se puede usar en el recordatorio: los mensajes al paciente no llevan importes ni datos clínicos.', {
        code: 'MESSAGE_TEMPLATE_INVALID',
        field: 'body',
      }),
    );
    const { user, dialog } = await openReminder();
    const body = within(dialog).getByLabelText(copy.body);
    fireEvent.change(body, { target: { value: 'Debes {importe}' } });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText(/\{importe\} no se puede usar en el recordatorio/)).toBeInTheDocument();
    expect(body).toHaveAttribute('aria-invalid', 'true');
    expect(body).toHaveAccessibleDescription(expect.stringContaining('no se puede usar en el recordatorio'));
    expect(within(dialog).getByTestId('message-template-status')).toHaveTextContent('Por defecto');
  });

  it('la vista previa también señala el campo inválido mientras se escribe', async () => {
    jest.mocked(previewMessageTemplate).mockRejectedValue(
      new ApiError(400, 'La variable {importe} no existe.', { code: 'MESSAGE_TEMPLATE_INVALID', field: 'subject' }),
    );
    const { dialog } = await openReminder();
    expect(await within(dialog).findByText('La variable {importe} no existe.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(copy.subject)).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByText(copy.previewInvalid)).toBeInTheDocument();
  });

  it('«Enviarme una prueba» manda el borrador y dice a qué correo; el 429 bloquea con su texto', async () => {
    jest.mocked(sendMessageTemplateTest).mockResolvedValueOnce({ sentTo: 'ma***@sonrisas.com.ve' });
    const { user, dialog } = await openReminder();
    const button = within(dialog).getByRole('button', { name: copy.test });
    await user.click(button);
    expect(sendMessageTemplateTest).toHaveBeenCalledWith(
      'tok',
      { key: 'appointment-reminder', channel: 'EMAIL', language: 'es' },
      REMINDER_DEFAULT_ES,
    );
    expect(await within(dialog).findByText(copy.testSent('ma***@sonrisas.com.ve'))).toBeInTheDocument();

    jest.mocked(sendMessageTemplateTest).mockRejectedValueOnce(
      new ApiError(429, 'Ya te enviamos una prueba hace un momento. Espera 5 minutos para pedir otra.', {
        retryAfterSeconds: 300,
      }),
    );
    await user.click(button);
    expect(await within(dialog).findByText(/Espera 5 minutos para pedir otra/)).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it('«Enviarme una prueba» con el correo sin confirmar: lo pide', async () => {
    jest.mocked(sendMessageTemplateTest).mockRejectedValueOnce(
      new ApiError(409, 'x', { code: 'EMAIL_NOT_VERIFIED' }),
    );
    const { user, dialog } = await openReminder();
    await user.click(within(dialog).getByRole('button', { name: copy.test }));
    expect(await within(dialog).findByText(/Confirma tu correo antes de pedir una prueba/)).toBeInTheDocument();
  });

  it('«Restablecer» pide confirmación y vuelve a «Por defecto»', async () => {
    const saved = catalog();
    saved.messages[0].channels[0].languages[0].custom = {
      subject: 'Tu cita',
      body: 'Hola {paciente}',
      updatedAt: '2026-11-19T12:00:00.000Z',
      updatedByName: null,
    };
    jest.mocked(listMessageTemplates).mockResolvedValue(saved);
    jest.mocked(resetMessageTemplate).mockResolvedValue({
      key: 'appointment-reminder',
      channel: 'EMAIL',
      language: 'es',
      offered: true,
      default: REMINDER_DEFAULT_ES,
      custom: null,
    });
    const { user, dialog } = await openReminder();
    expect(within(dialog).getByTestId('message-template-status')).toHaveTextContent('Personalizado');
    expect(within(dialog).getByLabelText(copy.body)).toHaveValue('Hola {paciente}');
    await user.click(within(dialog).getByRole('button', { name: copy.reset }));
    const confirm = await screen.findByRole('dialog', { name: copy.resetTitle });
    await user.click(within(confirm).getByRole('button', { name: copy.resetConfirm }));
    expect(resetMessageTemplate).toHaveBeenCalledWith('tok', { key: 'appointment-reminder', channel: 'EMAIL', language: 'es' });
    await waitFor(() => expect(within(dialog).getByTestId('message-template-status')).toHaveTextContent('Por defecto'));
    expect(within(dialog).getByLabelText(copy.body)).toHaveValue(REMINDER_DEFAULT_ES.body);
  });

  it('WhatsApp: sin asunto ni prueba, {enlace} obligatoria y la vista previa como burbuja de texto', async () => {
    jest.mocked(previewMessageTemplate).mockResolvedValue({
      channel: 'WHATSAPP',
      subject: null,
      html: null,
      text: 'Hola Ana, confirma aquí: https://ejemplo.dentalix.app/vista-previa',
    });
    render(<MessageTemplatesSettings token="tok" />);
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Editar «Confirmación de cita por WhatsApp»' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmación de cita por WhatsApp' });
    expect(within(dialog).queryByLabelText(copy.subject)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: copy.test })).not.toBeInTheDocument();
    expect(within(dialog).getByText(copy.whatsappFixed(true))).toBeInTheDocument();
    expect(within(dialog).getByText(copy.confirmationExtras)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Insertar {enlace}' })).toHaveAccessibleDescription(
      'El enlace para confirmar. (obligatoria)',
    );
    expect(await within(dialog).findByTestId('message-preview-text')).toHaveTextContent(
      'Hola Ana, confirma aquí: https://ejemplo.dentalix.app/vista-previa',
    );
    // Un solo idioma: sin pestañas.
    expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument();
  });
});

describe('withTemplate', () => {
  it('sustituye solo la combinación guardada y quita un idioma retirado ya restablecido', () => {
    const base = catalog();
    base.messages[0].channels[0].languages[1] = {
      ...base.messages[0].channels[0].languages[1],
      offered: false,
      custom: { subject: 'x', body: 'y', updatedAt: '2026-11-19T12:00:00.000Z', updatedByName: null },
    };
    const next = withTemplate(base, {
      key: 'appointment-reminder',
      channel: 'EMAIL',
      language: 'en',
      offered: false,
      default: base.messages[0].channels[0].languages[1].default,
      custom: null,
    });
    expect(next.messages[0].channels[0].languages.map((l) => l.language)).toEqual(['es']);
    expect(next.messages[1]).toBe(base.messages[1]);
  });
});
