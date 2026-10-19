import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { AppointmentPostOpPanel } from './appointment-postop-panel';
import { NetworkError } from '@/lib/api/api-error';
import {
  deliverPostOp,
  getAppointmentPostOp,
  type PostOpDeliveryCreated,
  type PostOpDeliverySummary,
  type PostOpSuggestions,
} from '@/lib/postop/postop-api';

jest.mock('../../lib/postop/postop-api', () => ({
  ...jest.requireActual('../../lib/postop/postop-api'),
  getAppointmentPostOp: jest.fn(),
  deliverPostOp: jest.fn(),
}));
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGet = getAppointmentPostOp as jest.MockedFunction<typeof getAppointmentPostOp>;
const mockedDeliver = deliverPostOp as jest.MockedFunction<typeof deliverPostOp>;

const EXTRACTION = { id: 'tpl-ext', code: 'EXO', title: 'Tras una extracción', version: 2 };
const WHITENING = { id: 'tpl-bla', code: 'BLA', title: 'Tras un blanqueamiento', version: 1 };
const ENDO = { id: 'tpl-endo', code: 'ENDO', title: 'Tras una endodoncia', version: 3 };

function suggestions(overrides: Partial<PostOpSuggestions> = {}): PostOpSuggestions {
  return {
    patientId: 'pat-1',
    suggested: [EXTRACTION, WHITENING],
    others: [ENDO],
    email: { allowed: true, reason: null, toMasked: 'a***@correo.com', toResponsible: false },
    whatsapp: { phone: '573105550101', reason: null },
    locationPhone: '+57 601 555 0000',
    deliveries: [],
    ...overrides,
  };
}

function deliverySummary(overrides: Partial<PostOpDeliverySummary> = {}): PostOpDeliverySummary {
  return {
    id: 'del-1',
    patientId: 'pat-1',
    appointmentId: 'appt-1',
    templateId: EXTRACTION.id,
    templateCode: 'EXO',
    templateTitle: EXTRACTION.title,
    templateVersion: 2,
    channel: 'PRINT',
    deliveredAt: '2026-10-20T15:30:00.000Z',
    deliveredByName: 'Laura Gómez',
    recipientMasked: null,
    sentToResponsible: false,
    firstOpenedAt: null,
    linkExpiresAt: null,
    ...overrides,
  };
}

function created(overrides: Partial<PostOpDeliveryCreated> = {}): PostOpDeliveryCreated {
  return {
    delivery: deliverySummary(),
    publicUrl: null,
    whatsapp: null,
    sentTo: null,
    sentToResponsible: false,
    ...overrides,
  };
}

/** Ventana que abre el clic (en blanco hasta que la entrega queda registrada). */
function fakeWindow() {
  const win = { opener: {} as unknown, location: { href: '' }, close: jest.fn() };
  const open = jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
  return { win, open };
}

