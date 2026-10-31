import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { FillOpeningPanel } from './fill-opening-panel';
import { ApiError } from '@/lib/api/client';
import {
  createLinkOffer,
  createWaitlistOffer,
  listOpeningCandidates,
  moveAppointmentToOpening,
  recordOfferOutcome,
  type OpeningCandidate,
  type OpeningCandidates,
  type OpeningSlot,
} from '@/lib/appointments/opening-candidates';
import { scheduleFromWaitlist, type AppointmentWrite } from '@/lib/appointments/waitlist-api';
import { testAgendaClock } from '@/lib/test/sede-clock';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

jest.mock('../../lib/appointments/opening-candidates', () => {
  const actual = jest.requireActual('../../lib/appointments/opening-candidates');
  return {
    ...actual,
    listOpeningCandidates: jest.fn(),
    createWaitlistOffer: jest.fn(),
    moveAppointmentToOpening: jest.fn(),
    recordOfferOutcome: jest.fn(),
    createLinkOffer: jest.fn(),
  };
});
jest.mock('../../lib/appointments/waitlist-api', () => ({
  scheduleFromWaitlist: jest.fn(),
}));
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
const mockedList = listOpeningCandidates as jest.MockedFunction<typeof listOpeningCandidates>;
const mockedOffer = createWaitlistOffer as jest.MockedFunction<typeof createWaitlistOffer>;
const mockedMove = moveAppointmentToOpening as jest.MockedFunction<typeof moveAppointmentToOpening>;
const mockedOutcome = recordOfferOutcome as jest.MockedFunction<typeof recordOfferOutcome>;
const mockedLinkOffer = createLinkOffer as jest.MockedFunction<typeof createLinkOffer>;
const mockedSchedule = scheduleFromWaitlist as jest.MockedFunction<typeof scheduleFromWaitlist>;

const SLOT: OpeningSlot = {
  locationId: 'loc-1',
  providerId: 'drx',
  start: '2031-03-04T10:00:00.000Z',
  end: '2031-03-04T10:30:00.000Z',
};

function candidate(over: Partial<OpeningCandidate> & { patientId: string }): OpeningCandidate {
  return {
    kind: 'WAITLIST',
    patientFirstName: 'Ana',
    patientLastName: 'Ríos',
    phone: '3101234567',
    whatsappPhone: '573101234567',
    whatsappBlocked: false,
    whatsappBlockedReason: null,
    waitlistEntryId: `wl-${over.patientId}`,
    appointmentId: null,
    priority: 'NORMAL',
    durationMinutes: 30,
    appointmentType: null,
    reason: 'Endodoncia del 46',
    preferredWindow: null,
    providerId: null,
    currentAppointment: null,
    waitingSince: '2031-02-01T00:00:00.000Z',
    offersToday: 0,
    offeredForSlot: false,
    pendingOfferId: null,
    emailBlockedReason: null,
    linkOfferState: null,
    ...over,
  };
}

function view(items: OpeningCandidate[]): OpeningCandidates {
  return {
    locationId: SLOT.locationId,
    providerId: SLOT.providerId,
    start: SLOT.start,
    end: SLOT.end,
    timeZone: 'UTC',
    providerOffSchedule: false,
    offerCap: 2,
    linkOffers: { pending: 0, total: 0, acceptedBy: null, expired: false },
    linkOfferOpen: true,
    items,
    truncated: false,
  };
}

const ana = candidate({ patientId: 'p-ana', priority: 'URGENT' });
const berta = candidate({
  patientId: 'p-berta',
  patientFirstName: 'Berta',
  patientLastName: 'Gil',
  whatsappBlocked: true,
  whatsappBlockedReason: 'OPTED_OUT',
  whatsappPhone: null,
});
const elena = candidate({
  patientId: 'p-elena',
  kind: 'APPOINTMENT',
  patientFirstName: 'Elena',
  patientLastName: 'Mora',
  waitlistEntryId: null,
  appointmentId: 'apt-elena',
  currentAppointment: {
    id: 'apt-elena',
    start: '2031-03-25T09:00:00.000Z',
    end: '2031-03-25T09:30:00.000Z',
    providerId: 'drx',
    status: 'SCHEDULED',
  },
});

