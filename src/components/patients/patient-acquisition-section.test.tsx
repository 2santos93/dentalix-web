import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { PatientAcquisitionSection } from './patient-acquisition-section';
import { getPatientAcquisition, type PatientAcquisition } from '@/lib/patients/patient-sources-api';
import { testStamp } from '@/lib/test/stamp';

jest.mock('../../lib/patients/patient-sources-api', () => ({
  ...jest.requireActual('../../lib/patients/patient-sources-api'),
  getPatientAcquisition: jest.fn(),
}));
const mocked = jest.mocked(getPatientAcquisition);

async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function acquisition(overrides: Partial<PatientAcquisition> = {}): PatientAcquisition {
  return {
    source: { id: 's-ref', name: 'Recomendación de paciente', kind: 'PATIENT', isActive: true },
    referredByPatient: { id: 'p-ref', fullName: 'Luisa Márquez', patientCode: '1001' },
    referredByName: null,
    referrals: { count: 0, recent: [] },
    ...overrides,
  };
}

describe('PatientAcquisitionSection (DX-172)', () => {
  beforeEach(() => mocked.mockReset());

  it('pide la captación UNA vez y enseña la fuente y quién lo recomendó, con enlace a su ficha', async () => {
    mocked.mockResolvedValue(acquisition());
    const { container } = render(<PatientAcquisitionSection token="t" patientId="p1" stamp={testStamp()} />);
    const section = await screen.findByRole('region', { name: 'Origen' });
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledWith('t', 'p1');
    expect(within(section).getByText('Recomendación de paciente')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Luisa Márquez' })).toHaveAttribute('href', '/patients/p-ref');
    expect(await violations(container)).toEqual([]);
  });

  it('el profesional que lo derivó y una fuente desactivada', async () => {
    mocked.mockResolvedValue(
      acquisition({
        source: { id: 's-ext', name: 'Profesional externo', kind: 'EXTERNAL_PROFESSIONAL', isActive: false },
        referredByPatient: null,
        referredByName: 'Dra. Carmen Rodríguez',
      }),
    );
    render(<PatientAcquisitionSection token="t" patientId="p1" stamp={testStamp()} />);
    expect(await screen.findByText('Profesional externo (desactivada)')).toBeInTheDocument();
    expect(screen.getByText('Dra. Carmen Rodríguez')).toBeInTheDocument();
  });

  it('en el referente: «Ha recomendado a N pacientes» con los recientes', async () => {
    mocked.mockResolvedValue(
      acquisition({
        source: null,
        referredByPatient: null,
        referrals: {
          count: 12,
          recent: [
            { id: 'p-2', fullName: 'Pedro Salas', createdAt: '2026-11-10T15:00:00.000Z' },
            { id: 'p-3', fullName: 'Rosa Medina', createdAt: '2026-11-02T15:00:00.000Z' },
          ],
        },
      }),
    );
    const { container } = render(<PatientAcquisitionSection token="t" patientId="p1" stamp={testStamp()} />);
    expect(await screen.findByTestId('patient-referrals-count')).toHaveTextContent('12 pacientes');
    const list = screen.getByRole('list', { name: 'Los 2 más recientes' });
    expect(within(list).getByRole('link', { name: 'Pedro Salas' })).toHaveAttribute('href', '/patients/p-2');
    expect(screen.queryByText('Cómo nos conoció')).not.toBeInTheDocument();
    expect(await violations(container)).toEqual([]);
  });

  it('sin fuente ni recomendados no pinta nada', async () => {
    mocked.mockResolvedValue(acquisition({ source: null, referredByPatient: null }));
    const { container } = render(<PatientAcquisitionSection token="t" patientId="p1" stamp={testStamp()} />);
    await Promise.resolve();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('si falla, el error de sección con «Reintentar» vuelve a pedirla', async () => {
    mocked.mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce(acquisition());
    render(<PatientAcquisitionSection token="t" patientId="p1" stamp={testStamp()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: 'Luisa Márquez' })).toBeInTheDocument();
    expect(mocked).toHaveBeenCalledTimes(2);
  });
});