function renderPanel() {
  return render(<AppointmentPostOpPanel token="tok" appointmentId="appt-1" />);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('AppointmentPostOpPanel', () => {
  it('propone la plantilla sugerida (la primera, preseleccionada)', async () => {
    mockedGet.mockResolvedValue(suggestions());
    renderPanel();
    const region = await screen.findByRole('region', { name: 'Indicaciones' });
    const first = await within(region).findByRole('radio', { name: /Tras una extracción/ });
    expect(first).toBeChecked();
    expect(within(region).getByRole('radio', { name: /Tras un blanqueamiento/ })).not.toBeChecked();
    expect(within(region).queryByRole('combobox')).not.toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('tok', 'appt-1');
    for (const name of ['Imprimir', 'Enviar por email', 'Abrir WhatsApp']) {
      expect(within(region).getByRole('button', { name })).toBeEnabled();
    }
  });

  it('sin sugerencias: lo dice y ofrece las demás en un selector', async () => {
    mockedGet.mockResolvedValue(suggestions({ suggested: [], others: [ENDO, WHITENING] }));
    renderPanel();
    expect(await screen.findByText('No hay indicaciones para esta cita')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: /otras indicaciones/i });
    expect(within(select).getByRole('option', { name: /Tras una endodoncia/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    // Hasta elegir una, no hay nada que entregar.
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeDisabled();

    await userEvent.selectOptions(select, ENDO.id);
    mockedDeliver.mockResolvedValue(created({ sentTo: 'a***@correo.com' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar por email' }));
    await waitFor(() =>
      expect(mockedDeliver).toHaveBeenCalledWith('tok', 'appt-1', {
        templateId: ENDO.id,
        channel: 'EMAIL',
      }),
    );
  });

  it('email no permitido: botón deshabilitado con el motivo', async () => {
    mockedGet.mockResolvedValue(
      suggestions({
        email: { allowed: false, reason: 'El paciente no tiene email.', toMasked: null, toResponsible: false },
      }),
    );
    renderPanel();
    const button = await screen.findByRole('button', { name: 'Enviar por email' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('El paciente no tiene email.');
  });

  it('sin teléfono: «Abrir WhatsApp» deshabilitado con el motivo', async () => {
    mockedGet.mockResolvedValue(
      suggestions({ whatsapp: { phone: null, reason: 'El paciente no tiene celular con indicativo.' } }),
    );
    renderPanel();
    const button = await screen.findByRole('button', { name: 'Abrir WhatsApp' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('El paciente no tiene celular con indicativo.');
  });

  it('«Enviar por email» confirma a quién se envió (y si fue al responsable)', async () => {
    mockedGet.mockResolvedValue(suggestions());
    mockedDeliver
      .mockResolvedValueOnce(created({ sentTo: 'a***@correo.com' }))
      .mockResolvedValueOnce(created({ sentTo: 'm***@correo.com', sentToResponsible: true }));
    renderPanel();
    const button = await screen.findByRole('button', { name: 'Enviar por email' });
    await userEvent.click(button);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Indicaciones enviadas a a***@correo.com.'),
    );
    expect(mockedDeliver).toHaveBeenCalledWith('tok', 'appt-1', {
      templateId: EXTRACTION.id,
      channel: 'EMAIL',
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar por email' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Indicaciones enviadas al responsable del paciente (m***@correo.com).',
      ),
    );
  });

  it('«Abrir WhatsApp» registra la entrega PRIMERO y abre wa.me con el texto de la API', async () => {
    const { win, open } = fakeWindow();
    mockedGet.mockResolvedValue(suggestions());
    let hrefWhenRecorded: string | null = null;
    mockedDeliver.mockImplementation(() => {
      hrefWhenRecorded = win.location.href;
      return Promise.resolve(
        created({
          delivery: deliverySummary({ channel: 'WHATSAPP_LINK' }),
          publicUrl: 'http://demo.localhost:3001/indicaciones/tok_abc',
          whatsapp: {
            phone: '573105550101',
            text: 'Hola Ana, aquí tienes tus indicaciones: http://demo.localhost:3001/indicaciones/tok_abc',
          },
        }),
      );
    });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir WhatsApp' }));
    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(win.location.href).not.toBe(''));
    expect(hrefWhenRecorded).toBe('');
    expect(win.opener).toBeNull();
    expect(mockedDeliver).toHaveBeenCalledWith('tok', 'appt-1', {
      templateId: EXTRACTION.id,
      channel: 'WHATSAPP_LINK',
    });
    const href = win.location.href;
    expect(href.startsWith('https://wa.me/573105550101?text=')).toBe(true);
    const text = decodeURIComponent(href.split('?text=')[1]);
    expect(text).toContain('http://demo.localhost:3001/indicaciones/tok_abc');
    expect(text).not.toContain(EXTRACTION.title);
  });

  it('«Imprimir» registra la entrega y abre la vista imprimible en otra pestaña', async () => {
    const { win, open } = fakeWindow();
    mockedGet.mockResolvedValue(suggestions());
    mockedDeliver.mockResolvedValue(created({ delivery: deliverySummary({ id: 'del-9' }) }));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Imprimir' }));
    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(win.location.href).toBe('/print/patients/pat-1/indicaciones/del-9'));
    expect(mockedDeliver).toHaveBeenCalledWith('tok', 'appt-1', {
      templateId: EXTRACTION.id,
      channel: 'PRINT',
    });
  });

  it('con el bloqueador de ventanas: registra y deja «Abrir» en el aviso', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    mockedGet.mockResolvedValue(suggestions());
    mockedDeliver.mockResolvedValue(created({ delivery: deliverySummary({ id: 'del-9' }) }));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Imprimir' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [, opts] = (toast.success as jest.Mock).mock.calls[0];
    opts.action.onClick();
    expect(open).toHaveBeenLastCalledWith(
      '/print/patients/pat-1/indicaciones/del-9',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('error de red al entregar: cierra la pestaña y avisa con reintento', async () => {
    const { win } = fakeWindow();
    mockedGet.mockResolvedValue(suggestions());
    mockedDeliver.mockRejectedValueOnce(new NetworkError(new TypeError('fetch failed')));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir WhatsApp' }));
    await waitFor(() => expect(win.close).toHaveBeenCalled());
    expect(win.location.href).toBe('');
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/conexión/),
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) }),
    );

    // El reintento repite la misma entrega.
    mockedDeliver.mockResolvedValueOnce(
      created({ whatsapp: { phone: '573105550101', text: 'Hola' } }),
    );
    const [, opts] = (toast.error as jest.Mock).mock.calls[0];
    await act(async () => opts.action.onClick());
    await waitFor(() => expect(mockedDeliver).toHaveBeenCalledTimes(2));
    expect(mockedDeliver).toHaveBeenLastCalledWith('tok', 'appt-1', {
      templateId: EXTRACTION.id,
      channel: 'WHATSAPP_LINK',
    });
  });

  it('tras entregar, la lista «Entregadas en esta cita» se refresca', async () => {
    mockedGet.mockResolvedValueOnce(suggestions()).mockResolvedValueOnce(
      suggestions({
        deliveries: [deliverySummary({ channel: 'EMAIL', deliveredByName: 'Laura Gómez' })],
      }),
    );
    mockedDeliver.mockResolvedValue(created({ sentTo: 'a***@correo.com' }));
    renderPanel();
    expect(await screen.findByText(/Aún no se han entregado/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar por email' }));
    const list = await screen.findByRole('list', { name: 'Entregadas en esta cita' });
    const item = within(list).getByRole('listitem');
    expect(item).toHaveTextContent(/EXO v2 · Email · \d{2}\/\d{2}\/2026 \d{2}:\d{2} · Laura Gómez/);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('error al cargar: SectionError con reintento', async () => {
    mockedGet.mockRejectedValueOnce(new NetworkError(new TypeError('fetch failed'))).mockResolvedValueOnce(suggestions());
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('radio', { name: /Tras una extracción/ })).toBeChecked();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
