/**
 * @jest-environment node
 */
import { register } from './instrumentation';

describe('instrumentation (OPS-024: la web no arranca en producción sin API_URL)', () => {
  const saved = { ...process.env };
  let exit: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.assign(process.env, { NODE_ENV: 'production', NEXT_RUNTIME: 'nodejs' });
    delete process.env.API_URL;
    delete process.env.NEXT_PHASE;
  });
  afterEach(() => {
    process.env = { ...saved };
    exit.mockRestore();
    error.mockRestore();
  });

  it('sin API_URL sale con código 1 y dice por qué', () => {
    register();
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(error.mock.calls[0][0])).toMatch(/API_URL/);
  });

  it('con API_URL válida arranca', () => {
    process.env.API_URL = 'https://api.dentalix.app/api/v1';
    register();
    expect(exit).not.toHaveBeenCalled();
  });

  it('no comprueba nada durante `next build` ni en el runtime edge', () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    register();
    delete process.env.NEXT_PHASE;
    process.env.NEXT_RUNTIME = 'edge';
    register();
    expect(exit).not.toHaveBeenCalled();
  });
});