function renderPanel(props: Partial<React.ComponentProps<typeof FillOpeningPanel>> = {}) {
  const handlers = {
    onOpenChange: jest.fn(),
    onAssigned: jest.fn(),
    onAgendaStale: jest.fn(),
    onShowWaitlist: jest.fn(),
  };
  render(
    <FillOpeningPanel clock={CLOCK}
      open
      token="tok"
      slot={SLOT}
      providerName="Dra. Pérez"
      locationName="Sede Norte"
      canAct
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('«Ocupar este hueco» (DX-210)', () => {
  it('lista los candidatos en el orden de la API, con urgencia, cita actual y ofertas de hoy', async () => {
    mockedList.mockResolvedValue(view([ana, berta, elena]));
    renderPanel();
    const rows = await screen.findAllByTestId('opening-candidate');
    expect(rows.map((r) => within(r).getAllByText(/./)[0].textContent)).toEqual([
      'Ana Ríos',
      'Berta Gil',
      'Elena Mora',
    ]);
    expect(within(rows[0]).getByText('Urgente')).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Cita actual: martes, 25 de marzo a las 09:00/)).toBeInTheDocument();
    expect(within(rows[0]).getByText('Ofertas hoy: 0 de 2')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', SLOT);
  });

  /** Ventana que abre el clic (en blanco hasta que la oferta queda registrada). */
  function fakeWindow() {
    const win = { opener: {} as unknown, location: { href: '' }, close: jest.fn() };
    const open = jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    return { win, open };
  }

  it('«Ofrecer por WhatsApp» registra la oferta PRIMERO y luego abre wa.me sin datos clínicos', async () => {
    const { win, open } = fakeWindow();
    mockedList.mockResolvedValue(view([ana]));
    let hrefWhenRecorded: string | null = null;
    mockedOffer.mockImplementation(() => {
      hrefWhenRecorded = win.location.href;
      return Promise.resolve({} as never);
    });
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ofrecer el hueco por WhatsApp a Ana Ríos' }),
    );
    // La ventana se abre en el mismo clic (sin bloqueador de ventanas) pero vacía.
    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(win.location.href).not.toBe(''));
    expect(mockedOffer).toHaveBeenCalledWith('tok', SLOT, ana, { channel: 'WA_ME' });
    expect(hrefWhenRecorded).toBe('');
    expect(win.opener).toBeNull();
    const href = win.location.href;
    expect(href.startsWith('https://wa.me/573101234567?text=')).toBe(true);
    const text = decodeURIComponent(href.split('text=')[1]);
    expect(text).toContain('Hola Ana');
    expect(text).toContain('martes, 4 de marzo a las 10:00');
    expect(text).toContain('Sede Norte');
    expect(text).toContain('Dra. Pérez');
    expect(text).not.toContain('Endodoncia');
    open.mockRestore();
  });

  it('si no se pudo registrar la oferta (p. ej. el tope), no se abre WhatsApp', async () => {
    const { win, open } = fakeWindow();
    mockedList.mockResolvedValue(view([ana]));
    mockedOffer.mockRejectedValue(new ApiError(409, 'Ya se le ofrecieron 2 huecos hoy'));
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ofrecer el hueco por WhatsApp a Ana Ríos' }),
    );
    await waitFor(() => expect(win.close).toHaveBeenCalled());
    expect(win.location.href).toBe('');
    expect(toast.error).toHaveBeenCalledWith('Ya se le ofrecieron 2 huecos hoy', expect.anything());
    open.mockRestore();
  });

  it('con el bloqueador de ventanas: registra y deja «Abrir WhatsApp» en el aviso', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    mockedList.mockResolvedValue(view([ana]));
    mockedOffer.mockResolvedValue({} as never);
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ofrecer el hueco por WhatsApp a Ana Ríos' }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Oferta a Ana Ríos registrada.', {
        action: { label: 'Abrir WhatsApp', onClick: expect.any(Function) },
      }),
    );
    open.mockRestore();
  });

  it('una oferta sin respuesta del hueco: «Anotar respuesta» con teclado la cierra', async () => {
    mockedList.mockResolvedValue(
      view([{ ...ana, offersToday: 1, offeredForSlot: true, pendingOfferId: 'of-1' }]),
    );
    mockedOutcome.mockResolvedValue();
    renderPanel();
    const answer = await screen.findByRole('button', { name: 'Anotar la respuesta de Ana Ríos' });
    answer.focus();
    await userEvent.keyboard('{Enter}');
    const group = screen.getByRole('group', { name: '¿Qué respondió Ana Ríos?' });
    await userEvent.click(within(group).getByRole('button', { name: 'Aceptó' }));
    await waitFor(() => expect(mockedOutcome).toHaveBeenCalledWith('tok', 'of-1', 'ACCEPTED'));
    expect(mockedOffer).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Respuesta de Ana Ríos anotada.');
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });

  it('sin permiso de WhatsApp (DX-128) lo dice y ofrece «Llamar»', async () => {
    mockedList.mockResolvedValue(
      view([{ ...ana, whatsappBlocked: true, whatsappBlockedReason: 'NO_OPT_IN', whatsappPhone: null }]),
    );
    renderPanel();
    await screen.findByText('Ana Ríos');
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByText('Sin permiso de WhatsApp: llámalo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Llamar a Ana Ríos al 3101234567' })).toBeInTheDocument();
  });

  it('con baja de WhatsApp (DX-128) no hay botón de WhatsApp: se ofrece «Llamar»', async () => {
    mockedList.mockResolvedValue(view([berta]));
    renderPanel();
    await screen.findByText('Berta Gil');
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Llamar a Berta Gil al 3101234567' })).toHaveAttribute(
      'href',
      'tel:3101234567',
    );
    expect(screen.getByText('No recibe WhatsApp: llámalo')).toBeInTheDocument();
  });

  it('«Llamé» con teclado: elige el resultado y registra la oferta por teléfono', async () => {
    mockedList.mockResolvedValue(view([berta]));
    mockedOffer.mockResolvedValue({} as never);
    renderPanel();
    const called = await screen.findByRole('button', { name: 'Anotar la llamada a Berta Gil' });
    called.focus();
    await userEvent.keyboard('{Enter}');
    const group = screen.getByRole('group', { name: '¿Qué respondió Berta Gil?' });
    await userEvent.click(within(group).getByRole('button', { name: 'No contestó' }));
    await waitFor(() =>
      expect(mockedOffer).toHaveBeenCalledWith('tok', SLOT, berta, {
        channel: 'PHONE',
        outcome: 'NO_ANSWER',
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Oferta a Berta Gil registrada.');
  });

  it('«Llamé» que llega tarde al tope (409): avisa en español y cierra los resultados', async () => {
    mockedList
      .mockResolvedValueOnce(view([berta]))
      .mockResolvedValue(view([{ ...berta, offersToday: 2, offeredForSlot: true }]));
    mockedOffer.mockRejectedValue(new ApiError(409, 'Ya se le ofrecieron 2 huecos hoy'));
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Anotar la llamada a Berta Gil' }),
    );
    const group = screen.getByRole('group', { name: '¿Qué respondió Berta Gil?' });
    await userEvent.click(within(group).getByRole('button', { name: 'No contestó' }));
    await screen.findByText('Ya alcanzó el tope de ofertas de hoy');
    expect(toast.error).toHaveBeenCalledWith('Ya se le ofrecieron 2 huecos hoy', expect.anything());
    expect(screen.queryByRole('group', { name: '¿Qué respondió Berta Gil?' })).not.toBeInTheDocument();
  });

  it('con el tope de ofertas del día no se puede volver a ofrecer', async () => {
    mockedList.mockResolvedValue(view([{ ...ana, offersToday: 2, offeredForSlot: true }]));
    renderPanel();
    await screen.findByText('Aviso enviado');
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anotar la llamada a Ana Ríos' })).toBeDisabled();
    expect(screen.getByText('Ya alcanzó el tope de ofertas de hoy')).toBeInTheDocument();
  });

  it('«Asignar» un pendiente reutiliza «Agendar aquí»; una cita marcada se adelanta', async () => {
    mockedList.mockResolvedValue(view([ana, elena]));
    const created = { start: SLOT.start, warnings: [] } as unknown as AppointmentWrite;
    mockedSchedule.mockResolvedValue(created);
    mockedMove.mockResolvedValue(created);
    const { onAssigned } = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Asignar el hueco a Ana Ríos' }));
    await waitFor(() => expect(onAssigned).toHaveBeenCalledWith(created));
    expect(mockedSchedule).toHaveBeenCalledWith('tok', 'wl-p-ana', {
      providerId: 'drx',
      start: SLOT.start,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Asignar el hueco a Elena Mora' }));
    await waitFor(() => expect(mockedMove).toHaveBeenCalledWith('tok', 'apt-elena', SLOT));
  });

  it('si otro ocupó el hueco: 409 en español, el candidato sale y se recarga', async () => {
    mockedList.mockResolvedValueOnce(view([ana, elena])).mockResolvedValue(view([ana, elena]));
    mockedSchedule.mockRejectedValue(
      new ApiError(409, 'El profesional ya tiene una cita en ese horario'),
    );
    const { onAssigned, onAgendaStale } = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Asignar el hueco a Ana Ríos' }));
    await waitFor(() => expect(onAgendaStale).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(
      'El profesional ya tiene una cita en ese horario',
      expect.anything(),
    );
    expect(onAssigned).not.toHaveBeenCalled();
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Ana Ríos')).not.toBeInTheDocument();
    expect(screen.getByText('Elena Mora')).toBeInTheDocument();
  });

  it('DX-233: un hueco fuera del horario del profesional lo dice en vez de «nadie cabe»', async () => {
    mockedList.mockResolvedValue({ ...view([]), providerOffSchedule: true });
    renderPanel();
    expect(
      await screen.findByText('Este hueco queda fuera del horario del profesional en la sede'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nadie en la lista cabe en este hueco')).not.toBeInTheDocument();
  });

  it('vacío con «Ver pendientes», carga con esqueleto y error con «Reintentar»', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(view([]));
    const { onShowWaitlist } = renderPanel();
    expect(screen.getByText('Buscando candidatos…')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Nadie en la lista cabe en este hueco')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver pendientes' }));
    expect(onShowWaitlist).toHaveBeenCalled();
  });

  it('sin permiso para actuar (odontólogo) solo ve la lista, sin botones', async () => {
    mockedList.mockResolvedValue(view([ana]));
    renderPanel({ canAct: false });
    await screen.findByText('Ana Ríos');
    expect(screen.queryByRole('button', { name: /Asignar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anotar/ })).not.toBeInTheDocument();
  });

  describe('DX-435: oferta con enlace', () => {
    const offerResult = (patientId: string, url: string | null, whatsappPhone: string | null) =>
      ({ id: `o-${patientId}`, patientId, url, whatsappPhone }) as Awaited<ReturnType<typeof createLinkOffer>>;

    it('elige varios, envía por WhatsApp y deja un «Abrir WhatsApp» por paciente con el enlace en el texto', async () => {
      const carla = candidate({ patientId: 'p-carla', patientFirstName: 'Carla', patientLastName: 'Paz' });
      mockedList.mockResolvedValue(view([ana, carla]));
      mockedLinkOffer
        .mockResolvedValueOnce(offerResult('p-ana', 'https://demo.dentalix.app/hueco/aaa', '573101234567'))
        .mockResolvedValueOnce(offerResult('p-carla', 'https://demo.dentalix.app/hueco/ccc', '573101234567'));
      renderPanel();
      const send = await screen.findByRole('button', { name: 'Enviar oferta con enlace' });
      expect(send).toBeDisabled();
      await userEvent.click(screen.getByRole('checkbox', { name: 'Elegir a Ana Ríos para la oferta con enlace' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Elegir a Carla Paz para la oferta con enlace' }));
      expect(screen.getByText('2 elegidos')).toBeInTheDocument();
      await userEvent.click(send);
      const dialog = await screen.findByRole('dialog', { name: 'Enviar oferta con enlace' });
      await userEvent.click(within(dialog).getByRole('radio', { name: /WhatsApp/ }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar oferta' }));
      const open = await within(dialog).findByRole('link', { name: 'Abrir WhatsApp con la oferta para Ana Ríos' });
      expect(decodeURIComponent(open.getAttribute('href') ?? '')).toContain('https://demo.dentalix.app/hueco/aaa');
      expect(decodeURIComponent(open.getAttribute('href') ?? '')).not.toMatch(/Endodoncia|Ríos/);
      expect(mockedLinkOffer).toHaveBeenCalledTimes(2);
      expect(mockedLinkOffer).toHaveBeenCalledWith('tok', SLOT, expect.objectContaining({ patientId: 'p-ana' }), 'LINK_WA_ME');
    });

    it('por email: quien no tiene correo queda fuera y el error de uno no frena a los demás', async () => {
      const sinCorreo = candidate({
        patientId: 'p-sin',
        patientFirstName: 'Sara',
        patientLastName: 'Luna',
        emailBlockedReason: 'NO_EMAIL',
      });
      const carla = candidate({ patientId: 'p-carla', patientFirstName: 'Carla', patientLastName: 'Paz' });
      mockedList.mockResolvedValue(view([ana, sinCorreo, carla]));
      mockedLinkOffer
        .mockRejectedValueOnce(new ApiError(409, 'Ya se le ofrecieron 2 huecos hoy'))
        .mockResolvedValueOnce(offerResult('p-carla', null, null));
      renderPanel();
      for (const name of ['Ana Ríos', 'Sara Luna', 'Carla Paz']) {
        await userEvent.click(await screen.findByRole('checkbox', { name: `Elegir a ${name} para la oferta con enlace` }));
      }
      await userEvent.click(screen.getByRole('button', { name: 'Enviar oferta con enlace' }));
      const dialog = await screen.findByRole('dialog', { name: 'Enviar oferta con enlace' });
      expect(within(dialog).getByText(/Sin este canal \(no se les envía\): Sara Luna/)).toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar oferta' }));
      const results = await within(dialog).findByTestId('link-offer-results');
      expect(results).toHaveTextContent('Ana Ríos · Ya se le ofrecieron 2 huecos hoy');
      expect(results).toHaveTextContent('Carla Paz · Correo en camino');
      expect(mockedLinkOffer).toHaveBeenCalledTimes(2);
      expect(mockedLinkOffer).toHaveBeenLastCalledWith('tok', SLOT, expect.objectContaining({ patientId: 'p-carla' }), 'LINK_EMAIL');
    });

    it('el hueco muestra «Oferta enviada (n)», «Aceptado por …» o «Caducado»', async () => {
      mockedList.mockResolvedValueOnce({
        ...view([{ ...ana, linkOfferState: 'OPEN' }]),
        linkOffers: { pending: 2, total: 2, acceptedBy: null, expired: false },
      });
      renderPanel();
      expect(await screen.findByTestId('slot-link-offers')).toHaveTextContent('Oferta enviada (2)');
      expect(screen.getByText('Enlace enviado')).toBeInTheDocument();
    });

    it('con ofertas pendientes sondea y, al aceptar alguien, dice «Aceptado por …» y refresca la agenda', async () => {
      jest.useFakeTimers();
      try {
        mockedList
          .mockResolvedValueOnce({
            ...view([{ ...ana, linkOfferState: 'OPEN' }]),
            linkOffers: { pending: 1, total: 1, acceptedBy: null, expired: false },
          })
          .mockResolvedValue({
            ...view([{ ...ana, linkOfferState: 'ACCEPTED' }]),
            linkOffers: {
              pending: 0,
              total: 1,
              acceptedBy: { patientId: 'p-ana', firstName: 'Ana', lastName: 'Ríos', at: '2031-03-03T10:00:00.000Z' },
              expired: false,
            },
          });
        const { onAgendaStale } = renderPanel();
        expect(await screen.findByText('Oferta enviada (1)')).toBeInTheDocument();
        await React.act(async () => {
          jest.advanceTimersByTime(15_000);
        });
        expect(await screen.findByText('Aceptado por Ana Ríos')).toBeInTheDocument();
        expect(onAgendaStale).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Ana Ríos aceptó el hueco por enlace.');
        expect(screen.queryByRole('button', { name: 'Enviar oferta con enlace' })).not.toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    it('todas caducadas: «Caducado»; con menos de 20 minutos no se ofrece por enlace', async () => {
      mockedList.mockResolvedValueOnce({
        ...view([{ ...ana, linkOfferState: 'EXPIRED' }]),
        linkOffers: { pending: 0, total: 1, acceptedBy: null, expired: true },
        linkOfferOpen: false,
      });
      renderPanel();
      expect(await screen.findByTestId('slot-link-offers')).toHaveTextContent('Caducado');
      expect(screen.getByText(/Faltan menos de 20 minutos/)).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });
});
