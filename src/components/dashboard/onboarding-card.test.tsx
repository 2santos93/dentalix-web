import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingCard, onboardingCardCopy as copy } from './onboarding-card';
import {
  dismissOnboarding,
  getOnboardingStatus,
  type OnboardingStatus,
  type OnboardingStepKey,
} from '@/lib/onboarding/onboarding-api';
import { notifyError } from '@/components/errors/notify';
import { tokenForRole } from '@/lib/test/data-consents';

// jest.mock no reescribe alias: rutas relativas (convención del repo).
jest.mock('../../lib/onboarding/onboarding-api', () => ({
  ...jest.requireActual('../../lib/onboarding/onboarding-api'),
  getOnboardingStatus: jest.fn(),
  dismissOnboarding: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedGet = jest.mocked(getOnboardingStatus);
const mockedDismiss = jest.mocked(dismissOnboarding);
const admin = tokenForRole('ADMIN');

const REQUIRED: OnboardingStepKey[] = [
  'BUSINESS_HOURS',
  'APPOINTMENT_TYPES',
  'CATALOG_PRICES',
  'STAFF',
  'FIRST_APPOINTMENT',
];

function status(done: OnboardingStepKey[] = [], dismissedAt: string | null = null): OnboardingStatus {
  const completedCount = REQUIRED.filter((k) => done.includes(k)).length;
  return {
    dismissedAt,
    steps: [
      ...REQUIRED.map((key) => ({ key, done: done.includes(key), optional: false })),
      { key: 'PATIENT_IMPORT' as const, done: done.includes('PATIENT_IMPORT'), optional: true },
    ],
    completedCount,
    requiredCount: 5,
    allDone: completedCount === 5,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe('OnboardingCard (DX-020)', () => {
  it('no se pinta ni pide nada para otros roles', () => {
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION']) {
      const { container, unmount } = render(<OnboardingCard token={tokenForRole(role)} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('carga con esqueleto y enseña los pasos pendientes, cada uno con su enlace', async () => {
    mockedGet.mockResolvedValue(status(['APPOINTMENT_TYPES']));
    render(<OnboardingCard token={admin} />);
    expect(screen.getByRole('status', { name: copy.loading })).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: copy.listLabel });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(screen.getByRole('progressbar', { name: copy.progressLabel })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText(copy.progress(1, 5))).toBeInTheDocument();

    const types = screen.getByRole('link', { name: `${copy.steps.APPOINTMENT_TYPES.title} (${copy.done})` });
    expect(types).toHaveAttribute('href', '/settings/tipos-de-cita');
    expect(screen.getByRole('link', { name: `${copy.steps.BUSINESS_HOURS.title} (${copy.pending})` })).toHaveAttribute(
      'href',
      '/settings/horarios',
    );
    expect(screen.getByRole('link', { name: `${copy.steps.PATIENT_IMPORT.title} (${copy.pending})` })).toHaveAttribute(
      'href',
      '/settings/importar-pacientes',
    );
    expect(screen.getByText(copy.optionalHeading)).toBeInTheDocument();
  });

  it('un fallo de carga queda en su sitio con Reintentar (escalón 1)', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(status());
    render(<OnboardingCard token={admin} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.error);
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: copy.listLabel })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('«No mostrar más» la descarta y la esconde', async () => {
    mockedGet.mockResolvedValue(status());
    mockedDismiss.mockResolvedValue(status([], '2026-12-26T12:00:00.000Z'));
    render(<OnboardingCard token={admin} />);
    await userEvent.click(await screen.findByRole('button', { name: copy.dismiss }));
    await waitFor(() => expect(screen.queryByTestId('inicio-onboarding')).not.toBeInTheDocument());
    expect(mockedDismiss).toHaveBeenCalledWith(admin);
  });

  it('si el descarte falla, la tarjeta sigue y avisa con reintento (escalón 3)', async () => {
    mockedGet.mockResolvedValue(status());
    mockedDismiss.mockRejectedValue(new Error('boom'));
    render(<OnboardingCard token={admin} />);
    await userEvent.click(await screen.findByRole('button', { name: copy.dismiss }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(copy.dismissError, expect.objectContaining({ onRetry: expect.any(Function) })),
    );
    expect(screen.getByTestId('inicio-onboarding')).toBeInTheDocument();
  });

  it('con los cinco hechos, «Tu clínica está lista» con el opcional y Cerrar', async () => {
    mockedGet.mockResolvedValue(status(REQUIRED));
    mockedDismiss.mockResolvedValue(status(REQUIRED, '2026-12-26T12:00:00.000Z'));
    render(<OnboardingCard token={admin} />);
    expect(await screen.findByRole('heading', { name: copy.readyTitle })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.readyImport })).toHaveAttribute('href', '/settings/importar-pacientes');
    expect(screen.queryByRole('list', { name: copy.listLabel })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy.readyClose }));
    await waitFor(() => expect(screen.queryByTestId('inicio-onboarding')).not.toBeInTheDocument());
  });

  it('lista y con la importación hecha, sin el enlace de importar', async () => {
    mockedGet.mockResolvedValue(status([...REQUIRED, 'PATIENT_IMPORT']));
    render(<OnboardingCard token={admin} />);
    expect(await screen.findByRole('heading', { name: copy.readyTitle })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: copy.readyImport })).not.toBeInTheDocument();
  });

  it('descartada en la API: no se pinta y se recuerda para no enseñar el esqueleto', async () => {
    mockedGet.mockResolvedValue(status([], '2026-12-26T12:00:00.000Z'));
    const first = render(<OnboardingCard token={admin} />);
    await waitFor(() => expect(first.container).toBeEmptyDOMElement());
    first.unmount();

    mockedGet.mockReturnValue(new Promise(() => {}));
    const second = render(<OnboardingCard token={admin} />);
    expect(second.container).toBeEmptyDOMElement();
  });
});
