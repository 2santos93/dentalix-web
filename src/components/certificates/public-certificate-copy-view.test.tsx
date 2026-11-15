import { render, screen } from '@testing-library/react';
import { PublicCertificateCopyView, publicCertificateCopyCopy as copy } from './public-certificate-copy-view';
import {
  CERTIFICATE_COPY_EXPIRED_CODE,
  getPublicCertificateCopy,
  type PublicCertificateCopy,
} from '@/lib/certificates/certificate-copy';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeCertificate } from '@/lib/test/certificates';

jest.mock('../../lib/certificates/certificate-copy', () => ({
  ...jest.requireActual('../../lib/certificates/certificate-copy'),
  getPublicCertificateCopy: jest.fn(),
}));

const get = getPublicCertificateCopy as jest.MockedFunction<typeof getPublicCertificateCopy>;
const TOKEN = 'A'.repeat(43);
const cert = makeCertificate();

// Caracas (UTC−4) en 12 h: 13:05Z → 9:05 a. m.
const BASE: PublicCertificateCopy = {
  status: 'AVAILABLE',
  clinic: { name: 'Clínica Dental Los Palos Grandes', primaryColor: null, logoUrl: null },
  expiresAt: '2026-12-15T15:00:00.000Z',
  voidedAt: null,
  format: { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' },
  certificate: {
    kind: 'ATTENDANCE',
    numberLabel: '000123',
    issuedAt: cert.issuedAt,
    attendedFrom: cert.attendedFrom,
    attendedUntil: cert.attendedUntil,
    timesSource: 'ACTUAL',
    restDays: null,
    restStartDate: null,
    restEndDate: null,
    diagnosis: null,
    diagnosisOmitted: false,
    snapshot: cert.snapshot,
  },
};

describe('PublicCertificateCopyView (DX-306)', () => {
  beforeEach(() => get.mockReset());

  it('mientras carga, lo anuncia', () => {
    get.mockReturnValue(new Promise(() => undefined));
    render(<PublicCertificateCopyView token={TOKEN} />);
    expect(screen.getByRole('status')).toHaveTextContent(copy.loading);
    expect(get).toHaveBeenCalledWith(TOKEN);
  });

  it('justificante: tipo y nº, clínica, paciente, «asistió a consulta» con el reloj de la sede y «Descargar PDF»', async () => {
    get.mockResolvedValue(BASE);
    render(<PublicCertificateCopyView token={TOKEN} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Justificante de asistencia nº 000123' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Clínica Dental Los Palos Grandes')).toBeInTheDocument();
    expect(screen.getByText('Yusmary Rondón · V-12345678')).toBeInTheDocument();
    expect(screen.getByText(/^Asistió a consulta el 16\/11\/2026 de 9:05.*a\..*m\. a 9:50/)).toBeInTheDocument();
    expect(screen.queryByText(copy.scheduled)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.diagnosis)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.download })).toHaveAttribute(
      'href',
      `/api/v1/public/certificate-copies/${TOKEN}/pdf`,
    );
  });

  it('reposo: días con desde/hasta, horas programadas y el diagnóstico nunca (solo el aviso de que se omite)', async () => {
    get.mockResolvedValue({
      ...BASE,
      certificate: {
        ...BASE.certificate!,
        kind: 'REST',
        timesSource: 'SCHEDULED',
        restDays: 3,
        restStartDate: '2026-11-16',
        restEndDate: '2026-11-18',
        diagnosis: null,
        diagnosisOmitted: true,
      },
    });
    render(<PublicCertificateCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Certificado de reposo nº 000123' })).toBeInTheDocument();
    expect(screen.getByText('3 días de reposo, del 16/11/2026 al 18/11/2026.')).toBeInTheDocument();
    expect(screen.getByText(copy.scheduled)).toBeInTheDocument();
    expect(screen.getByText(copy.diagnosisOmitted)).toBeInTheDocument();
  });

  it('anulado después del envío: «Este certificado fue anulado», sin contenido ni descarga', async () => {
    get.mockResolvedValue({ ...BASE, status: 'VOIDED', certificate: null, voidedAt: '2026-11-20T15:00:00.000Z' });
    render(<PublicCertificateCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: copy.voidedTitle, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/La clínica lo anuló el 20\/11\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: copy.download })).not.toBeInTheDocument();
    expect(screen.queryByText(/Yusmary/)).not.toBeInTheDocument();
  });

  it('caducado (410 con su código): «Este enlace caducó»', async () => {
    get.mockRejectedValue(new ApiError(410, 'Gone', { code: CERTIFICATE_COPY_EXPIRED_CODE }));
    render(<PublicCertificateCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: copy.expiredTitle })).toBeInTheDocument();
  });

  it('inválido o de otra clínica (404): aviso sin reintento', async () => {
    get.mockRejectedValue(new ApiError(404, 'Not Found'));
    render(<PublicCertificateCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: copy.notFoundTitle })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sin red: escalón 1 con reintento que vuelve a pedirlo', async () => {
    get.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    get.mockResolvedValueOnce(BASE);
    const user = setupUser();
    render(<PublicCertificateCopyView token={TOKEN} />);
    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: /nº 000123/ })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('429: «Demasiados intentos»', async () => {
    get.mockRejectedValue(new ApiError(429, 'Too Many Requests'));
    render(<PublicCertificateCopyView token={TOKEN} />);
    expect(await screen.findByText(copy.tooManyMessage)).toBeInTheDocument();
  });
});
