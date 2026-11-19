import { act, render, screen, waitFor } from '@testing-library/react';
import { tokenForRole } from '@/lib/test/data-consents';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { getWorkQueuesSummary, type WorkQueueKey } from '@/lib/work-queues/work-queues-api';
import {
  useWorkQueueCount,
  useWorkQueuesView,
  WORK_QUEUES_CHANGED_EVENT,
  WorkQueuesProvider,
} from './work-queues-context';

jest.mock('../../lib/work-queues/work-queues-api', () => ({
  ...jest.requireActual('../../lib/work-queues/work-queues-api'),
  getWorkQueuesSummary: jest.fn(),
}));
const summary = jest.mocked(getWorkQueuesSummary);

function Badge({ k }: { k: WorkQueueKey }) {
  return <span data-testid={`badge-${k}`}>{useWorkQueueCount(k)}</span>;
}
function MyDay() {
  const view = useWorkQueuesView();
  return (
    <span data-testid="view">
      {view.status === 'ready' ? view.items.map((i) => `${i.key}=${i.count ?? 'ERR'}`).join(',') : view.status}
    </span>
  );
}

let closing = 3;
beforeEach(() => {
  window.localStorage.clear();
  closing = 3;
  summary.mockReset();
  summary.mockImplementation(async (_token, keys) => ({
    generatedAt: '',
    items: (
      [
        { key: 'CLOSING_QUEUE', status: 'OK', count: closing },
        { key: 'ANAMNESIS_REVIEW', status: 'OK', count: 1 },
        { key: 'LOW_STOCK', status: 'OK', count: 4 },
      ] as const
    ).filter((i) => !keys || keys.includes(i.key)),
  }));
});

