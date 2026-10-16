import { render } from '@testing-library/react';
import AppSegmentError from './error';
import PrintSegmentError from '../print/error';

describe.each([
  ['(app)/error.tsx', AppSegmentError],
  ['print/error.tsx', PrintSegmentError],
])('%s no filtra el mensaje en producción (DX-061)', (_name, Boundary) => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
    env.NODE_ENV = originalEnv;
  });

  it('solo registra name y digest', () => {
    env.NODE_ENV = 'production';
    const error = Object.assign(new RangeError('HC de Juan Pérez'), { digest: 'd1' });
    render(<Boundary error={error} reset={() => {}} />);
    expect(spy).toHaveBeenCalledWith('Error de render', { name: 'RangeError', digest: 'd1' });
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Juan');
    expect(spy.mock.calls.flat()).not.toContain(error);
  });
});
