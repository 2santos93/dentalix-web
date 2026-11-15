import { render, screen, waitFor, within } from '@testing-library/react';
import { IssueCertificateModal } from './issue-certificate-modal';
import {
  getCertificateIssuer,
  getCertificateSettings,
  issueCertificate,
  listCertificateAppointments,
} from '@/lib/certificates/certificates-api';
import { openCertificatePdf } from '@/lib/certificates/open-certificate-pdf';
import { ApiError } from '@/lib/api/client';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { tokenFor } from '@/lib/test/prescriptions';
import { makeCertificate, makeEligibleAppointment } from '@/lib/test/certificates';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede({ id: 'loc1' })]),
}));
jest.mock('../../lib/certificates/certificates-api', () => ({
  ...jest.requireActual('../../lib/certificates/certificates-api'),
  listCertificateAppointments: jest.fn(),
  issueCertificate: jest.fn(),
  getCertificateIssuer: jest.fn(),
  getCertificateSettings: jest.fn(),
}));
jest.mock('../../lib/certificates/open-certificate-pdf', () => ({ openCertificatePdf: jest.fn() }));

const mockedAppointments = listCertificateAppointments as jest.MockedFunction<typeof listCertificateAppointments>;
const mockedIssue = issueCertificate as jest.MockedFunction<typeof issueCertificate>;
const mockedIssuer = getCertificateIssuer as jest.MockedFunction<typeof getCertificateIssuer>;
const mockedSettings = getCertificateSettings as jest.MockedFunction<typeof getCertificateSettings>;
const mockedOpen = openCertificatePdf as jest.MockedFunction<typeof openCertificatePdf>;

const TOKEN = tokenFor('DENTIST', 'u-dentist');

function renderModal(props: Partial<React.ComponentProps<typeof IssueCertificateModal>> = {}) {
  const onIssued = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <IssueCertificateModal
      open
      onOpenChange={onOpenChange}
      token={TOKEN}
      patientId="p1"
      kind="ATTENDANCE"
      onIssued={onIssued}
      {...props}
    />,
  );
  return { onIssued, onOpenChange };
}

beforeEach(() => {
  mockedAppointments.mockReset();
  mockedIssue.mockReset();
  mockedIssuer.mockReset();
  mockedSettings.mockReset();
  mockedOpen.mockReset();
  clearSessionStore();
  mockedIssuer.mockResolvedValue({ canIssueAttendance: true, canIssueRest: true, professionalLicense: 'MPPS 45678' });
  mockedSettings.mockResolvedValue({ restMaxDays: 15, restPrintDiagnosis: false });
});

describe('Emitir justificante (DX-306)', () => {
  it('elige la cita más reciente libre; la que ya tiene justificante vigente, deshabilitada y explicada', async () => {
    mockedAppointments.mockResolvedValue([
      makeEligibleAppointment({ id: 'a-taken', liveKinds: ['ATTENDANCE'] }),
      makeEligibleAppointment({ id: 'a-free', start: '2026-11-10T14:00:00.000Z', end: '2026-11-10T14:45:00.000Z' }),
    ]);
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: 'Emitir justificante' });
    const group = await within(dialog).findByRole('radiogroup', { name: 'Cita atendida' });
    const radios = within(group).getAllByRole('radio');
    expect(radios[0]).toBeDisabled();
    expect(radios[0]).toHaveAccessibleDescription(/Ya tiene un justificante vigente/);
    expect(radios[1]).toBeChecked();
    await waitFor(() => expect(group).toHaveTextContent('10/11/2026 · 14:00–14:45'));
    expect(group).toHaveTextContent('Sede Chacao · Dra. Andreina Salazar');
    // El justificante no pide días ni diagnóstico, ni consulta el emisor.
    expect(within(dialog).queryByLabelText('Días de reposo')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Diagnóstico/)).not.toBeInTheDocument();
    expect(mockedIssuer).not.toHaveBeenCalled();
  });

  it('con la cita de la agenda, queda elegida esa', async () => {
    mockedAppointments.mockResolvedValue([
      makeEligibleAppointment({ id: 'a1' }),
      makeEligibleAppointment({ id: 'a2', start: '2026-11-10T14:00:00.000Z' }),
    ]);
    renderModal({ initialAppointmentId: 'a2' });
    const group = await screen.findByRole('radiogroup', { name: 'Cita atendida' });
    const radios = within(group).getAllByRole('radio');
    expect(radios[1]).toBeChecked();
  });

  it('emite, avisa a la ficha y ofrece «Imprimir»', async () => {
    const user = setupUser();
    mockedAppointments.mockResolvedValue([makeEligibleAppointment()]);
    const cert = makeCertificate();
    mockedIssue.mockResolvedValue(cert);
    mockedOpen.mockResolvedValue(undefined);
    const { onIssued } = renderModal();
    const dialog = await screen.findByRole('dialog', { name: 'Emitir justificante' });
    await within(dialog).findByRole('radiogroup', { name: 'Cita atendida' });
    await user.click(within(dialog).getByRole('button', { name: 'Emitir' }));
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith(TOKEN, 'p1', { kind: 'ATTENDANCE', appointmentId: 'appt1' }),
    );
    expect(onIssued).toHaveBeenCalledWith(cert);
    expect(await within(dialog).findByText('Justificante de asistencia nº 000123 emitido')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Imprimir' }));
    expect(mockedOpen).toHaveBeenCalledWith(TOKEN, 'p1', 'cert1');
    expect(within(dialog).getAllByRole('button', { name: 'Cerrar' }).length).toBeGreaterThan(0);
  });

  it('el 409 de la API (ya hay uno vigente) se ve con su texto en el formulario', async () => {
    const user = setupUser();
    mockedAppointments.mockResolvedValue([makeEligibleAppointment()]);
    mockedIssue.mockRejectedValue(
      new ApiError(409, 'Esta cita ya tiene un justificante vigente (nº 000123): anúlalo antes de emitir otro.'),
    );
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: 'Emitir justificante' });
    await within(dialog).findByRole('radiogroup', { name: 'Cita atendida' });
    await user.click(within(dialog).getByRole('button', { name: 'Emitir' }));
    expect(await within(dialog).findByText(/ya tiene un justificante vigente \(nº 000123\)/)).toBeInTheDocument();
  });

  it('sin citas atendidas: lo explica y no hay «Emitir»', async () => {
    mockedAppointments.mockResolvedValue([]);
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: 'Emitir justificante' });
    expect(await within(dialog).findByText('No hay citas atendidas para certificar.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Emitir' })).not.toBeInTheDocument();
  });

  it('fallo de carga: escalón 1 con reintento dentro del modal', async () => {
    const user = setupUser();
    mockedAppointments.mockRejectedValueOnce(new ApiError(500, 'x')).mockResolvedValueOnce([makeEligibleAppointment()]);
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: 'Emitir justificante' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No pudimos cargar las citas atendidas del paciente.');
    await user.click(within(dialog).getByRole('button', { name: 'Reintentar' }));
    expect(await within(dialog).findByRole('radiogroup', { name: 'Cita atendida' })).toBeInTheDocument();
  });
});