describe('WorkQueuesProvider (DX-503)', () => {
  it('el menú y «Mi día» leen la misma respuesta: mismos números', async () => {
    render(
      <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/dashboard">
        <Badge k="CLOSING_QUEUE" />
        <MyDay />
      </WorkQueuesProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('view')).toHaveTextContent('CLOSING_QUEUE=3,ANAMNESIS_REVIEW=1,LOW_STOCK=4'),
    );
    expect(screen.getByTestId('badge-CLOSING_QUEUE')).toHaveTextContent('3');
    // Tras cerrar un pendiente se relee al momento, y ambos cambian juntos.
    closing = 2;
    act(() => window.dispatchEvent(new Event(WORK_QUEUES_CHANGED_EVENT)));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('CLOSING_QUEUE=2'));
    expect(screen.getByTestId('badge-CLOSING_QUEUE')).toHaveTextContent('2');
  });

  it('DX-503-bis: en Inicio, UNA petición (todas las listas), no la del menú antes', async () => {
    render(
      <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/dashboard">
        <Badge k="CLOSING_QUEUE" />
        <MyDay />
      </WorkQueuesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('LOW_STOCK=4'));
    await act(async () => {});
    expect(summary).toHaveBeenCalledTimes(1);
    expect(summary.mock.calls[0][1]).toBeUndefined();
    expect(screen.getByTestId('badge-CLOSING_QUEUE')).toHaveTextContent('3');
  });

  it('DX-503-bis: «Mi día» montado fuera de Inicio sigue pidiendo todas', async () => {
    render(
      <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/otra">
        <MyDay />
      </WorkQueuesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('LOW_STOCK=4'));
    expect(summary.mock.calls.at(-1)?.[1]).toBeUndefined();
  });

  it('DX-487: con la pestaña oculta no sondea; al volver relee al momento', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
    const setVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    };
    try {
      render(
        <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/agenda">
          <Badge k="CLOSING_QUEUE" />
        </WorkQueuesProvider>,
      );
      await act(async () => {});
      expect(summary).toHaveBeenCalledTimes(1);

      setVisibility('hidden');
      await act(async () => {
        jest.advanceTimersByTime(180_000);
      });
      expect(summary).toHaveBeenCalledTimes(1);

      setVisibility('visible');
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(summary).toHaveBeenCalledTimes(2);
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(summary).toHaveBeenCalledTimes(3);
    } finally {
      setVisibility('visible');
      jest.useRealTimers();
    }
  });

  describe('DX-298 (FE-073): ni navegar ni volver enseguida a la pestaña releen', () => {
    const setVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    };
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] }));
    afterEach(() => {
      setVisibility('visible');
      jest.useRealTimers();
    });

    function Shell({ pathname }: { pathname: string }) {
      return (
        <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname={pathname}>
          <Badge k="ANAMNESIS_REVIEW" />
        </WorkQueuesProvider>
      );
    }

    it('navegar entre 5 pantallas no lanza ningún GET /work-queues/summary extra', async () => {
      const { rerender } = render(<Shell pathname="/agenda" />);
      await act(async () => {});
      expect(summary).toHaveBeenCalledTimes(1);
      for (const pathname of ['/patients', '/caja', '/presupuestos', '/anamnesis-por-revisar', '/reportes']) {
        rerender(<Shell pathname={pathname} />);
        await act(async () => {
          jest.advanceTimersByTime(5_000);
        });
      }
      expect(summary).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('badge-ANAMNESIS_REVIEW')).toHaveTextContent('1');
    });

    it('de Inicio (todas las listas) a otra pantalla y de vuelta: la misma lectura', async () => {
      const { rerender } = render(
        <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/dashboard">
          <MyDay />
        </WorkQueuesProvider>,
      );
      await act(async () => {});
      expect(summary).toHaveBeenCalledTimes(1);
      rerender(
        <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/agenda">
          <span />
        </WorkQueuesProvider>,
      );
      await act(async () => {});
      rerender(
        <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/dashboard">
          <MyDay />
        </WorkQueuesProvider>,
      );
      await act(async () => {});
      expect(summary).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('view')).toHaveTextContent('LOW_STOCK=4');
    });

    it('el sondeo sigue cada minuto aunque se navegue entre medias', async () => {
      const { rerender } = render(<Shell pathname="/agenda" />);
      await act(async () => {});
      await act(async () => {
        jest.advanceTimersByTime(40_000);
      });
      rerender(<Shell pathname="/patients" />);
      await act(async () => {
        jest.advanceTimersByTime(20_000);
      });
      expect(summary).toHaveBeenCalledTimes(2);
    });

    it('con la pestaña oculta no sondea; al volver antes de 60 s no relee y después de 60 s relee una vez', async () => {
      render(<Shell pathname="/agenda" />);
      await act(async () => {});
      expect(summary).toHaveBeenCalledTimes(1);

      setVisibility('hidden');
      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });
      setVisibility('visible');
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(summary).toHaveBeenCalledTimes(1);

      setVisibility('hidden');
      await act(async () => {
        jest.advanceTimersByTime(300_000);
      });
      expect(summary).toHaveBeenCalledTimes(1);
      setVisibility('visible');
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(summary).toHaveBeenCalledTimes(2);
    });
  });

  it('sin «Mi día» montado pide solo las listas del menú', async () => {
    render(
      <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/patients">
        <Badge k="ANAMNESIS_REVIEW" />
      </WorkQueuesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('badge-ANAMNESIS_REVIEW')).toHaveTextContent('1'));
    for (const call of summary.mock.calls) expect(call[1]).toEqual(['CLOSING_QUEUE', 'ANAMNESIS_REVIEW', 'POST_OP_CHECKS']);
  });

  it('al cambiar de sede, lo de la otra sede no vale: vuelve a cargar', async () => {
    let resolve!: () => void;
    render(
      <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/dashboard">
        <MyDay />
      </WorkQueuesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('CLOSING_QUEUE=3'));
    summary.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = () => r({ generatedAt: '', items: [{ key: 'CLOSING_QUEUE', status: 'OK', count: 9 }] });
        }),
    );
    act(() => setActiveLocationId('loc-norte'));
    expect(screen.getByTestId('view')).toHaveTextContent('loading');
    act(() => resolve());
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('CLOSING_QUEUE=9'));
  });

  it('un fallo de fondo deja el último contador; sin datos, «Mi día» da error', async () => {
    render(
      <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/dashboard">
        <Badge k="CLOSING_QUEUE" />
        <MyDay />
      </WorkQueuesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('badge-CLOSING_QUEUE')).toHaveTextContent('3'));
    const before = summary.mock.calls.length;
    let rejected = false;
    summary.mockImplementationOnce(async () => {
      rejected = true;
      throw new Error('network');
    });
    act(() => window.dispatchEvent(new Event(WORK_QUEUES_CHANGED_EVENT)));
    await waitFor(() => expect(rejected).toBe(true));
    expect(summary.mock.calls.length).toBeGreaterThan(before);
    await act(async () => {});
    expect(screen.getByTestId('badge-CLOSING_QUEUE')).toHaveTextContent('3');
    expect(screen.getByTestId('view')).toHaveTextContent('CLOSING_QUEUE=3');
  });

  it('la primera lectura falla: «Mi día» en error', async () => {
    summary.mockRejectedValue(new Error('network'));
    render(
      <WorkQueuesProvider token={tokenForRole('ASSISTANT')} pathname="/dashboard">
        <MyDay />
      </WorkQueuesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('error'));
  });
});
