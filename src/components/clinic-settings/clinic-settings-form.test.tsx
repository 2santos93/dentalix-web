import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicSettingsForm, validateClinicDraft } from './clinic-settings-form';
import {
  getClinicSettings,
  removeClinicLogo,
  updateClinicSettings,
  uploadClinicLogo,
  type ClinicSettings,
} from '@/lib/clinic/clinic-settings-api';
import { BrandingProvider, useClinicBranding } from '@/components/brand/branding-context';
import { ApiError } from '@/lib/api/api-error';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../lib/clinic/clinic-settings-api', () => ({
  ...jest.requireActual('../../lib/clinic/clinic-settings-api'),
  getClinicSettings: jest.fn(),
  updateClinicSettings: jest.fn(),
  uploadClinicLogo: jest.fn(),
  removeClinicLogo: jest.fn(),
}));
const mockedGet = jest.mocked(getClinicSettings);
const mockedPatch = jest.mocked(updateClinicSettings);
const mockedUpload = jest.mocked(uploadClinicLogo);
const mockedRemove = jest.mocked(removeClinicLogo);

const BASE: ClinicSettings = {
  name: 'Clínica Sonrisas',
  legalName: null,
  taxId: null,
  taxIdLabel: null,
  fiscalAddress: null,
  contactEmail: null,
  contactPhone: null,
  primaryColor: '#0E7490',
  logoUrl: null,
  fiscalDataPending: true,
};

const bar = () => screen.queryByRole('region', { name: 'Cambios sin guardar' });

function BrandProbe() {
  const b = useClinicBranding();
  return <p data-testid="probe">{`${b.name}|${b.primaryColor}|${b.logoUrl}`}</p>;
}

