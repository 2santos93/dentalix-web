import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { AppointmentPostOpPanel } from './appointment-postop-panel';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import {
  deliverPostOp,
  getAppointmentPostOp,
  type PostOpDeliveryCreated,
  type PostOpDeliverySummary,
  type PostOpSuggestions,
} from '@/lib/postop/postop-api';
import { testAgendaClock } from '@/lib/test/sede-clock';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

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
    whatsapp: { phone: '584145550101', reason: null },
    locationPhone: '+58 212 555 0000',
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
    emailStatus: null,
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
    emailQueued: true,
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
  return render(<AppointmentPostOpPanel clock={CLOCK} token="tok" appointmentId="appt-1" />);
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
    // DX-250: las demás indicaciones siguen a mano aunque haya sugeridas.
    expect(within(region).getByRole('combobox', { name: /otras indicaciones/i })).toHaveValue('');
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
      suggestions({ whatsapp: { phone: null, reason: 'El teléfono del paciente no sirve para WhatsApp.' } }),
    );
    renderPanel();
    const button = await screen.findByRole('button', { name: 'Abrir WhatsApp' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('El teléfono del paciente no sirve para WhatsApp.');
  });

  it('sin teléfono y sin motivo de la API: el propio dice cómo escribirlo, sin nombrar un país (DX-329)', async () => {
    mockedGet.mockResolvedValue(suggestions({ whatsapp: { phone: null, reason: null } }));
    renderPanel();
    const button = await screen.findByRole('button', { name: 'Abrir WhatsApp' });
    expect(button).toHaveAccessibleDescription(
      'El teléfono del paciente no sirve para WhatsApp: revísalo en su ficha o escríbelo con + y su prefijo.',
    );
    expect(button).not.toHaveAccessibleDescription(/país|indicativo/);
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

  it('email registrado pero no encolado: aviso persistente con el enlace y «Copiar enlace», que anuncia «Copiado»', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mockedGet.mockResolvedValue(suggestions());
    mockedDeliver.mockResolvedValueOnce(
      created({
        delivery: deliverySummary({ channel: 'EMAIL', emailStatus: 'NOT_SENT' }),
        publicUrl: 'https://demo.dentalix.app/indicaciones/tok_abc',
        sentTo: null,
        emailQueued: false,
      }),
    );
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar por email' }));

    const notice = await screen.findByText('El email no salió');
    expect(notice.closest('[role="alert"]')).toHaveTextContent(/Email · no enviado/);
    // No es un toast que se va: sigue en el panel.
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    const field = screen.getByLabelText('Enlace público de las indicaciones');
    expect(field).toHaveValue('https://demo.dentalix.app/indicaciones/tok_abc');
    expect(field).toHaveAttribute('readonly');

    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    expect(await screen.findByText('Copiado')).toBeInTheDocument();
    expect(screen.getByText('Copiado')).toHaveAttribute('role', 'status');
    expect(writeText).toHaveBeenCalledWith('https://demo.dentalix.app/indicaciones/tok_abc');

    // La recarga de la lista no lo borra; solo «Entendido».
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(screen.getByText('El email no salió')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByText('El email no salió')).not.toBeInTheDocument();
  });

  it('si el portapapeles falla, lo dice y deja el enlace seleccionado', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockRejectedValue(new Error('denegado')) },
      configurable: true,
    });
    mockedGet.mockResolvedValue(suggestions());
    mockedDeliver.mockResolvedValueOnce(
      created({
        delivery: deliverySummary({ channel: 'EMAIL', emailStatus: 'NOT_SENT' }),
        publicUrl: 'https://demo.dentalix.app/indicaciones/tok_abc',
        emailQueued: false,
      }),
    );
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar por email' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar enlace' }));
    expect(await screen.findByText(/No pudimos copiar automáticamente/)).toBeInTheDocument();
  });

  it('con sugeridas y otras, se puede elegir una de las otras y se entrega con su templateId', async () => {
    mockedGet.mockResolvedValue(suggestions());
    mockedDeliver.mockResolvedValue(created({ sentTo: 'a***@correo.com' }));
    renderPanel();
    const select = await screen.findByRole('combobox', { name: /otras indicaciones/i });
    await userEvent.selectOptions(select, ENDO.id);
    // La sugerida deja de estar marcada: la elección manual gana.
    expect(screen.getByRole('radio', { name: /Tras una extracción/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar por email' }));
    await waitFor(() =>
      expect(mockedDeliver).toHaveBeenCalledWith('tok', 'appt-1', {
        templateId: ENDO.id,
        channel: 'EMAIL',
      }),
    );
    // Volver a una sugerida suelta la otra.
    await userEvent.click(await screen.findByRole('radio', { name: /Tras un blanqueamiento/ }));
    expect(screen.getByRole('combobox', { name: /otras indicaciones/i })).toHaveValue('');
    expect(screen.getByRole('radio', { name: /Tras un blanqueamiento/ })).toBeChecked();
  });

  it('antes de enviar, bajo «Enviar por email» se lee el destino enmascarado y si va al responsable', async () => {
    mockedGet.mockResolvedValue(suggestions());
    const first = renderPanel();
    const button = await screen.findByRole('button', { name: 'Enviar por email' });
    expect(screen.getByText('Se enviará a a***@correo.com.')).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription('Se enviará a a***@correo.com.');
    first.unmount();

    mockedGet.mockResolvedValue(
      suggestions({
        email: { allowed: true, reason: null, toMasked: 'm***@correo.com', toResponsible: true },
      }),
    );
    renderPanel();
    expect(
      await screen.findByText('Se enviará a m***@correo.com (responsable del paciente).'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar por email' })).toHaveAccessibleDescription(
      'Se enviará a m***@correo.com (responsable del paciente).',
    );
  });

  it('una entrega EMAIL cuyo email no salió se lee «Email · no enviado» en la lista de la cita', async () => {
    mockedGet.mockResolvedValue(
      suggestions({ deliveries: [deliverySummary({ channel: 'EMAIL', emailStatus: 'NOT_SENT' })] }),
    );
    renderPanel();
    const list = await screen.findByRole('list', { name: 'Entregadas en esta cita' });
    expect(list).toHaveTextContent(/EXO v2 · Email · no enviado · /);
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
            phone: '584145550101',
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
    expect(href.startsWith('https://wa.me/584145550101?text=')).toBe(true);
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
      created({ whatsapp: { phone: '584145550101', text: 'Hola' } }),
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
  it('el reintento del toast comparte la guarda incluso antes de renderizar busy', async () => {
    const { open } = fakeWindow();
    mockedGet.mockResolvedValue(suggestions());
    mockedDeliver.mockRejectedValueOnce(new NetworkError(new TypeError('fetch failed')));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Imprimir' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [, opts] = (toast.error as jest.Mock).mock.calls[0];
    let finish!: (value: PostOpDeliveryCreated) => void;
    mockedDeliver.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => { opts.action.onClick(); opts.action.onClick(); });
    // La segunda pulsación no hace nada: ni otra pestaña ni otra comprobación.
    expect(open).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(mockedDeliver).toHaveBeenCalledTimes(2));
    expect(mockedGet).toHaveBeenCalledTimes(2);
    await act(async () => finish(created()));
  });

  describe('reintentar la entrega (DX-250)', () => {
    it.each([
      [422, 'El paciente no tiene email ni un responsable que reciba avisos'],
      [429, 'Demasiados emails seguidos a esta clínica. Espera un momento'],
    ])('un %s no ofrece «Reintentar»', async (status, serverMessage) => {
      mockedGet.mockResolvedValue(suggestions());
      mockedDeliver.mockRejectedValueOnce(new ApiError(status, serverMessage));
      renderPanel();
      await userEvent.click(await screen.findByRole('button', { name: 'Enviar por email' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      const [, opts] = (toast.error as jest.Mock).mock.calls[0];
      expect(opts.action).toBeUndefined();
    });

    it('un 502 sí lo ofrece; antes de repetir relee la lista y, si la entrega ya está, no hace el POST', async () => {
      const { win } = fakeWindow();
      const landed = deliverySummary({
        id: 'del-landed',
        channel: 'PRINT',
        templateId: EXTRACTION.id,
      });
      mockedGet
        .mockResolvedValueOnce(suggestions())
        // La relectura: el POST sí llegó a registrarse.
        .mockResolvedValueOnce(suggestions({ deliveries: [landed] }));
      mockedDeliver.mockRejectedValueOnce(new ApiError(502, 'Bad Gateway'));
      renderPanel();
      await userEvent.click(await screen.findByRole('button', { name: 'Imprimir' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      const [, opts] = (toast.error as jest.Mock).mock.calls[0];
      expect(opts.action).toEqual(expect.objectContaining({ label: 'Reintentar' }));
      expect(win.close).toHaveBeenCalledTimes(1);

      await act(async () => opts.action.onClick());
      await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/ya había quedado registrada/)));
      expect(mockedDeliver).toHaveBeenCalledTimes(1);
      // La lista se pinta con la entrega ya registrada.
      expect(await screen.findByRole('list', { name: 'Entregadas en esta cita' })).toHaveTextContent('EXO v2 · Impresas');
    });

    it('un 502 y la relectura sin la entrega: ahora sí repite el POST, una sola vez', async () => {
      fakeWindow();
      mockedGet.mockResolvedValue(suggestions());
      mockedDeliver
        .mockRejectedValueOnce(new ApiError(502, 'Bad Gateway'))
        .mockResolvedValueOnce(created({ sentTo: 'a***@correo.com' }));
      renderPanel();
      await userEvent.click(await screen.findByRole('button', { name: 'Enviar por email' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      const [, opts] = (toast.error as jest.Mock).mock.calls[0];
      await act(async () => opts.action.onClick());
      await waitFor(() => expect(mockedDeliver).toHaveBeenCalledTimes(2));
      expect(mockedGet.mock.calls.length).toBeGreaterThanOrEqual(2);
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Indicaciones enviadas a a***@correo.com.'),
      );
    });

    it('si la relectura falla, no repite el POST: reintenta la comprobación', async () => {
      mockedGet.mockResolvedValueOnce(suggestions());
      mockedDeliver.mockRejectedValueOnce(new ApiError(502, 'Bad Gateway'));
      renderPanel();
      await userEvent.click(await screen.findByRole('button', { name: 'Enviar por email' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      const [, first] = (toast.error as jest.Mock).mock.calls[0];
      mockedGet.mockRejectedValueOnce(new NetworkError(new TypeError('fetch failed')));
      await act(async () => first.action.onClick());
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringMatching(/comprobar si la entrega ya quedó registrada/),
          expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) }),
        ),
      );
      expect(mockedDeliver).toHaveBeenCalledTimes(1);
    });
  });

  it('una recarga fallida conserva selección, datos y entrega nueva con aviso recuperable', async () => {
    mockedGet.mockResolvedValueOnce(suggestions())
      .mockRejectedValueOnce(new NetworkError(new TypeError('fetch failed')))
      .mockResolvedValueOnce(suggestions({ deliveries: [deliverySummary({ channel: 'EMAIL' })] }));
    mockedDeliver.mockResolvedValue(created({ delivery: deliverySummary({ channel: 'EMAIL' }) }));
    renderPanel();
    await userEvent.click(await screen.findByRole('radio', { name: /Tras un blanqueamiento/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar por email' }));
    const warning = await screen.findByText(/No pudimos actualizar las indicaciones/);
    expect(warning).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Tras un blanqueamiento/ })).toBeChecked();
    expect(screen.getByRole('list', { name: 'Entregadas en esta cita' })).toHaveTextContent('EXO v2 · Email');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByText(/No pudimos actualizar las indicaciones/)).not.toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledTimes(3);
  });

  it('el vacío no anuncia al montar; anuncia tras elegir unas indicaciones', async () => {
    mockedGet.mockResolvedValue(suggestions({ suggested: [], others: [ENDO] }));
    renderPanel();
    const empty = await screen.findByText('No hay indicaciones para esta cita');
    expect(empty).not.toHaveAttribute('role', 'status');
    await userEvent.selectOptions(screen.getByRole('combobox'), ENDO.id);
    expect(empty).toHaveAttribute('role', 'status');
  });

  it('dos paneles tienen nombres ligados a sus propios encabezados únicos', async () => {
    mockedGet.mockResolvedValue(suggestions());
    render(<><AppointmentPostOpPanel clock={CLOCK} token="tok" appointmentId="a" /><AppointmentPostOpPanel clock={CLOCK} token="tok" appointmentId="b" /></>);
    const panels = await screen.findAllByRole('region', { name: 'Indicaciones' });
    const ids = panels.map((p) => p.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(2);
    panels.forEach((p, i) => expect(within(p).getByRole('heading', { name: 'Indicaciones' }).id).toBe(ids[i]));
  });

});
