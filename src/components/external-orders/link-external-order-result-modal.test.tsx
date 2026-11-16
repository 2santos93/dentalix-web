import { render, screen, waitFor, within } from '@testing-library/react';
import { LinkExternalOrderResultModal } from './link-external-order-result-modal';
import { linkExternalOrderResult } from '@/lib/external-orders/external-orders-api';
import {
  listPatientDocuments,
  uploadPatientDocument,
  type PatientDocument,
} from '@/lib/patient-documents/patient-documents-api';
import { ApiError } from '@/lib/api/client';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { makeExternalOrder } from '@/lib/test/external-orders';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede({ id: 'loc1' })]),
}));
jest.mock('../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../lib/external-orders/external-orders-api'),
  linkExternalOrderResult: jest.fn(),
}));
jest.mock('../../lib/patient-documents/patient-documents-api', () => ({
  ...jest.requireActual('../../lib/patient-documents/patient-documents-api'),
  listPatientDocuments: jest.fn(),
  uploadPatientDocument: jest.fn(),
}));

const mockedLink = jest.mocked(linkExternalOrderResult);
const mockedList = jest.mocked(listPatientDocuments);
const mockedUpload = jest.mocked(uploadPatientDocument);

function doc(overrides: Partial<PatientDocument> = {}): PatientDocument {
  return {
    id: 'doc1',
    patientId: 'p1',
    locationId: 'loc1',
    category: 'XRAY',
    originalName: 'panoramica.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    sha256: 'a'.repeat(64),
    clinicalDate: null,
    toothNumbers: [],
    notes: null,
    uploadedById: 'u-rec',
    uploadedByName: 'Rita Recepción',
    uploadedAt: '2026-11-12T10:00:00.000Z',
    inlineViewable: true,
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    ...overrides,
  };
}

function renderModal() {
  const onLinked = jest.fn();
  render(
    <LinkExternalOrderResultModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      patientId="p1"
      order={makeExternalOrder()}
      onLinked={onLinked}
    />,
  );
  return { dialog: screen.getByRole('dialog', { name: 'Ligar resultado' }), onLinked };
}

describe('LinkExternalOrderResultModal (DX-572)', () => {
  beforeEach(() => {
    mockedLink.mockReset();
    mockedList.mockReset();
    mockedUpload.mockReset();
    clearSessionStore();
  });

  it('elige un documento vigente (los anulados no salen) y lo liga', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([doc(), doc({ id: 'doc2', originalName: 'vieja.jpg', voidedAt: '2026-11-11T00:00:00.000Z' })]);
    mockedLink.mockResolvedValue(makeExternalOrder({ status: 'RESULT_RECEIVED', resultDocumentId: 'doc1' }));
    const { dialog, onLinked } = renderModal();
    const radio = await within(dialog).findByRole('radio', { name: /panoramica\.jpg/ });
    expect(within(dialog).queryByRole('radio', { name: /vieja\.jpg/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ligar resultado' }));
    expect(await within(dialog).findByText('Elige el documento del resultado.')).toBeInTheDocument();
    await user.click(radio);
    await user.click(within(dialog).getByRole('button', { name: 'Ligar resultado' }));
    await waitFor(() => expect(mockedLink).toHaveBeenCalledWith('tok', 'eo1', 'doc1'));
    expect(onLinked).toHaveBeenCalled();
  });

  it('sube un archivo nuevo como Informe y lo liga después', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedUpload.mockResolvedValue(doc({ id: 'doc-new', category: 'REPORT' }));
    mockedLink.mockResolvedValue(makeExternalOrder({ status: 'RESULT_RECEIVED', resultDocumentId: 'doc-new' }));
    const { dialog } = renderModal();
    expect(await within(dialog).findByText('El paciente no tiene documentos vigentes.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Subir uno nuevo' }));
    const file = new File(['%PDF-1.4'], 'informe.pdf', { type: 'application/pdf' });
    await user.upload(within(dialog).getByLabelText('Archivo', { exact: true }), file);
    await user.click(within(dialog).getByRole('radio', { name: 'Informe' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ligar resultado' }));
    await waitFor(() =>
      expect(mockedUpload).toHaveBeenCalledWith('tok', 'p1', { file, category: 'REPORT' }),
    );
    await waitFor(() => expect(mockedLink).toHaveBeenCalledWith('tok', 'eo1', 'doc-new'));
  });

  it('si el archivo sube pero el ligado falla, lo dice y lo deja elegido', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedUpload.mockResolvedValue(doc({ id: 'doc-new', originalName: 'rx.jpg' }));
    mockedLink.mockRejectedValue(new ApiError(409, 'La orden ya tiene resultado.'));
    const { dialog } = renderModal();
    await within(dialog).findByText('El paciente no tiene documentos vigentes.');
    await user.click(within(dialog).getByRole('radio', { name: 'Subir uno nuevo' }));
    await user.upload(
      within(dialog).getByLabelText('Archivo', { exact: true }),
      new File(['x'], 'rx.jpg', { type: 'image/jpeg' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Ligar resultado' }));
    expect(await within(dialog).findByText(/El archivo quedó en «Documentos»/)).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /rx\.jpg/ })).toBeChecked();
  });

  it('sin archivo no sube nada', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    const { dialog } = renderModal();
    await within(dialog).findByText('El paciente no tiene documentos vigentes.');
    await user.click(within(dialog).getByRole('radio', { name: 'Subir uno nuevo' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ligar resultado' }));
    expect(await within(dialog).findByText('Elige el archivo del resultado.')).toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});