function renderForm(allowed = true) {
  return render(
    <BrandingProvider value={{ name: 'Clínica Sonrisas', logoUrl: null, primaryColor: '#0E7490' }}>
      <ClinicSettingsForm token="tok" allowed={allowed} />
      <BrandProbe />
    </BrandingProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('Ajustes › Datos de la clínica (DX-019)', () => {
  it('sin permiso: estado bloqueado y no llama a la API', () => {
    renderForm(false);
    expect(screen.getByText('Solo administración edita los datos de la clínica.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('carga (esqueleto), luego el formulario con el aviso de datos fiscales pendientes y sin barra', async () => {
    mockedGet.mockResolvedValue(BASE);
    renderForm();
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Nombre comercial' })).toHaveValue('Clínica Sonrisas');
    expect(screen.getByTestId('fiscal-pending-callout')).toBeInTheDocument();
    expect(within(screen.getByTestId('document-header-preview')).getByText('Datos fiscales pendientes')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nombre del identificador fiscal' })).toHaveAttribute('placeholder', 'Id. fiscal');
    expect(bar()).not.toBeInTheDocument();
  });

  it('error al cargar: mensaje y reintento', async () => {
    mockedGet.mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce(BASE);
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('textbox', { name: 'Nombre comercial' })).toBeInTheDocument();
  });

  it('la vista previa del documento usa el nombre propio del identificador antes de guardar', async () => {
    mockedGet.mockResolvedValue(BASE);
    renderForm();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Razón social' }), 'Sonrisas S.A.');
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre del identificador fiscal' }), 'ID fiscal');
    await userEvent.type(screen.getByRole('textbox', { name: 'Identificador fiscal' }), 'J-1234');
    const preview = screen.getByTestId('document-header-preview');
    expect(within(preview).getByTestId('clinic-fiscal')).toHaveTextContent('Sonrisas S.A. · ID fiscal J-1234');
    expect(within(preview).queryByText('Datos fiscales pendientes')).not.toBeInTheDocument();
    expect(bar()).toBeInTheDocument();
  });

  it('guarda solo lo que cambió; la marca de la pestaña cambia al instante y se refresca el layout', async () => {
    mockedGet.mockResolvedValue(BASE);
    mockedPatch.mockResolvedValue({ ...BASE, legalName: 'Sonrisas S.A.', taxId: 'J-1', primaryColor: '#6D28D9', fiscalDataPending: false });
    renderForm();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Razón social' }), 'Sonrisas S.A.');
    await userEvent.type(screen.getByRole('textbox', { name: 'Identificador fiscal' }), 'J-1');
    const hex = screen.getByRole('textbox', { name: 'Color en hexadecimal' });
    await userEvent.clear(hex);
    await userEvent.type(hex, '#6d28d9');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar los datos de la clínica' }));
    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('tok', { legalName: 'Sonrisas S.A.', taxId: 'J-1', primaryColor: '#6D28D9' }),
    );
    expect(mockedUpload).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('Clínica Sonrisas|#6D28D9|null'));
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId('client-accent').textContent).toContain('--color-primary:#6D28D9');
    await waitFor(() => expect(bar()).not.toBeInTheDocument());
    expect(screen.queryByTestId('fiscal-pending-callout')).not.toBeInTheDocument();
  });

  it('un color sin contraste AA o cerca de un estado se advierte; la familia se ve en claro y oscuro', async () => {
    mockedGet.mockResolvedValue(BASE);
    renderForm();
    const hex = await screen.findByRole('textbox', { name: 'Color en hexadecimal' });
    expect(screen.getByTestId('accent-preview-light')).toBeInTheDocument();
    expect(screen.getByTestId('accent-preview-dark')).toBeInTheDocument();
    expect(screen.queryByTestId('accent-contrast-warning')).not.toBeInTheDocument();
    await userEvent.clear(hex);
    await userEvent.type(hex, '#7DD3FC');
    expect(screen.getByTestId('accent-contrast-warning')).toHaveTextContent('el mínimo es 4,5:1');
    await userEvent.clear(hex);
    await userEvent.type(hex, '#B91C1C');
    expect(screen.getByTestId('accent-status-warning')).toHaveTextContent('peligro');
  });

  it('valida antes de mandar: nombre vacío, email y color', async () => {
    mockedGet.mockResolvedValue(BASE);
    renderForm();
    await userEvent.clear(await screen.findByRole('textbox', { name: 'Nombre comercial' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Email de contacto' }), 'sin arroba');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar los datos de la clínica' }));
    expect(screen.getByText('Escribe el nombre comercial (hasta 120 caracteres).')).toBeInTheDocument();
    expect(screen.getByText('Escribe un email con la forma nombre@dominio.')).toBeInTheDocument();
    expect(mockedPatch).not.toHaveBeenCalled();
    expect(validateClinicDraft({ name: 'x', legalName: '', taxIdLabel: '', taxId: 'x'.repeat(65), fiscalAddress: '', contactEmail: '', contactPhone: '', primaryColor: 'red', logo: 'keep' })).toEqual({
      taxId: 'Hasta 64 caracteres.',
      primaryColor: 'Escribe un color en hexadecimal de seis cifras, p. ej. #0E7490.',
    });
  });

  it('logo: tipo o tamaño inválido se rechaza al elegirlo; uno válido se ve en la vista previa y se sube al guardar', async () => {
    mockedGet.mockResolvedValue(BASE);
    mockedUpload.mockResolvedValue({ ...BASE, logoUrl: 'https://api.example/files/logos/x.png' });
    renderForm();
    const input = await screen.findByTestId('clinic-logo-input');
    await userEvent.upload(input, new File(['GIF89a'], 'logo.gif', { type: 'image/gif' }), { applyAccept: false });
    expect(screen.getByText('El logo debe ser una imagen PNG, JPG o SVG.')).toBeInTheDocument();
    const big = new File([new Uint8Array(1024 * 1024)], 'logo.png', { type: 'image/png' });
    await userEvent.upload(input, big);
    expect(screen.getByText('El logo supera el máximo de 1 MB.')).toBeInTheDocument();
    const ok = new File([new Uint8Array([0x89, 0x50])], 'logo.png', { type: 'image/png' });
    await userEvent.upload(input, ok);
    expect(await screen.findByTestId('clinic-logo-preview')).toHaveAttribute('src', expect.stringMatching(/^data:image\/png/));
    expect(screen.getByText('Nuevo: logo.png (se sube al guardar).')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar los datos de la clínica' }));
    await waitFor(() => expect(mockedUpload).toHaveBeenCalledWith('tok', ok));
    expect(mockedPatch).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('https://api.example/files/logos/x.png'));
  });

  it('quitar el logo es un cambio pendiente; un fallo de la API se muestra en la barra', async () => {
    mockedGet.mockResolvedValue({ ...BASE, logoUrl: 'https://api.example/files/logos/x.png' });
    mockedRemove.mockRejectedValue(new ApiError(503, 'El almacén no responde.'));
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar logo' }));
    expect(screen.getByText('Se quitará al guardar.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar los datos de la clínica' }));
    expect(await within(bar()!).findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.getByTestId('clinic-logo-preview')).toBeInTheDocument();
  });
});