describe('Certificado de reposo (DX-306)', () => {
  it('sin registro profesional: lo avisa antes y no deja emitir', async () => {
    mockedIssuer.mockResolvedValue({ canIssueAttendance: true, canIssueRest: true, professionalLicense: null });
    mockedAppointments.mockResolvedValue([makeEligibleAppointment()]);
    renderModal({ kind: 'REST' });
    const dialog = await screen.findByRole('dialog', { name: 'Certificado de reposo' });
    expect(await within(dialog).findByText('Te falta el registro profesional')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Emitir' })).not.toBeInTheDocument();
  });

  it('días entre 1 y el máximo, inicio por defecto el día de la atención, sin diagnóstico si la clínica no lo imprime', async () => {
    const user = setupUser();
    mockedAppointments.mockResolvedValue([makeEligibleAppointment()]);
    mockedIssue.mockResolvedValue(makeCertificate({ kind: 'REST', restDays: 3 }));
    renderModal({ kind: 'REST' });
    const dialog = await screen.findByRole('dialog', { name: 'Certificado de reposo' });
    const days = await within(dialog).findByLabelText('Días de reposo');
    expect(within(dialog).getByText('Entre 1 y 15.')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Diagnóstico/)).not.toBeInTheDocument();
    await user.clear(days);
    await user.type(days, '16');
    await user.click(within(dialog).getByRole('button', { name: 'Emitir' }));
    expect(await within(dialog).findByText('Escribe un número entero de días entre 1 y 15.')).toBeInTheDocument();
    expect(mockedIssue).not.toHaveBeenCalled();
    await user.clear(days);
    await user.type(days, '3');
    // Atención el 16/11 (UTC): del 16 al 18.
    expect(await within(dialog).findByText('Reposo del 16/11/2026 al 18/11/2026.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Emitir' }));
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith(TOKEN, 'p1', {
        kind: 'REST',
        appointmentId: 'appt1',
        restDays: 3,
        restStartDate: '2026-11-16',
      }),
    );
    expect(await within(dialog).findByText('Certificado de reposo nº 000123 emitido')).toBeInTheDocument();
  });

  it('con la clínica que imprime el diagnóstico, se puede escribir y viaja', async () => {
    const user = setupUser();
    mockedSettings.mockResolvedValue({ restMaxDays: 30, restPrintDiagnosis: true });
    mockedAppointments.mockResolvedValue([makeEligibleAppointment()]);
    mockedIssue.mockResolvedValue(makeCertificate({ kind: 'REST', restDays: 2 }));
    renderModal({ kind: 'REST' });
    const dialog = await screen.findByRole('dialog', { name: 'Certificado de reposo' });
    const diagnosis = await within(dialog).findByLabelText('Diagnóstico (opcional)');
    await user.type(diagnosis, 'Exodoncia del 38');
    const days = within(dialog).getByLabelText('Días de reposo');
    await user.clear(days);
    await user.type(days, '2');
    await user.click(within(dialog).getByRole('button', { name: 'Emitir' }));
    await waitFor(() =>
      expect(mockedIssue).toHaveBeenCalledWith(TOKEN, 'p1', {
        kind: 'REST',
        appointmentId: 'appt1',
        restDays: 2,
        restStartDate: '2026-11-16',
        diagnosis: 'Exodoncia del 38',
      }),
    );
  });

  it('el 400 de la API (lo que falta) se enseña tal cual', async () => {
    const user = setupUser();
    mockedAppointments.mockResolvedValue([makeEligibleAppointment()]);
    mockedIssue.mockRejectedValue(new ApiError(400, 'La fecha de inicio del reposo no puede ser anterior al día de la atención.'));
    renderModal({ kind: 'REST' });
    const dialog = await screen.findByRole('dialog', { name: 'Certificado de reposo' });
    await within(dialog).findByLabelText('Días de reposo');
    await user.click(within(dialog).getByRole('button', { name: 'Emitir' }));
    expect(
      await within(dialog).findByText('La fecha de inicio del reposo no puede ser anterior al día de la atención.'),
    ).toBeInTheDocument();
  });
});
