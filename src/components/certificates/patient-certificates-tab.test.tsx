import { render, screen, waitFor, within } from '@testing-library/react';
import { PatientCertificatesTab } from './patient-certificates-tab';
import {
  getCertificateIssuer,
  listPatientCertificates,
  voidCertificate,
} from '@/lib/certificates/certificates-api';
import { openCertificatePdf } from '@/lib/certificates/open-certificate-pdf';
import { ApiError } from '@/lib/api/client';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { tokenFor } from '@/lib/test/prescriptions';
import { makeCertificate } from '@/lib/test/certificates';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede({ id: 'loc1' })]),
}));
jest.mock('../../lib/certificates/certificates-api', () => ({
  ...jest.requireActual('../../lib/certificates/certificates-api'),
  listPatientCertificates: jest.fn(),
  voidCertificate: jest.fn(),
  getCertificateIssuer: jest.fn(),
  listCertificateAppointments: jest.fn().mockReturnValue(new Promise(() => {})),
  getCertificateSettings: jest.fn().mockReturnValue(new Promise(() => {})),
}));
jest.mock('../../lib/certificates/open-certificate-pdf', () => ({ openCertificatePdf: jest.fn() }));

const mockedList = listPatientCertificates as jest.MockedFunction<typeof listPatientCertificates>;
const mockedVoid = voidCertificate as jest.MockedFunction<typeof voidCertificate>;
const mockedIssuer = getCertificateIssuer as jest.MockedFunction<typeof getCertificateIssuer>;
const mockedOpen = openCertificatePdf as jest.MockedFunction<typeof openCertificatePdf>;

const DENTIST = tokenFor('DENTIST', 'u-dentist');
const RECEPTION = tokenFor('RECEPTION', 'u-rec');

