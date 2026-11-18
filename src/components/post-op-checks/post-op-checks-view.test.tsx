import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import {
  listPostOpChecks,
  registerPostOpAttempt,
  type PostOpCheck,
  type PostOpCheckItem,
  type PostOpCheckPage,
} from '@/lib/post-op-checks/post-op-checks-api';
import { PostOpChecksView, postOpChecksCopy as copy } from './post-op-checks-view';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { tokenForRole } from '@/lib/test/data-consents';
import { WORK_QUEUES_CHANGED_EVENT } from '@/components/work-queues/work-queues-context';
import { useAuthStore } from '@/lib/auth/auth-store';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/clinic-branding', () => ({ fetchClinicName: jest.fn().mockResolvedValue('Clínica Ávila') }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../components/errors/notify', () => ({ notifyError: jest.fn() }));
// El formulario de cita tiene sus tests: aquí, qué le llega.
jest.mock('./post-op-schedule-dialog', () => ({
  PostOpScheduleDialog: (props: {
    item: { patientId: string; professionalId: string; locationId: string };
    onCreated: (a: { id: string }) => void;
  }) => (
    <div
      role="dialog"
      aria-label="Agendar revisión"
      data-patient={props.item.patientId}
      data-professional={props.item.professionalId}
      data-location={props.item.locationId}
    >
      <button type="button" onClick={() => props.onCreated({ id: 'ap-1' })}>
        Crear cita
      </button>
    </div>
  ),
}));
jest.mock('../../lib/post-op-checks/post-op-checks-api', () => ({
  ...jest.requireActual('../../lib/post-op-checks/post-op-checks-api'),
  listPostOpChecks: jest.fn(),
  registerPostOpAttempt: jest.fn(),
}));
const mockedList = jest.mocked(listPostOpChecks);
const mockedRegister = jest.mocked(registerPostOpAttempt);
const { notifyError } = jest.requireMock('../../components/errors/notify') as { notifyError: jest.Mock };

const DENTIST = tokenForRole('DENTIST');
const RECEPTION = tokenForRole('RECEPTION');

const item = (over: Partial<PostOpCheckItem> = {}): PostOpCheckItem => ({
  id: 'k1',
  dueOn: '2026-11-17',
  overdueDays: 0,
  locationId: 'l1',
  patientId: 'p1',
  patientName: 'Jorge Eduardo Ramírez Ortega',
  patientPhone: '+58 414 555 0101',
  whatsAppDigits: '584145550101',
  professionalId: 'u-dentist',
  professionalName: 'Dra. Carmen Rojas',
  appointmentId: 'a1',
  appointmentStart: '2026-11-16T14:00:00.000Z',
  attemptsCount: 0,
  clinicalHidden: false,
  procedureName: 'Extracción simple',
  attempts: [],
  instructions: [{ deliveryId: 'd1', title: 'Cuidados tras una extracción', deliveredAt: '2026-11-16T15:00:00.000Z' }],
  ...over,
});
const page = (items: PostOpCheckItem[]): PostOpCheckPage => ({
  items,
  total: items.length,
  overdue: items.filter((i) => i.overdueDays > 0).length,
  page: 1,
  pageSize: 25,
});
const check = (over: Partial<PostOpCheck> = {}): PostOpCheck => ({
  id: 'k1',
  patientId: 'p1',
  locationId: 'l1',
  status: 'DONE',
  outcome: 'FINE',
  dueOn: '2026-11-17',
  closedAt: '2026-11-17T15:00:00.000Z',
  closedById: 'u-dentist',
  clinicalEntryId: 'e1',
  addendumId: 'ad1',
  attemptId: 'at1',
  attemptsCount: 1,
  ...over,
});

async function rowOf(name: string) {
  return (await screen.findByText(name)).closest('tr')!;
}

async function register(outcome: string, note?: string) {
  const row = await rowOf('Jorge Eduardo Ramírez Ortega');
  await userEvent.click(within(row).getByRole('button', { name: 'Acciones de Jorge Eduardo Ramírez Ortega' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: copy.register }));
  const dialog = await screen.findByRole('dialog', { name: 'Registrar resultado' });
  await userEvent.click(within(dialog).getByRole('radio', { name: new RegExp(`^${outcome}`) }));
  if (note) await userEvent.type(within(dialog).getByLabelText('Nota (opcional)'), note);
  await userEvent.click(within(dialog).getByRole('button', { name: /^Guardar/ }));
}

