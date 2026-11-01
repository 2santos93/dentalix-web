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

  it('sin «Mi día» montado pide solo las listas del menú', async () => {
    render(
      <WorkQueuesProvider token={tokenForRole('ADMIN')} pathname="/patients">
        <Badge k="ANAMNESIS_REVIEW" />
      </WorkQueuesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('badge-ANAMNESIS_REVIEW')).toHaveTextContent('1'));
    for (const call of summary.mock.calls) expect(call[1]).toEqual(['CLOSING_QUEUE', 'ANAMNESIS_REVIEW']);
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
