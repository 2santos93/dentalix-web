import { reportBoundaryError } from './report-boundary-error';

describe('reportBoundaryError (DX-061, FE-026)', () => {
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

  function boom() {
    return Object.assign(new RangeError('Invalid currency code : PACIENTE Juan Pérez'), {
      digest: 'abc123',
    });
  }

  it('en producción registra solo name y digest, nunca el mensaje ni el stack', () => {
    env.NODE_ENV = 'production';
    reportBoundaryError(boom());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toEqual(['Error de render', { name: 'RangeError', digest: 'abc123' }]);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Juan');
  });

  it('en producción sin digest registra solo el name', () => {
    env.NODE_ENV = 'production';
    reportBoundaryError(new Error('dato sensible'));
    expect(spy.mock.calls[0]).toEqual(['Error de render', { name: 'Error', digest: undefined }]);
  });

  it('en desarrollo registra el error completo para depurar', () => {
    env.NODE_ENV = 'development';
    const err = boom();
    reportBoundaryError(err);
    expect(spy).toHaveBeenCalledWith(err);
  });
});
