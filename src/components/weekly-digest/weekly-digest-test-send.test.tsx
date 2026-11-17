import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeeklyDigestTestSend } from './weekly-digest-test-send';
import { sendWeeklyDigestTest } from '@/lib/clinic/weekly-digest-api';
import { useSedeFormat } from '@/lib/locations/use-sede-format';
import { regionalFormat } from '@/lib/format/regional-format';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/clinic/weekly-digest-api', () => ({
  ...jest.requireActual('../../lib/clinic/weekly-digest-api'),
  sendWeeklyDigestTest: jest.fn(),
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(),
}));

const BUTTON = 'Enviarme una prueba';

describe('WeeklyDigestTestSend (DX-568)', () => {
  beforeEach(() => {
    jest.mocked(sendWeeklyDigestTest).mockReset();
    jest
      .mocked(useSedeFormat)
      .mockReturnValue({ status: 'ready', fmt: regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }) });
  });

  it('envía y dice a qué correo y qué semana', async () => {
    const user = setupUser();
    jest
      .mocked(sendWeeklyDigestTest)
      .mockResolvedValue({ sentTo: 'ma***@sonrisas.com.ve', weekStart: '2026-11-09', weekEnd: '2026-11-15' });
    render(<WeeklyDigestTestSend token="tok" />);
    await user.click(screen.getByRole('button', { name: BUTTON }));
    expect(sendWeeklyDigestTest).toHaveBeenCalledWith('tok');
    expect(
      await screen.findByText(
        'Te enviamos la prueba a ma***@sonrisas.com.ve, con la semana del 09/11/2026 al 15/11/2026. Llega con «[Prueba]» en el asunto.',
      ),
    ).toBeInTheDocument();
  });

  it('sin formato de la sede, sin fechas', async () => {
    const user = setupUser();
    jest.mocked(useSedeFormat).mockReturnValue({ status: 'loading' });
    jest
      .mocked(sendWeeklyDigestTest)
      .mockResolvedValue({ sentTo: 'ma***@sonrisas.com.ve', weekStart: '2026-11-09', weekEnd: '2026-11-15' });
    render(<WeeklyDigestTestSend token="tok" />);
    await user.click(screen.getByRole('button', { name: BUTTON }));
    expect(
      await screen.findByText('Te enviamos la prueba a ma***@sonrisas.com.ve. Llega con «[Prueba]» en el asunto.'),
    ).toBeInTheDocument();
  });

  it('409 EMAIL_NOT_VERIFIED: explica que hay que confirmar el correo', async () => {
    const user = setupUser();
    jest
      .mocked(sendWeeklyDigestTest)
      .mockRejectedValue(new ApiError(409, 'x', { code: 'EMAIL_NOT_VERIFIED' }));
    render(<WeeklyDigestTestSend token="tok" />);
    await user.click(screen.getByRole('button', { name: BUTTON }));
    expect(
      await screen.findByText(
        'Confirma tu correo antes de pedir una prueba: el resumen solo se envía a correos confirmados.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled();
  });

  it('429: el mensaje de la API y el botón espera lo que dice `retryAfterSeconds`', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime, pointerEventsCheck: 0 });
      jest.mocked(sendWeeklyDigestTest).mockRejectedValue(
        new ApiError(429, 'Ya te enviamos una prueba hace un momento. Espera 4 minutos para pedir otra.', {
          retryAfterSeconds: 200,
        }),
      );
      render(<WeeklyDigestTestSend token="tok" />);
      await user.click(screen.getByRole('button', { name: BUTTON }));
      expect(
        await screen.findByText('Ya te enviamos una prueba hace un momento. Espera 4 minutos para pedir otra.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: BUTTON })).toBeDisabled();
      act(() => {
        jest.advanceTimersByTime(200_000);
      });
      expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });
});
