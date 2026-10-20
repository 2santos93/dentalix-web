import { render, screen } from '@testing-library/react';
import { DocumentViewerDialog } from './document-viewer-dialog';
import { getPatientDocumentUrl } from '@/lib/patient-documents/patient-documents-api';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeDocument } from '@/lib/test/patient-documents';

jest.mock('../../lib/patient-documents/patient-documents-api', () => ({
  ...jest.requireActual('../../lib/patient-documents/patient-documents-api'),
  getPatientDocumentUrl: jest.fn(),
}));
jest.mock('../../lib/hooks/use-media-query', () => ({ useMediaQuery: jest.fn() }));

const mockedUrl = getPatientDocumentUrl as jest.MockedFunction<typeof getPatientDocumentUrl>;
const mockedWide = useMediaQuery as jest.MockedFunction<typeof useMediaQuery>;
const URL_INLINE = 'http://localhost:3000/api/v1/files/signed?k=1';

function renderViewer(doc = makeDocument()) {
  return render(<DocumentViewerDialog open onOpenChange={jest.fn()} token="T" document={doc} />);
}

describe('DocumentViewerDialog (DX-151)', () => {
  beforeEach(() => {
    mockedUrl.mockReset().mockResolvedValue({ url: URL_INLINE, expiresAt: '', disposition: 'inline' });
    mockedWide.mockReset().mockReturnValue(true);
  });

  it('imagen: <img> sin referrer y «Abrir en otra pestaña»', async () => {
    renderViewer(makeDocument({ originalName: 'sonrisa.jpg', mimeType: 'image/jpeg', category: 'PHOTO' }));
    const img = await screen.findByRole('img', { name: 'sonrisa.jpg' });
    expect(img).toHaveAttribute('src', URL_INLINE);
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByRole('link', { name: 'Abrir en otra pestaña' })).toHaveAttribute('href', URL_INLINE);
    expect(mockedUrl).toHaveBeenCalledWith('T', 'p1', 'doc-1', 'inline');
  });

  it('PDF en pantalla ancha: <iframe> sin referrer y SIN sandbox (Chromium bloquea su visor de PDF en marcos aislados)', async () => {
    renderViewer();
    const frame = await screen.findByTitle('Vista previa de panoramica.pdf');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).not.toHaveAttribute('sandbox');
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(frame).toHaveAttribute('src', URL_INLINE);
    expect(screen.getByRole('link', { name: 'Abrir en otra pestaña' })).toBeInTheDocument();
  });

  it('PDF en pantalla estrecha (< 640 px): sin iframe, botón «Abrir»', async () => {
    mockedWide.mockReturnValue(false);
    renderViewer();
    const open = await screen.findByRole('link', { name: 'Abrir' });
    expect(open).toHaveAttribute('href', URL_INLINE);
    expect(open).toHaveAttribute('target', '_blank');
    expect(screen.queryByTitle('Vista previa de panoramica.pdf')).not.toBeInTheDocument();
  });

  it('imagen en pantalla estrecha: sigue en línea', async () => {
    mockedWide.mockReturnValue(false);
    renderViewer(makeDocument({ originalName: 'rx.png', mimeType: 'image/png' }));
    expect(await screen.findByRole('img', { name: 'rx.png' })).toBeInTheDocument();
  });

  it('si la URL no carga: error de sección con «Reintentar»', async () => {
    const user = setupUser();
    mockedUrl.mockReset();
    mockedUrl.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedUrl.mockResolvedValueOnce({ url: URL_INLINE, expiresAt: '', disposition: 'inline' });
    renderViewer();
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos abrir el documento.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTitle('Vista previa de panoramica.pdf')).toBeInTheDocument();
  });

  it('«Abrir en otra pestaña» pide una URL nueva en cada clic (la anterior caduca)', async () => {
    const user = setupUser();
    const fakeTab = { opener: {} as unknown, location: { replace: jest.fn() }, close: jest.fn() };
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(fakeTab as unknown as Window);
    renderViewer();
    await screen.findByTitle('Vista previa de panoramica.pdf');
    mockedUrl.mockResolvedValueOnce({ url: 'http://files/fresca', expiresAt: '', disposition: 'inline' });
    await user.click(screen.getByRole('link', { name: 'Abrir en otra pestaña' }));
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(mockedUrl).toHaveBeenCalledTimes(2);
    expect(fakeTab.opener).toBeNull();
    expect(fakeTab.location.replace).toHaveBeenCalledWith('http://files/fresca');
    openSpy.mockRestore();
  });
});
