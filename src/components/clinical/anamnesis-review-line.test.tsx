import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnamnesisReviewLine } from './anamnesis-review-line';
import { listLocations } from '@/lib/locations/locations-api';
import { utcSede } from '@/lib/test/sede-clock';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';
import {
  confirmAnamnesisNoChanges,
  type PatientMedicalAlerts,
} from '@/lib/clinical/medical-alerts';

jest.mock('../../lib/clinical/medical-alerts', () => ({
  ...jest.requireActual('../../lib/clinical/medical-alerts'),
  confirmAnamnesisNoChanges: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede()]),
}));
const mockedConfirm = confirmAnamnesisNoChanges as jest.MockedFunction<typeof confirmAnamnesisNoChanges>;

const expired: PatientMedicalAlerts = {
  hasCriticalAlert: false,
  requiresPremedication: false,
  anamnesisStatus: 'EXPIRED',
  alerts: [],
  anamnesisReviewedAt: '2025-08-01T12:00:00.000Z',
  validityMonths: 12,
  anamnesisExpiresOn: '2026-08-01',
  today: '2026-10-20',
  timeZone: 'America/Caracas',
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
    await waitFor(() =>
      expect(screen.getByTestId('anamnesis-review')).toHaveTextContent(
        'Anamnesis caducada · revisada el 01/08/2025 por Dra. Ruiz',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Sin cambios hoy' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('¿Sin cambios en la salud del paciente?');
    await user.click(screen.getByRole('button', { name: 'Confirmar sin cambios' }));
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith('tok', 'p1'));
    await waitFor(() => expect(onReload).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirmada hoy: dice quién y a qué hora, sin volver a ofrecer el botón', async () => {
    render(
      <AnamnesisReviewLine
        token="tok"
        patientId="p1"
        alerts={{
          ...expired,
          anamnesisStatus: 'CURRENT',
          lastReview: { kind: 'NO_CHANGES', at: '2026-10-20T15:00:00.000Z', byName: 'Dr. Gómez' },
        }}
        failed={false}
        onReload={jest.fn()}
        canConfirm
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('anamnesis-review')).toHaveTextContent(/Sin cambios hoy · confirmado a las \d\d:\d\d por Dr\. Gómez/),
    );
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
          lastReview: { kind: 'UPDATED', at: '2026-10-20T15:00:00.000Z', byName: 'Dra. Ruiz' },
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

describe('AnamnesisReviewLine con cada sede (DX-354b)', () => {
  // 23:30 del 20/10 en Caracas, la zona de la ficha (03:30Z del 21/10).
  const confirmed: PatientMedicalAlerts = {
    ...expired,
    anamnesisStatus: 'CURRENT',
    anamnesisExpiresOn: '2027-10-20',
    lastReview: { kind: 'NO_CHANGES', at: '2026-10-21T03:30:00.000Z', byName: 'Dr. Gómez' },
  };
  const listLocationsMock = listLocations as jest.MockedFunction<typeof listLocations>;
  // La zona es la de la ficha (Caracas), no la de la sede de la pantalla; solo el reloj es el de la pantalla.
  const expectedTime = (key: 'caracas' | 'berlin') =>
    STAMP_FORMATS[key].time(new Date('2026-10-21T03:30:00.000Z'), 'America/Caracas');

  afterEach(() => listLocationsMock.mockResolvedValue([utcSede()]));

  it.each([['caracas'], ['berlin']] as const)(
    'con la pantalla en %s: la hora de la ficha con el reloj de la sede y la caducidad en su formato',
    async (key) => {
      listLocationsMock.mockResolvedValue([STAMP_SEDES[key]]);
      render(
        <AnamnesisReviewLine token="tok" patientId="p1" alerts={confirmed} failed={false} onReload={jest.fn()} canConfirm />,
      );
      const line = screen.getByTestId('anamnesis-review');
      // La ficha es de Caracas: 23:30 en su zona; el reloj (12/24 h) es el de la sede de la pantalla.
      await waitFor(() => expect(line).toHaveTextContent(`confirmado a las ${expectedTime(key)} por Dr. Gómez`));
      expect(line).toHaveTextContent(`Caduca el ${STAMP_FORMATS[key].civilDate('2027-10-20')}.`);
    },
  );

  it('Caracas (12 h) y Berlín (24 h) no escriben igual la misma hora', () => {
    expect(expectedTime('caracas')).toBe('11:30 p. m.');
    expect(expectedTime('berlin')).toBe('23:30');
  });

  it('sin formato: «—» en la hora, la frase sigue completa y el aviso sale una vez', async () => {
    listLocationsMock.mockRejectedValue(new Error('red'));
    render(
      <AnamnesisReviewLine token="tok" patientId="p1" alerts={confirmed} failed={false} onReload={jest.fn()} canConfirm />,
    );
    await waitFor(() => expect(screen.getAllByText(/No se pudo saber el formato regional/)).toHaveLength(1));
    expect(screen.getByTestId('anamnesis-review')).toHaveTextContent('Sin cambios hoy · confirmado a las — por Dr. Gómez');
  });
});