describe('PostOpChecksView (DX-566)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedRegister.mockReset();
    notifyError.mockReset();
    jest.mocked(listLocations).mockResolvedValue([clinicLocation({ id: 'l1' })]);
  });

  it('clínico: paciente, vence, procedimiento con sus indicaciones, intentos, llamar y WhatsApp sin datos clínicos', async () => {
    mockedList.mockResolvedValue(
      page([
        item({
          overdueDays: 2,
          attemptsCount: 1,
          attempts: [
            { id: 'at0', outcome: 'NO_ANSWER', note: 'Buzón de voz', byId: 'u-dentist', byName: 'Dra. Carmen Rojas', at: '2026-11-17T13:00:00.000Z' },
          ],
        }),
      ]),
    );
    render(<PostOpChecksView token={DENTIST} />);
    const row = await rowOf('Jorge Eduardo Ramírez Ortega');
    expect(within(row).getByText('Vencido hace 2 días')).toBeInTheDocument();
    expect(within(row).getByText('Extracción simple')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /Cuidados tras una extracción/ })).toHaveAttribute(
      'href',
      '/print/patients/p1/indicaciones/d1',
    );
    expect(within(row).getByText('1 intento')).toBeInTheDocument();
    expect(within(row).getByText(/^No contesta · Dra\. Carmen Rojas · /)).toBeInTheDocument();
    expect(within(row).getByText('Buzón de voz')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /^Llamar a Jorge/ })).toHaveAttribute('href', 'tel:+584145550101');
    await waitFor(() =>
      expect(within(row).getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toContain('Cl%C3%ADnica%20%C3%81vila'),
    );
    expect(within(row).getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).not.toMatch(/Extracci/);
  });

  it('recepción: ve a quién llamar, sin procedimiento, sin historial y sin «Registrar resultado»', async () => {
    mockedList.mockResolvedValue(
      page([item({ clinicalHidden: true, procedureName: null, attempts: null, instructions: null, attemptsCount: 1 })]),
    );
    render(<PostOpChecksView token={RECEPTION} />);
    const row = await rowOf('Jorge Eduardo Ramírez Ortega');
    expect(screen.queryByRole('columnheader', { name: copy.colProcedure })).not.toBeInTheDocument();
    expect(within(row).getByText('1 intento')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /^Llamar a Jorge/ })).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Acciones de Jorge Eduardo Ramírez Ortega' }));
    expect(await screen.findByRole('menuitem', { name: copy.openRecord })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: copy.register })).not.toBeInTheDocument();
  });

  it('vacío y error con «Reintentar»', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedList.mockResolvedValueOnce(page([]));
    render(<PostOpChecksView token={DENTIST} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(copy.emptyTitle)).toBeInTheDocument();
  });

  it('«Bien» cierra: la fila sale, avisa que quedó en la historia y relee «Mi día»', async () => {
    mockedList.mockResolvedValueOnce(page([item()])).mockResolvedValue(page([]));
    mockedRegister.mockResolvedValue(check());
    const changed = jest.fn();
    window.addEventListener(WORK_QUEUES_CHANGED_EVENT, changed);
    render(<PostOpChecksView token={DENTIST} />);
    await register('Bien', 'Sin dolor');
    expect(mockedRegister).toHaveBeenCalledWith(DENTIST, 'k1', { outcome: 'FINE', note: 'Sin dolor' });
    expect(await screen.findByText(copy.savedRecord('Jorge Eduardo Ramírez Ortega'))).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Jorge Eduardo Ramírez Ortega')).not.toBeInTheDocument());
    expect(changed).toHaveBeenCalled();
    window.removeEventListener(WORK_QUEUES_CHANGED_EVENT, changed);
  });

  it('«No contesta» suma un intento y la fila sigue; el tercero avisa «No localizado»', async () => {
    mockedList.mockResolvedValueOnce(page([item()])).mockResolvedValueOnce(page([item({ attemptsCount: 1 })]));
    mockedRegister.mockResolvedValueOnce(check({ status: 'PENDING', outcome: null, closedAt: null, closedById: null, clinicalEntryId: null, addendumId: null }));
    render(<PostOpChecksView token={DENTIST} />);
    await register('No contesta');
    expect(mockedRegister).toHaveBeenCalledWith(DENTIST, 'k1', { outcome: 'NO_ANSWER' });
    expect(await screen.findByText(copy.savedAttempt('Jorge Eduardo Ramírez Ortega', 1))).toBeInTheDocument();
    const row = await rowOf('Jorge Eduardo Ramírez Ortega');
    expect(within(row).getByText('1 intento')).toBeInTheDocument();

    mockedList.mockResolvedValue(page([]));
    mockedRegister.mockResolvedValueOnce(check({ status: 'UNREACHABLE', outcome: null, attemptsCount: 3 }));
    await register('No contesta');
    expect(await screen.findByText(copy.unreachable('Jorge Eduardo Ramírez Ortega'))).toBeInTheDocument();
  });

  it('con dos intentos, el diálogo avisa que el tercero lo cierra', async () => {
    mockedList.mockResolvedValue(page([item({ attemptsCount: 2 })]));
    render(<PostOpChecksView token={DENTIST} />);
    const row = await rowOf('Jorge Eduardo Ramírez Ortega');
    await userEvent.click(within(row).getByRole('button', { name: 'Acciones de Jorge Eduardo Ramírez Ortega' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: copy.register }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar resultado' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /^No contesta/ }));
    expect(within(dialog).getByText(/el control se cerrará como «No localizado»/)).toBeInTheDocument();
  });

  it('sin resultado no guarda y avisa junto al grupo', async () => {
    mockedList.mockResolvedValue(page([item()]));
    render(<PostOpChecksView token={DENTIST} />);
    const row = await rowOf('Jorge Eduardo Ramírez Ortega');
    await userEvent.click(within(row).getByRole('button', { name: 'Acciones de Jorge Eduardo Ramírez Ortega' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: copy.register }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar resultado' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar resultado' }));
    expect(await within(dialog).findByText('Elige el resultado de la llamada.')).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('«Necesita cita» cierra y abre la agenda con el paciente, el profesional y la sede del control', async () => {
    mockedList.mockResolvedValueOnce(page([item()])).mockResolvedValue(page([]));
    mockedRegister.mockResolvedValue(check({ outcome: 'NEEDS_APPOINTMENT' }));
    render(<PostOpChecksView token={DENTIST} />);
    await register('Necesita cita');
    const schedule = await screen.findByRole('dialog', { name: 'Agendar revisión' });
    expect(schedule).toHaveAttribute('data-patient', 'p1');
    expect(schedule).toHaveAttribute('data-professional', 'u-dentist');
    expect(schedule).toHaveAttribute('data-location', 'l1');
    await userEvent.click(within(schedule).getByRole('button', { name: 'Crear cita' }));
    expect(await screen.findByText(copy.scheduled('Jorge Eduardo Ramírez Ortega'))).toBeInTheDocument();
  });

  it('409 (otra persona ya lo cerró): avisa y relee la lista', async () => {
    mockedList.mockResolvedValueOnce(page([item()])).mockResolvedValue(page([]));
    mockedRegister.mockRejectedValue(new ApiError(409, 'Este control postoperatorio ya está cerrado: no admite más intentos'));
    render(<PostOpChecksView token={DENTIST} />);
    await register('Bien');
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('Este control postoperatorio ya está cerrado: no admite más intentos'),
    );
    expect(await screen.findByText(copy.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Registrar resultado' })).not.toBeInTheDocument();
  });

  it('409 de sede sin formato regional: el diálogo sigue abierto con el aviso y, para ADMIN, «Configurar sede»', async () => {
    const ADMIN = tokenForRole('ADMIN');
    useAuthStore.setState({ accessToken: ADMIN });
    try {
      mockedList.mockResolvedValue(page([item()]));
      mockedRegister.mockRejectedValue(
        new ApiError(409, 'La sede no tiene formato regional', { code: 'LOCATION_LOCALE_REQUIRED', locationId: 'l9' }),
      );
      render(<PostOpChecksView token={ADMIN} />);
      const row = await rowOf('Jorge Eduardo Ramírez Ortega');
      await userEvent.click(within(row).getByRole('button', { name: 'Acciones de Jorge Eduardo Ramírez Ortega' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: copy.register }));
      const dialog = await screen.findByRole('dialog', { name: 'Registrar resultado' });
      await userEvent.click(within(dialog).getByRole('radio', { name: /^Bien/ }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar resultado' }));
      expect(await within(dialog).findByText(/no tiene formato regional configurado/)).toBeInTheDocument();
      expect(within(dialog).getByRole('link', { name: 'Configurar sede' })).toHaveAttribute(
        'href',
        '/settings/sedes?sede=l9',
      );
      expect(notifyError).not.toHaveBeenCalled();
      // «Reintentar» vuelve a mandar el mismo resultado.
      mockedRegister.mockResolvedValueOnce(check());
      await userEvent.click(within(dialog).getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(mockedRegister).toHaveBeenCalledTimes(2));
      expect(mockedRegister).toHaveBeenLastCalledWith(ADMIN, 'k1', { outcome: 'FINE' });
    } finally {
      useAuthStore.setState({ accessToken: null });
    }
  });
});