describe('PatientCertificatesTab (DX-306)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedVoid.mockReset();
    mockedOpen.mockReset();
    mockedIssuer.mockReset();
    mockedIssuer.mockResolvedValue({ canIssueAttendance: true, canIssueRest: true, professionalLicense: 'MPPS 45678' });
    clearSessionStore();
  });

  it('cargando: esqueleto anunciado', async () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<PatientCertificatesTab token={DENTIST} patientId="p1" />);
    expect(screen.getByRole('status', { name: 'Cargando certificados' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Certificado de reposo' })).toBeInTheDocument();
  });

  it('vacío: dice qué hacer y ofrece los dos botones a quien puede emitir reposo', async () => {
    mockedList.mockResolvedValue([]);
    render(<PatientCertificatesTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText('Este paciente no tiene certificados.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir justificante' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Certificado de reposo' })).toBeInTheDocument();
  });

  it('recepción emite el justificante pero no ve «Certificado de reposo»', async () => {
    mockedIssuer.mockResolvedValue({ canIssueAttendance: true, canIssueRest: false, professionalLicense: null });
    mockedList.mockResolvedValue([]);
    render(<PatientCertificatesTab token={RECEPTION} patientId="p1" />);
    await screen.findByText('Este paciente no tiene certificados.');
    await waitFor(() => expect(mockedIssuer).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Emitir justificante' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Certificado de reposo' })).not.toBeInTheDocument();
  });

  it('error de carga con reintento (escalón 1)', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedList.mockResolvedValueOnce([makeCertificate()]);
    render(<PatientCertificatesTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los certificados.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: 'Certificados del paciente' })).toBeInTheDocument();
  });

  it('lista tipo, nº, atención con las horas de la sede, reposo, quién emitió y el anulado con su motivo', async () => {
    mockedList.mockResolvedValue([
      makeCertificate({
        id: 'cert2',
        kind: 'REST',
        numberLabel: '000124',
        restDays: 3,
        restStartDate: '2026-11-16',
        restEndDate: '2026-11-18',
        hasDiagnosis: true,
        diagnosis: 'Exodoncia del 38',
        timesSource: 'SCHEDULED',
      }),
      makeCertificate({
        voidedAt: '2026-11-17T10:00:00.000Z',
        voidedByName: 'Ana Titular',
        voidReason: 'Fecha equivocada',
      }),
    ]);
    render(<PatientCertificatesTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Certificados del paciente' });
    const [, rest, voided] = within(table).getAllByRole('row');
    expect(rest).toHaveTextContent('Certificado de reposo');
    expect(rest).toHaveTextContent('nº 000124');
    // La sede de prueba es UTC en 24 h, es-VE.
    await waitFor(() => expect(rest).toHaveTextContent('16/11/2026 · 13:05–13:50'));
    expect(rest).toHaveTextContent('Con las horas programadas');
    expect(rest).toHaveTextContent('3 días de reposo del 16/11/2026 al 18/11/2026');
    expect(rest).toHaveTextContent('por Dra. Andreina Salazar');
    expect(rest).toHaveTextContent('Vigente');
    expect(within(rest).getByRole('button', { name: /^Imprimir/ })).toBeInTheDocument();
    expect(voided).toHaveTextContent('Anulado');
    expect(voided).toHaveTextContent(/por Ana Titular\. Motivo: Fecha equivocada/);
    expect(within(voided).queryByRole('button', { name: /^Acciones de/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar|borrar|eliminar/i })).not.toBeInTheDocument();
  });

  it('recepción: sin «Imprimir» en un reposo con diagnóstico, y explica por qué', async () => {
    mockedIssuer.mockResolvedValue({ canIssueAttendance: true, canIssueRest: false, professionalLicense: null });
    mockedList.mockResolvedValue([
      makeCertificate({ kind: 'REST', restDays: 2, hasDiagnosis: true, diagnosis: null }),
    ]);
    render(<PatientCertificatesTab token={RECEPTION} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Certificados del paciente' });
    expect(within(table).queryByRole('button', { name: /^Imprimir/ })).not.toBeInTheDocument();
    expect(table).toHaveTextContent('Lleva diagnóstico: lo imprime odontología o administración.');
  });

  it('«Imprimir» abre el PDF; si falla, un aviso con reintento (escalón 3)', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeCertificate()]);
    mockedOpen.mockRejectedValueOnce(new ApiError(500, 'x')).mockResolvedValueOnce(undefined);
    render(<PatientCertificatesTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Certificados del paciente' });
    await user.click(within(table).getByRole('button', { name: /^Imprimir/ }));
    await waitFor(() => expect(mockedOpen).toHaveBeenCalledWith(DENTIST, 'p1', 'cert1'));
  });

  it('otro odontólogo no anula un certificado ajeno; un ADMIN sí', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeCertificate()]);
    const { unmount } = render(<PatientCertificatesTab token={tokenFor('DENTIST', 'u-otro')} patientId="p1" />);
    await screen.findByRole('table', { name: 'Certificados del paciente' });
    expect(screen.queryByRole('button', { name: /^Acciones de/ })).not.toBeInTheDocument();
    unmount();
    clearSessionStore();
    render(<PatientCertificatesTab token={tokenFor('ADMIN', 'u-admin')} patientId="p1" />);
    await screen.findByRole('table', { name: 'Certificados del paciente' });
    await user.click(screen.getByRole('button', { name: 'Acciones de Justificante de asistencia nº 000123' }));
    expect(await screen.findByRole('menuitem', { name: 'Anular' })).toBeInTheDocument();
  });

  it('anular pide motivo (mín. 3) y deja la fila anulada', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeCertificate()]);
    mockedVoid.mockResolvedValue(
      makeCertificate({ voidedAt: '2026-11-17T10:00:00.000Z', voidedByName: 'Dra. Andreina Salazar', voidReason: 'Otra cita' }),
    );
    render(<PatientCertificatesTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Certificados del paciente' });
    await user.click(within(table).getByRole('button', { name: /^Acciones de/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Anular' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular certificado' });
    const submit = within(dialog).getByRole('button', { name: 'Anular certificado' });
    expect(submit).toBeDisabled();
    const reason = within(dialog).getByLabelText('Motivo de la anulación');
    await user.type(reason, 'no');
    await user.click(submit);
    expect(await within(dialog).findByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();
    expect(mockedVoid).not.toHaveBeenCalled();
    await user.clear(reason);
    await user.type(reason, 'Otra cita');
    await user.click(submit);
    await waitFor(() => expect(mockedVoid).toHaveBeenCalledWith(DENTIST, 'p1', 'cert1', 'Otra cita'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Motivo: Otra cita');
  });

  it('un 409 al anular (ya anulado) se ve en el formulario', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeCertificate()]);
    mockedVoid.mockRejectedValue(new ApiError(409, 'Este certificado ya está anulado.'));
    render(<PatientCertificatesTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Certificados del paciente' });
    await user.click(within(table).getByRole('button', { name: /^Acciones de/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Anular' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular certificado' });
    await user.type(within(dialog).getByLabelText('Motivo de la anulación'), 'Duplicado');
    await user.click(within(dialog).getByRole('button', { name: 'Anular certificado' }));
    expect(await within(dialog).findByText('Este certificado ya está anulado.')).toBeInTheDocument();
  });
});
