import { act, render, screen, waitFor, within } from '@testing-library/react';
import { IssueExternalOrderModal } from './issue-external-order-modal';
import {
  issueExternalOrder,
  listExternalOrderTemplates,
  listRecipientSuggestions,
} from '@/lib/external-orders/external-orders-api';
import { openExternalOrderPdf } from '@/lib/external-orders/open-external-order-pdf';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeExternalOrder, makeExternalOrderTemplate } from '@/lib/test/external-orders';

jest.mock('../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../lib/external-orders/external-orders-api'),
  issueExternalOrder: jest.fn(),
  listExternalOrderTemplates: jest.fn(),
  listRecipientSuggestions: jest.fn(),
}));
jest.mock('../../lib/external-orders/open-external-order-pdf', () => ({ openExternalOrderPdf: jest.fn() }));

const mockedIssue = jest.mocked(issueExternalOrder);
const mockedTemplates = jest.mocked(listExternalOrderTemplates);
const mockedSuggestions = jest.mocked(listRecipientSuggestions);

function renderModal(props: Partial<React.ComponentProps<typeof IssueExternalOrderModal>> = {}) {
  const onIssued = jest.fn();
  render(
    <IssueExternalOrderModal open onOpenChange={jest.fn()} token="tok" patientId="p1" onIssued={onIssued} {...props} />,
  );
  return { dialog: screen.getByRole('dialog', { name: 'Nueva orden' }), onIssued };
}

describe('IssueExternalOrderModal (DX-572)', () => {
  beforeEach(() => {
    mockedIssue.mockReset();
    mockedTemplates.mockReset().mockResolvedValue([
      makeExternalOrderTemplate(),
      makeExternalOrderTemplate({
        id: 'tpl2',
        name: 'Tomografía de haz cónico',
        recipient: null,
        items: ['Tomografía de haz cónico del maxilar', 'Informe del radiólogo'],
      }),
    ]);
    mockedSuggestions.mockReset().mockResolvedValue([{ name: 'Laboratorio Clínico Altamira', source: 'RECENT' }]);
    jest.mocked(openExternalOrderPdf).mockReset();
  });

  it('una plantilla precarga tipo, destinatario y estudios, y se emite con ella', async () => {
    const user = setupUser();
    mockedIssue.mockResolvedValue(makeExternalOrder({ numberLabel: '000009' }));
    const { dialog, onIssued } = renderModal();
    const template = within(dialog).getByLabelText('Plantilla (opcional)', { exact: true });
    await waitFor(() => expect(within(template).getByRole('option', { name: 'Radiografía panorámica' })).toBeInTheDocument());
    await user.selectOptions(template, 'tpl1');
    expect(within(dialog).getByLabelText('Tipo', { exact: true })).toHaveValue('IMAGING');
    expect(within(dialog).getByLabelText('Destinatario', { exact: true })).toHaveValue('Centro de Imagen Norte');
    expect(within(dialog).getByLabelText('Estudio 1', { exact: true })).toHaveValue('Radiografía panorámica');
    await user.click(within(dialog).getByRole('button', { name: 'Emitir orden' }));
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith('tok', 'p1', {
        kind: 'IMAGING',
        recipient: 'Centro de Imagen Norte',
        items: ['Radiografía panorámica'],
        templateId: 'tpl1',
      }),
    );
    expect(await within(dialog).findByText('Orden nº 000009 emitida')).toBeInTheDocument();
    expect(onIssued).toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Ver e imprimir' })).toBeInTheDocument();
  });

  it('pide el destinatario y al menos un estudio', async () => {
    const user = setupUser();
    const { dialog } = renderModal();
    await user.click(within(dialog).getByRole('button', { name: 'Emitir orden' }));
    expect(await within(dialog).findByText('Escribe el destinatario.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Destinatario', { exact: true }), 'Centro Médico');
    await user.click(within(dialog).getByRole('button', { name: 'Emitir orden' }));
    expect(await within(dialog).findByText('Escribe al menos un estudio o el motivo de la referencia.')).toBeInTheDocument();
    expect(mockedIssue).not.toHaveBeenCalled();
  });

  it('añade y quita estudios; con cita, dientes y nota los manda todos', async () => {
    const user = setupUser();
    mockedIssue.mockResolvedValue(makeExternalOrder());
    const { dialog } = renderModal({ appointmentId: 'appt1' });
    expect(dialog).toHaveTextContent('Se emite desde esta cita y queda en su sede.');
    await user.selectOptions(within(dialog).getByLabelText('Tipo', { exact: true }), 'LAB');
    await user.type(within(dialog).getByLabelText('Destinatario', { exact: true }), 'Lab');
    await user.type(within(dialog).getByLabelText('Estudio 1', { exact: true }), 'Hematología completa');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir estudio' }));
    await user.type(within(dialog).getByLabelText('Estudio 2', { exact: true }), 'Glicemia');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir estudio' }));
    await user.click(within(dialog).getByRole('button', { name: 'Quitar el estudio 3' }));
    expect(within(dialog).queryByLabelText('Estudio 3', { exact: true })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Dientes (opcional)', { exact: true }), '36{enter}');
    await user.type(within(dialog).getByLabelText('Nota clínica (opcional)', { exact: true }), 'Paciente anticoagulado');
    await user.click(within(dialog).getByRole('button', { name: 'Emitir orden' }));
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith('tok', 'p1', {
        kind: 'LAB',
        recipient: 'Lab',
        items: ['Hematología completa', 'Glicemia'],
        toothNumbers: ['36'],
        clinicalNote: 'Paciente anticoagulado',
        appointmentId: 'appt1',
      }),
    );
  });

  it('las sugerencias de destinatario rellenan el campo', async () => {
    const user = setupUser();
    const { dialog } = renderModal();
    await user.click(
      await within(dialog).findByRole('button', { name: 'Usar «Laboratorio Clínico Altamira» como destinatario' }),
    );
    expect(within(dialog).getByLabelText('Destinatario', { exact: true })).toHaveValue('Laboratorio Clínico Altamira');
  });

  it('un 400 de la API (sin registro profesional) sale en el formulario', async () => {
    const user = setupUser();
    mockedIssue.mockRejectedValue(new ApiError(400, 'No se puede emitir la orden: falta tu registro profesional.'));
    const { dialog } = renderModal();
    await user.type(within(dialog).getByLabelText('Destinatario', { exact: true }), 'Centro');
    await user.type(within(dialog).getByLabelText('Estudio 1', { exact: true }), 'Periapical');
    await user.click(within(dialog).getByRole('button', { name: 'Emitir orden' }));
    expect(await within(dialog).findByText('No se puede emitir la orden: falta tu registro profesional.')).toBeInTheDocument();
  });

  it('si las plantillas no cargan, el campo se sustituye por un reintento (escalón 2)', async () => {
    const user = setupUser();
    mockedTemplates.mockRejectedValueOnce(new ApiError(500, 'x'));
    const { dialog } = renderModal();
    expect(await within(dialog).findByText('Plantillas sin cargar')).toBeInTheDocument();
    await act(async () => {
      await user.click(within(dialog).getByRole('button', { name: /Reintentar/ }));
    });
    expect(await within(dialog).findByRole('option', { name: 'Radiografía panorámica' })).toBeInTheDocument();
  });
});
