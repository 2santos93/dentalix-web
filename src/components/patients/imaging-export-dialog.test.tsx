import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ImagingExportDialog, IMAGING_HELP_HREF } from './imaging-export-dialog';
import { setupUser } from '@/lib/test/user';
import { fetchPatientImagingExport } from '@/lib/patients/patients-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  fetchPatientImagingExport: jest.fn(),
}));

const fetchExport = fetchPatientImagingExport as jest.MockedFunction<typeof fetchPatientImagingExport>;

const TEXT = [
  'Código del paciente: 1042',
  'Apellidos: Pérez Núñez',
  'Nombre: José Ángel',
  'Apellidos (sin tildes): Perez Nunez',
  'Nombre (sin tildes): Jose Angel',
  'Fecha de nacimiento: 05.03.1990',
  'Fecha de nacimiento (aaaa-mm-dd): 1990-03-05',
  'Sexo: M',
  '',
].join('\r\n');

/** jsdom no tiene `Blob.text()`: se lee con `FileReader` (UTF-8). */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob, 'utf-8');
  });
}

function renderDialog(open = true) {
  return render(
    <ImagingExportDialog open={open} onOpenChange={() => {}} token="jwt" patientId="p1" patientCode="1042" />,
  );
}

describe('ImagingExportDialog (DX-484)', () => {
  beforeEach(() => {
    fetchExport.mockReset();
  });

  it('pide el .txt UNA vez por apertura (también en StrictMode) y lo muestra en un <pre> con su etiqueta', async () => {
    fetchExport.mockResolvedValue(TEXT);
    render(
      <StrictMode>
        <ImagingExportDialog open onOpenChange={() => {}} token="jwt" patientId="p1" patientCode="1042" />
      </StrictMode>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Preparando los datos del paciente…');
    const pre = await screen.findByTestId('imaging-export-text');
    expect(pre.tagName).toBe('PRE');
    expect(pre).toHaveAccessibleName('Datos del paciente');
    expect(pre.textContent).toBe(TEXT);
    expect(fetchExport).toHaveBeenCalledTimes(1);
    expect(fetchExport).toHaveBeenCalledWith('jwt', 'p1');
    expect(
      screen.getByText('Dentalix no se conecta con el software de imagen: da de alta al paciente allí con este código.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cómo darlo de alta en Sidexis, Romexis, Dexis o CS Imaging' })).toHaveAttribute(
      'href',
      IMAGING_HELP_HREF,
    );
  });

  it('cerrado no pide nada; cada apertura vuelve a pedir una vez', async () => {
    fetchExport.mockResolvedValue(TEXT);
    const { rerender } = renderDialog(false);
    expect(fetchExport).not.toHaveBeenCalled();
    const props = { onOpenChange: () => {}, token: 'jwt', patientId: 'p1', patientCode: '1042' };
    rerender(<ImagingExportDialog open {...props} />);
    await screen.findByTestId('imaging-export-text');
    rerender(<ImagingExportDialog open={false} {...props} />);
    rerender(<ImagingExportDialog open {...props} />);
    await screen.findByTestId('imaging-export-text');
    expect(fetchExport).toHaveBeenCalledTimes(2);
  });

  it('«Copiar» copia el texto obtenido y lo anuncia; si falla, pide copiarlo a mano', async () => {
    fetchExport.mockResolvedValue(TEXT);
    const user = setupUser();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderDialog();
    await screen.findByTestId('imaging-export-text');

    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(await screen.findByText('Datos copiados')).toHaveAttribute('role', 'status');

    writeText.mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(await screen.findByText(/selecciona el texto y cópialo a mano/)).toBeInTheDocument();
  });

  it('«Descargar .txt» guarda paciente-1042.txt en UTF-8 con el texto, sin volver a pedirlo', async () => {
    fetchExport.mockResolvedValue(TEXT);
    const user = setupUser();
    const createObjectURL = jest.fn((blob: Blob) => {
      void blob;
      return 'blob:x';
    });
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicks: HTMLAnchorElement[] = [];
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this);
      });
    try {
      renderDialog();
      await screen.findByTestId('imaging-export-text');
      await user.click(screen.getByRole('button', { name: 'Descargar .txt' }));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0];
      expect(blob.type).toBe('text/plain;charset=utf-8');
      expect(await readBlob(blob)).toBe(TEXT);
      expect(clicks).toHaveLength(1);
      expect(clicks[0].download).toBe('paciente-1042.txt');
      expect(fetchExport).toHaveBeenCalledTimes(1);
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('si la API falla: escalón 1 con el mensaje y «Reintentar», que vuelve a pedir', async () => {
    fetchExport.mockRejectedValueOnce(new ApiError(500, 'Error interno')).mockResolvedValueOnce(TEXT);
    const user = setupUser();
    renderDialog();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron preparar los datos');
    expect(screen.queryByTestId('imaging-export-text')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('imaging-export-text');
    expect(fetchExport).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
