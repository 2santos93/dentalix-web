import { render, screen, waitFor, within } from '@testing-library/react';
import { PatientExternalOrdersTab } from './patient-external-orders-tab';
import {
  listExternalOrderTemplates,
  listPatientExternalOrders,
  listRecipientSuggestions,
  unlinkExternalOrderResult,
  voidExternalOrder,
} from '@/lib/external-orders/external-orders-api';
import { openExternalOrderPdf } from '@/lib/external-orders/open-external-order-pdf';
import { ApiError } from '@/lib/api/client';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { tokenFor } from '@/lib/test/prescriptions';
import { makeExternalOrder } from '@/lib/test/external-orders';
import { notifyError } from '@/components/errors/notify';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede({ id: 'loc1' })]),
}));
jest.mock('../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../lib/external-orders/external-orders-api'),
  listPatientExternalOrders: jest.fn(),
  voidExternalOrder: jest.fn(),
  unlinkExternalOrderResult: jest.fn(),
  listExternalOrderTemplates: jest.fn(),
  listRecipientSuggestions: jest.fn(),
}));
jest.mock('../../lib/external-orders/open-external-order-pdf', () => ({ openExternalOrderPdf: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = jest.mocked(listPatientExternalOrders);
const mockedVoid = jest.mocked(voidExternalOrder);
const mockedUnlink = jest.mocked(unlinkExternalOrderResult);
const mockedOpen = jest.mocked(openExternalOrderPdf);

const DENTIST = tokenFor('DENTIST', 'u-dentist');
const RECEPTION = tokenFor('RECEPTION', 'u-rec');
const TABLE = 'Órdenes del paciente';

describe('PatientExternalOrdersTab (DX-572)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedVoid.mockReset();
    mockedUnlink.mockReset();
    mockedOpen.mockReset();
    jest.mocked(listExternalOrderTemplates).mockResolvedValue([]);
    jest.mocked(listRecipientSuggestions).mockResolvedValue([]);
    clearSessionStore();
  });

  it('cargando: esqueleto anunciado', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<PatientExternalOrdersTab token={DENTIST} patientId="p1" />);
    expect(screen.getByRole('status', { name: 'Cargando órdenes' })).toBeInTheDocument();
  });

  it('vacío: el odontólogo ve «Nueva orden» y el enlace a «Órdenes sin resultado»', async () => {
    mockedList.mockResolvedValue([]);
    render(<PatientExternalOrdersTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText('Este paciente no tiene órdenes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva orden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Órdenes sin resultado' })).toHaveAttribute('href', '/ordenes-sin-resultado');
  });

  it.each(['RECEPTION', 'ASSISTANT'])('%s no ve «Nueva orden»', async (role) => {
    mockedList.mockResolvedValue([]);
    render(<PatientExternalOrdersTab token={tokenFor(role, 'u-x')} patientId="p1" />);
    await screen.findByText('Este paciente no tiene órdenes.');
    expect(screen.queryByRole('button', { name: 'Nueva orden' })).not.toBeInTheDocument();
  });

  it('error de carga con reintento (escalón 1)', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó')).mockResolvedValueOnce([makeExternalOrder()]);
    render(<PatientExternalOrdersTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las órdenes.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: TABLE })).toBeInTheDocument();
  });

  it('lista tipo, nº, fecha de la sede, destinatario, estudios, nota, estado y anulada con su motivo', async () => {
    mockedList.mockResolvedValue([
      makeExternalOrder({
        id: 'eo2',
        numberLabel: '000008',
        kind: 'SPECIALIST',
        recipient: 'Dra. Mariela Ortiz, endodoncia',
        items: ['Valoración endodóntica'],
        toothNumbers: ['36', '37'],
        clinicalNote: 'Dolor a la percusión',
        hasClinicalNote: true,
      }),
      makeExternalOrder({
        status: 'VOIDED',
        voidedAt: '2026-11-11T10:00:00.000Z',
        voidedByName: 'Ana Titular',
        voidReason: 'Estudio equivocado',
      }),
    ]);
    render(<PatientExternalOrdersTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: TABLE });
    const [, specialist, voided] = within(table).getAllByRole('row');
    expect(specialist).toHaveTextContent('Especialista');
    expect(specialist).toHaveTextContent('nº 000008');
    await waitFor(() => expect(specialist).toHaveTextContent('10/11/2026'));
    expect(specialist).toHaveTextContent('Dra. Mariela Ortiz, endodoncia');
    expect(specialist).toHaveTextContent('Valoración endodóntica');
    expect(specialist).toHaveTextContent('Dientes 36, 37');
    expect(specialist).toHaveTextContent('Nota clínica: Dolor a la percusión');
    expect(specialist).toHaveTextContent('Emitida');
    expect(voided).toHaveTextContent('Anulada');
    expect(voided).toHaveTextContent(/por Ana Titular\. Motivo: Estudio equivocado/);
    expect(screen.queryByRole('button', { name: /editar|borrar|eliminar/i })).not.toBeInTheDocument();
  });

  it('recepción no ve la nota: solo «Lleva nota clínica», e imprime sin la nota', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeExternalOrder({ clinicalNote: null, hasClinicalNote: true })]);
    mockedOpen.mockResolvedValue(undefined);
    render(<PatientExternalOrdersTab token={RECEPTION} patientId="p1" />);
    const table = await screen.findByRole('table', { name: TABLE });
    expect(table).toHaveTextContent('Lleva nota clínica');
    expect(table).not.toHaveTextContent('Nota clínica:');
    await user.click(within(table).getByRole('button', { name: /^Ver e imprimir/ }));
    await waitFor(() => expect(mockedOpen).toHaveBeenCalledWith(RECEPTION, 'eo1', false, 'orden-000007.pdf'));
  });

  it('un rol clínico elige con o sin la nota cuando la orden la lleva', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeExternalOrder({ clinicalNote: 'Sospecha de quiste', hasClinicalNote: true })]);
    mockedOpen.mockResolvedValue(undefined);
    render(<PatientExternalOrdersTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: TABLE });
    await user.click(within(table).getByRole('button', { name: /^Ver e imprimir/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Con la nota clínica' }));
    await waitFor(() => expect(mockedOpen).toHaveBeenCalledWith(DENTIST, 'eo1', true, 'orden-000007.pdf'));
  });

  it('si el PDF falla, un aviso con reintento (escalón 3)', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeExternalOrder()]);
    mockedOpen.mockRejectedValueOnce(new ApiError(500, 'x'));
    render(<PatientExternalOrdersTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: TABLE });
    await user.click(within(table).getByRole('button', { name: /^Ver e imprimir/ }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('No pudimos abrir el PDF de la orden.', expect.objectContaining({ onRetry: expect.any(Function) })),
    );
  });

  it('otro odontólogo no anula una orden ajena; quien la emitió sí, con motivo de 5 caracteres', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeExternalOrder()]);
    const { unmount } = render(<PatientExternalOrdersTab token={tokenFor('DENTIST', 'u-otro')} patientId="p1" />);
    await screen.findByRole('table', { name: TABLE });
    await user.click(screen.getByRole('button', { name: 'Acciones de Imagen · orden nº 000007' }));
    expect(await screen.findByRole('menuitem', { name: 'Ligar resultado' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Anular' })).not.toBeInTheDocument();
    unmount();
    clearSessionStore();

    mockedVoid.mockResolvedValue(
      makeExternalOrder({ status: 'VOIDED', voidedAt: '2026-11-11T10:00:00.000Z', voidedByName: 'Dra. Laura Ruiz', voidReason: 'Repetida' }),
    );
    render(<PatientExternalOrdersTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: TABLE });
    await user.click(screen.getByRole('button', { name: 'Acciones de Imagen · orden nº 000007' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Anular' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular orden' });
    const reason = within(dialog).getByLabelText('Motivo de la anulación');
    await user.type(reason, 'otra');
    await user.click(within(dialog).getByRole('button', { name: 'Anular orden' }));
    expect(await within(dialog).findByText('Escribe el motivo (al menos 5 caracteres).')).toBeInTheDocument();
    expect(mockedVoid).not.toHaveBeenCalled();
    await user.clear(reason);
    await user.type(reason, 'Repetida');
    await user.click(within(dialog).getByRole('button', { name: 'Anular orden' }));
    await waitFor(() => expect(mockedVoid).toHaveBeenCalledWith(DENTIST, 'eo1', 'Repetida'));
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Motivo: Repetida'));
  });

  it('con resultado: «Ver resultado» y «Desligar resultado» (que vuelve a «Emitida»)', async () => {
    const user = setupUser();
    const linked = makeExternalOrder({
      status: 'RESULT_RECEIVED',
      resultDocumentId: 'doc-rx',
      resultLinkedAt: '2026-11-12T10:00:00.000Z',
      resultLinkedById: 'u-rec',
      resultLinkedByName: 'Rita Recepción',
    });
    mockedList.mockResolvedValue([linked]);
    mockedUnlink.mockResolvedValue(makeExternalOrder());
    render(<PatientExternalOrdersTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: TABLE });
    expect(table).toHaveTextContent('Resultado recibido');
    await waitFor(() => expect(table).toHaveTextContent('Ligado el 12/11/2026 por Rita Recepción'));
    expect(within(table).getByRole('button', { name: /^Ver resultado/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acciones de Imagen · orden nº 000007' }));
    expect(screen.queryByRole('menuitem', { name: 'Anular' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Desligar resultado' }));
    await waitFor(() => expect(mockedUnlink).toHaveBeenCalledWith(DENTIST, 'eo1'));
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Emitida'));
  });

  it('«Nueva orden» abre el modal (en su propio trozo)', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    render(<PatientExternalOrdersTab token={DENTIST} patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Nueva orden' }));
    expect(await screen.findByRole('dialog', { name: 'Nueva orden' })).toBeInTheDocument();
  });

  it('una anulada no tiene acciones (ni enviar, ni ligar, ni anular)', async () => {
    mockedList.mockResolvedValue([makeExternalOrder({ status: 'VOIDED', voidedAt: '2026-11-11T10:00:00.000Z' })]);
    render(<PatientExternalOrdersTab token={tokenFor('ADMIN', 'u-admin')} patientId="p1" />);
    await screen.findByRole('table', { name: TABLE });
    expect(screen.queryByRole('button', { name: /^Acciones de/ })).not.toBeInTheDocument();
  });
});
