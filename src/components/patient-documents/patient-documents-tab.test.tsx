import { useState } from 'react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { PatientDocumentsTab } from './patient-documents-tab';
import { PatientTabPanel } from '@/components/patients/patient-tab-panel';
import type { PatientDetailTabKey } from '@/components/patients/patient-detail-tabs';
import {
  getPatientDocumentUrl,
  listPatientDocuments,
  uploadPatientDocument,
  voidPatientDocument,
} from '@/lib/patient-documents/patient-documents-api';
import { convertHeicToJpeg, HeicConversionError } from '@/lib/patient-documents/heic';
import { startDownload } from '@/lib/patient-documents/download';
import { notifyError } from '@/components/errors/notify';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeDocument, tokenFor } from '@/lib/test/patient-documents';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/patient-documents/patient-documents-api', () => ({
  ...jest.requireActual('../../lib/patient-documents/patient-documents-api'),
  listPatientDocuments: jest.fn(),
  uploadPatientDocument: jest.fn(),
  getPatientDocumentUrl: jest.fn(),
  voidPatientDocument: jest.fn(),
}));
jest.mock('../../lib/patient-documents/heic', () => ({
  ...jest.requireActual('../../lib/patient-documents/heic'),
  convertHeicToJpeg: jest.fn(),
}));
jest.mock('../../lib/patient-documents/download', () => ({ startDownload: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedList = listPatientDocuments as jest.MockedFunction<typeof listPatientDocuments>;
const mockedUpload = uploadPatientDocument as jest.MockedFunction<typeof uploadPatientDocument>;
const mockedUrl = getPatientDocumentUrl as jest.MockedFunction<typeof getPatientDocumentUrl>;
const mockedVoid = voidPatientDocument as jest.MockedFunction<typeof voidPatientDocument>;
const mockedHeic = convertHeicToJpeg as jest.MockedFunction<typeof convertHeicToJpeg>;
const mockedDownload = startDownload as jest.MockedFunction<typeof startDownload>;
const mockedNotify = notifyError as jest.MockedFunction<typeof notifyError>;

const DENTIST = tokenFor('DENTIST', 'u-dentist');
const RECEPTION = tokenFor('RECEPTION', 'u-rec');
const ADMIN = tokenFor('ADMIN', 'u-admin');
const MB = 1024 * 1024;

function pdf(name = 'remision.pdf', size?: number) {
  const file = new File(['%PDF-1.7'], name, { type: 'application/pdf' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** Ignora el sufijo `sr-only` de los botones («Ver panoramica.pdf»). */
const VISIBLE = { ignore: 'script, style, .sr-only' };

function fileInput() {
  return screen.getByLabelText('Archivos para subir') as HTMLInputElement;
}

function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByTestId('documents-drop-zone'), { dataTransfer: { files, types: ['Files'] } });
}

describe('PatientDocumentsTab (DX-151)', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([]);
    mockedLocations.mockReset().mockResolvedValue([clinicLocation({ locale: 'de-DE', hourCycle: 'h23' })]);
    mockedUpload.mockReset();
    mockedUrl.mockReset();
    mockedVoid.mockReset();
    mockedHeic.mockReset();
    mockedDownload.mockReset();
    mockedNotify.mockReset();
  });

  it('formatFileSize en-US is 1.5 MB: el tamaño con el formato de la sede de la pantalla', async () => {
    mockedLocations.mockResolvedValue([clinicLocation({ locale: 'en-US', hourCycle: 'h12' })]);
    mockedList.mockResolvedValue([makeDocument()]);
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText('1.5 MB')).toBeInTheDocument();
  });

  it('«Configurar sede» abre la sede sin formato o sin reloj, no la lista', async () => {
    useAuthStore.setState({ accessToken: tokenFor('ADMIN') });
    try {
      mockedLocations.mockResolvedValue([clinicLocation({ id: 'sede-sin-reloj', locale: 'en-US', hourCycle: null })]);
      mockedList.mockResolvedValue([makeDocument()]);
      render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
      expect(await screen.findByRole('link', { name: 'Configurar sede' })).toHaveAttribute(
        'href',
        '/settings/sedes?sede=sede-sin-reloj',
      );
    } finally {
      useAuthStore.setState({ accessToken: null });
    }
  });

  it('sin formato de la sede: tamaño «—» y el aviso con Reintentar', async () => {
    mockedLocations.mockResolvedValue([clinicLocation({ locale: null, hourCycle: null })]);
    mockedList.mockResolvedValue([makeDocument()]);
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText(/No se pudo saber el formato regional o el reloj de la sede/)).toBeInTheDocument();
    expect(screen.queryByText(/MB$/)).not.toBeInTheDocument();
  });

  it('carga con esqueleto anunciado', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    expect(screen.getByRole('status', { name: /cargando documentos/i })).toBeInTheDocument();
  });

  it('vacío: «Sin documentos» y zona de subida accesible con la lista blanca', async () => {
    render(<PatientDocumentsTab token={RECEPTION} patientId="p1" />);
    expect(await screen.findByText('Sin documentos')).toBeInTheDocument();
    const choose = screen.getByRole('button', { name: 'Elegir archivos' });
    expect(choose).toHaveAccessibleDescription(
      'PDF, JPG, PNG, HEIC (se convierte a JPG), Word (.docx) y DICOM, hasta 20 MB por archivo.',
    );
    expect(fileInput()).toHaveAttribute('type', 'file');
    expect(fileInput().accept).toContain('.pdf');
    expect(mockedList).toHaveBeenCalledWith(RECEPTION, 'p1', { category: null, tooth: null });
  });

  it('error de carga con «Reintentar»', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedList.mockResolvedValueOnce([makeDocument()]);
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los documentos.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('panoramica.pdf', VISIBLE)).toBeInTheDocument();
  });

  it('lista con categoría, fecha clínica, dientes y autor; el anulado tachado con motivo', async () => {
    mockedList.mockResolvedValue([
      makeDocument(),
      makeDocument({
        id: 'doc-2',
        category: 'PHOTO',
        originalName: 'sonrisa.jpg',
        mimeType: 'image/jpeg',
        toothNumbers: [],
        clinicalDate: null,
        voidedAt: '2026-10-11T10:00:00.000Z',
        voidedByName: 'Dra. Laura Ruiz',
        voidReason: 'Paciente equivocado',
      }),
    ]);
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Documentos' });
    const [, active, voided] = within(table).getAllByRole('row');
    expect(active).toHaveTextContent('Radiografía');
    expect(active).toHaveTextContent('panoramica.pdf');
    expect(active).toHaveTextContent('10/10/2026');
    expect(active).toHaveTextContent('11, 21');
    expect(active).toHaveTextContent('Dra. Laura Ruiz');
    expect(voided).toHaveAttribute('data-status', 'VOIDED');
    expect(within(voided).getByText('sonrisa.jpg', VISIBLE)).toHaveClass('line-through');
    expect(voided).toHaveTextContent('Anulado');
    expect(voided).toHaveTextContent('Motivo: Paciente equivocado');
    expect(voided).toHaveTextContent('Sin fecha');
    expect(within(voided).queryByRole('button', { name: /^anular/i })).not.toBeInTheDocument();
  });

  it('acciones por rol: el autor y ADMIN anulan; otro odontólogo no; DOCX sin «Ver»', async () => {
    const docs = [
      makeDocument({ uploadedById: 'u-rec' }),
      makeDocument({
        id: 'doc-3',
        originalName: 'informe.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        inlineViewable: false,
        uploadedById: 'u-rec',
      }),
    ];
    mockedList.mockResolvedValue(docs);
    const { unmount } = render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('panoramica.pdf', VISIBLE);
    expect(screen.queryByRole('button', { name: /^anular/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver panoramica.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver informe.docx' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar informe.docx' })).toBeInTheDocument();
    unmount();

    render(<PatientDocumentsTab token={RECEPTION} patientId="p1" />);
    await screen.findByText('panoramica.pdf', VISIBLE);
    expect(screen.getAllByRole('button', { name: /^anular/i })).toHaveLength(2);
  });

  it('si la API no trae el nombre del autor, la fila dice «un usuario»', async () => {
    mockedList.mockResolvedValue([makeDocument({ uploadedByName: null })]);
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText(/^un usuario · /, VISIBLE)).toBeInTheDocument();
  });

  it('«Anular» abre el modal con motivo y tacha el documento', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeDocument()]);
    mockedVoid.mockResolvedValue(
      makeDocument({ voidedAt: '2026-10-12T10:00:00.000Z', voidedByName: 'Admin', voidReason: 'Duplicado' }),
    );
    render(<PatientDocumentsTab token={ADMIN} patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Anular panoramica.pdf' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular documento' });
    await user.type(within(dialog).getByLabelText('Motivo de la anulación'), 'Duplicado');
    await user.click(within(dialog).getByRole('button', { name: 'Anular documento' }));
    expect(mockedVoid).toHaveBeenCalledWith(ADMIN, 'p1', 'doc-1', 'Duplicado');
    expect(await screen.findByText('Anulado')).toBeInTheDocument();
    expect(screen.getByText(/Motivo: Duplicado/)).toBeInTheDocument();
  });

  it('«Descargar» pide la URL de descarga y la abre; si falla, aviso con reintento', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeDocument()]);
    mockedUrl.mockResolvedValueOnce({ url: 'http://files/x?sig', expiresAt: '', disposition: 'attachment' });
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Descargar panoramica.pdf' }));
    expect(mockedUrl).toHaveBeenCalledWith(DENTIST, 'p1', 'doc-1', 'attachment');
    expect(mockedDownload).toHaveBeenCalledWith('http://files/x?sig');

    mockedUrl.mockRejectedValueOnce(new ApiError(500, 'boom'));
    await user.click(screen.getByRole('button', { name: 'Descargar panoramica.pdf' }));
    expect(mockedNotify).toHaveBeenCalledWith(
      'No pudimos descargar el documento.',
      expect.objectContaining({ onRetry: expect.any(Function) }),
    );
  });

  it('«Ver» abre el visor', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeDocument()]);
    mockedUrl.mockResolvedValue({ url: 'http://files/x?sig', expiresAt: '', disposition: 'inline' });
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Ver panoramica.pdf' }));
    expect(await screen.findByRole('dialog', { name: 'panoramica.pdf' })).toBeInTheDocument();
    expect(mockedUrl).toHaveBeenCalledWith(DENTIST, 'p1', 'doc-1', 'inline');
  });

  it('filtros: el diente de ?tooth= viene puesto; la categoría recarga la lista', async () => {
    const user = setupUser();
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" initialTooth="11" />);
    expect(await screen.findByText('Ningún documento con estos filtros')).toBeInTheDocument();
    expect(mockedList).toHaveBeenLastCalledWith(DENTIST, 'p1', { category: null, tooth: '11' });
    expect(screen.getByLabelText('Diente')).toHaveValue('11');
    await user.selectOptions(screen.getByLabelText('Categoría'), 'XRAY');
    expect(mockedList).toHaveBeenLastCalledWith(DENTIST, 'p1', { category: 'XRAY', tooth: '11' });
    await user.selectOptions(screen.getByLabelText('Diente'), '');
    expect(mockedList).toHaveBeenLastCalledWith(DENTIST, 'p1', { category: 'XRAY', tooth: null });
  });

  it('un ?tooth= que no es FDI se ignora', async () => {
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" initialTooth="99" />);
    await screen.findByText('Sin documentos');
    expect(mockedList).toHaveBeenCalledWith(DENTIST, 'p1', { category: null, tooth: null });
  });

  it('pre-chequeo: 21 MB da el error en español sin llamar a la API', async () => {
    const user = setupUser();
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    await user.upload(fileInput(), pdf('cbct.pdf', 21 * MB));
    const row = screen.getByRole('listitem', { name: 'cbct.pdf' });
    expect(within(row).getByRole('alert')).toHaveTextContent('El archivo supera el máximo de 20 MB.');
    expect(within(row).queryByRole('button', { name: /reintentar|subir/i })).not.toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('pre-chequeo: un tipo fuera de la lista blanca (soltado) no se sube', async () => {
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    dropFiles([new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })]);
    const row = await screen.findByRole('listitem', { name: 'logo.svg' });
    expect(within(row).getByRole('alert')).toHaveTextContent(/Tipo de archivo no admitido/);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('cola: sube con categoría, dientes, fecha y notas, con progreso; el documento entra en la lista', async () => {
    const user = setupUser();
    let report: ((p: number) => void) | undefined;
    let finish: ((doc: ReturnType<typeof makeDocument>) => void) | undefined;
    mockedUpload.mockImplementation((_t, _p, _input, opts) => {
      report = opts?.onProgress;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    dropFiles([pdf('remision.pdf')]);
    const row = await screen.findByRole('listitem', { name: 'remision.pdf' });
    await user.selectOptions(within(row).getByLabelText('Categoría'), 'REFERRAL');
    await user.type(within(row).getByLabelText('Dientes (opcional)'), '11{Enter}21,');
    fireEvent.change(within(row).getByLabelText('Fecha clínica (opcional)'), { target: { value: '2026-10-01' } });
    await user.type(within(row).getByLabelText('Notas (opcional)'), 'Ortodoncia');
    await user.click(within(row).getByRole('button', { name: 'Subir remision.pdf' }));

    expect(mockedUpload).toHaveBeenCalledWith(
      DENTIST,
      'p1',
      {
        file: expect.any(File),
        category: 'REFERRAL',
        clinicalDate: '2026-10-01',
        toothNumbers: ['11', '21'],
        notes: 'Ortodoncia',
      },
      {
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
        resumeDocumentId: null,
        onStored: expect.any(Function),
      },
    );
    act(() => report?.(0.4));
    expect(within(row).getByRole('progressbar', { name: 'Progreso de subida de remision.pdf' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    await act(async () => finish?.(makeDocument({ id: 'nuevo', originalName: 'remision.pdf', category: 'REFERRAL' })));
    expect(within(row).getByText('Subido')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Documentos' })).getByText('remision.pdf', VISIBLE)).toBeInTheDocument();
  });

  it('cola: un fichero falla y otro sube; el fallido muestra el error de la API y «Reintentar»', async () => {
    const user = setupUser();
    mockedUpload.mockImplementation(async (_t, _p, input) => {
      if (input.file.name === 'roto.pdf') throw new ApiError(500, 'Fallo');
      return makeDocument({ id: 'ok', originalName: input.file.name });
    });
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    await user.upload(fileInput(), [pdf('roto.pdf'), pdf('ok.pdf')]);
    await user.click(screen.getByRole('button', { name: 'Subir 2 archivos' }));

    const broken = screen.getByRole('listitem', { name: 'roto.pdf' });
    expect(await within(broken).findByText('Error')).toBeInTheDocument();
    expect(mockedNotify).toHaveBeenCalledWith(
      expect.stringMatching(/^No se subió «roto\.pdf»\./),
      expect.objectContaining({ onRetry: expect.any(Function) }),
    );
    expect(within(screen.getByRole('listitem', { name: 'ok.pdf' })).getByText('Subido')).toBeInTheDocument();

    mockedUpload.mockResolvedValueOnce(makeDocument({ id: 'roto2', originalName: 'roto.pdf' }));
    await user.click(within(broken).getByRole('button', { name: 'Reintentar roto.pdf' }));
    expect(await within(broken).findByText('Subido')).toBeInTheDocument();
    expect(mockedUpload).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['duplicado (409)', new ApiError(409, 'Este archivo ya está en la ficha del paciente.')],
    [
      'contenido no admitido (400 DOCUMENT_CONTENT_REJECTED)',
      new ApiError(400, 'Tipo de archivo no admitido. Se aceptan PDF, JPG, PNG, HEIC, DOCX y DICOM.', {
        code: 'DOCUMENT_CONTENT_REJECTED',
      }),
    ],
    ['más de 20 MB (413)', new ApiError(413, 'El archivo supera el máximo de 20 MB.')],
  ])('QA D3: un error definitivo, %s, solo ofrece «Quitar», sin «Reintentar» en la fila ni en el aviso', async (_label, error) => {
    const user = setupUser();
    mockedUpload.mockRejectedValueOnce(error);
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    dropFiles([pdf('x.pdf')]);
    const row = await screen.findByRole('listitem', { name: 'x.pdf' });
    await user.click(within(row).getByRole('button', { name: 'Subir x.pdf' }));
    expect(await within(row).findByText('Error')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Reintentar/ })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Quitar x.pdf' })).toBeInTheDocument();
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    expect(mockedNotify.mock.calls[0][1]).toBeUndefined();
  });

  it('un 400 del formulario (sin código de contenido) sí se puede corregir y reintentar', async () => {
    const user = setupUser();
    mockedUpload.mockRejectedValueOnce(new ApiError(400, 'La fecha clínica no es válida.'));
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    dropFiles([pdf('x.pdf')]);
    const row = await screen.findByRole('listitem', { name: 'x.pdf' });
    await user.click(within(row).getByRole('button', { name: 'Subir x.pdf' }));
    expect(await within(row).findByRole('button', { name: 'Reintentar x.pdf' })).toBeInTheDocument();
  });

  it('revisión M-6: si el fichero ya llegó al almacén, «Reintentar» repite el complete de ese documento', async () => {
    const user = setupUser();
    mockedUpload.mockImplementationOnce(async (_t, _p, _i, opts) => {
      opts?.onStored?.('doc-1');
      throw new ApiError(503, 'El almacén de archivos no responde.');
    });
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    dropFiles([pdf('x.pdf')]);
    const row = await screen.findByRole('listitem', { name: 'x.pdf' });
    await user.click(within(row).getByRole('button', { name: 'Subir x.pdf' }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(
      'El almacén de archivos no responde o hay muchas subidas en curso.',
    );
    expect(mockedUpload.mock.calls[0][3]?.resumeDocumentId ?? null).toBeNull();
    mockedUpload.mockResolvedValueOnce(makeDocument({ id: 'doc-1', originalName: 'x.pdf' }));
    await user.click(within(row).getByRole('button', { name: 'Reintentar x.pdf' }));
    expect(await within(row).findByText('Subido')).toBeInTheDocument();
    expect(mockedUpload.mock.calls[1][3]?.resumeDocumentId).toBe('doc-1');
  });

  it('QA D2: durante la subida hay «Cancelar»: aborta la subida y la fila vuelve a estar lista, sin aviso de error', async () => {
    const user = setupUser();
    let signal: AbortSignal | undefined;
    mockedUpload.mockImplementationOnce(
      (_t, _p, _i, opts) =>
        new Promise((_resolve, reject) => {
          signal = opts?.signal;
          signal?.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')));
        }),
    );
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    dropFiles([pdf('x.pdf')]);
    const row = await screen.findByRole('listitem', { name: 'x.pdf' });
    await user.click(within(row).getByRole('button', { name: 'Subir x.pdf' }));
    await user.click(await within(row).findByRole('button', { name: 'Cancelar x.pdf' }));
    expect(signal?.aborted).toBe(true);
    expect(await within(row).findByRole('button', { name: 'Subir x.pdf' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Cancelar x.pdf' })).toBeNull();
    expect(mockedNotify).not.toHaveBeenCalled();
  });

  it('el «Reintentar» del toast usa la fila actual: si se cambió la categoría tras el fallo, se envía la nueva', async () => {
    const user = setupUser();
    mockedUpload.mockRejectedValueOnce(new ApiError(500, 'Fallo'));
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    dropFiles([pdf('rx.pdf')]);
    const row = await screen.findByRole('listitem', { name: 'rx.pdf' });
    await user.click(within(row).getByRole('button', { name: 'Subir rx.pdf' }));
    expect(await within(row).findByText('Error')).toBeInTheDocument();
    const { onRetry } = mockedNotify.mock.calls[0][1] as { onRetry: () => void };

    await user.selectOptions(within(row).getByLabelText('Categoría'), 'XRAY');
    mockedUpload.mockResolvedValueOnce(makeDocument({ id: 'rx', originalName: 'rx.pdf', category: 'XRAY' }));
    await act(async () => onRetry());
    expect(mockedUpload).toHaveBeenLastCalledWith(
      DENTIST,
      'p1',
      expect.objectContaining({ category: 'XRAY' }),
      expect.anything(),
    );
    expect(await within(row).findByText('Subido')).toBeInTheDocument();
  });

  it('el «Reintentar» del toast no sube una fila que ya se quitó de la cola', async () => {
    const user = setupUser();
    mockedUpload.mockRejectedValueOnce(new ApiError(500, 'Fallo'));
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    dropFiles([pdf('rx.pdf')]);
    const row = await screen.findByRole('listitem', { name: 'rx.pdf' });
    await user.click(within(row).getByRole('button', { name: 'Subir rx.pdf' }));
    expect(await within(row).findByText('Error')).toBeInTheDocument();
    const { onRetry } = mockedNotify.mock.calls[0][1] as { onRetry: () => void };

    await user.click(within(row).getByRole('button', { name: /^Quitar/ }));
    expect(screen.queryByRole('listitem', { name: 'rx.pdf' })).not.toBeInTheDocument();
    await act(async () => onRetry());
    expect(mockedUpload).toHaveBeenCalledTimes(1);
  });

  it('HEIC: se convierte a JPG antes de subir; si falla, el error en español', async () => {
    mockedHeic.mockResolvedValueOnce(new File(['jpg'], 'IMG_1.jpg', { type: 'image/jpeg' }));
    mockedHeic.mockRejectedValueOnce(new HeicConversionError(new Error('libheif')));
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    dropFiles([new File(['h'], 'IMG_1.HEIC', { type: 'image/heic' }), new File(['h'], 'IMG_2.heic')]);
    expect(await screen.findByRole('listitem', { name: 'IMG_1.jpg' })).toBeInTheDocument();
    const bad = screen.getByRole('listitem', { name: 'IMG_2.heic' });
    expect(within(bad).getByRole('alert')).toHaveTextContent(
      'No pudimos convertir la foto HEIC; expórtala como JPG.',
    );
    expect(mockedHeic).toHaveBeenCalledTimes(2);
  });

  it('desde el odontograma (?tooth=) la fila nueva trae ese diente', async () => {
    const user = setupUser();
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" initialTooth="36" tagUploadsWithTooth />);
    await screen.findByText('Ningún documento con estos filtros');
    await user.upload(fileInput(), pdf('rx36.pdf'));
    const row = screen.getByRole('listitem', { name: 'rx36.pdf' });
    expect(within(row).getByRole('button', { name: 'Quitar el diente 36' })).toBeInTheDocument();
  });

  it('con ?tooth= pero sin venir de «Documentos del diente», solo se filtra: la fila nueva no trae diente', async () => {
    const user = setupUser();
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" initialTooth="36" />);
    await screen.findByText('Ningún documento con estos filtros');
    await user.upload(fileInput(), pdf('rx.pdf'));
    const row = screen.getByRole('listitem', { name: 'rx.pdf' });
    expect(within(row).queryByRole('button', { name: /quitar el diente/i })).not.toBeInTheDocument();
  });

  it('un diente no válido sin confirmar bloquea «Subir» hasta corregirlo', async () => {
    const user = setupUser();
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    await user.upload(fileInput(), pdf('rx.pdf'));
    const row = screen.getByRole('listitem', { name: 'rx.pdf' });
    await user.type(within(row).getByLabelText('Dientes (opcional)'), '99');
    await user.tab();
    expect(within(row).getByText('«99» no es un código FDI válido.')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Subir rx.pdf' })).toBeDisabled();
    await user.clear(within(row).getByLabelText('Dientes (opcional)'));
    await user.type(within(row).getByLabelText('Dientes (opcional)'), '11{Enter}');
    expect(within(row).getByRole('button', { name: 'Subir rx.pdf' })).toBeEnabled();
  });

  it('como mucho 3 subidas a la vez; la cuarta queda «En espera» y arranca al liberarse un hueco', async () => {
    const user = setupUser();
    const finishers: (() => void)[] = [];
    mockedUpload.mockImplementation(
      (_t, _p, input) =>
        new Promise((resolve) => {
          finishers.push(() => resolve(makeDocument({ id: input.file.name, originalName: input.file.name })));
        }),
    );
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    await user.upload(fileInput(), [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf'), pdf('d.pdf')]);
    await user.click(screen.getByRole('button', { name: 'Subir 4 archivos' }));
    expect(mockedUpload).toHaveBeenCalledTimes(3);
    expect(within(screen.getByRole('listitem', { name: 'd.pdf' })).getByText('En espera…')).toBeInTheDocument();
    await act(async () => finishers[0]());
    expect(mockedUpload).toHaveBeenCalledTimes(4);
  });

  it('anuncia a lectores de pantalla «<nombre> subido» y «<nombre>: error»', async () => {
    const user = setupUser();
    mockedUpload.mockImplementation(async (_t, _p, input) => {
      if (input.file.name === 'mal.pdf') throw new ApiError(400, 'El contenido no coincide con el tipo.');
      return makeDocument({ id: 'ok', originalName: input.file.name });
    });
    render(<PatientDocumentsTab token={DENTIST} patientId="p1" />);
    await screen.findByText('Sin documentos');
    await user.upload(fileInput(), pdf('bien.pdf'));
    await user.click(screen.getByRole('button', { name: 'Subir bien.pdf' }));
    const live = await screen.findByText('bien.pdf subido');
    expect(live).toHaveAttribute('aria-live', 'polite');
    await user.upload(fileInput(), pdf('mal.pdf'));
    await user.click(screen.getByRole('button', { name: 'Subir mal.pdf' }));
    expect(await screen.findByText('mal.pdf: error')).toHaveAttribute('aria-live', 'polite');
  });
});

/** Como la página: el panel de «Documentos» y otra pestaña; la cola retiene el panel. */
function TabsHarness({ active }: { active: PatientDetailTabKey }) {
  const [pending, setPending] = useState(false);
  return (
    <PatientTabPanel tab="documents" activeTab={active} register={() => {}} keepMounted={pending}>
      <PatientDocumentsTab token={DENTIST} patientId="p1" onPendingChange={setPending} />
    </PatientTabPanel>
  );
}

describe('PatientDocumentsTab dentro de la ficha: cambiar de pestaña (DX-151)', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([]);
    mockedLocations.mockReset().mockResolvedValue([clinicLocation({ locale: 'de-DE', hourCycle: 'h23' })]);
    mockedUpload.mockReset();
    mockedNotify.mockReset();
  });

  it('una subida que falla con otra pestaña activa se ve al volver («Error» + «Reintentar») y avisa con un toast', async () => {
    const user = setupUser();
    let fail: ((err: unknown) => void) | undefined;
    mockedUpload.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const { rerender } = render(<TabsHarness active="documents" />);
    await screen.findByText('Sin documentos');
    await user.upload(fileInput(), [pdf('rx1.pdf'), pdf('rx2.pdf')]);
    await user.click(screen.getByRole('button', { name: 'Subir rx1.pdf' }));

    rerender(<TabsHarness active="odontogram" />);
    expect(screen.getByRole('tabpanel', { hidden: true })).toHaveAttribute('hidden');
    await act(async () => fail?.(new ApiError(500, 'Fallo')));
    expect(mockedNotify).toHaveBeenCalledWith(
      expect.stringMatching(/^No se subió «rx1\.pdf»\./),
      expect.objectContaining({ onRetry: expect.any(Function) }),
    );

    rerender(<TabsHarness active="documents" />);
    const row = screen.getByRole('listitem', { name: 'rx1.pdf' });
    expect(within(row).getByText('Error')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Reintentar rx1.pdf' })).toBeInTheDocument();
    // El que seguía listo, con su fila intacta.
    expect(screen.getByRole('button', { name: 'Subir rx2.pdf' })).toBeInTheDocument();
  });

  it('sin nada pendiente en la cola, el panel inactivo se desmonta como los demás', async () => {
    const { rerender } = render(<TabsHarness active="documents" />);
    await screen.findByText('Sin documentos');
    rerender(<TabsHarness active="odontogram" />);
    expect(screen.queryByText('Sin documentos')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { hidden: true })).toBeEmptyDOMElement();
  });
});
