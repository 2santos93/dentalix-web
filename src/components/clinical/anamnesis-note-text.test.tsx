import { render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth/auth-store';
import type { MedicalAlertFlags } from '@/lib/clinical/medical-alerts';
import { listLocations } from '@/lib/locations/locations-api';
import { dateIn, STAMP_SEDES } from '@/lib/test/stamp';
import { AnamnesisNoteText } from './anamnesis-note-text';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

// 03:30Z del 2 de septiembre: 1 de septiembre en Caracas, 2 en Berlín.
const REVIEWED = '2026-09-02T03:30:00.000Z';
const expired: MedicalAlertFlags = {
  hasCriticalAlert: false,
  requiresPremedication: false,
  anamnesisStatus: 'EXPIRED',
  alerts: [],
  anamnesisReviewedAt: REVIEWED,
};

beforeEach(() => {
  mockedLocations.mockReset();
  window.localStorage.clear();
  useAuthStore.setState({ accessToken: 'tok' });
});
afterEach(() => useAuthStore.setState({ accessToken: null }));

it.each([['caracas'], ['berlin']] as const)('con la pantalla en %s: la última revisión con la fecha de la sede', async (key) => {
  mockedLocations.mockResolvedValue([STAMP_SEDES[key]]);
  render(<p data-testid="note"><AnamnesisNoteText flags={expired} /></p>);
  await waitFor(() =>
    expect(screen.getByTestId('note')).toHaveTextContent(`Anamnesis caducada · última revisión ${dateIn(key, REVIEWED)}`),
  );
});

it('mientras carga o sin formato, la frase sigue completa con «—»', async () => {
  mockedLocations.mockReturnValue(new Promise(() => {}));
  render(<p data-testid="note"><AnamnesisNoteText flags={expired} /></p>);
  expect(screen.getByTestId('note')).toHaveTextContent('Anamnesis caducada · última revisión —');
});

it('sin anamnesis no hay fecha que pintar', () => {
  mockedLocations.mockResolvedValue([STAMP_SEDES.caracas]);
  render(<p data-testid="note"><AnamnesisNoteText flags={{ ...expired, anamnesisStatus: 'MISSING' }} /></p>);
  expect(screen.getByTestId('note')).toHaveTextContent('Sin anamnesis');
});
