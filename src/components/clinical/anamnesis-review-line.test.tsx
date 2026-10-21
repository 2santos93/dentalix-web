import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnamnesisReviewLine } from './anamnesis-review-line';
import {
  confirmAnamnesisNoChanges,
  type PatientMedicalAlerts,
} from '@/lib/clinical/medical-alerts';

jest.mock('../../lib/clinical/medical-alerts', () => ({
  ...jest.requireActual('../../lib/clinical/medical-alerts'),
  confirmAnamnesisNoChanges: jest.fn(),
}));
const mockedConfirm = confirmAnamnesisNoChanges as jest.MockedFunction<typeof confirmAnamnesisNoChanges>;

const expired: PatientMedicalAlerts = {
  hasCriticalAlert: false,
  requiresPremedication: false,
  anamnesisStatus: 'EXPIRED',
  alerts: [],
  anamnesisReviewedAt: '2025-08-01T12:00:00.000Z',
  validityMonths: 12,
  anamnesisExpiresAt: '2026-08-01T12:00:00.000Z',
  lastReview: { kind: 'UPDATED', at: '2025-08-01T12:00:00.000Z', byName: 'Dra. Ruiz' },
};

describe('AnamnesisReviewLine (DX-247)', () => {
  beforeEach(() => mockedConfirm.mockReset());

  it('caducada: dice cuándo y quién la revisó y ofrece «Sin cambios hoy» en un modal', async () => {
    const user = userEvent.setup();
    const onReload = jest.fn();
    mockedConfirm.mockResolvedValue({
      id: 'r1',
      patientId: 'p1',
      medicalHistoryVersionId: 'v1',
      reviewedById: 'u1',
      reviewedByName: 'Dr. Gómez',
      locationId: null,
      reviewedAt: new Date().toISOString(),
    });
    render(
      <AnamnesisReviewLine token="tok" patientId="p1" alerts={expired} failed={false} onReload={onReload} canConfirm />,
    );
    expect(screen.getByTestId('anamnesis-review')).toHaveTextContent(
      'Anamnesis caducada · revisada el 01/08/2025 por Dra. Ruiz',
    );
    await user.click(screen.getByRole('button', { name: 'Sin cambios hoy' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('¿Sin cambios en la salud del paciente?');
    await user.click(screen.getByRole('button', { name: 'Confirmar sin cambios' }));
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith('tok', 'p1'));
    await waitFor(() => expect(onReload).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirmada hoy: dice quién y a qué hora, sin volver a ofrecer el botón', () => {
    render(
      <AnamnesisReviewLine
        token="tok"
        patientId="p1"
        alerts={{
          ...expired,
          anamnesisStatus: 'CURRENT',
          lastReview: { kind: 'NO_CHANGES', at: new Date().toISOString(), byName: 'Dr. Gómez' },
        }}
        failed={false}
        onReload={jest.fn()}
        canConfirm
      />,
    );
    expect(screen.getByTestId('anamnesis-review')).toHaveTextContent(/Sin cambios hoy · confirmado a las \d\d:\d\d por Dr\. Gómez/);
    expect(screen.queryByRole('button', { name: 'Sin cambios hoy' })).not.toBeInTheDocument();
  });

  it('una anamnesis guardada hoy no ofrece «Sin cambios hoy»', () => {
    render(
      <AnamnesisReviewLine
        token="tok"
        patientId="p1"
        alerts={{
          ...expired,
          anamnesisStatus: 'CURRENT',
          lastReview: { kind: 'UPDATED', at: new Date().toISOString(), byName: 'Dra. Ruiz' },
        }}
        failed={false}
        onReload={jest.fn()}
        canConfirm
      />,
    );
    expect(screen.getByTestId('anamnesis-review')).toHaveTextContent('Anamnesis al día · revisada el');
    expect(screen.queryByRole('button', { name: 'Sin cambios hoy' })).not.toBeInTheDocument();
  });

  it('sin anamnesis no hay nada que confirmar; recepción no ve el botón', () => {
    const { rerender } = render(
      <AnamnesisReviewLine
        token="tok"
        patientId="p1"
        alerts={{ ...expired, anamnesisStatus: 'MISSING', lastReview: null, anamnesisReviewedAt: null }}
        failed={false}
        onReload={jest.fn()}
        canConfirm
      />,
    );
    expect(screen.getByTestId('anamnesis-review')).toHaveTextContent('Sin anamnesis');
    expect(screen.queryByRole('button', { name: 'Sin cambios hoy' })).not.toBeInTheDocument();
    rerender(
      <AnamnesisReviewLine token="tok" patientId="p1" alerts={expired} failed={false} onReload={jest.fn()} canConfirm={false} />,
    );
    expect(screen.queryByRole('button', { name: 'Sin cambios hoy' })).not.toBeInTheDocument();
  });

  it('si la confirmación falla, el modal sigue abierto con el error', async () => {
    const user = userEvent.setup();
    mockedConfirm.mockRejectedValue(new Error('caída'));
    render(
      <AnamnesisReviewLine token="tok" patientId="p1" alerts={expired} failed={false} onReload={jest.fn()} canConfirm />,
    );
    await user.click(screen.getByRole('button', { name: 'Sin cambios hoy' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar sin cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar la confirmación');
  });
});
