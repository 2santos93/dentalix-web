import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { lookupCaller, type CallerMatch } from '@/lib/caller-lookup/caller-lookup-api';
import { peekPrefillPhone, clearPrefillPhone, setPrefillPhone } from '@/lib/patients/prefill-phone';
import { listLocations } from '@/lib/locations/locations-api';
import { getPatient } from '@/lib/patients/patients-api';
import { clinicLocation } from '@/lib/test/locations';
import { STAMP_SEDES, dateIn, dateTimeIn } from '@/lib/test/stamp';
import { CallerLookupDialog, callerLookupCopy } from './caller-lookup-dialog';
import { callerCardCopy } from './caller-card';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({ getPatient: jest.fn() }));
jest.mock('../../lib/caller-lookup/caller-lookup-api', () => ({
  ...jest.requireActual('../../lib/caller-lookup/caller-lookup-api'),
  lookupCaller: jest.fn(),
}));
jest.mock('../appointments/appointment-form', () => ({
  AppointmentForm: ({ defaultPatient }: { defaultPatient?: { firstName: string } }) => (
    <p>Formulario de cita para {defaultPatient?.firstName}</p>
  ),
}));
const mockedLookup = lookupCaller as jest.MockedFunction<typeof lookupCaller>;

const match = (over: Partial<CallerMatch> = {}): CallerMatch => ({
  id: 'p1',
  firstName: 'Ana',
  lastName: 'Pérez',
  matchedBy: 'PATIENT',
  nextAppointment: null,
  lastVisit: null,
  balance: { overdue: { hasOverdue: false, overdueDays: null }, pending: [] },
  ...over,
});

function setup(role: 'ADMIN' | 'RECEPTION' | 'DENTIST' | 'ASSISTANT' = 'ADMIN') {
  const onOpenChange = jest.fn();
  const view = render(<CallerLookupDialog open onOpenChange={onOpenChange} token="tok" role={role} />);
  return { onOpenChange, ...view };
}

async function search(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(callerLookupCopy.fieldLabel), text);
  await user.click(screen.getByRole('button', { name: callerLookupCopy.search }));
  return user;
}

describe('CallerLookupDialog (DX-224)', () => {
  beforeEach(() => {
    mockedLookup.mockReset();
    push.mockReset();
    clearPrefillPhone();
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([
      { ...STAMP_SEDES.caracas },
      STAMP_SEDES.berlin,
      clinicLocation({ id: 'otra' }),
    ]);
  });

  it('abre con el foco en el campo, sin resultados y con un estado vivo vacío', () => {
    setup();
    expect(screen.getByRole('dialog', { name: callerLookupCopy.title })).toBeInTheDocument();
    expect(screen.getByLabelText(callerLookupCopy.fieldLabel)).toHaveFocus();
    expect(screen.getByTestId('caller-status')).toHaveTextContent('');
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('menos de 7 dígitos: «Escribe el número completo» y no sale a la API', async () => {
    setup();
    await search('412 12');
    expect(await screen.findByRole('alert')).toHaveTextContent(callerLookupCopy.tooShort);
    expect(screen.getByLabelText(callerLookupCopy.fieldLabel)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(callerLookupCopy.fieldLabel)).toHaveFocus();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('coincidencia única: próxima cita y última visita con la zona de SU sede, y saldo con código ISO', async () => {
    mockedLookup.mockResolvedValue({
      truncated: false,
      matches: [
        match({
          nextAppointment: {
            id: 'a1',
            start: '2026-11-10T14:00:00.000Z',
            location: {
              id: STAMP_SEDES.berlin.id,
              name: 'Berlín',
              timeZone: 'Europe/Berlin',
            },
          },
          lastVisit: {
            start: '2026-10-01T15:30:00.000Z',
            location: {
              id: STAMP_SEDES.caracas.id,
              name: 'Caracas',
              timeZone: 'America/Caracas',
            },
          },
          balance: {
            overdue: { hasOverdue: false, overdueDays: null },
            pending: [{ currency: 'USD', amount: 80 }],
          },
        }),
      ],
    });
    setup('RECEPTION');
    await search('0412 1234567');

    const card = await screen.findByTestId('caller-card');
    expect(mockedLookup).toHaveBeenCalledWith('tok', '0412 1234567');
    expect(within(card).getByRole('heading', { name: 'Ana Pérez' })).toBeInTheDocument();
    await waitFor(() => expect(card).toHaveTextContent(`${dateTimeIn('berlin', '2026-11-10T14:00:00.000Z')} · Berlín`));
    expect(card).toHaveTextContent(`${dateIn('caracas', '2026-10-01T15:30:00.000Z')} · Caracas`);
    expect(card).toHaveTextContent(/80,00\s*USD|USD\s*80[.,]00/);
    expect(screen.getByTestId('caller-status')).toHaveTextContent('1 paciente con ese número');
    expect(within(card).getByRole('button', { name: /nueva cita para ana pérez/i })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /abrir la ficha de ana pérez/i })).toHaveAttribute(
      'href',
      '/patients/p1',
    );
  });

  it('sin cita ni visitas: lo dice con palabras, no con guiones', async () => {
    mockedLookup.mockResolvedValue({ matches: [match()], truncated: false });
    setup();
    await search('04121234567');
    const card = await screen.findByTestId('caller-card');
    expect(card).toHaveTextContent(callerCardCopy.noNextAppointment);
    expect(card).toHaveTextContent(callerCardCopy.noLastVisit);
    expect(card).toHaveTextContent(callerCardCopy.noPendingBalance);
  });

  it('varios pacientes con el mismo número (grupo familiar): una tarjeta por cada uno y el responsable aclarado', async () => {
    mockedLookup.mockResolvedValue({
      truncated: false,
      matches: [
        match({ id: 'p1', firstName: 'Ana', lastName: 'Pérez' }),
        match({
          id: 'p2',
          firstName: 'Luis',
          lastName: 'Pérez',
          matchedBy: 'RESPONSIBLE_PARTY',
        }),
      ],
    });
    setup();
    await search('04121234567');
    const cards = await screen.findAllByTestId('caller-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByTestId('caller-status')).toHaveTextContent('2 pacientes con ese número');
    expect(within(cards[0]).queryByText(callerCardCopy.viaResponsible)).not.toBeInTheDocument();
    expect(within(cards[1]).getByText(callerCardCopy.viaResponsible)).toBeInTheDocument();
  });

  it('roles clínicos ven «Alerta clínica»; RECEPTION no (la API no manda la clave) ni el saldo si no es suyo', async () => {
    mockedLookup.mockResolvedValue({
      matches: [match({ hasCriticalAlert: true })],
      truncated: false,
    });
    const { unmount } = setup('DENTIST');
    await search('04121234567');
    expect(await screen.findByTestId('caller-critical-alert')).toHaveTextContent(callerCardCopy.criticalAlert);
    // El dentista no ve importes: ni el rótulo del saldo.
    expect(screen.queryByText(callerCardCopy.pendingBalance)).not.toBeInTheDocument();
    unmount();

    mockedLookup.mockResolvedValue({ matches: [match()], truncated: false });
    setup('RECEPTION');
    await search('04121234567');
    await screen.findByTestId('caller-card');
    expect(screen.queryByTestId('caller-critical-alert')).not.toBeInTheDocument();
    expect(screen.queryByText(callerCardCopy.criticalAlert)).not.toBeInTheDocument();
    expect(screen.getByText(callerCardCopy.pendingBalance)).toBeInTheDocument();
  });

  it('muestra «Saldo vencido» con los días', async () => {
    mockedLookup.mockResolvedValue({
      truncated: false,
      matches: [
        match({
          balance: {
            overdue: { hasOverdue: true, overdueDays: 12 },
            pending: [],
          },
        }),
      ],
    });
    setup('DENTIST');
    await search('04121234567');
    expect(await screen.findByTestId('overdue-chip')).toHaveTextContent(/vencido/i);
  });

  it('sin coincidencias: «Ningún paciente con ese número» y «Crear paciente» con el teléfono prellenado', async () => {
    mockedLookup.mockResolvedValue({ matches: [], truncated: false });
    const { onOpenChange } = setup();
    const user = await search('0412 5559999');
    expect(
      await screen.findByRole('button', {
        name: callerLookupCopy.createPatient,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(callerLookupCopy.noMatchTitle)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: callerLookupCopy.createPatient }));
    expect(peekPrefillPhone()).toBe('0412 5559999');
    expect(push).toHaveBeenCalledWith('/patients/new');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('error de la API: mensaje en español con «Reintentar», que vuelve a buscar', async () => {
    mockedLookup.mockRejectedValueOnce(new ApiError(500, 'Internal Server Error')).mockResolvedValueOnce({ matches: [match()], truncated: false });
    setup();
    const user = await search('04121234567');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(callerLookupCopy.loadError);
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByTestId('caller-card')).toBeInTheDocument();
    expect(mockedLookup).toHaveBeenCalledTimes(2);
    expect(mockedLookup).toHaveBeenLastCalledWith('tok', '04121234567');
  });

  it('un reintento que vuelve a fallar sigue siendo la misma sección de error (sin toast)', async () => {
    mockedLookup.mockRejectedValue(new ApiError(500, 'Internal Server Error'));
    setup();
    const user = await search('04121234567');
    await user.click(
      within(await screen.findByRole('alert')).getByRole('button', {
        name: /reintentar/i,
      }),
    );
    await waitFor(() => expect(mockedLookup).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent(callerLookupCopy.loadError);
  });

  it('pegar un número completo busca al instante', async () => {
    mockedLookup.mockResolvedValue({ matches: [match()], truncated: false });
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(callerLookupCopy.fieldLabel));
    await user.paste('+58 412 1234567');
    expect(await screen.findByTestId('caller-card')).toBeInTheDocument();
    expect(mockedLookup).toHaveBeenCalledWith('tok', '+58 412 1234567');
  });

  it('«Nueva cita» abre el formulario con el paciente puesto', async () => {
    mockedLookup.mockResolvedValue({ matches: [match()], truncated: false });
    (getPatient as jest.MockedFunction<typeof getPatient>).mockResolvedValue({
      id: 'p1',
      firstName: 'Ana',
      lastName: 'Pérez',
    } as Awaited<ReturnType<typeof getPatient>>);
    setup();
    const user = await search('04121234567');
    await user.click(await screen.findByRole('button', { name: /nueva cita para ana pérez/i }));
    expect(await screen.findByText('Formulario de cita para Ana')).toBeInTheDocument();
    expect(getPatient).toHaveBeenCalledWith('tok', 'p1');
  });

  it('M3: con más de 20 pacientes avisa de que hay más coincidencias', async () => {
    mockedLookup.mockResolvedValue({ matches: [match()], truncated: true });
    setup();
    await search('04121234567');
    expect(await screen.findByTestId('caller-truncated')).toHaveTextContent(callerLookupCopy.truncated);
  });

  it('M6: la ayuda del campo se lee con el campo; con error, lo que se lee es el error', async () => {
    setup();
    const input = screen.getByLabelText(callerLookupCopy.fieldLabel);
    const hint = document.getElementById(input.getAttribute('aria-describedby')!);
    expect(hint).toHaveTextContent(callerLookupCopy.fieldHint);
    await search('412');
    expect(screen.getByLabelText(callerLookupCopy.fieldLabel).getAttribute('aria-describedby')).not.toBe(hint?.id);
  });

  it('M7: cerrar el diálogo sin ir al alta olvida el teléfono prellenado', async () => {
    mockedLookup.mockResolvedValue({ matches: [], truncated: false });
    const { rerender } = render(<CallerLookupDialog open onOpenChange={jest.fn()} token="tok" role="ADMIN" />);
    await search('0412 5559999');
    await screen.findByRole('button', { name: callerLookupCopy.createPatient });
    setPrefillPhone('0412 5559999');
    rerender(<CallerLookupDialog open={false} onOpenChange={jest.fn()} token="tok" role="ADMIN" />);
    expect(peekPrefillPhone()).toBe('');
  });

  it('«Abrir ficha» cierra el diálogo', async () => {
    mockedLookup.mockResolvedValue({ matches: [match()], truncated: false });
    const { onOpenChange } = setup();
    const user = await search('04121234567');
    await user.click(await screen.findByRole('link', { name: /abrir la ficha de ana pérez/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
